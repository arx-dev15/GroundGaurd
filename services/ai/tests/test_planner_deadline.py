"""Planner wall-clock deadline + definition routing (mocked provider; no live calls)."""
import asyncio, os, sys, time
from unittest.mock import AsyncMock, patch
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.pipeline import query_understanding as qu
from src.pipeline.llm import llm_runtime

CTX = {"readyDocs": [{"id": "doc_stud", "filename": "stud.pdf"}]}
GOOD_PLAN = '{"task": "targeted", "standalone_query": "Who was Dr. Watson?", "retrieval_mode": "focused", "search_queries": ["Dr. Watson identity"]}'


def _slow(delay, result=GOOD_PLAN):
    async def _gen(user_prompt, system_prompt):
        await asyncio.sleep(delay)
        return result
    return _gen


def test_slow_planner_falls_back_within_deadline():
    with patch.object(qu, "PLANNER_TIMEOUT_SEC", 0.2), patch.object(llm_runtime, "is_configured", return_value=True), \
         patch.object(llm_runtime, "generate_structured", side_effect=_slow(2.0)):
        llm_runtime._cooldown_until = 0.0
        t0 = time.perf_counter()
        plan = asyncio.run(qu.understand_query("Who was Dr. Watson?", project_context=CTX))
        elapsed = time.perf_counter() - t0
    assert elapsed < 1.0
    assert plan.planner_source == "fallback" and plan.standalone_query
    assert "Dr. Watson identity" not in (plan.search_queries or [])   # late planner result never applied


def test_fast_planner_result_used_within_deadline():
    with patch.object(qu, "PLANNER_TIMEOUT_SEC", 2.0), patch.object(llm_runtime, "is_configured", return_value=True), \
         patch.object(llm_runtime, "generate_structured", side_effect=_slow(0.01)):
        llm_runtime._cooldown_until = 0.0
        plan = asyncio.run(qu.understand_query("Who was Dr. Watson?", project_context=CTX))
    assert plan.planner_source == "llm"


def test_default_deadline_is_bounded():
    assert 0 < qu.PLANNER_TIMEOUT_SEC <= 8


@pytest.mark.parametrize("q", ["Who was Dr. Watson?", "Who is Sherlock Holmes?", "What is Campus Monitor?"])
def test_definition_questions_still_use_planner(q):
    # Not enabled: deterministic retrieval missed ~35% of evidence the planner runs used for definitions.
    assert not qu.is_simple_factual_lookup(q, None, ["stud.pdf"])
    with patch.object(qu, "_call_planner_gemini", AsyncMock(return_value=None)) as planner, \
         patch.object(llm_runtime, "is_configured", return_value=True):
        llm_runtime._cooldown_until = 0.0
        asyncio.run(qu.understand_query(q, project_context=CTX))
    planner.assert_awaited_once()
