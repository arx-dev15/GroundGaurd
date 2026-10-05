import asyncio
import json
from unittest.mock import AsyncMock, patch, MagicMock
from src.pipeline.llm import RealLLMRuntime, LLMUnavailableError

def create_test_runtime():
    llm = RealLLMRuntime()
    llm.provider = "gemini"
    llm.model = "gemini-2.5-flash"
    llm.api_key = "fake-key"
    return llm

def test_streamed_gemini_chunks_order_and_concatenation():
    """Verify that Gemini SSE chunks preserve exact order and concatenate to full answer."""
    async def _run():
        llm = create_test_runtime()

        sse_chunks = [
            'data: {"candidates": [{"content": {"parts": [{"text": "Campus "}]}}]}\r\n\r\n',
            'data: {"candidates": [{"content": {"parts": [{"text": "Monitor "}]}}]}\r\n\r\n',
            'data: {"candidates": [{"content": {"parts": [{"text": "is "}]}}]}\r\n\r\n',
            'data: {"candidates": [{"content": {"parts": [{"text": "active."}]}}]}\r\n\r\n',
        ]

        async def mock_aiter_text():
            for chunk in sse_chunks:
                yield chunk

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.aiter_text = mock_aiter_text

        mock_stream_ctx = AsyncMock()
        mock_stream_ctx.__aenter__.return_value = mock_response

        with patch("httpx.AsyncClient.stream", return_value=mock_stream_ctx):
            collected_deltas = []
            async for delta in llm.stream_answer("system", "user"):
                collected_deltas.append(delta)

            assert collected_deltas == ["Campus ", "Monitor ", "is ", "active."]
            assert "".join(collected_deltas) == "Campus Monitor is active."

    asyncio.run(_run())


def test_stream_gemini_strips_hidden_thought_reasoning():
    """Verify that internal thought/reasoning parts are strictly excluded from streamed answer."""
    async def _run():
        llm = create_test_runtime()

        sse_chunks = [
            'data: {"candidates": [{"content": {"parts": [{"text": "Internal thoughts here", "thought": true}]}}]}\r\n\r\n',
            'data: {"candidates": [{"content": {"parts": [{"text": "Visible answer sentence."}]}}]}\r\n\r\n',
        ]

        async def mock_aiter_text():
            for chunk in sse_chunks:
                yield chunk

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.aiter_text = mock_aiter_text

        mock_stream_ctx = AsyncMock()
        mock_stream_ctx.__aenter__.return_value = mock_response

        with patch("httpx.AsyncClient.stream", return_value=mock_stream_ctx):
            collected = []
            async for delta in llm.stream_answer("system", "user"):
                collected.append(delta)

            assert collected == ["Visible answer sentence."]
            assert "Internal thoughts" not in "".join(collected)

    asyncio.run(_run())


def test_stream_gemini_handles_api_failure():
    """Verify that HTTP errors during stream initialization raise LLMUnavailableError."""
    async def _run():
        llm = create_test_runtime()

        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_response.aread = AsyncMock(return_value=b'{"error": "Service Unavailable"}')

        mock_stream_ctx = AsyncMock()
        mock_stream_ctx.__aenter__.return_value = mock_response

        with patch("httpx.AsyncClient.stream", return_value=mock_stream_ctx):
            raised = False
            try:
                async for _ in llm.stream_answer("system", "user"):
                    pass
            except LLMUnavailableError as e:
                raised = True
                assert "503" in str(e)
            assert raised, "Expected LLMUnavailableError on 503"

    asyncio.run(_run())
