"""
Regression suite: Stabilization Phase 03 -- recovery attempt cap (F4) & provider-error handling (F5).
All provider responses are mocked: no live Gemini quota is used.
"""
import asyncio
import json
import os
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.pipeline import llm as llm_mod
from src.pipeline.llm import LLMUnavailableError, llm_runtime
from src.pipeline import recovery, recovery_graph
from src.pipeline.retrieval import EvidenceItem

SECRET_BODY = '{"error":{"code":429,"message":"Quota exceeded for project 1234567890 (SECRET-QUOTA-DETAIL)",' \
              '"details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"%ss"}]}}'


@pytest.fixture(autouse=True)
def _reset_runtime():
    llm_runtime._cooldown_until = 0.0
    with patch.object(llm_runtime, "provider", "gemini"), patch.object(llm_runtime, "api_key", "test-key"), \
         patch.object(llm_runtime, "model", "gemini-test"):
        yield
    llm_runtime._cooldown_until = 0.0


def _resp(status, body="", headers=None, text_ok="ok"):
    r = MagicMock()
    r.status_code = status
    r.text = body
    r.headers = headers or {}
    r.json.return_value = {"candidates": [{"content": {"parts": [{"text": text_ok}]}}]}
    return r


# ---------------------------------------------------------------------------
# F5: provider errors
# ---------------------------------------------------------------------------

def test_429_retry_guidance_honored_within_budget():
    calls = [_resp(429, SECRET_BODY % "1"), _resp(200)]
    with patch.object(llm_mod.requests, "post", side_effect=calls) as post, patch.object(llm_mod.time, "sleep") as slp:
        out = asyncio.run(llm_runtime.generate_answer("q"))
    assert out.answer == "ok" and post.call_count == 2
    slp.assert_called_once_with(1.0)


def test_429_guidance_beyond_budget_is_terminal_sanitized_and_cools_down():
    with patch.object(llm_mod.requests, "post", return_value=_resp(429, SECRET_BODY % "30")) as post, \
         patch.object(llm_mod.time, "sleep") as slp:
        with pytest.raises(LLMUnavailableError) as ei:
            asyncio.run(llm_runtime.generate_answer("q"))
        err = ei.value
        assert post.call_count == 1 and not slp.called            # no doomed retry
        assert err.status_code == 429 and err.retry_after == 30 and err.reason == "rate_limited"
        assert "SECRET" not in str(err) and "1234567890" not in str(err)
        # Subsequent calls fail fast during cooldown -- no further request to the throttled provider.
        for fn in (lambda: llm_runtime.generate_answer("q"), lambda: llm_runtime.extract_claims("q")):
            with pytest.raises(LLMUnavailableError) as e2:
                asyncio.run(fn())
            assert e2.value.reason == "cooldown"
        assert post.call_count == 1


def test_503_without_guidance_single_bounded_retry():
    body = '{"error":{"code":503,"message":"internal shard xyz overloaded"}}'
    with patch.object(llm_mod.requests, "post", return_value=_resp(503, body)) as post, \
         patch.object(llm_mod.time, "sleep") as slp:
        with pytest.raises(LLMUnavailableError) as ei:
            asyncio.run(llm_runtime.extract_claims("q"))
    assert post.call_count == 2 == llm_mod.LLM_MAX_RETRIES + 1
    slp.assert_called_once_with(1.0)
    assert ei.value.status_code == 503 and "shard" not in str(ei.value)


def test_timeout_is_terminal_without_retry():
    with patch.object(llm_mod.requests, "post", side_effect=requests.Timeout("read timed out")) as post:
        with pytest.raises(LLMUnavailableError) as ei:
            asyncio.run(llm_runtime.generate_answer("q"))
    assert post.call_count == 1 and ei.value.reason == "timeout"


def test_non_retryable_status_not_retried():
    with patch.object(llm_mod.requests, "post", return_value=_resp(400, '{"error":"bad key AIza-secret"}')) as post:
        with pytest.raises(LLMUnavailableError) as ei:
            asyncio.run(llm_runtime.generate_answer("q"))
    assert post.call_count == 1 and "AIza" not in str(ei.value)


# ---------------------------------------------------------------------------
# F4: recovery attempt cap (graph + legacy) and recovery decisions
# ---------------------------------------------------------------------------

def _ev():
    return EvidenceItem(evidenceId="e1", chunkId="c1", documentId="d1", text="Pump P-101A rated flow is 450 gpm.",
                        pageNumber=1, sources=["qdrant_dense"])


def _retr():
    return SimpleNamespace(results=[_ev()])


def _run_graph(attempt, llm_side_effect, max_attempts=None):
    kw = {} if max_attempts is None else {"max_attempts": max_attempts}
    with patch.object(recovery_graph, "retrieve_evidence", return_value=_retr()) as retr, \
         patch.object(recovery_graph.llm_runtime, "extract_claims", AsyncMock(side_effect=llm_side_effect)) as llm:
        res = asyncio.run(recovery_graph.run_langgraph_recovery("p1", "c1", "Pump P-101A flows at 500 gpm.",
                                                                "INSUFFICIENT_EVIDENCE", attempt=attempt, **kw))
    return res, retr, llm


ABSTAIN = json.dumps({"action": "abstain", "claim": "", "reason": "silent"})
KEEP = json.dumps({"action": "keep", "claim": "Pump P-101A flows at 500 gpm.", "reason": "ok"})
REVISE = json.dumps({"action": "revise", "claim": "Pump P-101A has a rated flow of 450 gpm.", "reason": "corrected"})


def test_graph_attempt_below_limit_loops_until_limit():
    res, _, llm = _run_graph(1, [ABSTAIN, ABSTAIN])
    assert llm.await_count == recovery_graph.MAX_RECOVERY_ATTEMPTS == 2
    assert res.action == "abstain" and res.failureType == "attempt_limit"


def test_graph_attempt_at_limit_runs_once_then_stops():
    res, _, llm = _run_graph(2, [ABSTAIN, ABSTAIN, ABSTAIN])
    assert llm.await_count == 1 and res.failureType == "attempt_limit"


@pytest.mark.parametrize("attempt,max_attempts", [(3, None), (5, None), (5, 10)])
def test_graph_attempt_above_limit_never_raises_cap(attempt, max_attempts):
    res, retr, llm = _run_graph(attempt, [KEEP], max_attempts=max_attempts)
    assert res.action == "abstain" and res.failureType == "attempt_limit" and res.candidateClaim is None
    assert retr.call_count == 0 and llm.await_count == 0


@pytest.mark.parametrize("raw,action,claim", [
    (KEEP, "keep", "Pump P-101A flows at 500 gpm."),
    (REVISE, "revise", "Pump P-101A has a rated flow of 450 gpm."),
])
def test_graph_keep_and_revise_decisions(raw, action, claim):
    res, _, llm = _run_graph(1, [raw])
    assert res.action == action and res.candidateClaim == claim and res.failureType is None and llm.await_count == 1


def test_graph_provider_unavailable_is_terminal_with_real_reason():
    err = LLMUnavailableError("gemini provider unavailable (HTTP 429: rate limited); retry after 30s",
                              status_code=429, retry_after=30, reason="rate_limited")
    res, _, llm = _run_graph(1, [err, KEEP])
    assert llm.await_count == 1                                  # never loops into another throttled request
    assert res.action == "abstain" and res.failureType == "provider_unavailable"
    assert "attempt limit" not in res.reason and "provider unavailable" in res.reason


def _run_legacy(attempt, llm_side_effect):
    with patch.object(recovery, "retrieve_evidence", return_value=_retr()) as retr, \
         patch.object(recovery.llm_runtime, "extract_claims", AsyncMock(side_effect=llm_side_effect)) as llm:
        res = asyncio.run(recovery.execute_recovery("p1", "c1", "Pump P-101A flows at 500 gpm.",
                                                    "INSUFFICIENT_EVIDENCE", attempt=attempt))
    return res, retr, llm


@pytest.mark.parametrize("attempt,expect_calls", [(1, 1), (2, 1), (3, 0)])
def test_legacy_attempt_boundaries_match_graph(attempt, expect_calls):
    res, retr, llm = _run_legacy(attempt, [REVISE])
    assert llm.await_count == expect_calls
    if attempt > recovery.MAX_RECOVERY_ATTEMPTS:
        assert res.action == "abstain" and res.failureType == "attempt_limit" and retr.call_count == 0
    else:
        assert res.action == "revise" and res.failureType is None


def test_legacy_provider_unavailable_preserves_reason():
    res, _, _ = _run_legacy(1, [LLMUnavailableError("gemini provider timed out", reason="timeout")])
    assert res.failureType == "provider_unavailable" and "timed out" in res.reason


def test_recover_endpoint_sanitized_and_failure_type_exposed():
    from fastapi.testclient import TestClient
    from src import main
    with patch.object(llm_mod.requests, "post", return_value=_resp(429, SECRET_BODY % "30")), \
         patch.object(recovery_graph, "retrieve_evidence", return_value=_retr()):
        body = TestClient(main.app).post("/recover", json={
            "projectId": "p1", "claimId": "c1", "claim": "Pump P-101A flows at 500 gpm.",
            "failureReason": "INSUFFICIENT_EVIDENCE", "attempt": 1}).json()
    assert body["action"] == "abstain" and body["failureType"] == "provider_unavailable"
    assert "SECRET" not in json.dumps(body) and "1234567890" not in json.dumps(body)


def test_recover_endpoint_runs_exactly_one_attempt_per_request():
    """M3 owns the attempt loop: one /recover call = one LLM revision (was 2 for attempt 1)."""
    from fastapi.testclient import TestClient
    from src import main
    with patch.object(recovery_graph, "retrieve_evidence", return_value=_retr()), \
         patch.object(recovery_graph.llm_runtime, "extract_claims", AsyncMock(side_effect=[ABSTAIN, ABSTAIN])) as llm:
        body = TestClient(main.app).post("/recover", json={
            "projectId": "p1", "claimId": "c1", "claim": "Pump P-101A flows at 500 gpm.",
            "failureReason": "INSUFFICIENT_EVIDENCE", "attempt": 1}).json()
    assert llm.await_count == 1 and body["action"] == "abstain"
    assert body.get("failureType") is None  # a normal abstention, not a fake "attempt limit"
