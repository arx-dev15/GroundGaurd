import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx

from src.pipeline import llm as llm_mod
from src.pipeline.llm import LLMUnavailableError, RealLLMRuntime
from src.pipeline.query_understanding import _call_planner_gemini


def runtime_for(provider, model, key="test-key"):
    env = {
        "LLM_PROVIDER": provider,
        "LLM_MODEL": model,
        "GEMINI_API_KEY": "" if provider != "gemini" else key,
        "GROQ_API_KEY": "" if provider != "groq" else key,
    }
    with patch.dict(os.environ, env, clear=True):
        return RealLLMRuntime()


def test_provider_and_model_selection_is_environment_only():
    gemini = runtime_for("gemini", "gemini-test")
    groq = runtime_for("groq", "openai/gpt-oss-20b")

    assert gemini.provider == "gemini"
    assert gemini.model == "gemini-test"
    assert groq.provider == "groq"
    assert groq.model == "openai/gpt-oss-20b"
    assert groq.get_model_version() == "groq/openai/gpt-oss-20b"


def test_missing_provider_defaults_to_gemini():
    with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True):
        runtime = RealLLMRuntime()
    assert runtime.provider == "gemini"
    assert runtime.is_configured()


def test_invalid_provider_fails_without_fallback():
    runtime = runtime_for("not-a-provider", "model")
    assert not runtime.is_configured()
    with pytest.raises(LLMUnavailableError, match="Unsupported LLM_PROVIDER"):
        asyncio.run(runtime.generate_answer("question"))


def test_gemini_and_groq_non_streaming_operations_select_their_provider():
    gemini = runtime_for("gemini", "gemini-test")
    groq = runtime_for("groq", "openai/gpt-oss-20b")

    with patch.object(gemini, "_call_gemini", new=AsyncMock(return_value="gemini answer")) as gemini_call:
        result = asyncio.run(gemini.generate_answer("question"))
        assert result.answer == "gemini answer"
        gemini_call.assert_awaited_once()

    with patch.object(groq, "_call_groq", new=AsyncMock(return_value='{"claims": []}')) as groq_call:
        result = asyncio.run(groq.generate_structured("json request", "json system"))
        assert json.loads(result) == {"claims": []}
        groq_call.assert_awaited_once_with("json system", "json request", response_json=True)


def test_gemini_and_groq_streaming_operations_select_their_provider():
    async def gemini_stream(*args):
        yield "Gemini"

    async def groq_stream(*args):
        yield "Groq"

    gemini = runtime_for("gemini", "gemini-test")
    groq = runtime_for("groq", "openai/gpt-oss-20b")
    with patch.object(gemini, "_stream_gemini", side_effect=gemini_stream):
        assert asyncio.run(collect(gemini.stream_answer("q"))) == ["Gemini"]
    with patch.object(groq, "_stream_groq", side_effect=groq_stream):
        assert asyncio.run(collect(groq.stream_answer("q"))) == ["Groq"]


async def collect(iterator):
    return [item async for item in iterator]


def test_groq_streaming_http_chunks_are_parsed():
    runtime = runtime_for("groq", "openai/gpt-oss-20b")
    response = MagicMock(status_code=200, headers={})

    async def lines():
        yield 'data: {"choices":[{"delta":{"content":"Groq "}}]} '
        yield 'data: {"choices":[{"delta":{"content":"stream"}}]} '
        yield "data: [DONE]"

    response.aiter_lines = lines
    stream_context = MagicMock()
    stream_context.__aenter__ = AsyncMock(return_value=response)
    stream_context.__aexit__ = AsyncMock(return_value=None)
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    client.stream.return_value = stream_context

    with patch.object(llm_mod.httpx, "AsyncClient", return_value=client):
        assert asyncio.run(collect(runtime._stream_groq("system", "user"))) == ["Groq ", "stream"]
    request = client.stream.call_args
    assert request.args[0] == "POST"
    assert request.kwargs["json"]["model"] == "openai/gpt-oss-20b"
    assert request.kwargs["json"]["max_completion_tokens"] == 1024


def test_planner_wrapper_uses_selected_runtime_structured_call():
    runtime = runtime_for("groq", "openai/gpt-oss-20b")
    with patch("src.pipeline.llm.llm_runtime", runtime), patch.object(
        runtime, "generate_structured", new=AsyncMock(return_value='{"task":"targeted"}')
    ) as structured:
        result = asyncio.run(_call_planner_gemini("ignored", "ignored", "system", "user"))
    assert result == '{"task":"targeted"}'
    structured.assert_awaited_once_with("user", "system")


def test_groq_retry_and_error_sanitization():
    runtime = runtime_for("groq", "openai/gpt-oss-20b")
    first = MagicMock(status_code=429, headers={"Retry-After": "30"}, text='secret quota project 123')
    client = AsyncMock()
    client.__aenter__.return_value.post = AsyncMock(return_value=first)

    with patch.object(llm_mod.httpx, "AsyncClient", return_value=client), patch.object(llm_mod.asyncio, "sleep", new=AsyncMock()) as sleep:
        with pytest.raises(LLMUnavailableError) as error:
            asyncio.run(runtime._call_groq("system", "user"))

    assert error.value.status_code == 429
    assert error.value.reason == "rate_limited"
    assert "secret" not in str(error.value).lower()
    sleep.assert_not_awaited()


def test_groq_timeout_is_sanitized():
    runtime = runtime_for("groq", "openai/gpt-oss-20b")
    client = AsyncMock()
    client.__aenter__.return_value.post = AsyncMock(side_effect=httpx.TimeoutException("secret timeout"))
    with patch.object(llm_mod.httpx, "AsyncClient", return_value=client):
        with pytest.raises(LLMUnavailableError) as error:
            asyncio.run(runtime._call_groq("system", "user"))
    assert error.value.reason == "timeout"
    assert "secret" not in str(error.value).lower()


def test_groq_503_retries_within_budget():
    runtime = runtime_for("groq", "llama-3.1-8b-instant")
    first = MagicMock(status_code=503, headers={}, text="secret backend")
    second = MagicMock(status_code=200, headers={}, text="")
    second.json.return_value = {"choices": [{"message": {"content": "ok"}}]}
    client = AsyncMock()
    client.__aenter__.return_value.post = AsyncMock(side_effect=[first, second])
    with patch.object(llm_mod.httpx, "AsyncClient", return_value=client), patch.object(
        llm_mod.asyncio, "sleep", new=AsyncMock()
    ) as sleep:
        assert asyncio.run(runtime._call_groq("system", "user")) == "ok"
    sleep.assert_awaited_once_with(1.0)
