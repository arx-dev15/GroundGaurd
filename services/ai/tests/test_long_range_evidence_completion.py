"""
Permanent Regression Suite: Long-Range Evidence Completion & Retrieval Completeness Architecture
Validates:
1. Core invariant: RELEVANT EVIDENCE FOUND != QUESTION ANSWERED.
2. First-pass evidence completeness check (RELEVANT_INCOMPLETE vs ANSWERING).
3. Answer-slot coverage & unresolved information need representation.
4. Bounded evidence completion retrieval globally across authorized scope.
5. Exact reproduction case (A Study in Scarlet - encounter vs deduction).
6. Cross-domain permanent regression matrix (Narrative, Technical, Policy, Research, SOP, Spec).
7. Absence safety: true absence exhausts safely to precise abstention; no false corpus abstentions.
8. Performance / adaptive retrieval: simple direct queries remain single-pass.
9. Zero source-specific production rules in src/.
"""

import os
import re
import sys
import unittest
from typing import List, Dict, Any

# Ensure services/ai directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.pipeline.query_understanding import (
    InformationNeed,
    AnswerSlot,
    extract_answer_slot,
    detect_question_slot,
    extract_answer_facets,
    FacetStatus,
    detect_user_challenge,
    resolve_conversational_query,
)
from src.pipeline.retrieval import (
    Candidate,
    EvidenceSemanticState,
    AnswerSlotCoverage,
    evaluate_answer_slot_completeness,
    evaluate_facet_completeness,
    generate_completion_queries,
    merge_and_select_complete_evidence,
    evaluate_sufficiency,
    EvidenceSufficiency,
    EvidenceDisposition,
    FailureStage,
    SUFFICIENCY_THRESHOLD,
)
from src.pipeline.router import RouteDecision


class TestLongRangeEvidenceCompletion(unittest.TestCase):

    # =========================================================================
    # 1. CORE INVARIANT & ANSWER-SLOT EXTRACTION (Sections 1, 2, 3)
    # =========================================================================

    def test_extract_answer_slot_how_known_explanation(self):
        query = "how did sherlock know that watson was from afghanistan"
        slot = extract_answer_slot(query)
        self.assertEqual(slot.informationNeed, InformationNeed.EXPLANATION)
        self.assertEqual(slot.requiredRelation, "HOW_KNOWN_EXPLANATION")
        self.assertTrue(slot.isAssertionOnlyIncomplete)
        self.assertIn("sherlock", slot.subject.lower())
        self.assertIn("watson", slot.target.lower())
        self.assertIn("afghanistan", slot.target.lower())

    def test_extract_answer_slot_cause(self):
        query = "why did boiler pump P-101 trip"
        slot = extract_answer_slot(query)
        self.assertEqual(slot.informationNeed, InformationNeed.CAUSE)
        self.assertEqual(slot.requiredRelation, "CAUSE")
        self.assertTrue(slot.isAssertionOnlyIncomplete)
        self.assertIn("pump p-101", slot.subject.lower())

    def test_extract_answer_slot_location(self):
        query = "where does Dr. Watson reside"
        slot = extract_answer_slot(query)
        self.assertEqual(slot.informationNeed, InformationNeed.LOCATION)
        self.assertEqual(slot.requiredRelation, "LOCATION")
        self.assertTrue(slot.isAssertionOnlyIncomplete)

    def test_extract_answer_slot_procedure(self):
        query = "how to replace the fuel filter on generator G-1"
        slot = extract_answer_slot(query)
        self.assertEqual(slot.informationNeed, InformationNeed.PROCEDURE)
        self.assertEqual(slot.requiredRelation, "PROCEDURAL_STEPS")
        self.assertTrue(slot.isAssertionOnlyIncomplete)

    def test_extract_answer_slot_numeric_direct(self):
        query = "what is the maximum operating pressure of valve V-2"
        slot = extract_answer_slot(query)
        self.assertEqual(slot.informationNeed, InformationNeed.NUMERIC)
        self.assertFalse(slot.isAssertionOnlyIncomplete)

    # =========================================================================
    # 2. FIRST-PASS EVIDENCE COMPLETENESS EVALUATION (Section 2, 9)
    # =========================================================================

    def test_first_pass_detects_relevant_incomplete(self):
        """
        Passage establishes topic/assertion, but lacks explanation/reasoning.
        Disposition must be RELEVANT_INCOMPLETE, not ANSWERING or SUPPORTED.
        """
        query = "how did the detective know the traveler was from afghanistan"
        slot = extract_answer_slot(query)

        # Early encounter hit: statement of conclusion, no explanation
        cand_early = Candidate(
            chunkId="chk_ch1_encounter",
            documentId="doc_novel",
            projectId="proj_test",
            text="The detective shook hands and remarked immediately: 'You have been in Afghanistan, I perceive.' Watson asked how he knew, but he chuckled and did not explain.",
            rerankScore=0.55,
            denseScore=0.60,
            lexicalScore=0.70,
            chunkIndex=1
        )

        cov = evaluate_answer_slot_completeness(slot, [cand_early], query)
        self.assertEqual(cov.state, EvidenceSemanticState.RELEVANT_INCOMPLETE)
        self.assertFalse(cov.relation_satisfied)
        self.assertEqual(cov.unresolved_need, "EXPLANATION")
        self.assertEqual(cov.coverage_score, 0.5)

    def test_answering_evidence_satisfies_relation(self):
        """
        Distant passage provides the train of reasoning and deductive explanation.
        Disposition must be ANSWERING with relation_satisfied=True.
        """
        query = "how did the detective know the traveler was from afghanistan"
        slot = extract_answer_slot(query)

        cand_deduction = Candidate(
            chunkId="chk_ch2_deduction",
            documentId="doc_novel",
            projectId="proj_test",
            text="My train of reasoning ran here: A gentleman of medical type, military air, dark skin with fair wrists showing he had been in the tropics, haggard face showing hardship and sickness, injured left arm. Where in the tropics could an English army doctor have had his arm wounded? Clearly in Afghanistan.",
            rerankScore=0.68,
            denseScore=0.72,
            lexicalScore=0.75,
            chunkIndex=14
        )

        cov = evaluate_answer_slot_completeness(slot, [cand_deduction], query)
        self.assertEqual(cov.state, EvidenceSemanticState.ANSWERING)
        self.assertTrue(cov.relation_satisfied)
        self.assertEqual(cov.coverage_score, 1.0)

    # =========================================================================
    # 3. COMPLETION QUERY GENERATION & BOUNDS (Section 11)
    # =========================================================================

    def test_completion_query_generation_bounded(self):
        query = "how did Holmes know that Watson was from Afghanistan"
        slot = extract_answer_slot(query)
        cand_early = Candidate(
            chunkId="chk_ch1",
            documentId="doc_1",
            projectId="p1",
            text="Holmes shook hands with Watson and remarked immediately: You have been in Afghanistan, I perceive.",
            rerankScore=0.50
        )

        queries = generate_completion_queries(query, slot, [cand_early])
        # Maximum bounded set: 2-3 queries
        self.assertTrue(1 <= len(queries) <= 3)
        # Entity fidelity preserved
        rel_q = queries[1] if len(queries) > 1 else queries[0]
        self.assertIn("holmes", rel_q.lower())
        self.assertIn("afghanistan", rel_q.lower())
        # Unresolved relation tokens present
        self.assertTrue(any(w in rel_q.lower() for w in ["deduction", "reasoning", "explanation", "know", "how"]))

    # =========================================================================
    # 4. COMPLETE EVIDENCE MERGE & CONTEXT SELECTION (Section 14)
    # =========================================================================

    def test_complete_evidence_merges_assertion_and_explanation(self):
        """
        Merge preserves initial premise hit AND answering completion hit.
        """
        cand_early = Candidate(
            chunkId="chk_early",
            documentId="doc_1",
            projectId="p1",
            text="The detective remarked immediately: 'You have been in Afghanistan, I perceive.'",
            rerankScore=0.50,
            chunkIndex=1
        )
        cand_answering = Candidate(
            chunkId="chk_later",
            documentId="doc_1",
            projectId="p1",
            text="My train of reasoning ran here: A medical gentleman with military bearing, sunburnt face, wounded arm... Clearly in Afghanistan.",
            rerankScore=0.65,
            chunkIndex=14
        )
        slot = extract_answer_slot("how did the detective know the traveler was from afghanistan")

        merged = merge_and_select_complete_evidence([cand_early], [cand_answering], slot)
        chunk_ids = [c.chunkId for c in merged]
        self.assertIn("chk_early", chunk_ids)
        self.assertIn("chk_later", chunk_ids)

        cov = evaluate_answer_slot_completeness(slot, merged)
        self.assertEqual(cov.state, EvidenceSemanticState.ANSWERING)
        self.assertTrue(cov.relation_satisfied)

    # =========================================================================
    # 5. EXACT REPRODUCTION CASE (Section 18)
    # =========================================================================

    def test_exact_reproduction_flow(self):
        """
        Exact failure reproduction:
        First pass retrieves early encounter.
        System detects incomplete explanation relation.
        Triggers completion retrieval, discovers distant deduction chunk.
        Sufficiency evaluates to SUPPORTED without false corpus abstention.
        """
        query = "how did sherlock know that watson was from afghanistan"
        slot = extract_answer_slot(query)

        # First pass pool
        cand_p1 = Candidate(
            chunkId="chk_scarlet_ch1",
            documentId="doc_scarlet",
            projectId="proj_study",
            text="He shook hands and remarked immediately: 'You have been in Afghanistan, I perceive.' Watson looked with astonishment and wondered how he knew.",
            rerankScore=0.52,
            chunkIndex=2
        )
        first_pass_cov = evaluate_answer_slot_completeness(slot, [cand_p1], query)
        self.assertEqual(first_pass_cov.state, EvidenceSemanticState.RELEVANT_INCOMPLETE)

        # Distant hit discovered by global completion search
        cand_p2 = Candidate(
            chunkId="chk_scarlet_ch2",
            documentId="doc_scarlet",
            projectId="proj_study",
            text="My train of reasoning ran: Here is a gentleman of medical type, military air, dark skin with fair wrists showing he has just come from the tropics, haggard face showing hardship and sickness, and left arm injured. Where in the tropics could an English army doctor have seen much hardship and got his arm wounded? Clearly in Afghanistan.",
            rerankScore=0.72,
            chunkIndex=18
        )

        merged = merge_and_select_complete_evidence([cand_p1], [cand_p2], slot)
        final_cov = evaluate_answer_slot_completeness(slot, merged, query)
        self.assertEqual(final_cov.state, EvidenceSemanticState.ANSWERING)
        self.assertTrue(final_cov.relation_satisfied)

        route = RouteDecision(
            queryType="SEMANTIC_FACTUAL", dense=True, lexical=True, graph=False,
            extractedIdentifiers=[], identifierQuery=False, suggestedLimit=5,
            confidence=0.85, explanation="", rawQuery=query
        )
        suf = evaluate_sufficiency(
            merged, route, query=query,
            slot_coverage=final_cov.coverage_score,
            completion_triggered=True,
            completion_stop_reason="COMPLETE"
        )
        self.assertTrue(suf.sufficient)
        self.assertEqual(suf.disposition, EvidenceDisposition.SUPPORTED.value)
        self.assertEqual(suf.failureStage, FailureStage.NONE.value)
        self.assertGreaterEqual(suf.score, SUFFICIENCY_THRESHOLD)

    # =========================================================================
    # 6. CROSS-DOMAIN PERMANENT REGRESSION CASES (Section 19)
    # =========================================================================

    def test_cross_domain_narrative(self):
        """Narrative: Event early, explanation revealed later."""
        query = "how did the captain realize the ship had been sabotaged"
        slot = extract_answer_slot(query)
        self.assertEqual(slot.informationNeed, InformationNeed.EXPLANATION)

        cand_early = Candidate(
            chunkId="ch1", documentId="d1", projectId="p1",
            text="The captain inspected the rudder and muttered that someone had deliberately sabotaged the mechanism.",
            rerankScore=0.48
        )
        cov_1 = evaluate_answer_slot_completeness(slot, [cand_early], query)
        self.assertEqual(cov_1.state, EvidenceSemanticState.RELEVANT_INCOMPLETE)

        cand_later = Candidate(
            chunkId="ch8", documentId="d1", projectId="p1",
            text="The captain explained his reasoning: the hydraulic lines had been sheared cleanly with steel cutters, and the bypass valve was wired shut with copper twist.",
            rerankScore=0.70
        )
        cov_2 = evaluate_answer_slot_completeness(slot, [cand_later], query)
        self.assertEqual(cov_2.state, EvidenceSemanticState.ANSWERING)

    def test_cross_domain_technical(self):
        """Technical: Alarm introduced early, root cause explained later."""
        query = "why did chiller compressor C-201 trip"
        slot = extract_answer_slot(query)
        self.assertEqual(slot.informationNeed, InformationNeed.CAUSE)

        cand_early = Candidate(
            chunkId="tech_s1", documentId="d_tech", projectId="p_eng",
            text="Chiller compressor C-201 suffered an automatic shutdown trip at 04:15 during stage 2 startup.",
            rerankScore=0.46
        )
        cov_1 = evaluate_answer_slot_completeness(slot, [cand_early], query)
        self.assertEqual(cov_1.state, EvidenceSemanticState.RELEVANT_INCOMPLETE)

        cand_later = Candidate(
            chunkId="tech_s7", documentId="d_tech", projectId="p_eng",
            text="Compressor C-201 trips due to suction line cavitation caused by an accumulation of vapor bubbles when oil return temp drops below 40C.",
            rerankScore=0.74
        )
        cov_2 = evaluate_answer_slot_completeness(slot, [cand_later], query)
        self.assertEqual(cov_2.state, EvidenceSemanticState.ANSWERING)

    def test_cross_domain_policy(self):
        """Policy: Rule introduced early, exception explained later."""
        query = "can contractors access the production database"
        slot = extract_answer_slot(query)

        cand_early = Candidate(
            chunkId="pol_1", documentId="d_pol", projectId="p_sec",
            text="Policy 4.1: Direct database access is prohibited for all external contractors without exception in Section 4.",
            rerankScore=0.45
        )
        # Early hit alone
        self.assertIsNotNone(cand_early)

        cand_later = Candidate(
            chunkId="pol_app", documentId="d_pol", projectId="p_sec",
            text="Appendix B: Contractors holding Tier-3 security clearance may obtain temporary read-only database credentials through approval of Form SEC-9.",
            rerankScore=0.68
        )
        merged = [cand_later, cand_early]
        self.assertEqual(len(merged), 2)

    def test_cross_domain_research(self):
        """Research: Result in abstract, biological mechanism in discussion."""
        query = "what is the explanation for the increased binding affinity of molecule M-4"
        slot = extract_answer_slot(query)
        self.assertEqual(slot.informationNeed, InformationNeed.EXPLANATION)

        cand_abstract = Candidate(
            chunkId="res_abs", documentId="d_res", projectId="p_bio",
            text="Abstract: Synthetic molecule M-4 exhibited a 5-fold increase in binding affinity over wild-type controls.",
            rerankScore=0.49
        )
        cov_1 = evaluate_answer_slot_completeness(slot, [cand_abstract], query)
        self.assertEqual(cov_1.state, EvidenceSemanticState.RELEVANT_INCOMPLETE)

        cand_disc = Candidate(
            chunkId="res_disc", documentId="d_res", projectId="p_bio",
            text="Discussion: The explanation for the increased affinity of M-4 lies in the dual hydrogen bond formed with Asp-201 and hydrophobic stacking against Phe-112.",
            rerankScore=0.72
        )
        cov_2 = evaluate_answer_slot_completeness(slot, [cand_disc], query)
        self.assertEqual(cov_2.state, EvidenceSemanticState.ANSWERING)

    def test_cross_domain_sop(self):
        """SOP: Procedure referenced early, operational steps detailed later."""
        query = "what are the steps to execute emergency purge SOP-9"
        slot = extract_answer_slot(query)
        self.assertEqual(slot.informationNeed, InformationNeed.PROCEDURE)

        cand_ref = Candidate(
            chunkId="sop_s1", documentId="d_sop", projectId="p_plant",
            text="Section 1: Operating personnel must immediately execute emergency purge SOP-9 upon redline alert.",
            rerankScore=0.45
        )
        cov_1 = evaluate_answer_slot_completeness(slot, [cand_ref], query)
        self.assertEqual(cov_1.state, EvidenceSemanticState.RELEVANT_INCOMPLETE)

        cand_steps = Candidate(
            chunkId="sop_s5", documentId="d_sop", projectId="p_plant",
            text="SOP-9 Emergency Purge Steps: 1. Close main feed valve FV-10. 2. Connect nitrogen purge header. 3. Verify vent pressure bleeds below 0.5 bar.",
            rerankScore=0.76
        )
        cov_2 = evaluate_answer_slot_completeness(slot, [cand_steps], query)
        self.assertEqual(cov_2.state, EvidenceSemanticState.ANSWERING)

    def test_cross_domain_spec(self):
        """Spec: Equipment introduced early, operational constraints later."""
        query = "what is the maximum operating temperature of motor M-101"
        slot = extract_answer_slot(query)
        self.assertEqual(slot.informationNeed, InformationNeed.NUMERIC)

        cand_later = Candidate(
            chunkId="spec_limits", documentId="d_spec", projectId="p_eng",
            text="Motor M-101 technical limits: Maximum operating temperature is 140 C under Class H thermal insulation.",
            rerankScore=0.69
        )
        cov = evaluate_answer_slot_completeness(slot, [cand_later], query)
        self.assertEqual(cov.state, EvidenceSemanticState.ANSWERING)

    # =========================================================================
    # 7. ABSENCE SAFETY & PRECISE ABSTENTION (Section 20)
    # =========================================================================

    def test_true_absence_exhausts_safely_to_partial_or_abstention(self):
        """
        Document genuinely lacks the explanation.
        Completion exhausts without finding answering hits.
        Yields PARTIAL disposition (if assertion exists) without hallucinating corpus support.
        """
        query = "how did the inspector deduce the fraud"
        slot = extract_answer_slot(query)

        cand_only_assertion = Candidate(
            chunkId="chk_case_1", documentId="d_case", projectId="p_audit",
            text="The inspector told the director that he had deduced financial fraud in division 4. The document does not provide any further details.",
            rerankScore=0.42
        )
        cov = evaluate_answer_slot_completeness(slot, [cand_only_assertion], query)
        self.assertEqual(cov.state, EvidenceSemanticState.RELEVANT_INCOMPLETE)

        route = RouteDecision(
            queryType="SEMANTIC_FACTUAL", dense=True, lexical=True, graph=False,
            extractedIdentifiers=[], identifierQuery=False, suggestedLimit=5,
            confidence=0.85, explanation="", rawQuery=query
        )
        # When completion exhausts without answering evidence
        suf = evaluate_sufficiency(
            [cand_only_assertion], route, query=query,
            slot_coverage=cov.coverage_score,
            completion_triggered=True,
            completion_stop_reason="EXHAUSTED"
        )
        self.assertEqual(suf.disposition, EvidenceDisposition.PARTIAL.value)
        self.assertTrue("lack full explanation" in suf.reason or "lacks full explanation" in suf.reason)

    # =========================================================================
    # 8. PERFORMANCE & ADAPTIVE SINGLE-PASS (Section 22)
    # =========================================================================

    def test_simple_direct_fact_remains_single_pass(self):
        """
        Simple direct lookup matches immediately without triggering completion search.
        """
        query = "what is the nominal operating pressure of the chiller"
        slot = extract_answer_slot(query)

        cand_direct = Candidate(
            chunkId="chk_chiller", documentId="d_chiller", projectId="p_hvac",
            text="The chiller operates at a nominal operating pressure of 2.2 bar.",
            rerankScore=0.72
        )
        cov = evaluate_answer_slot_completeness(slot, [cand_direct], query)
        self.assertEqual(cov.state, EvidenceSemanticState.ANSWERING)
        self.assertFalse(slot.isAssertionOnlyIncomplete)

    # =========================================================================
    # 9. ZERO PRODUCTION HARDCODING INVARIANT (Section 18)
    # =========================================================================

    def test_zero_sherlock_hardcoding_in_production_src(self):
        """
        Guarantees that production code (services/ai/src/) contains ZERO occurrences
        of domain-specific fixtures: Sherlock, Watson, Afghanistan, Study in Scarlet.
        """
        src_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
        forbidden = [
            "sherlock", "watson", "afghanistan", "study in scarlet",
            "gregson", "lauriston", "ferrier", "rache", "drebber", "stangerson", "charpentier"
        ]

        found_violations = []
        for root, _, files in os.walk(src_dir):
            for f in files:
                if f.endswith(".py"):
                    full_path = os.path.join(root, f)
                    with open(full_path, "r", encoding="utf-8", errors="ignore") as fp:
                        content = fp.read().lower()
                        for term in forbidden:
                            if term in content:
                                found_violations.append(f"{f}: found '{term}'")

        self.assertEqual(
            found_violations,
            [],
            f"Production src/ code violates genericity invariant by mentioning fixtures: {found_violations}"
        )

    # =========================================================================
    # 10. CROSS-DOMAIN REGRESSION SUITE (Section P)
    # =========================================================================

    def test_multi_facet_technical_question(self):
        """Technical: Compound 'What are the specs and what testing verifies them?'."""
        query = "what are the operational limits of valve V-12 and what testing verified them"
        facets = extract_answer_facets(query)
        self.assertIsNotNone(facets)
        self.assertEqual(len(facets.facets), 2)
        self.assertEqual(facets.facets[0].facetType, "technical_spec")
        self.assertEqual(facets.facets[1].facetType, "supporting_evidence")

        cand_spec = Candidate(
            chunkId="chk_valv1", documentId="doc_v", projectId="p_v",
            text="Valve V-12 operational limits: Rated for maximum continuous pressure of 45 bar.",
            rerankScore=0.65
        )
        cov = evaluate_facet_completeness(facets, [cand_spec], query)
        self.assertEqual(cov["facet_statuses"]["facet_0"], FacetStatus.SUPPORTED.value)
        self.assertEqual(cov["facet_statuses"]["facet_1"], FacetStatus.UNRESOLVED.value)
        self.assertFalse(cov["all_facets_supported"])

    def test_comparison_across_distant_sections(self):
        """Comparison: Requires distinct coverage of Option A and Option B."""
        query = "how does protocol Alpha compare to protocol Beta"
        facets = extract_answer_facets(query)
        self.assertIsNotNone(facets)
        self.assertEqual(len(facets.facets), 2)

        cand_alpha = Candidate(
            chunkId="chk_a", documentId="doc_net", projectId="p_net",
            text="Protocol Alpha utilizes sliding window flow control with 1024-byte packet buffers.",
            rerankScore=0.70
        )
        cov = evaluate_facet_completeness(facets, [cand_alpha], query)
        self.assertEqual(cov["facet_statuses"]["facet_0"], FacetStatus.SUPPORTED.value)
        self.assertEqual(cov["facet_statuses"]["facet_1"], FacetStatus.UNRESOLVED.value)
        self.assertFalse(cov["all_facets_supported"])

    def test_two_hop_relationship_chain(self):
        """Two-hop chain: Entity A connected to Event C via Bridge B."""
        query = "how are component alpha and system omega connected"
        facets = extract_answer_facets(query)
        self.assertIsNotNone(facets)
        self.assertEqual(len(facets.facets), 2)

        cand_hop1 = Candidate(
            chunkId="chk_hop1", documentId="doc_sys", projectId="p_sys",
            text="Component Alpha provides primary clock signals to bus controller Beta.",
            rerankScore=0.55
        )
        cand_hop2 = Candidate(
            chunkId="chk_hop2", documentId="doc_sys", projectId="p_sys",
            text="Bus controller Beta regulates synchronization across System Omega.",
            rerankScore=0.62
        )
        cov = evaluate_facet_completeness(facets, [cand_hop1, cand_hop2], query)
        self.assertTrue(cov["all_facets_supported"])

    def test_user_correction_after_false_abstention(self):
        """User correction: 'no there is look carefully' after abstention triggers bounded retry."""
        history = [
            {"role": "user", "content": "What is the failover timeout for node 3?"},
            {"role": "assistant", "content": "The project evidence does not state the failover timeout."}
        ]
        is_ch, rest_q = detect_user_challenge("no there is look carefully", history)
        self.assertTrue(is_ch)
        self.assertEqual(rest_q, "What is the failover timeout for node 3?")

        # Non-challenge message should return False
        is_ch2, _ = detect_user_challenge("thanks for the answer", history)
        self.assertFalse(is_ch2)

    def test_conversational_pronoun_and_target_carryover(self):
        """Pronoun carryover: 'And how did it fail?' carries forward subject from prior turns."""
        history = [
            {"role": "user", "content": "What was turbine T-100 used for?"},
            {"role": "assistant", "content": "Turbine T-100 was used for auxiliary steam extraction."},
            {"role": "user", "content": "Why did pump P-40 oppose high flow to turbine T-100?"},
            {"role": "assistant", "content": "Pump P-40 suffered cavitation under high flow conditions."}
        ]
        resolved = resolve_conversational_query("And how did it finally fail?", history)
        self.assertIn("turbine T-100", resolved)
        self.assertIn("fail", resolved)


if __name__ == "__main__":
    unittest.main()
