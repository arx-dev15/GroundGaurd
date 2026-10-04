"""
GroundGuard Phase 1 MVP: Query Understanding Behavioral Test Suite
~35 cases covering all task types, retrieval modes, fallback safety, and architecture invariants.

Run: python -m pytest test_query_understanding.py -v
"""

import os
import sys
import asyncio
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

os.environ.setdefault("QDRANT_URL", ":memory:")
os.environ.setdefault("TANTIVY_PATH", ":memory:")
os.environ.setdefault("ALLOW_OFFLINE_DB", "true")

from src.pipeline.query_understanding import (
    understand_query,
    QueryPlan,
    _make_fallback_plan,
    _try_deterministic_plan,
    _is_social,
    _is_product_help,
    build_telemetry,
)


def run(coro):
    """Helper to run async coroutines in sync test methods."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Deterministic fast path tests
# ---------------------------------------------------------------------------

class TestSocialFastPath(unittest.TestCase):
    """Social / conversational queries must be caught by deterministic fast path."""

    def _assert_social(self, query):
        self.assertTrue(_is_social(query), f"Expected social for: {repr(query)}")

    def test_hello(self):
        self._assert_social("hello")

    def test_hey(self):
        self._assert_social("hey")

    def test_hi(self):
        self._assert_social("hi")

    def test_yo(self):
        self._assert_social("yo")

    def test_sup(self):
        self._assert_social("sup")

    def test_thanks(self):
        self._assert_social("thanks")

    def test_thx(self):
        self._assert_social("thx")

    def test_ok(self):
        self._assert_social("ok")

    def test_cool(self):
        self._assert_social("cool")

    def test_yo_bro(self):
        self._assert_social("yo bro")

    def test_thanks_bro(self):
        self._assert_social("thanks bro")

    def test_bye(self):
        self._assert_social("bye")

    def test_alright(self):
        self._assert_social("alright")


class TestProductHelpFastPath(unittest.TestCase):
    """Product-help queries must be caught by deterministic fast path."""

    def _assert_help(self, query):
        self.assertTrue(_is_product_help(query), f"Expected product_help for: {repr(query)}")

    def test_help(self):
        self._assert_help("help")

    def test_what_can_you_do(self):
        self._assert_help("what can you do")

    def test_what_can_u_do(self):
        self._assert_help("what can u do")

    def test_what_can_u_do_bro(self):
        self._assert_help("what can u do bro")

    def test_explain_groundguard(self):
        self._assert_help("explain groundguard")


class TestDeterministicPlanReturnsNoneForSubstantiveQueries(unittest.TestCase):
    """Substantive queries must NOT be caught by fast path."""

    def _assert_not_fast(self, query):
        result = _try_deterministic_plan(query)
        self.assertIsNone(result, f"Expected None (Gemini path) for: {repr(query)}")

    def test_broad_key_concepts(self):
        self._assert_not_fast("Explain key concepts from project documents")

    def test_what_is_campus_monitor(self):
        self._assert_not_fast("What is Campus Monitor?")

    def test_overview_main_ideas(self):
        self._assert_not_fast("What are the main ideas in these docs?")

    def test_informal_bro(self):
        self._assert_not_fast("bro what are the important things here")

    def test_lexical_mismatch(self):
        self._assert_not_fast("What gadgets does it use to sense the environment?")

    def test_unsupported_president(self):
        self._assert_not_fast("Who is the president of France?")

    def test_comparison(self):
        self._assert_not_fast("Compare the two systems")


# ---------------------------------------------------------------------------
# Fallback plan tests
# ---------------------------------------------------------------------------

class TestFallbackPlan(unittest.TestCase):
    """Planner failure must NEVER cause 500 or empty plan."""

    def test_fallback_has_original_query(self):
        q = "What does Campus Monitor do?"
        plan = _make_fallback_plan(q)
        self.assertEqual(plan.task, "targeted")
        self.assertEqual(plan.standalone_query, q)
        self.assertEqual(plan.retrieval_mode, "focused")
        self.assertIn(q, plan.search_queries)
        self.assertFalse(plan.needs_clarification)

    def test_fallback_empty_query(self):
        plan = _make_fallback_plan("")
        self.assertEqual(plan.task, "targeted")
        self.assertEqual(plan.search_queries, [])

    def test_fallback_whitespace_query(self):
        plan = _make_fallback_plan("   ")
        self.assertEqual(plan.standalone_query, "")
        self.assertEqual(plan.search_queries, [])

    def test_understand_query_fallback_on_no_api_key(self):
        """With no Gemini key configured, understand_query must return a safe fallback, not raise."""
        with patch.dict(os.environ, {}, clear=True):
            plan = run(understand_query("Explain key concepts from project documents"))
        self.assertIsNotNone(plan)
        self.assertIn(plan.task, ("targeted", "overview", "thematic", "multi_part", "follow_up", "comparison", "transform", "social", "product_help"))
        self.assertIsNotNone(plan.standalone_query)


# ---------------------------------------------------------------------------
# QueryPlan model validation tests
# ---------------------------------------------------------------------------

class TestQueryPlanValidation(unittest.TestCase):
    """QueryPlan schema must cap search_queries at 4."""

    def test_search_queries_capped_at_4(self):
        plan = QueryPlan(
            task="overview",
            standalone_query="overview",
            retrieval_mode="broad",
            search_queries=["q1", "q2", "q3", "q4", "q5", "q6"],
        )
        self.assertEqual(len(plan.search_queries), 4)

    def test_comparison_targets_capped_at_4(self):
        plan = QueryPlan(
            task="comparison",
            standalone_query="compare",
            retrieval_mode="comparative",
            comparison_targets=["A", "B", "C", "D", "E"],
        )
        self.assertEqual(len(plan.comparison_targets), 4)

    def test_default_task_is_targeted(self):
        plan = QueryPlan()
        self.assertEqual(plan.task, "targeted")
        self.assertEqual(plan.retrieval_mode, "focused")


# ---------------------------------------------------------------------------
# Telemetry tests
# ---------------------------------------------------------------------------

class TestTelemetry(unittest.TestCase):
    """Telemetry must include all required fields."""

    def test_telemetry_fields(self):
        plan = QueryPlan(
            task="overview",
            standalone_query="key concepts",
            retrieval_mode="broad",
            search_queries=["main purpose", "technologies"],
        )
        t = build_telemetry(
            plan=plan,
            original_query="Explain key concepts from project documents",
            first_pass_candidate_count=3,
            first_pass_sufficient=True,
            fallback_used=False,
            final_candidate_count=5,
            final_sufficient=True,
        )
        self.assertEqual(t["task"], "overview")
        self.assertEqual(t["retrievalMode"], "broad")
        self.assertEqual(t["searchQueryCount"], 2)
        self.assertFalse(t["fallbackUsed"])
        self.assertTrue(t["finalSufficiency"])
        self.assertEqual(t["originalQuery"], "Explain key concepts from project documents")


# ---------------------------------------------------------------------------
# Architecture invariant tests
# ---------------------------------------------------------------------------

class TestArchitectureInvariants(unittest.TestCase):
    """M2 must not import from M1; query understanding must not reference M1."""

    def test_query_understanding_no_m1_import(self):
        import inspect
        import src.pipeline.query_understanding as qu_mod
        src_code = inspect.getsource(qu_mod)
        self.assertNotIn(":8001", src_code)
        self.assertNotIn("ml_service", src_code.lower())
        self.assertNotIn("from src.ml", src_code)
        self.assertNotIn("import ml", src_code.lower())

    def test_query_understanding_no_agent_loop(self):
        import inspect
        import src.pipeline.query_understanding as qu_mod
        src_code = inspect.getsource(qu_mod)
        self.assertNotIn("LangGraph", src_code)
        self.assertNotIn("langgraph", src_code.lower())
        self.assertNotIn("while True", src_code)

    def test_query_understanding_no_new_service(self):
        import inspect
        import src.pipeline.query_understanding as qu_mod
        src_code = inspect.getsource(qu_mod)
        # Must not call M1 port
        self.assertNotIn(":8001", src_code)
        # Must not introduce a new vector store
        self.assertNotIn("ChromaDB", src_code)
        self.assertNotIn("Pinecone", src_code)

    def test_planner_call_count_is_bounded(self):
        """understand_query must make at most 1 Gemini call for substantive queries."""
        call_count = [0]

        async def mock_planner(*args, **kwargs):
            call_count[0] += 1
            return '{"task":"targeted","standalone_query":"Campus Monitor","retrieval_mode":"focused","search_queries":["What is Campus Monitor?"],"comparison_targets":[],"needs_clarification":false,"clarification_question":null}'

        with patch("src.pipeline.query_understanding._call_planner_gemini", side_effect=mock_planner):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key_123"}):
                run(understand_query("What is Campus Monitor?"))

        self.assertEqual(call_count[0], 1, "Planner must be called exactly once for a substantive query")

    def test_social_zero_planner_calls(self):
        """Social queries must make 0 Gemini calls."""
        call_count = [0]

        async def mock_planner(*args, **kwargs):
            call_count[0] += 1
            return "{}"

        with patch("src.pipeline.query_understanding._call_planner_gemini", side_effect=mock_planner):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key_123"}):
                run(understand_query("hello"))

        self.assertEqual(call_count[0], 0, "Social fast path must NOT call Gemini planner")

    def test_help_zero_planner_calls(self):
        """Product-help queries must make 0 Gemini calls."""
        call_count = [0]

        async def mock_planner(*args, **kwargs):
            call_count[0] += 1
            return "{}"

        with patch("src.pipeline.query_understanding._call_planner_gemini", side_effect=mock_planner):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key_123"}):
                run(understand_query("what can you do"))

        self.assertEqual(call_count[0], 0, "Help fast path must NOT call Gemini planner")

    def test_planner_exception_returns_fallback_not_raises(self):
        """If Gemini planner raises an exception, understand_query must return a safe fallback."""
        async def mock_planner_raises(*args, **kwargs):
            raise RuntimeError("Network timeout")

        with patch("src.pipeline.query_understanding._call_planner_gemini", side_effect=mock_planner_raises):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key_123"}):
                plan = run(understand_query("What are the main ideas in these docs?"))

        # Must not raise, must return a valid plan
        self.assertIsNotNone(plan)
        self.assertIsInstance(plan, QueryPlan)

    def test_planner_invalid_json_returns_fallback(self):
        """If Gemini planner returns invalid JSON, understand_query must fallback gracefully."""
        async def mock_bad_json(*args, **kwargs):
            return "NOT JSON AT ALL {{{}}}"

        with patch("src.pipeline.query_understanding._call_planner_gemini", side_effect=mock_bad_json):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key_123"}):
                plan = run(understand_query("Give me the important stuff"))

        self.assertIsNotNone(plan)
        self.assertIsInstance(plan, QueryPlan)
        # Fallback plan must have original query
        self.assertIn("important stuff", plan.standalone_query.lower())

    def test_planner_invalid_task_returns_fallback(self):
        """If Gemini planner returns an invalid task type, Pydantic validation should fail gracefully."""
        async def mock_invalid_task(*args, **kwargs):
            return '{"task":"UNKNOWN_TASK","standalone_query":"test","retrieval_mode":"focused","search_queries":["test"]}'

        with patch("src.pipeline.query_understanding._call_planner_gemini", side_effect=mock_invalid_task):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key_123"}):
                plan = run(understand_query("Walk me through this project"))

        self.assertIsNotNone(plan)
        self.assertIsInstance(plan, QueryPlan)


# ---------------------------------------------------------------------------
# Planner integration tests (mock Gemini; verify plan structure)
# ---------------------------------------------------------------------------

class TestPlannerIntegration(unittest.TestCase):
    """Tests that verify planner produces correct task/mode for query types (mocked Gemini)."""

    def _mock_plan(self, task, mode, queries, targets=None, clarify=False, clarify_q=None):
        import json
        return json.dumps({
            "task": task,
            "standalone_query": "mocked standalone",
            "retrieval_mode": mode,
            "search_queries": queries,
            "comparison_targets": targets or [],
            "needs_clarification": clarify,
            "clarification_question": clarify_q,
        })

    def test_broad_overview_produces_broad_mode(self):
        mock_resp = self._mock_plan("overview", "broad", ["main purpose of project", "key concepts", "core technologies"])

        async def mock_planner(*args, **kwargs):
            return mock_resp

        with patch("src.pipeline.query_understanding._call_planner_gemini", side_effect=mock_planner):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key"}):
                plan = run(understand_query("Explain key concepts from project documents"))

        self.assertEqual(plan.task, "overview")
        self.assertEqual(plan.retrieval_mode, "broad")
        self.assertGreaterEqual(len(plan.search_queries), 1)

    def test_targeted_question_produces_focused_mode(self):
        mock_resp = self._mock_plan("targeted", "focused", ["What is Campus Monitor?"])

        async def mock_planner(*args, **kwargs):
            return mock_resp

        with patch("src.pipeline.query_understanding._call_planner_gemini", side_effect=mock_planner):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key"}):
                plan = run(understand_query("What is Campus Monitor?"))

        self.assertEqual(plan.task, "targeted")
        self.assertEqual(plan.retrieval_mode, "focused")

    def test_comparison_produces_comparative_mode(self):
        mock_resp = self._mock_plan("comparison", "comparative",
                                     ["Campus Monitor capabilities", "alternative system capabilities"],
                                     targets=["Campus Monitor", "alternative system"])

        async def mock_planner(*args, **kwargs):
            return mock_resp

        with patch("src.pipeline.query_understanding._call_planner_gemini", side_effect=mock_planner):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key"}):
                plan = run(understand_query("Compare the two systems"))

        self.assertEqual(plan.task, "comparison")
        self.assertEqual(plan.retrieval_mode, "comparative")

    def test_ambiguous_compare_them_triggers_clarification(self):
        mock_resp = self._mock_plan(
            "comparison", "comparative", [],
            clarify=True, clarify_q="Could you clarify which two systems you'd like me to compare?"
        )

        async def mock_planner(*args, **kwargs):
            return mock_resp

        with patch("src.pipeline.query_understanding._call_planner_gemini", side_effect=mock_planner):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key"}):
                plan = run(understand_query("compare them"))

        self.assertTrue(plan.needs_clarification)
        self.assertIsNotNone(plan.clarification_question)
        self.assertIn("clarif", plan.clarification_question.lower())

    def test_follow_up_uses_context_resolution(self):
        mock_resp = self._mock_plan(
            "follow_up", "focused",
            ["What technologies does Campus Monitor use?"]
        )

        async def mock_planner(*args, **kwargs):
            return mock_resp

        ctx = [
            {"role": "user", "content": "What is Campus Monitor?"},
            {"role": "assistant", "content": "Campus Monitor is a system that..."},
        ]
        with patch("src.pipeline.query_understanding._call_planner_gemini", side_effect=mock_planner):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key"}):
                plan = run(understand_query("What technologies does it use?", conversation_context=ctx))

        self.assertEqual(plan.task, "follow_up")
        self.assertGreater(len(plan.search_queries), 0)

    def test_standalone_query_never_empty_for_targeted(self):
        """Even if planner returns empty standalone_query, it must be filled from original query."""
        mock_resp = '{"task":"targeted","standalone_query":"","retrieval_mode":"focused","search_queries":[],"comparison_targets":[],"needs_clarification":false,"clarification_question":null}'

        async def mock_planner(*args, **kwargs):
            return mock_resp

        original_q = "What does P-101A measure?"
        with patch("src.pipeline.query_understanding._call_planner_gemini", side_effect=mock_planner):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key"}):
                plan = run(understand_query(original_q))

        self.assertTrue(bool(plan.standalone_query), "standalone_query must never be empty")
        self.assertGreater(len(plan.search_queries), 0, "search_queries must not be empty for targeted task")


if __name__ == "__main__":
    unittest.main()
