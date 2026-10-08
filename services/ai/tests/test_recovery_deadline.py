"""M3 recovery budget -> M2 /recover -> provider HTTP timeout (mocked provider; no live calls)."""
import asyncio, os, sys, time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.pipeline import llm as llm_mod
from src.pipeline.llm import llm_runtime, llm_request_deadline, LLMUnavailableError


def _gemini_call(deadline_offset):
    resp = MagicMock(status_code=200, text="", headers={})
    resp.json.return_value = {"candidates": [{"content": {"parts": [{"text": "{}"}]}}]}
    with patch.object(llm_runtime, "provider", "gemini"), patch.object(llm_runtime, "api_key", "k"), \
         patch.object(llm_mod.requests, "post", return_value=resp) as post:
        llm_runtime._cooldown_until = 0.0
        async def go():
            tok = llm_request_deadline.set(None if deadline_offset is None else time.monotonic() + deadline_offset)
            try:
                return await llm_runtime.extract_claims("u", "s")
            finally:
                llm_request_deadline.reset(tok)
        asyncio.run(go())
    return post


def test_no_deadline_keeps_default_timeout():
    assert _gemini_call(None).call_args.kwargs["timeout"] == 40.0


def test_deadline_bounds_provider_http_timeout():
    t = _gemini_call(2.0).call_args.kwargs["timeout"]
    assert 0 < t <= 2.0


def test_expired_deadline_skips_provider_call():
    with pytest.raises(LLMUnavailableError) as e:
        _gemini_call(-1.0)
    assert e.value.reason == "timeout"


def test_recover_endpoint_sets_and_clears_deadline():
    from fastapi.testclient import TestClient
    import src.main as main
    seen = {}
    async def fake_recovery(**kw):
        seen["deadline"] = llm_request_deadline.get()
        return SimpleNamespace(action="abstain", candidateClaim=None, recoveryEvidence=[], modelVersion="m", reason="r", failureType=None)
    with patch("src.pipeline.recovery_graph.run_langgraph_recovery", fake_recovery):
        client = TestClient(main.app)
        body = {"projectId": "p", "claimId": "c", "claim": "x", "failureReason": "CONTRADICTION", "deadlineMs": 3000}
        t0 = time.monotonic()
        assert client.post("/recover", json=body).status_code == 200
        assert seen["deadline"] is not None and 0 < seen["deadline"] - t0 <= 3.1
        body.pop("deadlineMs")
        assert client.post("/recover", json=body).status_code == 200
        assert seen["deadline"] is None
    assert llm_request_deadline.get() is None
