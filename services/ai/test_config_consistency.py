
"""
GroundGuard Production Safety & Configuration Consistency Test Suite
Verifies:
1. Configured Sufficiency Threshold consistency (0.35 canonical value)
2. Qdrant Fail-Closed Production Invariant (no silent embedded/in-memory fallback)
3. Qdrant Development Fallback Invariant (explicit, observable fallback in dev)
4. ALLOW_OFFLINE_DB Strict Production Guard (fails closed, raises fatal error if enabled in production)
"""

import os
import unittest
from unittest.mock import patch, MagicMock

class TestSufficiencyThresholdConsistency(unittest.TestCase):
    def test_threshold_comes_from_central_config(self):
        """Test 9: Threshold comes from central config (SUFFICIENCY_THRESHOLD)."""
        from src.pipeline.retrieval import SUFFICIENCY_THRESHOLD
        self.assertEqual(
            SUFFICIENCY_THRESHOLD,
            0.35,
            f"Configured sufficiency threshold must be 0.35, got {SUFFICIENCY_THRESHOLD}"
        )

    def test_supported_evidence_is_sufficient(self):
        """Test 1: Supported evidence -> sufficient (ANSWERABLE)."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        cand = Candidate(
            chunkId="chk_01",
            documentId="doc_pid",
            projectId="p1",
            text="Centrifugal pump P-101A operates at 180C with design pressure 15.2 bar.",
            identifiers=["P-101A"],
            rerankScore=0.92,
            sources=["qdrant_dense"]
        )
        route = route_query("What is the operating temperature of pump P-101A?")
        res = evaluate_sufficiency([cand], route)
        self.assertTrue(res.sufficient)
        self.assertEqual(res.score, 0.92)
        self.assertTrue(res.signals.identifierMatched)
        self.assertFalse(res.signals.conflictingEvidence)

    def test_contradicted_premise_with_strong_evidence_is_sufficient(self):
        """Test 2: Contradicted premise + strong evidence -> still sufficient (ANSWERABLE_WITH_PROJECT_EVIDENCE)."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        cand = Candidate(
            chunkId="chk_01",
            documentId="doc_pid",
            projectId="p1",
            text="Centrifugal pump P-101A operates at a continuous operating temperature of 180C.",
            identifiers=["P-101A"],
            rerankScore=0.88,
            sources=["qdrant_dense"]
        )
        # Query premise asserts cryogenic -196C (false), but evidence is sufficient to refute
        route = route_query("Is pump P-101A operating at -196C cryogenic temperature?")
        res = evaluate_sufficiency([cand], route)
        self.assertTrue(
            res.sufficient,
            "Query with contradicted premise must be marked sufficient when direct project evidence exists to answer/refute"
        )
        self.assertTrue(res.signals.identifierMatched)

    def test_weakly_related_evidence_is_insufficient(self):
        """Test 3: Weakly related evidence -> insufficient."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        cand = Candidate(
            chunkId="chk_weak",
            documentId="doc_maint",
            projectId="p1",
            text="Routine vibration checks are performed on rotating machinery.",
            identifiers=[],
            rerankScore=0.15,
            sources=["qdrant_dense"]
        )
        route = route_query("What are the vibration analysis standards for rotating machinery?")
        res = evaluate_sufficiency([cand], route)
        self.assertFalse(res.sufficient)
        self.assertIn("below sufficiency threshold", res.reason)

    def test_out_of_domain_query_is_insufficient(self):
        """Test 4: Out-of-domain query -> insufficient."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        cand = Candidate(
            chunkId="chk_dist",
            documentId="doc_1",
            projectId="p1",
            text="Vessel TK-500 inspection report.",
            identifiers=["TK-500"],
            rerankScore=0.01,
            sources=["qdrant_dense"]
        )
        route = route_query("What is the capital city of France?")
        res = evaluate_sufficiency([cand], route)
        self.assertFalse(res.sufficient)

    def test_missing_identifier_is_insufficient(self):
        """Test 5: Missing identifier -> insufficient."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        cand = Candidate(
            chunkId="chk_01",
            documentId="doc_1",
            projectId="p1",
            text="Centrifugal pump P-101A operations.",
            identifiers=["P-101A"],
            rerankScore=0.85,
            sources=["qdrant_dense"]
        )
        # Query asks about boiler B-901 which does not exist in evidence
        route = route_query("What is the operating pressure of boiler B-901?")
        res = evaluate_sufficiency([cand], route)
        self.assertFalse(res.sufficient)
        self.assertFalse(res.signals.identifierMatched)
        self.assertIn("not supported by retrieved evidence", res.reason)

    def test_exact_id_route_requires_identifier_support(self):
        """Test 6: Exact-ID route requires identifier support."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        cand_unsupported = Candidate(
            chunkId="chk_unrel",
            documentId="doc_1",
            projectId="p1",
            text="General plant layout and perimeter fencing.",
            identifiers=[],
            rerankScore=0.75,
            sources=["qdrant_dense"]
        )
        route_exact = route_query("What are the specs for P-101A?")
        self.assertTrue(route_exact.identifierQuery)
        res = evaluate_sufficiency([cand_unsupported], route_exact)
        self.assertFalse(res.sufficient)
        self.assertFalse(res.signals.identifierMatched)

    def test_semantic_route_does_not_require_identifier_support(self):
        """Test 7: Semantic route does not require identifier support."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        cand_semantic = Candidate(
            chunkId="chk_maint",
            documentId="doc_maint",
            projectId="p1",
            text="All rotating machinery requires scheduled vibration analysis every six months.",
            identifiers=[],
            rerankScore=0.85,
            sources=["qdrant_dense"]
        )
        route_semantic = route_query("How frequently must rotating machines undergo periodic vibration assessments?")
        self.assertFalse(route_semantic.identifierQuery)
        res = evaluate_sufficiency([cand_semantic], route_semantic)
        self.assertTrue(res.sufficient)
        self.assertTrue(res.signals.identifierMatched, "Semantic query must pass identifier matched check")

    def test_mixed_query_requires_grounding_all_identifiers(self):
        """Test mixed query: requires all extracted identifiers to be grounded."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        # Evidence has P-101A but lacks R-902
        cand_p101a = Candidate(
            chunkId="chk_p101a",
            documentId="doc_1",
            projectId="p1",
            text="Centrifugal pump P-101A suction line details.",
            identifiers=["P-101A"],
            rerankScore=0.85,
            sources=["qdrant_dense"]
        )
        route_mixed = route_query("What is the piping connection between pump P-101A and reactor R-902?")
        self.assertIn("R-902", route_mixed.extractedIdentifiers)
        res = evaluate_sufficiency([cand_p101a], route_mixed)
        self.assertFalse(res.sufficient)
        self.assertFalse(res.signals.identifierMatched)
        self.assertIn("R-902", res.reason)

    def test_conflicting_evidence_is_surfaced_explicitly(self):
        """Test 8: Conflicting evidence across distinct document sources is surfaced explicitly."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        cand_rev_a = Candidate(
            chunkId="chk_rev_a",
            documentId="doc_rev_a",
            projectId="p1",
            text="Centrifugal pump P-101A design pressure is 15.2 bar.",
            identifiers=["P-101A"],
            rerankScore=0.90,
            sources=["qdrant_dense"]
        )
        cand_rev_b = Candidate(
            chunkId="chk_rev_b",
            documentId="doc_rev_b",
            projectId="p1",
            text="Centrifugal pump P-101A design pressure is 16.0 bar.",
            identifiers=["P-101A"],
            rerankScore=0.89,
            sources=["qdrant_dense"]
        )
        route = route_query("What is the design pressure for pump P-101A in bar?")
        res = evaluate_sufficiency([cand_rev_a, cand_rev_b], route)
        self.assertFalse(res.sufficient, "Conflicting source evidence must not pass sufficiency silently")
        self.assertTrue(res.signals.conflictingEvidence, "conflictingEvidence signal must be True")
        self.assertIn("Conflicting evidence detected", res.reason)

    def test_benchmark_labels_match_corrected_semantics(self):
        """Test 10: Benchmark labels match corrected ANSWERABLE vs NOT_ANSWERABLE semantics."""
        from benchmark_sufficiency_calibration import BENCHMARK_CASES

        answerable_cases = [c for c in BENCHMARK_CASES if c["expected"]]
        not_answerable_cases = [c for c in BENCHMARK_CASES if not c["expected"]]

        self.assertEqual(len(BENCHMARK_CASES), 126)
        self.assertEqual(len(answerable_cases), 71)
        self.assertEqual(len(not_answerable_cases), 55)

        # Ensure contradicted-but-answerable cases are labeled True (ANSWERABLE)
        contra_cases = [c for c in BENCHMARK_CASES if c["category"] == "CONTRADICTED_BUT_ANSWERABLE"]
        self.assertEqual(len(contra_cases), 10)
        for c in contra_cases:
            self.assertTrue(c["expected"], f"Case {c['id']} must be labeled True (ANSWERABLE)")

    def test_scope_gate_blocks_high_semantic_score_out_of_domain_query(self):
        """Test: Out-of-domain query with high semantic score gets blocked by scope gate."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        cand = Candidate(
            chunkId="chk_01",
            documentId="doc_pid",
            projectId="p1",
            text="Centrifugal pump P-101A operates at 180C with design pressure 15.2 bar.",
            identifiers=["P-101A"],
            rerankScore=0.96,
            sources=["qdrant_dense"]
        )
        route = route_query("What is the capital expenditure of the European Union hydrogen directive?")
        res = evaluate_sufficiency([cand], route, query="What is the capital expenditure of the European Union hydrogen directive?")
        self.assertFalse(res.sufficient, "High-semantic-score out-of-domain query must be blocked by scope gate")
        self.assertEqual(res.scope, "OUT_OF_SCOPE")
        self.assertIn("Out of project scope", res.reason)

    def test_valid_semantic_project_query_passes_scope_gate(self):
        """Test: Valid semantic project query passes scope gate."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        cand = Candidate(
            chunkId="chk_sop",
            documentId="doc_sop",
            projectId="p1",
            text="Standard operating procedure for pump startup sequence: confirm lube oil, open suction valve, start motor, verify discharge pressure.",
            identifiers=[],
            rerankScore=0.88,
            lexicalScore=0.75,
            sources=["tantivy_lexical"]
        )
        route = route_query("What pump startup sequence is required?")
        res = evaluate_sufficiency([cand], route, query="What pump startup sequence is required?")
        self.assertTrue(res.sufficient)
        self.assertEqual(res.scope, "IN_SCOPE")

    def test_relational_conflict_is_detected(self):
        """Test: Topological relational conflict (upstream vs downstream) is detected."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        c1 = Candidate(
            chunkId="chk_1",
            documentId="doc_1",
            projectId="p1",
            text="Isolation valve V-204 is positioned directly upstream of pump P-101A.",
            identifiers=["P-101A", "V-204"],
            rerankScore=0.91,
            sources=["qdrant_dense"]
        )
        c2 = Candidate(
            chunkId="chk_2",
            documentId="doc_2",
            projectId="p1",
            text="Isolation valve V-204 is positioned directly downstream of pump P-101A.",
            identifiers=["P-101A", "V-204"],
            rerankScore=0.90,
            sources=["qdrant_dense"]
        )
        route = route_query("Where is valve V-204 relative to pump P-101A?")
        res = evaluate_sufficiency([c1, c2], route)
        self.assertFalse(res.sufficient)
        self.assertTrue(res.signals.conflictingEvidence)
        self.assertEqual(res.signals.conflictType, "RELATIONAL_CONFLICT")

    def test_state_conflict_is_detected(self):
        """Test: Operational state conflict (open vs closed) is detected."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        c1 = Candidate(
            chunkId="chk_1",
            documentId="doc_1",
            projectId="p1",
            text="During startup sequence, suction valve V-204 shall remain open.",
            identifiers=["V-204"],
            rerankScore=0.89,
            sources=["qdrant_dense"]
        )
        c2 = Candidate(
            chunkId="chk_2",
            documentId="doc_2",
            projectId="p1",
            text="During startup sequence, suction valve V-204 shall remain closed.",
            identifiers=["V-204"],
            rerankScore=0.88,
            sources=["qdrant_dense"]
        )
        route = route_query("What is the required operational state of valve V-204 during startup?")
        res = evaluate_sufficiency([c1, c2], route)
        self.assertFalse(res.sufficient)
        self.assertTrue(res.signals.conflictingEvidence)
        self.assertEqual(res.signals.conflictType, "STATE_CONFLICT")

    def test_procedural_conflict_is_detected(self):
        """Test: Procedural isolation conflict (manual vs automatic) is detected."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        c1 = Candidate(
            chunkId="chk_1",
            documentId="doc_1",
            projectId="p1",
            text="Pressure relief valve PSV-102 requires manual isolation.",
            identifiers=["PSV-102"],
            rerankScore=0.90,
            sources=["qdrant_dense"]
        )
        c2 = Candidate(
            chunkId="chk_2",
            documentId="doc_2",
            projectId="p1",
            text="Pressure relief valve PSV-102 requires automatic isolation.",
            identifiers=["PSV-102"],
            rerankScore=0.89,
            sources=["qdrant_dense"]
        )
        route = route_query("What isolation method is mandated for relief valve PSV-102?")
        res = evaluate_sufficiency([c1, c2], route)
        self.assertFalse(res.sufficient)
        self.assertTrue(res.signals.conflictingEvidence)
        self.assertEqual(res.signals.conflictType, "PROCEDURAL_CONFLICT")

    def test_scope_gate_does_not_replace_m1(self):
        """Test: Scope gate does not assign claim truth or replace M1 cross-encoder authority."""
        from src.pipeline.retrieval import evaluate_scope, Candidate, route_query, ScopeDecision

        cand = Candidate(
            chunkId="chk_01",
            documentId="doc_pid",
            projectId="p1",
            text="Centrifugal pump P-101A operates at 180C with design pressure 15.2 bar.",
            identifiers=["P-101A"],
            rerankScore=0.92,
            sources=["qdrant_dense"]
        )
        route = route_query("Is pump P-101A operating at -196C?")
        scope_res = evaluate_scope("Is pump P-101A operating at -196C?", [cand], route)

        self.assertEqual(scope_res.decision, ScopeDecision.IN_SCOPE)
        self.assertFalse(hasattr(scope_res, "verificationStatus"))
        self.assertFalse(hasattr(scope_res, "entailmentScore"))

    # -------------------------------------------------------------
    # Final Scope Generalization & Deep Conflict Hardening Tests
    # -------------------------------------------------------------

    def test_unseen_industrial_query_rejected(self):
        """Test 1: Unseen industrial query without domain regex match is rejected by evidence coverage."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        cand = Candidate(
            chunkId="chk_pump",
            documentId="doc_pid_01",
            projectId="p1",
            text="Centrifugal pump P-101A operates at 180C with design pressure 15.2 bar.",
            identifiers=["P-101A"],
            rerankScore=0.22,
            sources=["qdrant_dense"]
        )
        # Query contains industrial engineering terms (procurement, bidding, expenditures) but absent from corpus
        route = route_query("What is the vendor competitive bidding procedure for capital expenditures over 500k?")
        res = evaluate_sufficiency([cand], route)
        self.assertFalse(res.sufficient)
        self.assertEqual(res.scope, "OUT_OF_SCOPE")
        self.assertLess(res.signals.evidenceCoverageScore, 0.40)

    def test_high_semantic_score_alone_cannot_force_in_scope(self):
        """Test 2: High semantic score alone cannot force IN_SCOPE when evidence coverage is unanswerable."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        # Candidate has synthetic high rerank score (0.95), but content does not answer carbon tax
        cand = Candidate(
            chunkId="chk_pump",
            documentId="doc_pid_01",
            projectId="p1",
            text="Centrifugal pump P-101A operates at continuous temperature of 180C with emissions monitoring port.",
            identifiers=["P-101A"],
            rerankScore=0.95,
            sources=["qdrant_dense"]
        )
        route = route_query("What is the refinery carbon tax exposure under the EU CBAM?")
        res = evaluate_sufficiency([cand], route)
        self.assertFalse(res.sufficient, "High semantic score must NOT bypass answerability scope gate")
        self.assertEqual(res.scope, "OUT_OF_SCOPE")
        self.assertIn("Topically similar vocabulary detected", res.reason)

    def test_valid_indirect_project_query_remains_in_scope(self):
        """Test 3: Valid indirect project query remains IN_SCOPE and sufficient."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        cand = Candidate(
            chunkId="chk_maint_02",
            documentId="doc_maint_02",
            projectId="p1",
            text="All rotating machinery in Train A requires scheduled vibration monitoring and predictive frequency analysis every six months.",
            identifiers=["Train A"],
            rerankScore=0.88,
            sources=["qdrant_dense", "tantivy_lexical"],
            lexicalScore=4.2
        )
        route = route_query("How frequently should predictive vibration monitoring be performed on Train A machinery?")
        res = evaluate_sufficiency([cand], route)
        self.assertTrue(res.sufficient)
        self.assertEqual(res.scope, "IN_SCOPE")
        self.assertGreaterEqual(res.signals.evidenceCoverageScore, 0.40)

    def test_multi_sentence_procedural_conflict_detected(self):
        """Test 4: Multi-sentence procedural conflict across document revisions is detected."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        c1 = Candidate(
            chunkId="chk_revA",
            documentId="doc_sop_revA",
            projectId="p1",
            text="During startup, V-204 is maintained open until suction pressure stabilizes. Operators then confirm minimum flow before pump energization.",
            identifiers=["V-204"],
            rerankScore=0.91,
            sources=["qdrant_dense"]
        )
        c2 = Candidate(
            chunkId="chk_revB",
            documentId="doc_sop_revB",
            projectId="p1",
            text="During startup, V-204 must remain closed until P-101A reaches commanded speed. Opening before stabilization is prohibited.",
            identifiers=["V-204"],
            rerankScore=0.90,
            sources=["qdrant_dense"]
        )
        route = route_query("What is the required startup operational state for suction valve V-204?")
        res = evaluate_sufficiency([c1, c2], route)
        self.assertFalse(res.sufficient)
        self.assertTrue(res.signals.conflictingEvidence)
        self.assertIn(res.signals.conflictType, ["STATE_CONFLICT", "PROCEDURAL_CONFLICT"])

    def test_multi_sentence_relational_conflict_detected(self):
        """Test 5: Multi-sentence relational conflict (reversed topological flow direction) is detected."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        c1 = Candidate(
            chunkId="chk_relA",
            documentId="doc_pid_revA",
            projectId="p1",
            text="P-101A discharges toward E-210 through V-301.",
            identifiers=["P-101A", "E-210"],
            rerankScore=0.92,
            sources=["qdrant_dense"]
        )
        c2 = Candidate(
            chunkId="chk_relB",
            documentId="doc_pid_revB",
            projectId="p1",
            text="Following ECN-1042, flow direction was reversed and E-210 now supplies P-101A.",
            identifiers=["P-101A", "E-210"],
            rerankScore=0.91,
            sources=["qdrant_dense"]
        )
        route = route_query("Does pump P-101A supply heat exchanger E-210?")
        res = evaluate_sufficiency([c1, c2], route)
        self.assertFalse(res.sufficient)
        self.assertTrue(res.signals.conflictingEvidence)
        self.assertEqual(res.signals.conflictType, "RELATIONAL_CONFLICT")

    def test_m1_evidence_nli_invoked_only_for_bounded_relevant_pairs(self):
        """Test 6: M1 evidence-vs-evidence NLI invoked only for bounded relevant pairs (<= 3 calls)."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query
        from unittest.mock import patch, MagicMock

        # Create 5 cross-document candidate pairs on P-101A with neutral technical differences
        candidates = [
            Candidate(
                chunkId=f"chk_cand_{i}",
                documentId=f"doc_source_{i}",
                projectId="p1",
                text=f"Equipment P-101A operating parameter subsection {i} establishes secondary baseline.",
                identifiers=["P-101A"],
                rerankScore=0.85,
                sources=["qdrant_dense"]
            )
            for i in range(5)
        ]
        route = route_query("What protocol applies to P-101A?")

        with patch("httpx.post") as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "label": "neutral",
                "scores": {"entailment": 0.1, "contradiction": 0.1, "neutral": 0.8},
                "modelVersion": "groundguard-deberta-v1-finetuned"
            }
            mock_post.return_value = mock_resp

            evaluate_sufficiency(candidates, route)
            # M1 comparisons must be hard-bounded to <= 3 calls
            self.assertLessEqual(mock_post.call_count, 3, f"M1 calls ({mock_post.call_count}) exceeded MAX_NLI_COMPARISONS bound (3)")

    def test_no_o_n2_corpus_wide_comparisons(self):
        """Test 7: Candidates with disjoint equipment identifiers do NOT trigger NLI or conflict checks."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query
        from unittest.mock import patch

        candidates = [
            Candidate(chunkId="c1", documentId="d1", projectId="p1", text="Pump P-101A is operational.", identifiers=["P-101A"], rerankScore=0.9),
            Candidate(chunkId="c2", documentId="d2", projectId="p1", text="Vessel TK-500 is atmospheric.", identifiers=["TK-500"], rerankScore=0.9),
            Candidate(chunkId="c3", documentId="d3", projectId="p1", text="Compressor K-301 operates at 4.2 bar.", identifiers=["K-301"], rerankScore=0.9),
            Candidate(chunkId="c4", documentId="d4", projectId="p1", text="Furnace F-101 duty is 35 MW.", identifiers=["F-101"], rerankScore=0.9),
            Candidate(chunkId="c5", documentId="d5", projectId="p1", text="Exchanger E-210 uses titanium tubes.", identifiers=["E-210"], rerankScore=0.9),
        ]
        route = route_query("What is the status of the plant?")

        with patch("httpx.post") as mock_post:
            evaluate_sufficiency(candidates, route)
            mock_post.assert_not_called()

    def test_known_newer_revision_resolves_older_source_with_metadata(self):
        """Test 8: Known newer revision resolves older source when metadata proves precedence."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        c1 = Candidate(
            chunkId="chk_old",
            documentId="doc_pid_revA",
            projectId="p1",
            text="Centrifugal pump P-101A design pressure is 15.2 bar.",
            identifiers=["P-101A"],
            rerankScore=0.88,
            sources=["qdrant_dense"],
            metadata={"status": "superseded", "supersededBy": "doc_pid_revB", "version": 1}
        )
        c2 = Candidate(
            chunkId="chk_new",
            documentId="doc_pid_revB",
            projectId="p1",
            text="Centrifugal pump P-101A design pressure is 16.0 bar per ECN-402.",
            identifiers=["P-101A"],
            rerankScore=0.92,
            sources=["qdrant_dense"],
            metadata={"status": "approved", "supersedes": "doc_pid_revA", "version": 2}
        )
        route = route_query("What is the design pressure of pump P-101A?")
        res = evaluate_sufficiency([c1, c2], route)
        self.assertTrue(res.sufficient, "Known newer revision must resolve conflict and allow sufficiency")
        self.assertEqual(res.signals.revisionResolution, "newer_revision_selected")
        self.assertFalse(res.signals.conflictingEvidence)

    def test_unknown_revision_precedence_remains_unresolved(self):
        """Test 9: Unknown revision precedence remains an active unresolved conflict."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query

        c1 = Candidate(
            chunkId="chk_1",
            documentId="doc_pid_unknown1",
            projectId="p1",
            text="Centrifugal pump P-101A design pressure is 15.2 bar.",
            identifiers=["P-101A"],
            rerankScore=0.90,
            sources=["qdrant_dense"]
        )
        c2 = Candidate(
            chunkId="chk_2",
            documentId="doc_pid_unknown2",
            projectId="p1",
            text="Centrifugal pump P-101A design pressure is 16.0 bar.",
            identifiers=["P-101A"],
            rerankScore=0.91,
            sources=["qdrant_dense"]
        )
        route = route_query("What is the design pressure of pump P-101A?")
        res = evaluate_sufficiency([c1, c2], route)
        self.assertFalse(res.sufficient)
        self.assertTrue(res.signals.conflictingEvidence)
        self.assertEqual(res.signals.revisionResolution, "unresolved")

    def test_m1_outage_has_no_effect_on_m2_conflict_analysis(self):
        """Test 10 (restored): M2 makes no M1 calls. M1 outage must be invisible to M2 conflict analysis."""
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query
        from unittest.mock import patch

        c1 = Candidate(
            chunkId="chk_a",
            documentId="doc_sop_a",
            projectId="p1",
            text="Operator protocol section 4 requires local manual validation on P-101A.",
            identifiers=["P-101A"],
            rerankScore=0.90,
            sources=["qdrant_dense"]
        )
        c2 = Candidate(
            chunkId="chk_b",
            documentId="doc_sop_b",
            projectId="p1",
            text="Operator protocol section 4 remote logic controls operational pacing on P-101A.",
            identifiers=["P-101A"],
            rerankScore=0.89,
            sources=["qdrant_dense"]
        )
        route = route_query("What does operator protocol section 4 mandate for P-101A?")

        with patch("httpx.post", side_effect=ConnectionError("M1 service unreachable")):
            # M2 must not call M1 at all -- outage is invisible
            res = evaluate_sufficiency([c1, c2], route)
            # The two SOP chunks have no shared numeric context and low predicate overlap,
            # so the factual-overlap gate skips them. No UNKNOWN conflict from M1.
            self.assertNotEqual(
                getattr(res.signals, "conflictType", None), "UNKNOWN",
                "M2 must not produce UNKNOWN conflict from M1 outage -- M2 does not call M1"
            )

class TestQdrantProductionSafety(unittest.TestCase):
    def test_production_fails_closed_without_embedded_fallback(self):
        """
        In production, if authoritative Qdrant URL is unreachable,
        QdrantStore MUST NOT fall back to embedded disk or in-memory.
        It must raise a fatal RuntimeError.
        """
        with patch.dict(os.environ, {"ENVIRONMENT": "production", "QDRANT_PATH": "uploads/indexes/qdrant_embedded"}):
            from src.pipeline.qdrant_store import QdrantStore
            with patch("src.pipeline.qdrant_store.QdrantClient") as mock_qclient:
                # Mock failure to connect to external Qdrant server
                mock_instance = MagicMock()
                mock_instance.get_collections.side_effect = ConnectionError("Qdrant server unreachable")
                mock_qclient.return_value = mock_instance

                with self.assertRaises(RuntimeError) as ctx:
                    QdrantStore(url="http://unreachable-qdrant:6333", path="uploads/indexes/qdrant_embedded")

                self.assertIn("production requires a healthy external Qdrant cluster", str(ctx.exception))

    def test_production_forbids_in_memory_mode(self):
        with patch.dict(os.environ, {"ENVIRONMENT": "production"}):
            from src.pipeline.qdrant_store import QdrantStore
            with self.assertRaises(RuntimeError) as ctx:
                QdrantStore(url=":memory:")
            self.assertIn("is not permitted in production", str(ctx.exception))

    def test_production_forbids_disk_embedded_mode(self):
        with patch.dict(os.environ, {"ENVIRONMENT": "production"}):
            from src.pipeline.qdrant_store import QdrantStore
            with self.assertRaises(RuntimeError) as ctx:
                QdrantStore(url="", path="uploads/indexes/qdrant_embedded")
            self.assertIn("is not permitted in production", str(ctx.exception))

    def test_development_allows_observable_embedded_fallback(self):
        """
        In development, fallback to embedded disk is permitted only with the explicit opt-in
        QDRANT_ALLOW_EMBEDDED_FALLBACK=true, logs an explicit warning, and is reported as such.
        """
        with patch.dict(os.environ, {"ENVIRONMENT": "development", "QDRANT_PATH": "scratch/test_qdrant_dev_fallback",
                                     "QDRANT_ALLOW_EMBEDDED_FALLBACK": "true"}):
            from src.pipeline.qdrant_store import QdrantStore
            with patch("src.pipeline.qdrant_store.QdrantClient") as mock_qclient:
                # External connection fails
                mock_qclient.side_effect = [
                    ConnectionError("Qdrant server unreachable"), # external call
                    MagicMock() # embedded fallback succeeds
                ]
                with self.assertLogs("m2-qdrant-store", level="WARNING") as log_capture:
                    store = QdrantStore(url="http://localhost:9999", path="scratch/test_qdrant_dev_fallback")
                    self.assertTrue(any("Falling back to embedded disk Qdrant" in msg for msg in log_capture.output))
                self.assertEqual(store.backend, "embedded_fallback")
                self.assertFalse(store.status()["authoritative"])

    def test_development_does_not_silently_switch_stores(self):
        """
        Without the explicit opt-in, an unreachable server must NOT be replaced by the embedded store
        (audit 2026-10-08: silent fallback served 0/31 READY documents while /health said ok).
        """
        env = {"ENVIRONMENT": "development", "QDRANT_PATH": "scratch/test_qdrant_dev_fallback",
               "QDRANT_ALLOW_EMBEDDED_FALLBACK": "false", "ALLOW_IN_MEMORY_FALLBACK": "false"}
        with patch.dict(os.environ, env):
            from src.pipeline.qdrant_store import QdrantStore, QdrantUnavailableError
            with patch("src.pipeline.qdrant_store.QdrantClient") as mock_qclient:
                mock_qclient.side_effect = ConnectionError("Qdrant server unreachable")
                store = QdrantStore(url="http://localhost:9999", path="scratch/test_qdrant_dev_fallback")
                # Only the server URL was ever attempted -- never a path= (embedded) client.
                for call in mock_qclient.call_args_list:
                    self.assertNotIn("path", call.kwargs)
                self.assertEqual(store.backend, "server")
                self.assertFalse(store.available)
                self.assertFalse(store.status()["available"])
                with self.assertRaises(QdrantUnavailableError):
                    store.client


class TestAllowOfflineDBSafety(unittest.TestCase):
    def test_production_forbids_allow_offline_db(self):
        """
        In production, ALLOW_OFFLINE_DB=true MUST raise a fatal RuntimeError.
        """
        with patch.dict(os.environ, {"ENVIRONMENT": "production", "ALLOW_OFFLINE_DB": "true"}):
            from src.pipeline.db import validate_ready_documents
            with self.assertRaises(RuntimeError) as ctx:
                validate_ready_documents(project_id="prod_proj", document_ids=["doc_1"])
            self.assertIn("ALLOW_OFFLINE_DB=true is strictly forbidden in production", str(ctx.exception))

    def test_production_fails_closed_when_postgres_unreachable(self):
        """
        In production with ALLOW_OFFLINE_DB=false, unreachable DB raises fatal RuntimeError.
        """
        with patch.dict(os.environ, {"ENVIRONMENT": "production", "ALLOW_OFFLINE_DB": "false"}):
            from src.pipeline.db import validate_ready_documents
            with patch("src.pipeline.db.get_connection", return_value=None):
                with self.assertRaises(RuntimeError) as ctx:
                    validate_ready_documents(project_id="prod_proj", document_ids=["doc_1"])
                self.assertIn("Failing closed to prevent unauthorized or unready document retrieval", str(ctx.exception))

    def test_development_allows_synthetic_fixture_documents(self):
        """
        In development with ALLOW_OFFLINE_DB=true, synthetic document IDs not in PostgreSQL
        are permitted for unit tests.
        """
        with patch.dict(os.environ, {"ENVIRONMENT": "development", "ALLOW_OFFLINE_DB": "true"}):
            from src.pipeline.db import validate_ready_documents
            with patch("src.pipeline.db.get_connection", return_value=None):
                result = validate_ready_documents(project_id="test_proj", document_ids=["synthetic_doc_1"])
                self.assertEqual(result, {"synthetic_doc_1"})




if __name__ == "__main__":
    unittest.main()


class TestArchitecturalCorrectness(unittest.TestCase):
    """
    Section 12 Architecture Restoration Tests.

    Locked GroundGuard service graph: M4 -> M3 -> M2 and M3 -> M1.
    There must be NO production runtime network path M2 -> M1.

    A. No M2 -> M1 HTTP/network path in production code.
    B. M2 retrieval works with M1 completely offline.
    E. M2 cannot mark claims verified/recovered.
    F. Canonical persisted claim states: pending/verified/flagged/recovered/needs_review.
    G. CASE-057 remains answerable without direct M2 -> M1 NLI.
    H. Deterministic conflict cases still work.
    I. Unknown semantic conflict does not fabricate certainty.
    """

    # A. No M2 -> M1 HTTP/network path in production code

    def test_a1_no_check_evidence_nli_m1_function_exists(self):
        import src.pipeline.retrieval as r
        self.assertFalse(hasattr(r, "check_evidence_nli_m1"),
                         "check_evidence_nli_m1 must have been removed from retrieval.py")

    def test_a2_no_ml_service_url_in_retrieval(self):
        import src.pipeline.retrieval as r
        self.assertFalse(hasattr(r, "ML_SERVICE_URL"),
                         "ML_SERVICE_URL must not exist in retrieval.py")

    def test_a3_no_enable_deep_conflict_nli_flag(self):
        import src.pipeline.retrieval as r
        self.assertFalse(hasattr(r, "ENABLE_DEEP_CONFLICT_NLI"),
                         "ENABLE_DEEP_CONFLICT_NLI must not exist")

    def test_a4_no_max_nli_conflict_comparisons_flag(self):
        import src.pipeline.retrieval as r
        self.assertFalse(hasattr(r, "MAX_NLI_CONFLICT_COMPARISONS"),
                         "MAX_NLI_CONFLICT_COMPARISONS must not exist")

    def test_a5_no_httpx_in_retrieval_source(self):
        import inspect, src.pipeline.retrieval as r
        src_text = inspect.getsource(r)
        self.assertNotIn("httpx", src_text,
                         "retrieval.py must not use httpx")

    def test_a6_no_verify_endpoint_in_retrieval_source(self):
        import inspect, src.pipeline.retrieval as r
        src_text = inspect.getsource(r)
        self.assertNotIn("/verify", src_text,
                         "retrieval.py must not reference M1 /verify endpoint")

    def test_a7_no_port_8001_in_retrieval_source(self):
        import inspect, src.pipeline.retrieval as r
        src_text = inspect.getsource(r)
        self.assertNotIn("8001", src_text,
                         "retrieval.py must not reference port 8001")

    # B. M2 retrieval works with M1 completely offline

    def test_b_retrieval_works_with_m1_offline(self):
        from src.pipeline.retrieval import evaluate_sufficiency, Candidate, route_query
        import socket
        original_connect = socket.socket.connect
        def fail_connect(self_sock, *args, **kwargs):
            raise ConnectionRefusedError("M1 is offline")
        socket.socket.connect = fail_connect
        try:
            cand = Candidate(
                chunkId="chk_01", documentId="doc_pid", projectId="p1",
                text="Centrifugal pump P-101A operates at 180C with design pressure 15.2 bar.",
                identifiers=["P-101A"], rerankScore=0.92, sources=["qdrant_dense"]
            )
            route = route_query("What is the operating temperature of pump P-101A?")
            res = evaluate_sufficiency([cand], route)
            self.assertTrue(res.sufficient, "M2 must evaluate sufficiency without M1")
        finally:
            socket.socket.connect = original_connect

    # E. M2 cannot mark claims verified/recovered

    def test_e_m2_evidence_sufficiency_has_no_claim_state_fields(self):
        from src.pipeline.retrieval import EvidenceSufficiency, EvidenceSufficiencySignals
        suff = EvidenceSufficiency(
            sufficient=True, reason="test", score=0.9,
            signals=EvidenceSufficiencySignals(
                resultCount=1, topRerankScore=0.9,
                identifierMatched=True, sourceCoverage=["qdrant_dense"]
            )
        )
        self.assertFalse(hasattr(suff, "verified"), "M2 must not have a verified field")
        self.assertFalse(hasattr(suff, "recovered"), "M2 must not have a recovered field")
        self.assertFalse(hasattr(suff, "claimState"), "M2 must not manage claim state")
        self.assertFalse(hasattr(suff, "needs_recovery"), "M2 must not have needs_recovery")
        self.assertFalse(hasattr(suff, "rejected"), "M2 must not have rejected field")

    # F. Canonical claim states

    def test_f_canonical_claim_states_in_contracts(self):
        import pathlib
        repo_root = pathlib.Path(__file__).resolve().parent.parent.parent
        contracts_path = repo_root / "packages" / "contracts" / "src" / "index.ts"
        contracts_src = contracts_path.read_text(encoding="utf-8")
        for state in ("pending", "verified", "flagged", "recovered", "needs_review"):
            self.assertIn(f"'{state}'", contracts_src,
                          f"Canonical claim state '{state}' must be in contracts")
        self.assertNotIn("'rejected'", contracts_src,
                         "rejected must not be a persisted canonical claim state")
        self.assertNotIn("'needs_recovery'", contracts_src,
                         "needs_recovery must not be a persisted canonical claim state")

    # G. CASE-057 remains answerable (deterministic, no M1)

    def test_g_case057_sop_vs_maintenance_schedule_not_conflict(self):
        from src.pipeline.retrieval import detect_candidate_conflicts, Candidate, RouteDecision
        sop_chunk = Candidate(
            chunkId="chk_alpha_08", documentId="doc_sop_08", projectId="proj_alpha",
            text=(
                "Standard Operating Procedure SOP-PUMP-01 for pump P-101A startup: "
                "1. Confirm lube oil reservoir level in sight glass. "
                "2. Verify suction valve V-204 is fully open. "
                "3. Crack open the minimum flow bypass line. "
                "4. Start motor M-101. "
                "5. Confirm discharge pressure stabilizes before opening discharge valve V-205."
            ),
            identifiers=["P-101A", "M-101", "V-204", "V-205"],
            rerankScore=0.998, sources=["qdrant_dense"]
        )
        maint_chunk = Candidate(
            chunkId="chk_alpha_02", documentId="doc_maint_02", projectId="proj_alpha",
            text=(
                "All rotating machinery in Train A requires scheduled vibration monitoring and "
                "predictive frequency analysis every six months. Lubricant oil ISO VG 46 must "
                "be sampled annually. Motor M-101 is rated at 75 kW and operates at 2950 RPM."
            ),
            identifiers=["M-101"], rerankScore=0.85, sources=["qdrant_dense"]
        )
        route = RouteDecision(
            routeType="mixed", extractedIdentifiers=["P-101A", "M-101"],
            hasNumerics=False, hasRelationalQuery=False, hasProceduralQuery=True,
            confidence=0.95, queryComplexity="multi_intent",
            routeReason="Mixed procedural + equipment identifier query"
        )
        result = detect_candidate_conflicts([sop_chunk, maint_chunk], route)
        self.assertFalse(result[0],
                         "CASE-057: SOP vs maintenance-schedule must NOT be flagged as conflicting")
        self.assertIsNone(result[1], "No conflict type should be set for this pair")

    # H. Deterministic conflict cases still work

    def test_h1_numeric_conflict_detected_deterministically(self):
        from src.pipeline.retrieval import detect_candidate_conflicts, Candidate, RouteDecision
        c1 = Candidate(chunkId="c1", documentId="doc_a", projectId="p",
                       text="P-101A design pressure 15.2 bar. Flow rate 120 m3/h.",
                       identifiers=["P-101A"], rerankScore=0.9, sources=["qdrant_dense"])
        c2 = Candidate(chunkId="c2", documentId="doc_b", projectId="p",
                       text="P-101A design pressure 22.0 bar. Flow rate 120 m3/h.",
                       identifiers=["P-101A"], rerankScore=0.85, sources=["qdrant_dense"])
        route = RouteDecision(routeType="numeric", extractedIdentifiers=["P-101A"],
                              hasNumerics=True, hasRelationalQuery=False, hasProceduralQuery=False,
                              confidence=0.95, queryComplexity="single_entity", routeReason="")
        result = detect_candidate_conflicts([c1, c2], route)
        self.assertTrue(result.has_conflict)
        self.assertEqual(result.conflict_type, "NUMERIC_CONFLICT")
        self.assertEqual(result.method, "deterministic")

    def test_h2_state_conflict_detected_deterministically(self):
        from src.pipeline.retrieval import detect_candidate_conflicts, Candidate, RouteDecision
        c1 = Candidate(chunkId="c1", documentId="doc_a", projectId="p",
                       text="Valve V-301 on P-101A suction must be maintained open during normal operation.",
                       identifiers=["V-301", "P-101A"], rerankScore=0.9, sources=["qdrant_dense"])
        c2 = Candidate(chunkId="c2", documentId="doc_b", projectId="p",
                       text="Valve V-301 on P-101A must remain closed during start sequence.",
                       identifiers=["V-301", "P-101A"], rerankScore=0.85, sources=["qdrant_dense"])
        route = RouteDecision(routeType="mixed", extractedIdentifiers=["V-301", "P-101A"],
                              hasNumerics=False, hasRelationalQuery=False, hasProceduralQuery=True,
                              confidence=0.9, queryComplexity="single_entity", routeReason="")
        result = detect_candidate_conflicts([c1, c2], route)
        self.assertTrue(result.has_conflict)
        self.assertEqual(result.conflict_type, "STATE_CONFLICT")

    def test_h3_procedural_conflict_detected_deterministically(self):
        from src.pipeline.retrieval import detect_candidate_conflicts, Candidate, RouteDecision
        c1 = Candidate(chunkId="c1", documentId="doc_a", projectId="p",
                       text="Manual isolation of valve V-300 on P-101A is mandatory before maintenance.",
                       identifiers=["V-300", "P-101A"], rerankScore=0.9, sources=["qdrant_dense"])
        c2 = Candidate(chunkId="c2", documentId="doc_b", projectId="p",
                       text="Automatic isolation is used for valve V-300 on P-101A during maintenance.",
                       identifiers=["V-300", "P-101A"], rerankScore=0.85, sources=["qdrant_dense"])
        route = RouteDecision(routeType="mixed", extractedIdentifiers=["V-300", "P-101A"],
                              hasNumerics=False, hasRelationalQuery=False, hasProceduralQuery=True,
                              confidence=0.9, queryComplexity="single_entity", routeReason="")
        result = detect_candidate_conflicts([c1, c2], route)
        self.assertTrue(result.has_conflict)
        self.assertEqual(result.conflict_type, "PROCEDURAL_CONFLICT")

    # I. Unknown semantic conflict does not fabricate certainty

    def test_i_unresolvable_semantic_ambiguity_not_fabricated(self):
        from src.pipeline.retrieval import detect_candidate_conflicts, Candidate, RouteDecision
        c1 = Candidate(chunkId="c1", documentId="doc_a", projectId="p",
                       text="Pump P-101A was installed during Phase 2 expansion in the north area.",
                       identifiers=["P-101A"], rerankScore=0.7, sources=["qdrant_dense"])
        c2 = Candidate(chunkId="c2", documentId="doc_b", projectId="p",
                       text="P-101A commissioning was completed with ATEX Zone 1 certification.",
                       identifiers=["P-101A"], rerankScore=0.68, sources=["qdrant_dense"])
        route = RouteDecision(routeType="semantic", extractedIdentifiers=["P-101A"],
                              hasNumerics=False, hasRelationalQuery=False, hasProceduralQuery=False,
                              confidence=0.8, queryComplexity="single_entity", routeReason="")
        result = detect_candidate_conflicts([c1, c2], route)
        self.assertFalse(result.has_conflict,
                         "Semantically ambiguous pairs must not fabricate conflict")

    # Revision precedence tests

    def test_explicit_supersedes_resolves_precedence(self):
        from src.pipeline.retrieval import resolve_revision_precedence, Candidate
        c_old = Candidate(chunkId="o", documentId="doc_rev_a", projectId="p",
                          text="15.2 bar.", sources=[])
        c_new = Candidate(chunkId="n", documentId="doc_rev_b", projectId="p",
                          text="17.5 bar.", sources=[],
                          metadata={"supersedes": "doc_rev_a", "documentFamily": "DS"})
        has_prec, newer, _, status = resolve_revision_precedence(c_old, c_new)
        self.assertTrue(has_prec)
        self.assertEqual(status, "newer_revision_selected")
        self.assertEqual(newer.documentId, "doc_rev_b")

    def test_lifecycle_status_same_family_resolves_precedence(self):
        from src.pipeline.retrieval import resolve_revision_precedence, Candidate
        c_old = Candidate(chunkId="o", documentId="doc_a", projectId="p", text=".", sources=[],
                          metadata={"status": "superseded", "documentFamily": "DS"})
        c_new = Candidate(chunkId="n", documentId="doc_b", projectId="p", text=".", sources=[],
                          metadata={"status": "active", "documentFamily": "DS"})
        has_prec, _, __, status = resolve_revision_precedence(c_old, c_new)
        self.assertTrue(has_prec)
        self.assertEqual(status, "newer_revision_selected")

    def test_newer_date_alone_does_not_establish_precedence(self):
        from src.pipeline.retrieval import resolve_revision_precedence, Candidate
        c_old = Candidate(chunkId="o", documentId="doc_a", projectId="p",
                          text=".", sources=[], metadata={"documentDate": "2022-01-01"})
        c_new = Candidate(chunkId="n", documentId="doc_b", projectId="p",
                          text=".", sources=[], metadata={"documentDate": "2024-06-15"})
        has_prec, _, __, status = resolve_revision_precedence(c_old, c_new)
        self.assertFalse(has_prec)
        self.assertEqual(status, "unresolved")

    def test_rev_token_without_lineage_does_not_resolve_precedence(self):
        from src.pipeline.retrieval import resolve_revision_precedence, Candidate
        c_a = Candidate(chunkId="a", documentId="doc_a", projectId="p",
                        text=".", sources=[], metadata={"revision": "A"})
        c_b = Candidate(chunkId="b", documentId="doc_b", projectId="p",
                        text=".", sources=[], metadata={"revision": "B"})
        has_prec, _, __, status = resolve_revision_precedence(c_a, c_b)
        self.assertFalse(has_prec)
        self.assertEqual(status, "unresolved")

    def test_unrelated_document_families_never_supersede(self):
        from src.pipeline.retrieval import resolve_revision_precedence, Candidate
        c_sop = Candidate(chunkId="sop", documentId="doc_sop", projectId="p",
                          text=".", sources=[],
                          metadata={"revision": "D", "documentFamily": "P101A-SOP"})
        c_ds = Candidate(chunkId="ds", documentId="doc_ds", projectId="p",
                         text=".", sources=[],
                         metadata={"revision": "B", "documentFamily": "P101A-DS"})
        has_prec, _, __, status = resolve_revision_precedence(c_sop, c_ds)
        self.assertFalse(has_prec)
        self.assertEqual(status, "unresolved")

    def test_unresolved_precedence_keeps_conflict_active(self):
        from src.pipeline.retrieval import detect_candidate_conflicts, Candidate, RouteDecision
        c1 = Candidate(chunkId="c1", documentId="doc_a", projectId="p",
                       text="P-101A design pressure 15.2 bar. Flow rate 120 m3/h.",
                       identifiers=["P-101A"], rerankScore=0.9, sources=["qdrant_dense"])
        c2 = Candidate(chunkId="c2", documentId="doc_b", projectId="p",
                       text="P-101A design pressure 22.0 bar. Flow rate 120 m3/h.",
                       identifiers=["P-101A"], rerankScore=0.85, sources=["qdrant_dense"])
        route = RouteDecision(routeType="numeric", extractedIdentifiers=["P-101A"],
                              hasNumerics=True, hasRelationalQuery=False, hasProceduralQuery=False,
                              confidence=0.95, queryComplexity="single_entity", routeReason="")
        result = detect_candidate_conflicts([c1, c2], route)
        self.assertTrue(result.has_conflict)
        self.assertEqual(result.revision_resolution, "unresolved")

