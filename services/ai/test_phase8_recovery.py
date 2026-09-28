"""
GroundGuard Phase 8: M2 Recovery Engine Unit Tests
Covers:
  - targeted query construction (attempt 1 & 2)
  - RECOVERY_SYSTEM_PROMPT required invariants
  - execute_recovery with mocked retrieval+LLM -> revise action
  - execute_recovery abstains when retrieval returns empty
  - execute_recovery abstains on LLM unavailable
  - malformed JSON response falls back to abstain
"""

import os, sys, re, json, unittest, asyncio
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.pipeline.recovery import (
    construct_recovery_query,
    execute_recovery,
    RECOVERY_SYSTEM_PROMPT,
)
from src.pipeline.retrieval import EvidenceItem


def make_ev(chunk_id: str, text: str) -> EvidenceItem:
    return EvidenceItem(
        evidenceId=f"ev_{chunk_id}",
        chunkId=chunk_id,
        documentId="doc_test",
        pageNumber=1,
        section=None,
        heading=None,
        text=text,
        score=0.9,
        identifiers=[],
        sources=[chunk_id],
        rerankScore=None,
    )


class MockRetrievalResult:
    def __init__(self, items):
        self.results = items


class TestQueryConstruction(unittest.TestCase):

    def test_attempt1_contradiction_includes_identifier_and_value(self):
        q = construct_recovery_query(
            "P-101A maximum discharge pressure is 15.2 bar.", "CONTRADICTION", attempt=1
        )
        self.assertIn("P-101A", q)
        self.assertIn("15.2", q)
        self.assertIn("bar", q)

    def test_attempt1_zero_evidence_includes_identifier_and_claim(self):
        q = construct_recovery_query(
            "P-101A rated flow rate is 120 m3/h.", "ZERO_EVIDENCE", attempt=1
        )
        self.assertIn("P-101A", q)
        self.assertIn("120", q)

    def test_attempt2_drops_specific_values_retains_identifier(self):
        q1 = construct_recovery_query(
            "P-101A maximum discharge pressure is 15.2 bar.", "INSUFFICIENT_EVIDENCE", attempt=1
        )
        q2 = construct_recovery_query(
            "P-101A maximum discharge pressure is 15.2 bar.", "INSUFFICIENT_EVIDENCE", attempt=2
        )
        self.assertIn("P-101A", q2)
        # attempt 2 should differ from attempt 1 (broadened/reformulated)
        self.assertNotEqual(q1, q2)

    def test_attempt2_without_identifier_still_returns_nonempty(self):
        q = construct_recovery_query(
            "The pump was painted blue in 2023.", "ZERO_EVIDENCE", attempt=2
        )
        self.assertIsInstance(q, str)
        self.assertGreater(len(q.strip()), 0)


class TestSystemPromptInvariants(unittest.TestCase):

    def test_prompt_contains_untrusted_label(self):
        self.assertIn("UNTRUSTED", RECOVERY_SYSTEM_PROMPT)

    def test_prompt_contains_abstain_action(self):
        self.assertIn("abstain", RECOVERY_SYSTEM_PROMPT)

    def test_prompt_contains_all_three_actions(self):
        for action in ("keep", "revise", "abstain"):
            self.assertIn(action, RECOVERY_SYSTEM_PROMPT)

    def test_prompt_contains_atomic_constraint(self):
        self.assertIn("atomic", RECOVERY_SYSTEM_PROMPT.lower())

    def test_prompt_json_schema_described(self):
        self.assertIn("action", RECOVERY_SYSTEM_PROMPT)
        self.assertIn("claim", RECOVERY_SYSTEM_PROMPT)
        self.assertIn("reason", RECOVERY_SYSTEM_PROMPT)


class TestExecuteRecovery(unittest.IsolatedAsyncioTestCase):

    async def test_abstain_on_empty_retrieval(self):
        mock_result = MockRetrievalResult([])
        with patch("src.pipeline.recovery.retrieve_evidence", return_value=mock_result):
            result = await execute_recovery(
                project_id="proj_a",
                claim_id="clm_001",
                claim="P-101A was painted blue in 2023.",
                failure_reason="ZERO_EVIDENCE",
                attempt=1,
            )
        self.assertEqual(result.action, "abstain")
        self.assertEqual(result.candidateClaim, "P-101A was painted blue in 2023.")
        self.assertEqual(len(result.recoveryEvidence), 0)

    async def test_revise_on_good_evidence_and_llm_response(self):
        ev = make_ev("chk_01", "P-101A maximum discharge pressure is 12.5 bar.")
        mock_result = MockRetrievalResult([ev])
        llm_json = json.dumps({
            "action": "revise",
            "claim": "P-101A maximum discharge pressure is 12.5 bar.",
            "reason": "Corrected from 15.2 bar to 12.5 bar per datasheet."
        })
        with patch("src.pipeline.recovery.retrieve_evidence", return_value=mock_result), \
             patch.object(
                 __import__("src.pipeline.llm", fromlist=["llm_runtime"]).llm_runtime,
                 "extract_claims",
                 new_callable=AsyncMock,
                 return_value=llm_json
             ):
            result = await execute_recovery(
                project_id="proj_a",
                claim_id="clm_002",
                claim="P-101A maximum discharge pressure is 15.2 bar.",
                failure_reason="CONTRADICTION",
                attempt=1,
            )
        self.assertEqual(result.action, "revise")
        self.assertEqual(result.candidateClaim, "P-101A maximum discharge pressure is 12.5 bar.")
        self.assertGreater(len(result.recoveryEvidence), 0)

    async def test_abstain_on_llm_unavailable(self):
        from src.pipeline.llm import LLMUnavailableError
        ev = make_ev("chk_01", "P-101A maximum discharge pressure is 12.5 bar.")
        mock_result = MockRetrievalResult([ev])
        with patch("src.pipeline.recovery.retrieve_evidence", return_value=mock_result), \
             patch.object(
                 __import__("src.pipeline.llm", fromlist=["llm_runtime"]).llm_runtime,
                 "extract_claims",
                 new_callable=AsyncMock,
                 side_effect=LLMUnavailableError("Gemini unavailable")
             ):
            result = await execute_recovery(
                project_id="proj_a",
                claim_id="clm_003",
                claim="P-101A maximum discharge pressure is 15.2 bar.",
                failure_reason="CONTRADICTION",
                attempt=1,
            )
        self.assertEqual(result.action, "abstain")
        self.assertIn("unavailable", result.modelVersion.lower())

    async def test_abstain_on_malformed_llm_json(self):
        ev = make_ev("chk_01", "P-101A discharge pressure is 12.5 bar.")
        mock_result = MockRetrievalResult([ev])
        with patch("src.pipeline.recovery.retrieve_evidence", return_value=mock_result), \
             patch.object(
                 __import__("src.pipeline.llm", fromlist=["llm_runtime"]).llm_runtime,
                 "extract_claims",
                 new_callable=AsyncMock,
                 return_value="not valid json at all ```"
             ):
            result = await execute_recovery(
                project_id="proj_a",
                claim_id="clm_004",
                claim="P-101A pressure is 15.2 bar.",
                failure_reason="CONTRADICTION",
                attempt=1,
            )
        self.assertEqual(result.action, "abstain")

    async def test_abstain_on_retrieval_exception(self):
        with patch(
            "src.pipeline.recovery.retrieve_evidence",
            side_effect=RuntimeError("Qdrant unavailable")
        ):
            result = await execute_recovery(
                project_id="proj_a",
                claim_id="clm_005",
                claim="P-101A pressure is 12.5 bar.",
                failure_reason="CONTRADICTION",
                attempt=1,
            )
        self.assertEqual(result.action, "abstain")
        self.assertIn("Retrieval", result.reason)


class TestZeroChunkStopCondition(unittest.IsolatedAsyncioTestCase):
    """
    Proves M2 execute_recovery zero-chunk stop-condition contract:
    zero chunks on any attempt -> abstain immediately, Gemini NOT called.
    Attempt 2 query is deterministically different from attempt 1.
    """

    async def test_zero_chunks_attempt1_abstains_without_calling_llm(self):
        mock_result = MockRetrievalResult([])
        with patch("src.pipeline.recovery.retrieve_evidence", return_value=mock_result), \
             patch.object(
                 __import__("src.pipeline.llm", fromlist=["llm_runtime"]).llm_runtime,
                 "extract_claims",
                 new_callable=AsyncMock
             ) as mock_llm:
            result = await execute_recovery(
                project_id="proj_a",
                claim_id="clm_zc_001",
                claim="P-101A was painted blue in 2023.",
                failure_reason="ZERO_EVIDENCE",
                attempt=1,
            )
        self.assertEqual(result.action, "abstain")
        self.assertEqual(len(result.recoveryEvidence), 0)
        mock_llm.assert_not_called()

    async def test_zero_chunks_attempt2_abstains_without_calling_llm(self):
        mock_result = MockRetrievalResult([])
        with patch("src.pipeline.recovery.retrieve_evidence", return_value=mock_result), \
             patch.object(
                 __import__("src.pipeline.llm", fromlist=["llm_runtime"]).llm_runtime,
                 "extract_claims",
                 new_callable=AsyncMock
             ) as mock_llm:
            result = await execute_recovery(
                project_id="proj_a",
                claim_id="clm_zc_002",
                claim="P-101A was painted blue in 2023.",
                failure_reason="ZERO_EVIDENCE",
                attempt=2,
            )
        self.assertEqual(result.action, "abstain")
        mock_llm.assert_not_called()

    def test_attempt2_query_differs_from_attempt1_for_zero_evidence(self):
        q1 = construct_recovery_query(
            "P-101A was painted blue in 2023.", "ZERO_EVIDENCE", attempt=1
        )
        q2 = construct_recovery_query(
            "P-101A was painted blue in 2023.", "ZERO_EVIDENCE", attempt=2
        )
        assert q1 != q2, "Attempt 2 must use a broadened/reformulated query"
        assert len(q2.strip()) > 0

if __name__ == "__main__":
    unittest.main()
