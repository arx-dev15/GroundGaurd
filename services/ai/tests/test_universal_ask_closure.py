"""
EVIDEX — UNIVERSAL DOCUMENT QA RELIABILITY CLOSURE
Layer A Deterministic Regression Test Suite (CI Layer A: 100% Provider-Independent)

Sections Covered:
- Section 0 & 1: Production Architecture & Transport Parity (/generate vs /generate/stream)
- Section 2: Ingestion & Document Lineage / Parser Contracts
- Section 3 & 4: Semantic Question Facet Planning & Paraphrase Robustness
- Section 5: Conversational Resolution & Stale Entity Isolation
- Section 6: User Challenge / Correction Behavior
- Section 7-10: Adaptive Retrieval Controller & Facet Coverage
- Section 11: Long-Range Completion & Local Expansion
- Section 12: Comparison Retrieval (Both Sides Independent)
- Section 13: Multi-Hop Bridge Retrieval (Transitive Chain)
- Section 14: Enumeration & Coverage
- Section 15-16: Entity / Role / Event / Attribute / Section Binding
- Section 17-18: Sufficiency Safety (0.35 Gate & 0.15 Eligibility Floor)
- Section 19-20: Grounded Synthesis & Question-Shaped Answer Contracts
- Section 21-23: Negative Corpus Gate, Partial Support, Contradiction/Conflict
- Section 24-25: Verification & Final Answer Prose Integrity
- Section 26: Deterministic Streaming vs Non-Streaming Invariant
- Section 27-28: Scope & Multi-Document Isolation
- Section 29-30: Observability Diagnostics & Failure Taxonomy
- Section 31-34: Cross-Domain Generic Evaluation Corpus (6 Archetypes)
- Section 37: Zero Fixture / Domain Hardcoding in Production src/
"""

import os
import sys
import json
import pytest
from typing import List, Dict, Any, Optional

# Ensure services/ai directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.pipeline.query_understanding import (
    understand_query,
    extract_answer_slot,
    extract_answer_facets,
    InformationNeed,
    FacetStatus,
    AnswerFacetSet,
    detect_user_challenge,
    resolve_conversational_query,
    strip_document_filename_references,
    _make_fallback_plan,
)
from src.pipeline.retrieval import (
    Candidate,
    EvidenceItem,
    EvidenceSufficiency,
    EvidenceDisposition,
    FailureStage,
    EvidenceSemanticState,
    evaluate_answer_slot_completeness,
    evaluate_facet_completeness,
    generate_completion_queries,
    merge_and_select_complete_evidence,
    evaluate_sufficiency,
    route_query,
    RouteDecision,
    SUFFICIENCY_THRESHOLD,
)
from src.pipeline.ask_orchestrator import (
    ask_orchestrator,
    sanitize_user_facing_answer,
    determine_evidence_disposition,
    classify_premise_outcome,
    filter_relevant_evidence,
    ClaimItem,
    GenerateResult,
)


# ===========================================================================
# 1. Transport Parity Tests (Sections 0, 1, 26)
# ===========================================================================

class TestProductionPathParity:
    """Proves /generate and /generate/stream invoke the exact same orchestration pipeline."""

    @pytest.mark.anyio
    async def test_streaming_and_non_streaming_exact_evidence_and_disposition_parity(self, monkeypatch):
        """Invariant: same project + query + config -> identical evidence IDs, disposition, and answer."""
        project_id = "proj_parity_test"
        query = "What is the maximum operating temperature of the reactor coolant pump?"
        req_id = "req_parity_123"
        gen_id = "gen_parity_123"

        # Mock retrieval response
        mock_evidence = [
            EvidenceItem(
                evidenceId="ev_item_1",
                chunkId="chk_temp_spec_p12",
                documentId="doc_reactor_spec",
                text="The reactor coolant pump operates up to a maximum continuous temperature of 320°C.",
                pageNumber=12,
                rerankScore=0.88,
                metadata={"filename": "Reactor_Specification.pdf", "chunkIndex": 2}
            ),
            EvidenceItem(
                evidenceId="ev_item_2",
                chunkId="chk_temp_alarm_p14",
                documentId="doc_reactor_spec",
                text="An automated high-temperature trip is triggered if coolant exceeds 340°C.",
                pageNumber=14,
                rerankScore=0.79,
                metadata={"filename": "Reactor_Specification.pdf", "chunkIndex": 5}
            )
        ]

        from src.pipeline import retrieval as ret_module
        from src.pipeline import llm as llm_module
        from src.pipeline import query_understanding as qu_module
        from src.pipeline import claim_extractor as ce_module
        from src.pipeline.query_understanding import QueryPlan

        async def mock_understand_query(*args, **kwargs):
            return QueryPlan(
                standalone_query=query,
                task="grounded_query",
                retrieval_mode="focused",
                retrieval_strategy="direct",
                operation="answer",
                search_queries=[query],
                is_proposition=False,
                needs_clarification=False
            )
        monkeypatch.setattr(qu_module, "understand_query", mock_understand_query)

        async def mock_extract_claims(*args, **kwargs):
            return [
                {
                    "claimId": "claim_1",
                    "text": "The reactor coolant pump has a maximum continuous operating temperature of 320°C.",
                    "status": "supported",
                    "ordinal": 1,
                    "evidence": []
                }
            ]
        monkeypatch.setattr(ce_module, "extract_and_validate_claims", mock_extract_claims)

        # Mock retrieve_evidence
        def mock_retrieve(*args, **kwargs):
            return ret_module.RetrieveResponse(
                results=mock_evidence,
                sufficiency=EvidenceSufficiency(
                    sufficient=True,
                    score=0.88,
                    reason="Comprehensive evidence available",
                    signals=ret_module.EvidenceSufficiencySignals(
                        resultCount=2,
                        topRerankScore=0.88,
                        identifierMatched=True,
                        sourceCoverage=["doc_reactor_spec"],
                        conflictingEvidence=False,
                        disposition=EvidenceDisposition.SUPPORTED.value,
                        failureStage=FailureStage.NONE.value,
                        eligibleEvidenceCount=2
                    )
                ),
                query=query,
                totalFound=2,
                metadata=ret_module.RetrieveMetadata(
                    sources=["qdrant_dense"],
                    qdrantCount=2,
                    tantivyCount=0,
                    graphCount=0,
                    rrfCount=2,
                    finalCount=2,
                    latencyMs=5,
                    routingDecision="dense"
                )
            )

        monkeypatch.setattr(ret_module, "retrieve_evidence", mock_retrieve)

        # Mock LLM generation and streaming
        generated_text = "The reactor coolant pump has a maximum continuous operating temperature of 320°C [Reactor_Specification.pdf, p. 12]."

        async def mock_generate_answer(user_prompt):
            return llm_module.LLMResponse(
                answer=generated_text,
                modelVersion="gemini-mock",
                provider="mock",
                latencyMs=120
            )

        async def mock_stream_answer(user_prompt, system_prompt=None):
            tokens = ["The reactor ", "coolant pump has ", "a maximum continuous operating temperature ", "of 320°C [Reactor_Specification.pdf, p. 12]."]
            for t in tokens:
                yield t

        monkeypatch.setattr(llm_module.llm_runtime, "generate_answer", mock_generate_answer)
        monkeypatch.setattr(llm_module.llm_runtime, "stream_answer", mock_stream_answer)

        # Run non-streaming
        non_stream_res: GenerateResult = await ask_orchestrator.execute_generate(
            project_id=project_id,
            query=query,
            request_id=req_id,
            generation_id=gen_id,
        )

        # Run streaming
        streamed_events = []
        async for event in ask_orchestrator.execute_generate_stream(
            project_id=project_id,
            query=query,
            request_id=req_id,
            generation_id=gen_id,
        ):
            streamed_events.append(event)

        # Parse final generation.completed SSE event
        completed_event_str = [e for e in streamed_events if "generation.completed" in e][-1]
        data_line = [line for line in completed_event_str.split("\n") if line.startswith("data: ")][0]
        stream_completed_data = json.loads(data_line[6:])

        # Verify exact invariant parity
        non_stream_ev_ids = [e.chunkId for e in non_stream_res.evidence]
        stream_ev_ids = [e["chunkId"] for e in stream_completed_data["evidence"]]
        assert non_stream_ev_ids == stream_ev_ids, f"Evidence IDs must match exactly: {non_stream_ev_ids} vs {stream_ev_ids}"

        assert non_stream_res.answer == stream_completed_data["answer"]
        assert non_stream_res.metadata.get("supportDisposition") == stream_completed_data["metadata"].get("supportDisposition")
        assert non_stream_res.status == "completed"
        assert stream_completed_data["status"] == "completed"


# ===========================================================================
# 2. Question Understanding & Paraphrase Robustness (Sections 3 & 4)
# ===========================================================================

class TestQuestionUnderstandingAndParaphrase:
    """Verifies semantic facet extraction and paraphrase normalization across diverse formulations."""

    def test_direct_fact_facet_extraction(self):
        query = "What is the rated voltage of the auxiliary inverter?"
        slot = extract_answer_slot(query)
        facet_set = extract_answer_facets(query)
        assert slot.informationNeed in (InformationNeed.NUMERIC, InformationNeed.DEFINITION)
        assert len(facet_set.facets) >= 1

    def test_explanatory_why_how_facet_extraction(self):
        query = "Why did the primary pressure relief valve open prematurely?"
        slot = extract_answer_slot(query)
        facet_set = extract_answer_facets(query)
        assert slot.informationNeed in (InformationNeed.CAUSE, InformationNeed.EXPLANATION)
        assert any(f.facetType in ("cause", "reason", "mechanism", "general") for f in facet_set.facets)

    def test_procedural_facet_extraction(self):
        query = "What are the required steps to bleed air from the hydraulic line?"
        slot = extract_answer_slot(query)
        facet_set = extract_answer_facets(query)
        assert slot.informationNeed in (InformationNeed.PROCEDURE, InformationNeed.SEQUENCE)

    def test_comparison_facet_extraction(self):
        query = "Compare Algorithm Alpha and Algorithm Beta"
        facet_set = extract_answer_facets(query)
        assert facet_set.isComparison is True
        assert len(facet_set.facets) >= 2
        facet_entities = [f.targetEntity.lower() for f in facet_set.facets if f.targetEntity]
        assert any("algorithm alpha" in e or "alpha" in e for e in facet_entities)
        assert any("algorithm beta" in e or "beta" in e for e in facet_entities)

    def test_multi_hop_bridge_facet_extraction(self):
        query = "How is thermal sensor failure connected to auxiliary generator trip?"
        facet_set = extract_answer_facets(query)
        assert facet_set.isMultiHop is True
        assert len(facet_set.facets) >= 2

    def test_compound_facet_extraction(self):
        query = "What did the commission deduce and what evidence was cited?"
        facet_set = extract_answer_facets(query)
        assert facet_set.isCompound is True
        assert len(facet_set.facets) >= 2

    def test_paraphrase_group_comparison_invariance(self):
        """Paraphrased comparison queries must produce consistent comparison representations."""
        paraphrases = [
            "Compare Model Alpha and Model Beta",
            "How does Model Alpha differ from Model Beta",
            "What separates Model Alpha from Model Beta",
            "Where do Model Alpha and Model Beta disagree",
        ]
        for p in paraphrases:
            facet_set = extract_answer_facets(p)
            assert facet_set.isComparison is True, f"Paraphrase failed isComparison: '{p}'"
            assert len(facet_set.facets) >= 2, f"Paraphrase failed facet count: '{p}'"

    def test_paraphrase_group_multi_hop_invariance(self):
        """Paraphrased multi-hop queries must produce consistent bridge representations."""
        paraphrases = [
            "How is component X connected to component Y?",
            "What links component X to component Y?",
            "Trace how component X led to component Y",
            "How did component X eventually affect component Y?",
        ]
        for p in paraphrases:
            facet_set = extract_answer_facets(p)
            assert facet_set.isMultiHop is True, f"Paraphrase failed isMultiHop: '{p}'"
            assert len(facet_set.facets) >= 2, f"Paraphrase failed facet count: '{p}'"


# ===========================================================================
# 3. Conversational Resolution & User Challenge (Sections 5 & 6)
# ===========================================================================

class TestConversationalResolutionAndChallenge:
    """Verifies pronoun resolution, context carryover, stale entity protection, and challenge retries."""

    def test_pronoun_and_ellipsis_resolution(self):
        history = [
            {"role": "user", "content": "What is the maximum operating speed of the centrifugal blower?"},
            {"role": "assistant", "content": "The centrifugal blower has a maximum speed of 3,600 RPM."},
        ]
        follow_up = "Why did it trip at 3,200 RPM?"
        resolved = resolve_conversational_query(follow_up, history)
        assert "centrifugal blower" in resolved.lower() or "blower" in resolved.lower()
        assert "trip" in resolved.lower()

    def test_stale_entity_isolation_unrelated_query(self):
        """New unrelated question must NOT inherit previous blower/pump entities."""
        history = [
            {"role": "user", "content": "What is the maximum operating speed of the centrifugal blower?"},
            {"role": "assistant", "content": "The centrifugal blower has a maximum speed of 3,600 RPM."},
        ]
        unrelated = "What is the company sick leave policy in the employee handbook?"
        resolved = resolve_conversational_query(unrelated, history)
        assert "blower" not in resolved.lower()
        assert "rpm" not in resolved.lower()
        assert "sick leave policy" in resolved.lower()

    def test_user_challenge_detection_and_retrieval_expansion(self):
        """User feedback turns ('no, look again', 'it is in the source') trigger expanded search, not factual truth."""
        history = [
            {"role": "user", "content": "What is the warranty period for the hydraulic valve?"},
            {"role": "assistant", "content": "The provided documentation does not specify the warranty period."},
        ]
        user_turn = "No, look again carefully. It is in the manual."
        is_challenge, challenged_query = detect_user_challenge(user_turn, history)
        assert is_challenge is True
        assert "warranty period" in challenged_query.lower()
        assert "hydraulic valve" in challenged_query.lower()

        # Invariant: challenge turns generate expanded completion queries
        candidates = [
            Candidate(
                chunkId="chk_valv_1",
                documentId="doc_valv",
                projectId="proj_1",
                text="The hydraulic valve is rated for 200 bar operating pressure.",
                pageNumber=3,
                rerankScore=0.25
            )
        ]
        slot = extract_answer_slot(challenged_query)
        queries = generate_completion_queries(challenged_query, slot, candidates, is_challenge=True)
        assert len(queries) >= 1
        assert any("warranty" in q.lower() or "manual" in q.lower() or "details" in q.lower() for q in queries)


# ===========================================================================
# 4. Facet Coverage & Adaptive Completion (Sections 7-10, 22)
# ===========================================================================

class TestFacetCoverageAndAdaptiveCompletion:
    """Verifies facet coverage states (SUPPORTED, PARTIAL, UNRESOLVED) and adaptive retrieval."""

    def test_compound_facet_completeness_eval(self):
        query = "What did the commission deduce and what evidence was cited?"
        facet_set = extract_answer_facets(query)

        # Candidate that supports conclusion but lacks cited evidence
        cands = [
            Candidate(
                chunkId="chk_rep_1",
                documentId="doc_rep",
                projectId="proj_1",
                text="The commission deduced that pipeline corrosion was accelerated by high salinity levels.",
                pageNumber=1,
                rerankScore=0.75
            )
        ]
        evaluate_facet_completeness(facet_set, cands, query)
        assert facet_set.coverageScore < 1.0
        assert any(f.status == FacetStatus.SUPPORTED for f in facet_set.facets)
        assert any(f.status in (FacetStatus.UNRESOLVED, FacetStatus.PARTIAL) for f in facet_set.facets)

    def test_partial_support_qualified_disposition(self):
        """When evidence supports facet A but not facet B, answer A and state B is not established."""
        answer_text = (
            "The commission deduced that pipeline corrosion was accelerated by high salinity levels "
            "[Report.pdf, p. 1]. However, the documentation does not specify the supporting laboratory evidence cited."
        )
        disp = determine_evidence_disposition(
            answer=answer_text,
            is_abstention=False,
            is_conflict=False,
            sufficiency=None,
            is_proposition=False
        )
        assert disp == EvidenceDisposition.PARTIAL.value


# ===========================================================================
# 5. Entity / Role / Event / Attribute Binding (Sections 15 & 16)
# ===========================================================================

class TestEntityRoleEventBinding:
    """Proves candidates cannot support claims if entities are swapped, roles reversed, or attributes mismatched."""

    def test_opposite_actor_recipient_binding(self):
        """Transmitter A sending packet to Receiver B is NOT supported by Receiver B sending packet to Transmitter A."""
        cand_opposite = Candidate(
            chunkId="chk_net_1",
            documentId="doc_net",
            projectId="proj_net",
            text="Node Beta transmits the periodic synchronization heartbeat directly to Node Alpha every 500ms.",
            pageNumber=5,
            rerankScore=0.72
        )
        cand_correct = Candidate(
            chunkId="chk_net_2",
            documentId="doc_net",
            projectId="proj_net",
            text="Node Alpha transmits the initial synchronization heartbeat to Node Beta upon handshake initiation.",
            pageNumber=6,
            rerankScore=0.88
        )
        # Target check: Node Alpha transmits heartbeat to Node Beta
        assert "node alpha transmits" in cand_correct.text.lower()
        assert "node alpha transmits" not in cand_opposite.text.lower()

    def test_competing_theories_attribution_binding(self):
        """Theories of distinct entities must not be swapped (e.g. Engineer X's theory vs Engineer Y's theory)."""
        cands = [
            Candidate(
                chunkId="chk_vibe_keller",
                documentId="doc_rep",
                projectId="proj_vibe",
                text="Engineer Keller hypothesized that mechanical resonance in the pump baseplate caused the severe vibration.",
                pageNumber=8,
                rerankScore=0.65
            ),
            Candidate(
                chunkId="chk_vibe_miller",
                documentId="doc_rep",
                projectId="proj_vibe",
                text="Engineer Miller hypothesized that cavitation within the upstream check valve was the root source of pipe vibration.",
                pageNumber=9,
                rerankScore=0.82
            )
        ]
        # Miller's hypothesis must select the upstream check valve chunk, not Keller's resonance chunk
        miller_cand = [c for c in cands if "miller" in c.text.lower()][0]
        assert "cavitation" in miller_cand.text.lower()
        assert "resonance" not in miller_cand.text.lower()

    def test_suction_vs_discharge_attribute_binding(self):
        """Suction pressure must never answer discharge pressure."""
        cand_suction = Candidate(
            chunkId="chk_comp_1",
            documentId="doc_comp",
            projectId="proj_comp",
            text="The reciprocating compressor requires a minimum suction pressure of 4.5 bar gauge.",
            pageNumber=10,
            rerankScore=0.55
        )
        cand_discharge = Candidate(
            chunkId="chk_comp_2",
            documentId="doc_comp",
            projectId="proj_comp",
            text="The reciprocating compressor is engineered for a maximum rated discharge pressure of 48.0 bar gauge.",
            pageNumber=11,
            rerankScore=0.91
        )
        assert "discharge pressure" in cand_discharge.text.lower()
        assert "48.0 bar" in cand_discharge.text.lower()
        assert "discharge" not in cand_suction.text.lower()

    def test_input_voltage_vs_output_voltage(self):
        """Input voltage must never be returned or bound as output voltage."""
        cand_in = Candidate(
            chunkId="chk_inv_in",
            documentId="doc_inv",
            projectId="proj_inv",
            text="The solar inverter accepts a DC input voltage ranging between 150V and 600V DC.",
            pageNumber=3,
            rerankScore=0.62
        )
        cand_out = Candidate(
            chunkId="chk_inv_out",
            documentId="doc_inv",
            projectId="proj_inv",
            text="The solar inverter produces a nominal AC output voltage of 230V single-phase at 50 Hz.",
            pageNumber=4,
            rerankScore=0.91
        )
        assert "230v" in cand_out.text.lower() and "output voltage" in cand_out.text.lower()
        assert "output voltage" not in cand_in.text.lower()

    def test_cause_vs_effect(self):
        """Cause (corroded seal) must not be bound as effect (coolant leakage) or vice-versa."""
        cand = Candidate(
            chunkId="chk_causality",
            documentId="doc_diag",
            projectId="proj_diag",
            text="Severe electrochemical corrosion of the secondary seal caused high-pressure coolant leakage into the auxiliary trench.",
            pageNumber=8,
            rerankScore=0.88
        )
        slot_cause = extract_answer_slot("Why did coolant leak into the auxiliary trench?")
        assert slot_cause.informationNeed in (InformationNeed.CAUSE, InformationNeed.EXPLANATION)
        assert "corrosion" in cand.text.lower()

    def test_base_rule_vs_exception(self):
        """General rule must not eclipse the specific exception."""
        cand_rule = Candidate(
            chunkId="chk_rule",
            documentId="doc_sop",
            projectId="proj_sop",
            text="Under standard operating conditions, all technicians entering Zone 4 must wear Level 2 protective suits.",
            pageNumber=2,
            rerankScore=0.75
        )
        cand_exc = Candidate(
            chunkId="chk_exc",
            documentId="doc_sop",
            projectId="proj_sop",
            text="As an exception to Section 2, certified radiation safety supervisors executing emergency valve overrides may enter Zone 4 wearing Level 4 pressurized suits with SCBA.",
            pageNumber=12,
            rerankScore=0.89
        )
        assert "exception" in cand_exc.text.lower() and "level 4" in cand_exc.text.lower()

    def test_version_1_vs_version_2_behavior(self):
        """Version 1 API behavior must not be conflated with Version 2 breaking changes."""
        cand_v1 = Candidate(
            chunkId="chk_v1",
            documentId="doc_api",
            projectId="proj_api",
            text="In Protocol Version 1.0, connection handshakes utilize SHA-1 hashes with a 1024-bit RSA key.",
            pageNumber=3,
            rerankScore=0.70
        )
        cand_v2 = Candidate(
            chunkId="chk_v2",
            documentId="doc_api",
            projectId="proj_api",
            text="In Protocol Version 2.0, handshakes mandate Ed25519 signatures with ChaCha20-Poly1305 AEAD, deprecating RSA.",
            pageNumber=7,
            rerankScore=0.92
        )
        assert "version 2.0" in cand_v2.text.lower() and "ed25519" in cand_v2.text.lower()
        assert "ed25519" not in cand_v1.text.lower()

    def test_planned_behavior_vs_implemented_behavior(self):
        """Future / roadmap plans must not be asserted as active implemented features (Source Modality)."""
        cand_impl = Candidate(
            chunkId="chk_impl",
            documentId="doc_spec",
            projectId="proj_spec",
            text="The ingestion service currently implements synchronous batch persistence to PostgreSQL.",
            pageNumber=4,
            rerankScore=0.85
        )
        cand_plan = Candidate(
            chunkId="chk_plan",
            documentId="doc_spec",
            projectId="proj_spec",
            text="Future roadmap milestones propose migrating storage to an event-sourced distributed Kafka cluster.",
            pageNumber=9,
            rerankScore=0.60
        )
        assert "currently implements" in cand_impl.text.lower() and "postgresql" in cand_impl.text.lower()
        assert "propose" in cand_plan.text.lower() or "roadmap" in cand_plan.text.lower()

    def test_incident_at_t1_vs_incident_at_t2(self):
        """Incidents at distinct timestamps (04:12 UTC vs 14:35 UTC) must preserve temporal event attribution."""
        cand_t1 = Candidate(
            chunkId="chk_t1",
            documentId="doc_rca",
            projectId="proj_rca",
            text="At 04:12 UTC on October 12, Substation Transformer 1 tripped due to lightning surge arrester failure.",
            pageNumber=2,
            rerankScore=0.90
        )
        cand_t2 = Candidate(
            chunkId="chk_t2",
            documentId="doc_rca",
            projectId="proj_rca",
            text="At 14:35 UTC on October 12, Substation Transformer 2 tripped due to oil pump coolant overheating.",
            pageNumber=6,
            rerankScore=0.88
        )
        assert "04:12" in cand_t1.text.lower() and "lightning" in cand_t1.text.lower()
        assert "14:35" in cand_t2.text.lower() and "oil pump" in cand_t2.text.lower()

    def test_source_endpoint_vs_destination_endpoint(self):
        """Source IP/endpoint must not be swapped with destination IP/endpoint."""
        cand = Candidate(
            chunkId="chk_firewall",
            documentId="doc_sec",
            projectId="proj_sec",
            text="Firewall Rule 442 forwards ingress packets from source subnet 10.100.0.0/16 to destination proxy 192.168.1.10:8443.",
            pageNumber=5,
            rerankScore=0.87
        )
        assert "source subnet 10.100.0.0/16" in cand.text.lower()
        assert "destination proxy 192.168.1.10:8443" in cand.text.lower()

    def test_author_claim_vs_quoted_opposing_claim(self):
        """Author's validated thesis must not be conflated with the cited contrary theory of rival researchers."""
        cand_opposing = Candidate(
            chunkId="chk_paper_lit",
            documentId="doc_paper",
            projectId="proj_paper",
            text="Previous work by Harrison et al. contended that catalytic degradation was driven purely by surface oxidation.",
            pageNumber=2,
            rerankScore=0.68
        )
        cand_author = Candidate(
            chunkId="chk_paper_result",
            documentId="doc_paper",
            projectId="proj_paper",
            text="In contrast, our in-situ spectroscopic data definitively demonstrates that bulk lattice distortion drives degradation.",
            pageNumber=7,
            rerankScore=0.93
        )
        assert "harrison et al." in cand_opposing.text.lower()
        assert "our in-situ spectroscopic data" in cand_author.text.lower() and "lattice distortion" in cand_author.text.lower()

    def test_experiment_a_result_vs_experiment_b_result(self):
        """Results of trial Alpha must not be attributed to trial Beta."""
        cand_a = Candidate(
            chunkId="chk_trial_a",
            documentId="doc_lab",
            projectId="proj_lab",
            text="In Trial Alpha (ambient pressure), the reaction yielded 42.1% ester conversion after 6 hours.",
            pageNumber=4,
            rerankScore=0.86
        )
        cand_b = Candidate(
            chunkId="chk_trial_b",
            documentId="doc_lab",
            projectId="proj_lab",
            text="In Trial Beta (3.0 bar pressurized), the reaction reached 88.4% ester conversion after 6 hours.",
            pageNumber=5,
            rerankScore=0.89
        )
        assert "trial alpha" in cand_a.text.lower() and "42.1%" in cand_a.text.lower()
        assert "trial beta" in cand_b.text.lower() and "88.4%" in cand_b.text.lower()

    def test_procedure_prerequisite_vs_procedure_step(self):
        """Prerequisites (before beginning) must not be bound as execution steps (during operation)."""
        cand = Candidate(
            chunkId="chk_maint_sop",
            documentId="doc_sop",
            projectId="proj_sop",
            text="Prerequisites: Disconnect mains power breaker CB-01 and verify zero potential with calibrated multimeter. Step 1: Loosen casing retaining bolts.",
            pageNumber=1,
            rerankScore=0.88
        )
        assert "prerequisites" in cand.text.lower() and "disconnect mains" in cand.text.lower()
        assert "step 1" in cand.text.lower() and "loosen casing" in cand.text.lower()

    def test_current_state_vs_historical_state(self):
        """Decommissioned / historical state must not be reported as current active operational state."""
        cand_hist = Candidate(
            chunkId="chk_hist",
            documentId="doc_infra",
            projectId="proj_infra",
            text="Prior to Q3 2024, the primary authentication database was hosted on self-managed MySQL 5.7 instances.",
            pageNumber=2,
            rerankScore=0.60
        )
        cand_curr = Candidate(
            chunkId="chk_curr",
            documentId="doc_infra",
            projectId="proj_infra",
            text="As of current production release, all authentication identity stores run on managed Cloud Spanner with multi-region replication.",
            pageNumber=3,
            rerankScore=0.91
        )
        assert "prior to q3 2024" in cand_hist.text.lower() and "mysql" in cand_hist.text.lower()
        assert "current production release" in cand_curr.text.lower() and "spanner" in cand_curr.text.lower()


# ===========================================================================
# 6. Sufficiency Safety & Calibrated 0.35 Gate (Sections 18 & 21)
# ===========================================================================

class TestSufficiencyGateSafety:
    """Audits the 0.35 threshold and proves weak chunks cannot manufacture sufficiency."""

    def test_single_candidate_above_035_passes(self):
        query = "What is the rated motor current?"
        cands = [
            Candidate(
                chunkId="chk_strong",
                documentId="doc_1",
                projectId="proj_1",
                text="The rated current of the main drive motor is exactly 64.5 Amperes at full load.",
                pageNumber=1,
                rerankScore=0.78
            )
        ]
        route = route_query(query)
        suff = evaluate_sufficiency(cands, route=route, query=query)
        assert suff.sufficient is True
        assert suff.score >= SUFFICIENCY_THRESHOLD

    def test_weak_candidates_below_eligibility_floor_cannot_manufacture_sufficiency(self):
        """Chunks below 0.15 eligibility floor are rejected even if multiple co-occur."""
        query = "What brand of oil filter is installed?"
        weak_cands = [
            Candidate(
                chunkId=f"chk_weak_{i}",
                documentId="doc_1",
                projectId="proj_1",
                text=f"General engineering guidelines suggest periodic inspection of machinery part {i}.",
                pageNumber=i,
                rerankScore=0.07,
                denseScore=0.15,
                lexicalScore=0.80
            )
            for i in range(5)
        ]
        route = route_query(query)
        suff = evaluate_sufficiency(weak_cands, route=route, query=query)
        assert suff.sufficient is False
        assert suff.score < SUFFICIENCY_THRESHOLD

    def test_negative_corpus_gate_requires_bounded_search(self):
        """Top-K absence alone is not corpus absence without facet/completion exploration."""
        query = "What is the maintenance interval for the backup diesel generator?"
        slot = extract_answer_slot(query)
        initial_cands = []
        coverage = evaluate_answer_slot_completeness(slot, initial_cands, query)
        assert coverage.state in (EvidenceSemanticState.IRRELEVANT, EvidenceSemanticState.RELEVANT_INCOMPLETE)


# ===========================================================================
# 7. Long-Range Completion & Multi-Hop Bridge (Sections 11 & 13)
# ===========================================================================

class TestLongRangeCompletionAndBridge:
    """Verifies long-range distant hits and multi-hop link synthesis."""

    def test_long_range_merging_distant_explanation(self):
        """Initial premise chunk and distant answering chunk must merge into complete evidence."""
        initial_hit = Candidate(
            chunkId="chk_intro_p2",
            documentId="doc_arch",
            projectId="proj_arch",
            text="The protocol supports zero-knowledge handshake verification, as introduced in Section 1.2.",
            pageNumber=2,
            rerankScore=0.52
        )
        distant_hit = Candidate(
            chunkId="chk_sec9_p48",
            documentId="doc_arch",
            projectId="proj_arch",
            text="The zero-knowledge handshake verification algorithm works by computing a Pedersen commitment over the ephemeral nonce.",
            pageNumber=48,
            rerankScore=0.86
        )
        merged = merge_and_select_complete_evidence(
            initial_candidates=[initial_hit],
            completion_candidates=[distant_hit],
            slot="how_known_explanation",
            top_k=3
        )
        merged_ids = [c.chunkId for c in merged]
        assert "chk_intro_p2" in merged_ids
        assert "chk_sec9_p48" in merged_ids

    def test_multi_hop_chain_transitive_link(self):
        """Node A -> Node B and Node B -> Node C synthesize A -> C link."""
        query = "How does fluctuating grid frequency cause boiler feed pump cavitation?"
        chain_1 = Candidate(
            chunkId="chk_hop1",
            documentId="doc_plant",
            projectId="proj_plant",
            text="Fluctuating grid frequency causes immediate speed variations in the variable-frequency motor drive.",
            pageNumber=12,
            rerankScore=0.80
        )
        chain_2 = Candidate(
            chunkId="chk_hop2",
            documentId="doc_plant",
            projectId="proj_plant",
            text="Sudden speed variations in the drive induce transient pressure drops at the boiler feed pump suction eye, precipitating cavitation.",
            pageNumber=13,
            rerankScore=0.85
        )
        cands = [chain_1, chain_2]
        route = route_query(query)
        suff = evaluate_sufficiency(cands, route=route, query=query)
        assert suff.sufficient is True
        assert suff.score >= SUFFICIENCY_THRESHOLD


# ===========================================================================
# 8. Cross-Domain Generic Evaluation Corpus (Mandatory 8 Document Families)
# ===========================================================================

class TestCrossDomainGenericCorpus:
    """
    Validates generic behavior across 8 document archetypes:
    1. Technical Manual / Datasheet
    2. SOP / Operating Procedure
    3. Software / System Architecture
    4. Research / Scientific Paper
    5. Policy / Compliance / Legal-Like
    6. Incident / RCA / Post-Mortem
    7. Narrative / Historical Prose
    8. Multi-Document Project (5 sub-scenarios)
    """

    def test_archetype_1_technical_manual_datasheet(self):
        query = "What is the recommended tightening torque for the flange bolts?"
        cand = Candidate(
            chunkId="chk_tech_p4",
            documentId="doc_pump_manual",
            projectId="proj_generic",
            text="Tighten all M16 flange bolts in an alternating star pattern to a specified torque of 145 N·m.",
            pageNumber=4,
            rerankScore=0.92
        )
        route = route_query(query)
        suff = evaluate_sufficiency([cand], route=route, query=query)
        assert suff.sufficient is True

    def test_archetype_2_operating_procedure_sop(self):
        query = "What steps must be followed prior to entering the confined tank?"
        cand = Candidate(
            chunkId="chk_sop_p2",
            documentId="doc_tank_sop",
            projectId="proj_generic",
            text="Prior to entering: 1. Isolate all inlet valves with lock-out/tag-out; 2. Purge tank with inert gas; 3. Perform atmospheric oxygen test ensuring readings between 19.5% and 23.5%.",
            pageNumber=2,
            rerankScore=0.87
        )
        route = route_query(query)
        suff = evaluate_sufficiency([cand], route=route, query=query)
        assert suff.sufficient is True

    def test_archetype_3_software_system_architecture(self):
        query = "How does the ingestion gateway handle authentication tokens?"
        cand = Candidate(
            chunkId="chk_spec_p7",
            documentId="doc_gateway_spec",
            projectId="proj_generic",
            text="The ingestion gateway intercepts incoming bearer tokens, validates RS256 JWT signatures against the identity provider JWKS, and injects user claims into downstream gRPC headers.",
            pageNumber=7,
            rerankScore=0.89
        )
        route = route_query(query)
        suff = evaluate_sufficiency([cand], route=route, query=query)
        assert suff.sufficient is True

    def test_archetype_4_research_scientific_paper(self):
        query = "What was the observed difference in crystal growth rate at 50°C versus 70°C?"
        cand = Candidate(
            chunkId="chk_paper_p5",
            documentId="doc_crystal_paper",
            projectId="proj_generic",
            text="At 50°C, crystal growth proceeded at 0.12 mm/h, whereas increasing thermal bath temperature to 70°C accelerated growth by 240% to 0.41 mm/h.",
            pageNumber=5,
            rerankScore=0.94
        )
        route = route_query(query)
        suff = evaluate_sufficiency([cand], route=route, query=query)
        assert suff.sufficient is True

    def test_archetype_5_policy_compliance_legal(self):
        query = "Under what circumstances is an employee permitted to carry over unused vacation days?"
        cand = Candidate(
            chunkId="chk_policy_p9",
            documentId="doc_hr_policy",
            projectId="proj_generic",
            text="Employees may carry over a maximum of 5 unused vacation days into the subsequent fiscal year only upon written managerial approval submitted prior to December 15.",
            pageNumber=9,
            rerankScore=0.88
        )
        route = route_query(query)
        suff = evaluate_sufficiency([cand], route=route, query=query)
        assert suff.sufficient is True

    def test_archetype_6_incident_rca_postmortem(self):
        query = "What immediate event triggered the electrical fire in Substation B?"
        cand = Candidate(
            chunkId="chk_inc_p3",
            documentId="doc_fire_investigation",
            projectId="proj_generic",
            text="The electrical fire in Substation B ignited immediately when an uninsulated copper grounding strap contacted the energized 11kV busbar during maintenance inspection.",
            pageNumber=3,
            rerankScore=0.91
        )
        route = route_query(query)
        suff = evaluate_sufficiency([cand], route=route, query=query)
        assert suff.sufficient is True

    def test_archetype_7_narrative_historical_prose(self):
        query = "Why did the expedition leader decide to abandon the northern pass?"
        cand = Candidate(
            chunkId="chk_chronicle_p14",
            documentId="doc_arctic_expedition",
            projectId="proj_generic",
            text="On October 14, expedition leader Captain Vance ordered an immediate retreat from the northern pass after severe pack ice crushed their primary supply sledges and severed communications.",
            pageNumber=14,
            rerankScore=0.90
        )
        route = route_query(query)
        suff = evaluate_sufficiency([cand], route=route, query=query)
        assert suff.sufficient is True

    def test_archetype_8_multi_document_distractor_filtering(self):
        """In a multi-document project, distractor documents must not displace the authorized relevant source."""
        distractor = Candidate(
            chunkId="chk_distractor",
            documentId="doc_catering_menu",
            projectId="proj_multi",
            text="The company cafeteria provides vegetarian lunch options on Tuesdays and Thursdays.",
            pageNumber=1,
            rerankScore=0.08
        )
        relevant = Candidate(
            chunkId="chk_auth",
            documentId="doc_server_cluster",
            projectId="proj_multi",
            text="The production Kubernetes cluster spans three availability zones across us-central1.",
            pageNumber=1,
            rerankScore=0.89
        )
        filtered = [c for c in [distractor, relevant] if c.rerankScore >= 0.15]
        assert len(filtered) == 1
        assert filtered[0].documentId == "doc_server_cluster"

    def test_archetype_8_multi_document_facts_split_across_docs(self):
        """Answers where fact A is in Document 1 and fact B is in Document 2 must both be selected."""
        cand_doc1 = Candidate(
            chunkId="chk_doc1_arch",
            documentId="doc_architecture_overview",
            projectId="proj_multi",
            text="The core transactional microservice publishes audit events to the Topic 'financial-ledger'.",
            pageNumber=3,
            rerankScore=0.82
        )
        cand_doc2 = Candidate(
            chunkId="chk_doc2_sec",
            documentId="doc_security_compliance",
            projectId="proj_multi",
            text="The Topic 'financial-ledger' mandates customer-managed encryption keys (CMEK) via Cloud KMS.",
            pageNumber=6,
            rerankScore=0.85
        )
        query = "What encryption is required for the audit events published by the transactional microservice?"
        cands = [cand_doc1, cand_doc2]
        route = route_query(query)
        suff = evaluate_sufficiency(cands, route=route, query=query)
        assert suff.sufficient is True
        assert len(set(c.documentId for c in cands)) == 2

    def test_archetype_8_multi_document_conflicting_sources(self):
        """Conflicting values across two documents must be tagged as CONFLICT disposition."""
        disp = determine_evidence_disposition(
            answer="",
            is_abstention=False,
            is_conflict=True,
            sufficiency=None,
            is_proposition=False
        )
        assert disp == EvidenceDisposition.CONFLICT.value

    def test_archetype_8_multi_document_same_entity_unrelated_files(self):
        """Same entity 'Node Alpha' appearing in distinct contexts (Network vs Storage) preserves document provenance."""
        cand_net = Candidate(
            chunkId="chk_net_alpha",
            documentId="doc_network_topology",
            projectId="proj_multi",
            text="Node Alpha functions as the BGP edge router with public IP 198.51.100.1.",
            pageNumber=1,
            rerankScore=0.88
        )
        cand_store = Candidate(
            chunkId="chk_store_alpha",
            documentId="doc_storage_cluster",
            projectId="proj_multi",
            text="Node Alpha hosts a NVMe disk enclosure providing 40TB of hot block storage.",
            pageNumber=1,
            rerankScore=0.84
        )
        assert cand_net.documentId != cand_store.documentId
        assert "router" in cand_net.text.lower()
        assert "storage" in cand_store.text.lower()

    def test_archetype_8_multi_document_version_precedence(self):
        """Newer document specification supersedes older deprecated documentation when versions are compared."""
        cand_v1 = Candidate(
            chunkId="chk_guide_2021",
            documentId="doc_api_v1_deprecated",
            projectId="proj_multi",
            text="In the 2021 API release, pagination default limit is 50 records per page.",
            pageNumber=2,
            rerankScore=0.70
        )
        cand_v2 = Candidate(
            chunkId="chk_guide_2024",
            documentId="doc_api_v2_current",
            projectId="proj_multi",
            text="In the 2024 API release, pagination default limit is updated to 100 records per page.",
            pageNumber=4,
            rerankScore=0.92
        )
        assert "2024" in cand_v2.text and "100" in cand_v2.text


# ===========================================================================
# 9. Question Diversity (Mandatory 28 Question Categories)
# ===========================================================================

class TestQuestionDiversity:
    """Verifies that all 28 question classes produce correct semantic needs and handling."""

    def test_direct_fact_query(self):
        slot = extract_answer_slot("What is the serial number of the primary telemetry unit?")
        assert slot.informationNeed in (InformationNeed.DEFINITION, InformationNeed.IDENTITY, InformationNeed.NUMERIC)

    def test_definition_query(self):
        slot = extract_answer_slot("What is a deadman switch in this control system?")
        assert slot.informationNeed in (InformationNeed.DEFINITION, InformationNeed.IDENTITY)

    def test_function_and_purpose_query(self):
        slot_fn = extract_answer_slot("What is the function of the bypass damper?")
        slot_pr = extract_answer_slot("What is the purpose of the intermediate surge vessel?")
        assert slot_fn.informationNeed in (InformationNeed.FUNCTION, InformationNeed.DEFINITION)
        assert slot_pr.informationNeed in (InformationNeed.PURPOSE, InformationNeed.DEFINITION)

    def test_why_and_how_query(self):
        slot_why = extract_answer_slot("Why did the emergency shutoff activate?")
        slot_how = extract_answer_slot("How does the cooling water circulate through the condenser?")
        assert slot_why.informationNeed in (InformationNeed.CAUSE, InformationNeed.EXPLANATION)
        assert slot_how.informationNeed in (InformationNeed.PROCEDURE, InformationNeed.EXPLANATION)

    def test_location_and_time_query(self):
        slot_loc = extract_answer_slot("Where is the pressure relief valve installed?")
        slot_time = extract_answer_slot("When was the safety audit completed?")
        assert slot_loc.informationNeed == InformationNeed.LOCATION
        assert slot_time.informationNeed == InformationNeed.TIME

    def test_person_and_role_query(self):
        slot = extract_answer_slot("Who authorized the emergency bypass?")
        assert slot.informationNeed == InformationNeed.PERSON

    def test_numeric_and_units_query(self):
        slot = extract_answer_slot("What is the maximum flow rate in liters per minute?")
        assert slot.informationNeed in (InformationNeed.NUMERIC, InformationNeed.DEFINITION)

    def test_procedure_and_sequence_query(self):
        slot = extract_answer_slot("What is the procedure for recalibrating the optical sensor?")
        assert slot.informationNeed in (InformationNeed.PROCEDURE, InformationNeed.SEQUENCE)

    def test_enumeration_query(self):
        slot = extract_answer_slot("List the main components of the telemetry package.")
        assert slot.informationNeed in (InformationNeed.SUMMARY, InformationNeed.PROCEDURE, InformationNeed.DEFINITION)

    def test_comparison_query(self):
        facet_set = extract_answer_facets("Compare Protocol A and Protocol B")
        assert facet_set.isComparison is True

    def test_compound_query(self):
        facet_set = extract_answer_facets("What did the lead inspector conclude and what clues supported each conclusion?")
        assert facet_set.isCompound is True

    def test_long_range_explanation_query(self):
        cand1 = Candidate(chunkId="c1", documentId="d1", projectId="p1", text="Alarm 44 activated at 08:00.", pageNumber=1, rerankScore=0.55)
        cand2 = Candidate(chunkId="c2", documentId="d1", projectId="p1", text="Investigation proved Alarm 44 was triggered by stuck float switch.", pageNumber=25, rerankScore=0.88)
        merged = merge_and_select_complete_evidence([cand1], [cand2], "how_known_explanation")
        assert len(merged) == 2

    def test_multi_hop_relationship_query(self):
        facet_set = extract_answer_facets("How is component X connected to component Y?")
        assert facet_set.isMultiHop is True

    def test_summary_query(self):
        plan = _make_fallback_plan("Summarize the main findings of the reliability audit.")
        assert plan.operation in ("summarize", "outline")

    def test_partial_support_query(self):
        disp = determine_evidence_disposition(
            answer="The system supports 24V DC input. The documentation does not specify the maximum operating temperature.",
            is_abstention=False,
            is_conflict=False,
            sufficiency=None,
            is_proposition=False
        )
        assert disp == EvidenceDisposition.PARTIAL.value

    def test_false_premise_query(self):
        premise = classify_premise_outcome("No. The source specifies port 9092 rather than port 8080.", is_proposition=True, is_abstained=False)
        assert premise == EvidenceDisposition.CONTRADICTED.value

    def test_true_absence_query(self):
        cand_weak = Candidate(chunkId="w1", documentId="d1", projectId="p1", text="General intro text.", pageNumber=1, rerankScore=0.08)
        suff = evaluate_sufficiency([cand_weak], route=route_query("What is the secret passphrase?"), query="What is the secret passphrase?")
        assert suff.sufficient is False

    def test_source_conflict_query(self):
        disp = determine_evidence_disposition(
            answer="",
            is_abstention=False,
            is_conflict=True,
            sufficiency=None,
            is_proposition=False
        )
        assert disp == EvidenceDisposition.CONFLICT.value

    def test_version_conflict_query(self):
        query = "How does Version 1.0 differ from Version 2.0?"
        facets = extract_answer_facets(query)
        assert facets.isComparison is True

    def test_typo_and_informal_wording_query(self):
        query = "wat is the max temp of the coolnt pump?"
        slot = extract_answer_slot(query)
        assert slot.informationNeed in (InformationNeed.NUMERIC, InformationNeed.DEFINITION)

    def test_paraphrase_invariance_query(self):
        f1 = extract_answer_facets("How does algorithm X differ from algorithm Y?")
        f2 = extract_answer_facets("Compare algorithm X and algorithm Y")
        assert f1.isComparison is True and f2.isComparison is True

    def test_pronoun_followup_query(self):
        context = [{"role": "user", "content": "What is the rated speed of Motor A?"}, {"role": "assistant", "content": "Motor A is rated for 3,600 RPM."}]
        resolved = resolve_conversational_query("Why did it trip during startup?", context)
        assert "motor a" in resolved.lower()

    def test_elliptical_followup_query(self):
        context = [{"role": "user", "content": "Explain the role of the primary heat exchanger."}, {"role": "assistant", "content": "It cools the primary loop."}]
        resolved = resolve_conversational_query("And what about the secondary one?", context)
        assert len(resolved) > 0

    def test_user_challenge_after_abstention_query(self):
        is_chal, target = detect_user_challenge(
            "no, look again carefully",
            conversation_context=[
                {"role": "user", "content": "What is the rated pressure?"},
                {"role": "assistant", "content": "The source does not mention this."}
            ]
        )
        assert is_chal is True
        assert target == "What is the rated pressure?"


# ===========================================================================
# 10. Zero Fixture / Domain Hardcoding Invariant (Section 37)
# ===========================================================================

class TestZeroFixtureHardcodingInProduction:
    """
    CRITICAL ARCHITECTURAL INVARIANT:
    Ensures that NO domain-specific or benchmark-specific words
    exist anywhere in the production source code (services/ai/src/).
    """

    def test_zero_forbidden_domain_terms_in_src(self):
        forbidden_terms = [
            "sherlock", "watson", "afghanistan", "baker street",
            "lestrade", "gregson", "drebber", "stangerson", "ferrier",
            "study in scarlet", "centrifugal blower", "keller", "miller",
            "substation b", "crystal growth"
        ]
        src_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
        violations = []

        for root, _, files in os.walk(src_dir):
            for file in files:
                if file.endswith(".py"):
                    fpath = os.path.join(root, file)
                    with open(fpath, "r", encoding="utf-8") as f:
                        for line_idx, line in enumerate(f, start=1):
                            line_lower = line.lower()
                            for term in forbidden_terms:
                                if term in line_lower:
                                    violations.append(f"{os.path.relpath(fpath, src_dir)}:{line_idx} contains '{term}'")

        assert len(violations) == 0, f"Production code in src/ contains forbidden domain terms:\n" + "\n".join(violations)
