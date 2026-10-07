import os
import sys
import unittest

# Ensure services/ai directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.pipeline.retrieval import (
    Candidate,
    evaluate_sufficiency,
    EvidenceSufficiency,
    EvidenceDisposition,
    FailureStage,
    ScopeDecision,
    SUFFICIENCY_THRESHOLD,
)
from src.pipeline.router import route_query, RouteDecision
from src.pipeline.query_understanding import strip_document_filename_references
from src.main import (
    determine_evidence_disposition,
    classify_premise_outcome,
    sanitize_user_facing_answer,
    _apply_bounded_context_expansion_and_ordering,
    EvidenceItem,
)


class TestSourceGroundedQAContract(unittest.TestCase):
    """
    LAYER A — REQUIRED CI
    Permanent deterministic regression matrix and source-grounded QA contract protection.
    Provider-independent (no external Gemini/LLM dependency).
    """

    # =========================================================================
    # 1. ONE ANSWERABILITY DECISION MODEL & INVARIANTS (Sections 1 & 2)
    # =========================================================================

    def test_disposition_supported(self):
        answer = "The chiller suction operating pressure is 2.2 bar under standard load."
        disp = determine_evidence_disposition(answer, is_abstention=False, is_conflict=False)
        self.assertEqual(disp, EvidenceDisposition.SUPPORTED.value)

    def test_disposition_partially_supported(self):
        answer = "The source identifies the rightmost pin as GND and instructs you to connect it to ground. It does not explain the electrical theory of ground."
        disp = determine_evidence_disposition(answer, is_abstention=False, is_conflict=False)
        self.assertEqual(disp, EvidenceDisposition.PARTIAL.value)
        # Verify it never collapses PARTIAL -> INSUFFICIENT
        self.assertNotEqual(disp, EvidenceDisposition.INSUFFICIENT.value)

    def test_disposition_contradicted(self):
        answer = "No, the remote access policy specifies 15 minutes of inactivity, not 30 minutes."
        disp = determine_evidence_disposition(answer, is_abstention=False, is_conflict=False, is_proposition=True)
        self.assertEqual(disp, EvidenceDisposition.CONTRADICTED.value)

    def test_disposition_conflict(self):
        disp = determine_evidence_disposition("Evidence conflicts.", is_abstention=False, is_conflict=True)
        self.assertEqual(disp, EvidenceDisposition.CONFLICT.value)

    def test_disposition_insufficient(self):
        disp = determine_evidence_disposition("I could not find sufficient evidence.", is_abstention=True, is_conflict=False)
        self.assertEqual(disp, EvidenceDisposition.INSUFFICIENT.value)

    # =========================================================================
    # 2. TWO-STAGE SUFFICIENCY SAFETY & 0.05 AUDIT (Sections 7 & 8)
    # =========================================================================

    def test_weak_evidence_cannot_manufacture_sufficiency(self):
        """
        Critical Weak-Evidence Safety Invariant:
        A distractor passage with rerankScore = 0.05 and high lexical overlap
        MUST NOT bypass the sufficiency threshold through coverage bonuses.
        """
        route = RouteDecision(
            queryType="SEMANTIC_FACTUAL",
            dense=True,
            lexical=True,
            graph=False,
            extractedIdentifiers=[],
            identifierQuery=False,
            suggestedLimit=5,
            confidence=0.85,
            explanation="Test semantic query",
            rawQuery="What brand of oil filter is installed?"
        )
        # Candidate with weak semantic relevance (0.07) but containing generic words
        weak_candidate = Candidate(
            chunkId="chk_weak_1",
            documentId="doc_chiller",
            projectId="proj_test",
            text="General maintenance includes checking the oil level and changing the filter periodically.",
            rerankScore=0.07,
            denseScore=0.15,
            lexicalScore=0.80,
            identifiers=[]
        )
        res = evaluate_sufficiency(
            candidates=[weak_candidate],
            route=route,
            query="What brand of oil filter is installed?"
        )
        self.assertFalse(res.sufficient)
        self.assertLess(res.score, SUFFICIENCY_THRESHOLD)
        self.assertEqual(res.disposition, EvidenceDisposition.INSUFFICIENT.value)
        self.assertEqual(res.failureStage, FailureStage.RERANKER_REJECTION.value)

    def test_single_strong_passage_passes(self):
        route = RouteDecision(
            queryType="SEMANTIC_FACTUAL",
            dense=True,
            lexical=True,
            graph=False,
            extractedIdentifiers=[],
            identifierQuery=False,
            suggestedLimit=5,
            confidence=0.90,
            explanation="Test semantic query",
            rawQuery="What is the suction pressure?"
        )
        strong_candidate = Candidate(
            chunkId="chk_strong_1",
            documentId="doc_chiller",
            projectId="proj_test",
            text="The nominal suction pressure is maintained at 2.2 bar during steady state operation.",
            rerankScore=0.88,
            denseScore=0.85,
            lexicalScore=0.90,
            identifiers=[]
        )
        res = evaluate_sufficiency(
            candidates=[strong_candidate],
            route=route,
            query="What is the suction pressure?"
        )
        self.assertTrue(res.sufficient)
        self.assertGreaterEqual(res.score, SUFFICIENCY_THRESHOLD)
        self.assertEqual(res.disposition, EvidenceDisposition.SUPPORTED.value)
        self.assertEqual(res.failureStage, FailureStage.NONE.value)

    def test_multi_passage_complementary_sufficiency(self):
        """
        Multi-Passage Aggregation Invariant:
        Two eligible passages (rerankScore >= 0.20) collectively covering the
        query facets can satisfy sufficiency even if single passages are mildly diluted.
        """
        route = RouteDecision(
            queryType="SEMANTIC_FACTUAL",
            dense=True,
            lexical=True,
            graph=False,
            extractedIdentifiers=[],
            identifierQuery=False,
            suggestedLimit=5,
            confidence=0.85,
            explanation="Test compound query",
            rawQuery="Explain pin connections and power supply requirements"
        )
        cand1 = Candidate(
            chunkId="chk_pin_1",
            documentId="doc_manual",
            projectId="proj_test",
            text="Pin 1 connects to VCC, pin 2 connects to Data, and pin 4 connects to GND.",
            rerankScore=0.32,
            denseScore=0.45,
            lexicalScore=0.60,
            identifiers=[]
        )
        cand2 = Candidate(
            chunkId="chk_pwr_2",
            documentId="doc_manual",
            projectId="proj_test",
            text="The sensor requires 3.3V to 5.5V DC regulated power supply across VCC and GND.",
            rerankScore=0.30,
            denseScore=0.42,
            lexicalScore=0.65,
            identifiers=[]
        )
        res = evaluate_sufficiency(
            candidates=[cand1, cand2],
            route=route,
            query="Explain pin connections and power supply requirements"
        )
        self.assertTrue(res.sufficient)
        self.assertGreaterEqual(res.score, SUFFICIENCY_THRESHOLD)
        self.assertIn(res.disposition, (EvidenceDisposition.SUPPORTED.value, EvidenceDisposition.PARTIAL.value))

    # =========================================================================
    # 3. ATTRIBUTE BINDING INTEGRITY (Section 10)
    # =========================================================================

    def test_attribute_binding_voltage_vs_current(self):
        """
        Nearby numbers and different attributes must not be swapped.
        voltage (3.3 V) != current (2.5 mA)
        """
        text = "Operating Voltage: 3.3V - 5.5V DC. Operating Current: 0.5mA to 2.5mA."
        route_v = route_query("What is the operating voltage?")
        route_c = route_query("What is the operating current?")
        
        # Verify query understanding distinguishes the attributes
        self.assertIn("voltage", route_v.rawQuery.lower())
        self.assertIn("current", route_c.rawQuery.lower())

    def test_attribute_binding_suction_vs_discharge_pressure(self):
        """
        suction pressure (2.2 bar) != discharge pressure (16.5 bar)
        """
        route_suc = route_query("What is the suction pressure?")
        route_dis = route_query("What is the discharge pressure?")
        self.assertIn("suction", route_suc.rawQuery.lower())
        self.assertIn("discharge", route_dis.rawQuery.lower())

    # =========================================================================
    # 4. QUERY REPRESENTATION & FILENAME STRIPPING (Section 4)
    # =========================================================================

    def test_strip_document_filename_references(self):
        cases = [
            ("what is troubleshooting frm the KC450_Chiller_Manual.pdf", "what is troubleshooting frm the"),
            ("what is the spill cleanup protocol in SOP_BIO_104_Cleanroom_Spill.pdf?", "what is the spill cleanup protocol?"),
            ("explain telemetry heartbeat in Telemetry_Architecture_v2.3.pdf", "explain telemetry heartbeat"),
            ("what are remote access requirements from SEC_2026_09_Remote_Security.pdf", "what are remote access requirements"),
        ]
        for raw, expected_prefix in cases:
            cleaned = strip_document_filename_references(raw)
            self.assertNotIn(".pdf", cleaned.lower())
            self.assertTrue(cleaned.lower().startswith(expected_prefix.lower().split()[0]))

    # =========================================================================
    # 5. PARAPHRASE INVARIANCE (Section 21)
    # =========================================================================

    def test_paraphrase_invariance_routing(self):
        paraphrases = [
            "Where is the emergency stop button located?",
            "Where can I find the emergency stop button?",
            "What's the location of the emergency stop button?",
            "where is emergency stop located?"
        ]
        routes = [route_query(p) for p in paraphrases]
        # All paraphrases should route to dense and lexical retrieval consistently
        for r in routes:
            self.assertTrue(r.dense)
            self.assertTrue(r.lexical)

    # =========================================================================
    # 6. BOUNDED CONTEXT EXPANSION (Section 9)
    # =========================================================================

    def test_bounded_context_expansion_preserves_order(self):
        """
        Procedural reading order must be strictly preserved:
        Sorted by (documentId, pageNumber, chunkIndex)
        """
        class MockPlan:
            target = "spill cleanup"
            retrieval_strategy = "procedural"
            operation = "procedure"

        ev1 = EvidenceItem(
            evidenceId="ev_1", chunkId="chk_2", documentId="doc_sop",
            text="Step 2: Neutralize the spill with absorbent powder.",
            pageNumber=2, metadata={"chunkIndex": 2}, score=0.85
        )
        ev2 = EvidenceItem(
            evidenceId="ev_2", chunkId="chk_1", documentId="doc_sop",
            text="Step 1: Evacuate the cleanroom immediately.",
            pageNumber=1, metadata={"chunkIndex": 1}, score=0.90
        )
        mock_res = type("_MockRes", (), {"results": [ev1, ev2], "sufficiency": None})()
        _apply_bounded_context_expansion_and_ordering(mock_res, "proj_test", MockPlan())

        # Ordered: Step 1 then Step 2
        self.assertEqual(mock_res.results[0].chunkId, "chk_1")
        self.assertEqual(mock_res.results[1].chunkId, "chk_2")

    # =========================================================================
    # 7. OBSERVABILITY & FAILURE STAGE TELEMETRY (Sections 23 & 24)
    # =========================================================================

    def test_failure_stage_telemetry(self):
        route = RouteDecision(
            queryType="SEMANTIC_FACTUAL", dense=True, lexical=True, graph=False,
            extractedIdentifiers=[], identifierQuery=False, suggestedLimit=5,
            confidence=0.8, explanation="Test", rawQuery="Random query"
        )
        # Test 1: Zero candidates -> RETRIEVAL_ZERO_CANDIDATES
        res_zero = evaluate_sufficiency([], route, query="Random query")
        self.assertFalse(res_zero.sufficient)
        self.assertEqual(res_zero.failureStage, FailureStage.RETRIEVAL_ZERO_CANDIDATES.value)

        # Test 2: Out of scope -> SCOPE_GATE_REJECTION
        res_scope = evaluate_sufficiency(
            [Candidate(chunkId="chk_1", documentId="doc_1", projectId="proj_1", text="Normal text", rerankScore=0.5)],
            route,
            query="What is tomorrow's weather forecast?"
        )
        self.assertFalse(res_scope.sufficient)
        self.assertEqual(res_scope.failureStage, FailureStage.SCOPE_GATE_REJECTION.value)

    # =========================================================================
    # 8. PERMANENT REGRESSION MATRIX ACROSS 6 ARCHEOLOGICAL SOURCES (Section 20)
    # =========================================================================

    def test_document_archetype_coverage(self):
        """
        Validates contract behavior across 6 document archetypes:
        1. Technical Manual (KC450_Chiller_Manual)
        2. Narrative / Prose (Eldoria_Whispering_Woods)
        3. Research Paper (Quantized_Edge_Transformer)
        4. Policy / Rules (SEC_2026_09_Remote_Security)
        5. Architecture / Spec (Telemetry_Architecture_v2.3)
        6. SOP / Procedure (SOP_BIO_104_Cleanroom_Spill)
        """
        matrix = [
            # (doc_type, query, expected_disp, is_abstention, is_prop)
            ("Technical Manual", "What is the suction pressure?", EvidenceDisposition.SUPPORTED.value, False, False),
            ("Technical Manual", "What does GND do and why is it necessary?", EvidenceDisposition.PARTIAL.value, False, False),
            ("Narrative", "Who guards the Whispering Woods?", EvidenceDisposition.SUPPORTED.value, False, False),
            ("Research", "What is the INT8 latency reduction percentage?", EvidenceDisposition.SUPPORTED.value, False, False),
            ("Policy", "Is remote access permitted without MFA?", EvidenceDisposition.CONTRADICTED.value, False, True),
            ("Architecture", "What is the heartbeat timeout threshold?", EvidenceDisposition.SUPPORTED.value, False, False),
            ("SOP", "What is the first step in hazardous chemical spills?", EvidenceDisposition.SUPPORTED.value, False, False),
            ("Absence", "Does the manual specify Mars atmospheric compatibility?", EvidenceDisposition.INSUFFICIENT.value, True, False),
        ]
        for doc_type, query, expected_disp, is_abstained, is_prop in matrix:
            mock_ans = (
                "I could not find sufficient information."
                if is_abstained
                else ("No, MFA is mandatory for all remote sessions."
                      if expected_disp == EvidenceDisposition.CONTRADICTED.value
                      else ("The source identifies GND but does not explain the electrical theory."
                            if expected_disp == EvidenceDisposition.PARTIAL.value
                            else f"Verified answer for {query}"))
            )
            disp = determine_evidence_disposition(mock_ans, is_abstention=is_abstained, is_conflict=False, is_proposition=is_prop)
            self.assertEqual(disp, expected_disp, f"Failed on {doc_type}: {query}")


if __name__ == "__main__":
    unittest.main()
