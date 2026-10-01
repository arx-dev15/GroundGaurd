"""
GroundGuard Phase 6: Claim Extraction & Evidence Provenance Unit and Integration Tests
Tests atomic claim decomposition, precision preservation, evidence provenance mapping,
fail-closed unknown reference rejection, zero-evidence allowance, and abstention behavior.
"""

import os
import sys
import json
import unittest
import asyncio
from unittest.mock import AsyncMock, patch

# Ensure services/ai is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class EvidenceItem(BaseModel):
    evidenceId: str
    chunkId: str
    documentId: Optional[str] = None
    text: str
    pageNumber: Optional[int] = 1
    section: Optional[str] = None
    heading: Optional[str] = None
    identifiers: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)

from src.pipeline.claim_extractor import extract_and_validate_claims, ProvenanceValidationError
from src.pipeline.llm import llm_runtime

def create_sample_evidence():
    return [
        EvidenceItem(
            evidenceId="ev_001",
            chunkId="chk_flow_101",
            documentId="doc_pumps",
            text="Centrifugal pump P-101A is designed with a rated flow rate of 120 m3/h.",
            pageNumber=2
        ),
        EvidenceItem(
            evidenceId="ev_002",
            chunkId="chk_press_101",
            documentId="doc_pumps",
            text="Maximum discharge pressure for P-101A is 15.2 bar under standard operating conditions.",
            pageNumber=3
        ),
        EvidenceItem(
            evidenceId="ev_003",
            chunkId="chk_valves_204",
            documentId="doc_piping",
            text="Manual isolation valve V-204 is located directly upstream of P-101A suction flange.",
            pageNumber=7
        ),
        EvidenceItem(
            evidenceId="ev_004",
            chunkId="chk_irrelevant_301",
            documentId="doc_safety",
            text="Eye wash station EW-301 was inspected in 2024.",
            pageNumber=12
        ),
    ]


class TestPhase6ClaimExtraction(unittest.TestCase):
    def test_atomic_claim_splitting_and_provenance(self):
        evidence = create_sample_evidence()
        answer = (
            "Pump P-101A has a rated flow of 120 m3/h, its maximum discharge pressure is 15.2 bar, "
            "and V-204 is upstream of the pump."
        )

        mock_llm_json = json.dumps({
            "claims": [
                {
                    "ordinal": 0,
                    "claim": "P-101A has a rated flow of 120 m3/h.",
                    "sourceText": "Pump P-101A has a rated flow of 120 m3/h",
                    "evidenceRefs": ["EVIDENCE_1"]
                },
                {
                    "ordinal": 1,
                    "claim": "P-101A has a maximum discharge pressure of 15.2 bar.",
                    "sourceText": "its maximum discharge pressure is 15.2 bar",
                    "evidenceRefs": ["EVIDENCE_2"]
                },
                {
                    "ordinal": 2,
                    "claim": "V-204 is upstream of P-101A.",
                    "sourceText": "V-204 is upstream of the pump",
                    "evidenceRefs": ["EVIDENCE_3"]
                }
            ]
        })

        with patch.object(llm_runtime, "extract_claims", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = mock_llm_json
            claims = asyncio.run(extract_and_validate_claims(answer, evidence))

        self.assertEqual(len(claims), 3)
        # Claim 0
        self.assertEqual(claims[0]["text"], "P-101A has a rated flow of 120 m3/h.")
        self.assertEqual(claims[0]["status"], "pending")
        self.assertEqual(claims[0]["ordinal"], 0)
        self.assertIsNone(claims[0]["verification"])
        self.assertEqual(len(claims[0]["evidence"]), 1)
        self.assertEqual(claims[0]["evidence"][0].chunkId, "chk_flow_101")

        # Claim 1
        self.assertEqual(claims[1]["text"], "P-101A has a maximum discharge pressure of 15.2 bar.")
        self.assertEqual(claims[1]["status"], "pending")
        self.assertEqual(claims[1]["ordinal"], 1)
        self.assertEqual(len(claims[1]["evidence"]), 1)
        self.assertEqual(claims[1]["evidence"][0].chunkId, "chk_press_101")

        # Claim 2
        self.assertEqual(claims[2]["text"], "V-204 is upstream of P-101A.")
        self.assertEqual(claims[2]["status"], "pending")
        self.assertEqual(claims[2]["ordinal"], 2)
        self.assertEqual(len(claims[2]["evidence"]), 1)
        self.assertEqual(claims[2]["evidence"][0].chunkId, "chk_valves_204")

    def test_fail_closed_on_unknown_evidence_ref(self):
        """Section 17 & 41: If extractor returns an unknown/hallucinated reference, fail closed."""
        evidence = create_sample_evidence()
        answer = "Pump P-101A operates at 8 bar."

        mock_llm_json = json.dumps({
            "claims": [
                {
                    "ordinal": 0,
                    "claim": "Pump P-101A operates at 8 bar.",
                    "evidenceRefs": ["EVIDENCE_999"]  # Hallucinated evidence ID!
                }
            ]
        })

        with patch.object(llm_runtime, "extract_claims", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = mock_llm_json
            with self.assertRaises(ProvenanceValidationError) as cm:
                asyncio.run(extract_and_validate_claims(answer, evidence))
            self.assertIn("EVIDENCE_999", str(cm.exception))

    def test_claim_with_zero_evidence_allowed(self):
        """Section 18: Unsupported claim without matching evidence is retained with evidenceRefs = []."""
        evidence = create_sample_evidence()
        answer = "P-101A was installed in 2019."

        mock_llm_json = json.dumps({
            "claims": [
                {
                    "ordinal": 0,
                    "claim": "P-101A was installed in 2019.",
                    "evidenceRefs": []
                }
            ]
        })

        with patch.object(llm_runtime, "extract_claims", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = mock_llm_json
            claims = asyncio.run(extract_and_validate_claims(answer, evidence))

        self.assertEqual(len(claims), 1)
        self.assertEqual(claims[0]["text"], "P-101A was installed in 2019.")
        self.assertEqual(claims[0]["evidence"], [])
        self.assertEqual(claims[0]["status"], "pending")

    def test_deduplication_of_identical_claims(self):
        """Section 35: Deduplicate identical claims while preserving first occurrence."""
        evidence = create_sample_evidence()
        answer = "P-101A has a rated flow of 120 m3/h. P-101A has a rated flow of 120 m3/h."

        mock_llm_json = json.dumps({
            "claims": [
                {
                    "ordinal": 0,
                    "claim": "P-101A has a rated flow of 120 m3/h.",
                    "evidenceRefs": ["EVIDENCE_1"]
                },
                {
                    "ordinal": 1,
                    "claim": "  p-101a has a rated flow of 120 m3/h. ",  # Duplicate
                    "evidenceRefs": ["EVIDENCE_1"]
                }
            ]
        })

        with patch.object(llm_runtime, "extract_claims", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = mock_llm_json
            claims = asyncio.run(extract_and_validate_claims(answer, evidence))

        self.assertEqual(len(claims), 1)
        self.assertEqual(claims[0]["ordinal"], 0)

    def test_abstention_skips_extraction(self):
        """Section 9 & 31: Abstention answers return empty claims without calling LLM."""
        evidence = create_sample_evidence()
        abstention_answer = "The provided documentation does not contain sufficient evidence to answer this question."

        with patch.object(llm_runtime, "extract_claims", new_callable=AsyncMock) as mock_extract:
            claims = asyncio.run(extract_and_validate_claims(abstention_answer, evidence))
            mock_extract.assert_not_called()

        self.assertEqual(claims, [])

    def test_malformed_json_raises_error(self):
        """Section 34 & 46: Malformed LLM output is rejected explicitly, no fabricated claims."""
        evidence = create_sample_evidence()
        answer = "Some answer text."

        with patch.object(llm_runtime, "extract_claims", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = "NOT VALID JSON at all <<>>"
            with self.assertRaises(ValueError):
                asyncio.run(extract_and_validate_claims(answer, evidence))

    def test_no_factual_claims_in_answer(self):
        """Conversational text with no factual claims returns empty list."""
        evidence = create_sample_evidence()
        answer = "Hello, here is the information you requested."

        mock_llm_json = json.dumps({"claims": []})

        with patch.object(llm_runtime, "extract_claims", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = mock_llm_json
            claims = asyncio.run(extract_and_validate_claims(answer, evidence))

        self.assertEqual(claims, [])

    def test_sequential_ordinal_renumbering(self):
        """Ordinals are deterministically 0, 1, 2 even if LLM provided out-of-order or duplicate ordinals."""
        evidence = create_sample_evidence()
        answer = "Pump P-101A operates at 1450 rpm. Valve V-204 is upstream."

        mock_llm_json = json.dumps({
            "claims": [
                {"ordinal": 5, "claim": "Pump P-101A operates at 1450 rpm.", "evidenceRefs": ["EVIDENCE_1"]},
                {"ordinal": 9, "claim": "Valve V-204 is upstream.", "evidenceRefs": ["EVIDENCE_3"]}
            ]
        })

        with patch.object(llm_runtime, "extract_claims", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = mock_llm_json
            claims = asyncio.run(extract_and_validate_claims(answer, evidence))

        self.assertEqual(len(claims), 2)
        self.assertEqual(claims[0]["ordinal"], 0)
        self.assertEqual(claims[1]["ordinal"], 1)

    def test_llm_extraction_failure_propagates_cleanly(self):
        """LLM failure must raise error and not fabricate fake claims."""
        evidence = create_sample_evidence()
        answer = "Pump P-101A operates at 1450 rpm."

        with patch.object(llm_runtime, "extract_claims", new_callable=AsyncMock) as mock_extract:
            mock_extract.side_effect = RuntimeError("Provider down")
            with self.assertRaises(RuntimeError):
                asyncio.run(extract_and_validate_claims(answer, evidence))



class TestPhase6RealGeminiIntegration(unittest.TestCase):
    def setUp(self):
        if not llm_runtime.is_configured():
            self.skipTest("LLM runtime not configured with real API key")

    def test_real_gemini_claim_extraction(self):
        """Executes real Gemini inference to prove real structured claim extraction."""

        evidence = create_sample_evidence()
        answer = (
            "Based on technical specifications, pump P-101A has a rated flow of 120 m3/h "
            "and maximum discharge pressure of 15.2 bar. Valve V-204 is located upstream of P-101A."
        )

        claims = asyncio.run(extract_and_validate_claims(answer, evidence))

        self.assertGreaterEqual(len(claims), 2, f"Expected at least 2 atomic claims, got {len(claims)}: {claims}")

        # Verify no conversational filler extracted as claim
        for c in claims:
            self.assertNotIn("based on technical specifications", c["text"].lower())
            self.assertEqual(c["status"], "pending")
            self.assertIsNone(c["verification"])

        # Verify atomic separation of flow and pressure
        texts = [c["text"] for c in claims]
        has_flow = any("120" in t and ("m3/h" in t or "m³/h" in t) for t in texts)
        has_pressure = any("15.2" in t and "bar" in t for t in texts)
        has_upstream = any("upstream" in t and "v-204" in t.lower() for t in texts)

        self.assertTrue(has_flow, f"Expected atomic flow claim in {texts}")
        self.assertTrue(has_pressure, f"Expected atomic pressure claim in {texts}")

        # Verify candidate evidence association
        for c in claims:
            if "120" in c["text"]:
                self.assertTrue(any(e.chunkId == "chk_flow_101" for e in c["evidence"]))
            if "15.2" in c["text"]:
                self.assertTrue(any(e.chunkId == "chk_press_101" for e in c["evidence"]))
            if "upstream" in c["text"]:
                self.assertTrue(any(e.chunkId == "chk_valves_204" for e in c["evidence"]))

        # Verify irrelevant evidence chunk (chk_irrelevant_301) was NEVER associated
        for c in claims:
            self.assertTrue(all(e.chunkId != "chk_irrelevant_301" for e in c["evidence"]))

    def test_real_gemini_preserves_negative_signs_and_units(self):
        """Verify negative signs (-20°C) and units are preserved."""
        if not llm_runtime.is_configured():
            self.skipTest("LLM runtime not configured")

        evidence = [
            EvidenceItem(
                evidenceId="ev_temp",
                chunkId="chk_temp",
                documentId="doc_1",
                text="The minimum design metal temperature for vessel V-101 is -20 C."
            )
        ]
        answer = "The minimum design metal temperature for vessel V-101 is -20°C."

        claims = asyncio.run(extract_and_validate_claims(answer, evidence))
        self.assertEqual(len(claims), 1)
        self.assertIn("-20", claims[0]["text"])
        self.assertIn("V-101", claims[0]["text"])
        self.assertEqual(len(claims[0]["evidence"]), 1)
        self.assertEqual(claims[0]["evidence"][0].chunkId, "chk_temp")

    def test_standalone_subject_compound_sentence(self):
        """Case A: Compound sentence must resolve subject P-101A into both atomic claims."""
        evidence = create_sample_evidence()
        answer = "P-101A has a rated flow of 120 m3/h and maximum discharge pressure of 15.2 bar."

        claims = asyncio.run(extract_and_validate_claims(answer, evidence))
        self.assertEqual(len(claims), 2, f"Expected 2 claims, got {len(claims)}: {claims}")
        for c in claims:
            self.assertIn("P-101A", c["text"], f"Claim '{c['text']}' missing subject P-101A")

    def test_standalone_subject_bullet_list(self):
        """Case B: Bullet list under entity header must resolve subject P-101A into each claim."""
        evidence = create_sample_evidence()
        answer = "P-101A specifications:\n- Rated flow: 120 m3/h\n- Maximum discharge pressure: 15.2 bar"

        claims = asyncio.run(extract_and_validate_claims(answer, evidence))
        self.assertEqual(len(claims), 2, f"Expected 2 claims, got {len(claims)}: {claims}")
        for c in claims:
            self.assertIn("P-101A", c["text"], f"Claim '{c['text']}' missing subject P-101A")

    def test_multi_equipment_attribute_isolation(self):
        """Case C: Multiple entities must not cross-contaminate attributes."""
        evidence = [
            EvidenceItem(evidenceId="ev_p", chunkId="chk_p", text="Pump P-101A operates at 1450 rpm."),
            EvidenceItem(evidenceId="ev_v", chunkId="chk_v", text="Valve V-204 design pressure is 20 bar.")
        ]
        answer = "Pump P-101A operates at 1450 rpm while valve V-204 has a design pressure of 20 bar."

        claims = asyncio.run(extract_and_validate_claims(answer, evidence))
        self.assertEqual(len(claims), 2, f"Expected 2 claims, got {len(claims)}: {claims}")

        flow_claim = next((c for c in claims if "1450" in c["text"]), None)
        press_claim = next((c for c in claims if "20" in c["text"]), None)

        self.assertIsNotNone(flow_claim)
        self.assertIsNotNone(press_claim)
        self.assertIn("P-101A", flow_claim["text"])
        self.assertNotIn("V-204", flow_claim["text"])
        self.assertIn("V-204", press_claim["text"])
        self.assertNotIn("P-101A", press_claim["text"])

    def test_ambiguous_subject_no_hallucination(self):
        """Case D: If subject is genuinely absent/ambiguous, do not invent or guess an entity."""
        evidence = [
            EvidenceItem(evidenceId="ev_t", chunkId="chk_t", text="Maximum operating temperature is 65 C.")
        ]
        answer = "The maximum operating temperature is 65°C."

        claims = asyncio.run(extract_and_validate_claims(answer, evidence))
        self.assertEqual(len(claims), 1)
        self.assertIn("65", claims[0]["text"])
        # Must not fabricate an equipment ID like P-101A or V-204
        self.assertNotIn("P-101A", claims[0]["text"])
        self.assertNotIn("V-204", claims[0]["text"])


if __name__ == "__main__":
    unittest.main()

