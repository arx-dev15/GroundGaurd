"""
Tests for GroundGuard conversational response generation, product help,
natural abstention, and clarification using M2's RealLLMRuntime.
Verifies:
- LLM generation when configured
- Deterministic fallback when LLM unavailable or fails
- Product help capability manifest constraint enforcement
- Abstention without world knowledge / hallucinations
- Preservation of original instruction vs standalone query
- Absence of demo terms in production routing logic
"""

import unittest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from src.pipeline.conversational import (
    generate_social_response,
    generate_product_help_response,
    generate_abstention_response,
    generate_clarification_response,
    GROUNDGUARD_CAPABILITY_MANIFEST,
    FALLBACK_SOCIAL_GREETING,
    FALLBACK_SOCIAL_THANKS,
    FALLBACK_SOCIAL_FAREWELL,
    FALLBACK_SOCIAL_ACK,
    FALLBACK_PRODUCT_HELP,
    FALLBACK_ABSTENTION,
    FALLBACK_CLARIFICATION,
)
from src.pipeline.llm import RealLLMRuntime, LLMResponse


def run(coro):
    return asyncio.run(coro)


class TestConversationalGeneration(unittest.TestCase):

    # -----------------------------------------------------------------------
    # 1. Social LLM Path & Fallbacks
    # -----------------------------------------------------------------------

    def test_social_llm_path_called(self):
        mock_llm = MagicMock(spec=RealLLMRuntime)
        mock_llm.is_configured.return_value = True
        mock_llm.generate_answer = AsyncMock(return_value=LLMResponse(
            answer="Hello! How can I assist you with your project documentation today?",
            modelVersion="test-model",
            provider="test",
            latencyMs=100
        ))

        resp = run(generate_social_response(
            user_message="hello",
            sub_intent="greeting",
            project_name="Water Treatment Facility",
            llm_runtime=mock_llm,
        ))

        self.assertTrue(mock_llm.generate_answer.called)
        self.assertIn("Hello!", resp)

    def test_social_fallback_when_unconfigured(self):
        mock_llm = MagicMock(spec=RealLLMRuntime)
        mock_llm.is_configured.return_value = False

        resp = run(generate_social_response(
            user_message="hello",
            sub_intent="greeting",
            llm_runtime=mock_llm,
        ))
        self.assertEqual(resp, FALLBACK_SOCIAL_GREETING)

        resp_thanks = run(generate_social_response(
            user_message="thanks",
            sub_intent="thanks",
            llm_runtime=mock_llm,
        ))
        self.assertEqual(resp_thanks, FALLBACK_SOCIAL_THANKS)

        resp_farewell = run(generate_social_response(
            user_message="bye",
            sub_intent="farewell",
            llm_runtime=mock_llm,
        ))
        self.assertEqual(resp_farewell, FALLBACK_SOCIAL_FAREWELL)

        resp_ack = run(generate_social_response(
            user_message="ok",
            sub_intent="ack",
            llm_runtime=mock_llm,
        ))
        self.assertEqual(resp_ack, FALLBACK_SOCIAL_ACK)

    def test_social_fallback_on_exception(self):
        mock_llm = MagicMock(spec=RealLLMRuntime)
        mock_llm.is_configured.return_value = True
        mock_llm.generate_answer = AsyncMock(side_effect=RuntimeError("API Network Timeout"))

        resp = run(generate_social_response(
            user_message="hello",
            sub_intent="greeting",
            llm_runtime=mock_llm,
        ))
        self.assertEqual(resp, FALLBACK_SOCIAL_GREETING)

    # -----------------------------------------------------------------------
    # 2. Product Help Path & Capability Constraint
    # -----------------------------------------------------------------------

    def test_product_help_llm_path(self):
        mock_llm = MagicMock(spec=RealLLMRuntime)
        mock_llm.is_configured.return_value = True
        mock_llm.generate_answer = AsyncMock(return_value=LLMResponse(
            answer="I can help you explore documents and inspect factual claims.",
            modelVersion="test-model",
            provider="test",
            latencyMs=120
        ))

        resp = run(generate_product_help_response(
            user_message="what can you do",
            project_name="Demo Project",
            llm_runtime=mock_llm,
        ))

        self.assertTrue(mock_llm.generate_answer.called)
        self.assertIn("inspect factual claims", resp)

    def test_product_help_manifest_integrity(self):
        # Invariant: Fixed manifest must only include true features
        self.assertIn("answer questions using uploaded project evidence", GROUNDGUARD_CAPABILITY_MANIFEST)
        self.assertIn("synthesize information across project documents", GROUNDGUARD_CAPABILITY_MANIFEST)
        self.assertIn("compare supported information across sources", GROUNDGUARD_CAPABILITY_MANIFEST)
        self.assertIn("show citations/evidence", GROUNDGUARD_CAPABILITY_MANIFEST)
        self.assertIn("inspect individual factual claims", GROUNDGUARD_CAPABILITY_MANIFEST)
        self.assertIn("show verification state", GROUNDGUARD_CAPABILITY_MANIFEST)
        self.assertIn("show recovery when unsupported claims are repaired", GROUNDGUARD_CAPABILITY_MANIFEST)
        self.assertIn("let users review claims needing attention", GROUNDGUARD_CAPABILITY_MANIFEST)

        # Invariant: Never include non-existent features
        for cap in GROUNDGUARD_CAPABILITY_MANIFEST:
            self.assertNotIn("web", cap.lower())
            self.assertNotIn("internet", cap.lower())
            self.assertNotIn("edit", cap.lower())
            self.assertNotIn("collaboration", cap.lower())

    def test_product_help_fallback(self):
        mock_llm = MagicMock(spec=RealLLMRuntime)
        mock_llm.is_configured.return_value = False

        resp = run(generate_product_help_response(
            user_message="what can u do",
            llm_runtime=mock_llm,
        ))
        self.assertEqual(resp, FALLBACK_PRODUCT_HELP)

    # -----------------------------------------------------------------------
    # 3. Natural Abstention Path & Fallback
    # -----------------------------------------------------------------------

    def test_abstention_llm_path(self):
        mock_llm = MagicMock(spec=RealLLMRuntime)
        mock_llm.is_configured.return_value = True
        mock_llm.generate_answer = AsyncMock(return_value=LLMResponse(
            answer="I couldn't find enough evidence in the uploaded documents regarding this topic.",
            modelVersion="test-model",
            provider="test",
            latencyMs=95
        ))

        resp = run(generate_abstention_response(
            query="Who is the president of France?",
            insufficiency_reason="No relevant chunks found",
            project_name="Piping Specs",
            doc_titles=["piping_manual.pdf"],
            llm_runtime=mock_llm,
        ))

        self.assertTrue(mock_llm.generate_answer.called)
        self.assertIn("evidence", resp.lower())

    def test_abstention_fallback(self):
        mock_llm = MagicMock(spec=RealLLMRuntime)
        mock_llm.is_configured.return_value = False

        resp = run(generate_abstention_response(
            query="Who is the president of France?",
            llm_runtime=mock_llm,
        ))
        self.assertEqual(resp, FALLBACK_ABSTENTION)

    # -----------------------------------------------------------------------
    # 4. Clarification Path & Fallback
    # -----------------------------------------------------------------------

    def test_clarification_preserves_structured_question(self):
        mock_llm = MagicMock(spec=RealLLMRuntime)
        mock_llm.is_configured.return_value = True

        resp = run(generate_clarification_response(
            user_query="compare them",
            structured_clarification="Which two systems would you like me to compare?",
            llm_runtime=mock_llm,
        ))
        # When structured_clarification is already produced by planner, returns it directly
        self.assertEqual(resp, "Which two systems would you like me to compare?")
        self.assertFalse(mock_llm.generate_answer.called)

    def test_clarification_fallback(self):
        mock_llm = MagicMock(spec=RealLLMRuntime)
        mock_llm.is_configured.return_value = False

        resp = run(generate_clarification_response(
            user_query="compare them",
            structured_clarification=None,
            llm_runtime=mock_llm,
        ))
        self.assertEqual(resp, FALLBACK_CLARIFICATION)

    # -----------------------------------------------------------------------
    # 5. Production Routing Invariant: No Demo-Specific Term Hardcoding
    # -----------------------------------------------------------------------

    def test_no_hardcoded_demo_terms_in_production(self):
        import inspect
        import src.pipeline.query_understanding as qu
        import src.pipeline.intent_classifier as ic
        import src.pipeline.conversational as conv

        qu_source = inspect.getsource(qu)
        ic_source = inspect.getsource(ic)
        conv_source = inspect.getsource(conv)

        forbidden_demo_terms = ["campus monitor", "p-101a", "tk-500", "v-204"]
        for term in forbidden_demo_terms:
            self.assertNotIn(term, qu_source.lower(), f"Forbidden demo term '{term}' found in query_understanding.py")
            self.assertNotIn(term, ic_source.lower(), f"Forbidden demo term '{term}' found in intent_classifier.py")
            self.assertNotIn(term, conv_source.lower(), f"Forbidden demo term '{term}' found in conversational.py")


if __name__ == "__main__":
    unittest.main()
