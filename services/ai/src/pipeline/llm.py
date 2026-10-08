"""
GroundGuard Phase 5: Real LLM Runtime
Provides real inference integration for configured LLM providers (Gemini, Groq, OpenAI, Ollama).
Enforces zero mock generation, greedy temperature=0.0 decoding, and explicit unavailability semantics.
"""

import os
import re
import time
import asyncio
import contextvars
import logging
from typing import Optional, Dict, Any
from pydantic import BaseModel
import httpx
import requests
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), ".env"), override=True)

from src.pipeline.prompts import (
    GROUNDGUARD_SYSTEM_PROMPT, CLAIM_EXTRACTION_SYSTEM_PROMPT,
    get_generation_system_prompt, get_extraction_system_prompt,
)

logger = logging.getLogger("m2-llm-runtime")

# Strict total time budget for honoring provider retry guidance (Retry-After / RetryInfo.retryDelay).
LLM_RETRY_BUDGET_SEC = float(os.getenv("LLM_RETRY_BUDGET_SEC", "6"))
LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "1"))
_RETRYABLE_STATUS = (429, 500, 502, 503, 504)


def _gemini_thinking_config() -> Optional[Dict[str, Any]]:
    """
    Opt-in, reversible Gemini thinking control (unset = request unchanged). Thinking models emit no visible
    text until internal reasoning finishes, which delays the first streamed token.
      GEMINI_THINKING_BUDGET=<int>   (Gemini 2.5-family: 0 disables thinking where the model allows it)
      GEMINI_THINKING_LEVEL=<level>  (Gemini 3-family, e.g. "low")
    Use only values the configured model supports; an unsupported value is rejected by the API (HTTP 400).
    """
    budget = os.getenv("GEMINI_THINKING_BUDGET", "").strip()
    level = os.getenv("GEMINI_THINKING_LEVEL", "").strip()
    if budget:
        try:
            return {"thinkingBudget": int(budget)}
        except ValueError:
            logger.warning("[llm-runtime] Ignoring non-integer GEMINI_THINKING_BUDGET")
    if level:
        return {"thinkingLevel": level}
    return None
_STATUS_TEXT = {429: "rate limited", 500: "internal error", 502: "bad gateway", 503: "temporarily unavailable", 504: "gateway timeout"}
_SUPPORTED_PROVIDERS = {"gemini", "groq", "openai", "ollama"}


# Optional absolute time.monotonic() deadline for provider calls made on behalf of the current request
# (e.g. M3's remaining recovery budget). Unset = unchanged timeouts. Propagates into asyncio.to_thread.
llm_request_deadline: "contextvars.ContextVar[Optional[float]]" = contextvars.ContextVar("llm_request_deadline", default=None)


def _deadline_timeout(default: float) -> float:
    """HTTP timeout bounded by the request deadline; raises when the deadline has already passed."""
    dl = llm_request_deadline.get()
    if dl is None:
        return default
    remaining = dl - time.monotonic()
    if remaining <= 0.05:
        raise LLMUnavailableError("provider call skipped: request deadline reached", reason="timeout")
    return min(default, remaining)


class LLMUnavailableError(Exception):
    """
    Raised when no real LLM provider is configured or reachable.
    str(err) is a SANITIZED public message; raw provider bodies are only logged (truncated).
    reason: "provider_unavailable" | "rate_limited" | "timeout" | "connection" | "cooldown" | "not_configured"
    """

    def __init__(self, message: str, status_code: Optional[int] = None,
                 retry_after: Optional[float] = None, reason: str = "provider_unavailable"):
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after
        self.reason = reason


def _parse_retry_after(headers: Any, body: str) -> Optional[float]:
    try:
        h = (headers or {}).get("Retry-After") or (headers or {}).get("retry-after")
        if h:
            return float(h)
    except (TypeError, ValueError, AttributeError):
        pass
    m = re.search(r'"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"', body or "")
    return float(m.group(1)) if m else None


def _provider_error(provider: str, status: int, body: str, retry_after: Optional[float]) -> "LLMUnavailableError":
    logger.warning(f"[llm-runtime] {provider} HTTP {status} (raw body, truncated): {(body or '')[:300]}")
    msg = f"{provider} provider unavailable (HTTP {status}: {_STATUS_TEXT.get(status, 'request rejected')})"
    if retry_after:
        msg += f"; retry after {retry_after:.0f}s"
    return LLMUnavailableError(msg, status_code=status, retry_after=retry_after,
                               reason="rate_limited" if status == 429 else "provider_unavailable")

class LLMResponse(BaseModel):
    answer: str
    modelVersion: str
    provider: str
    latencyMs: int

class RealLLMRuntime:
    """
    Manages connection and inference execution against configured real LLM APIs.
    """
    def __init__(self):
        # Provider identification
        self.provider_explicit = bool(os.getenv("LLM_PROVIDER"))
        self.provider = (os.getenv("LLM_PROVIDER") or "gemini").strip().lower()
        self.model = os.getenv("LLM_MODEL", "")

        self.configuration_error = None
        if self.provider not in _SUPPORTED_PROVIDERS:
            self.configuration_error = f"Unsupported LLM_PROVIDER: '{self.provider}'"

        # Explicitly map API key to configured provider (no silent fallback or key leaking)
        if self.provider == "gemini":
            self.api_key = os.getenv("GEMINI_API_KEY", "")
        elif self.provider == "groq":
            self.api_key = os.getenv("GROQ_API_KEY", "")
        elif self.provider == "openai":
            self.api_key = os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY", "")
        else:
            self.api_key = ""

        self.base_url = os.getenv("LLM_BASE_URL", "")
        # Process-local cooldown after a terminal throttling response: later calls fail fast without
        # sending another request into an already-throttled provider (not a distributed rate limiter).
        self._cooldown_until = 0.0

        # Apply default models for detected provider
        if self.provider == "gemini" and not self.model:
            self.model = "gemini-flash-lite-latest"
        elif self.provider == "groq" and not self.model:
            self.model = "llama-3.1-8b-instant"
        elif self.provider == "openai" and not self.model:
            self.model = "gpt-4o-mini"
        elif self.provider == "ollama" and not self.model:
            self.model = "llama3.1"

        logger.info(
            f"[llm-runtime] Initialized LLM runtime: provider='{self.provider or 'NONE'}', "
            f"model='{self.model or 'NONE'}', key_configured={'YES' if bool(self.api_key) else 'NO'}"
        )

    def is_configured(self) -> bool:
        """Returns True if a real provider and required credentials/endpoints are set."""
        if self.configuration_error:
            return False
        if self.provider == "ollama":
            return True  # Ollama runs locally without API key
        return bool(self.api_key)

    def _ensure_configured(self, operation: str) -> None:
        if self.configuration_error:
            raise LLMUnavailableError(self.configuration_error, reason="not_configured")
        if self.provider != "ollama" and not self.api_key:
            if self.provider == "gemini" and not self.provider_explicit:
                raise LLMUnavailableError(
                    "PHASE 5 BLOCKED — REAL LLM RUNTIME NOT CONFIGURED: "
                    "No valid LLM_PROVIDER or LLM_API_KEY configured in environment.",
                    reason="not_configured",
                )
            raise LLMUnavailableError(
                f"{self.provider} provider is configured for {operation} but its API key is missing",
                reason="not_configured",
            )

    def _check_cooldown(self) -> None:
        remaining = self._cooldown_until - time.monotonic()
        if remaining > 0:
            raise LLMUnavailableError(
                f"{self.provider} provider rate limited; retry after {remaining:.0f}s",
                status_code=429, retry_after=remaining, reason="cooldown",
            )

    def _enter_cooldown(self, err: "LLMUnavailableError") -> None:
        if err.retry_after and err.status_code in (429, 503):
            self._cooldown_until = max(self._cooldown_until, time.monotonic() + min(err.retry_after, 120.0))

    def get_model_version(self) -> str:
        """Returns the full model identifier."""
        if not self.is_configured():
            return "unconfigured"
        return f"{self.provider}/{self.model}"

    async def generate_answer(self, user_prompt: str, system_prompt: Optional[str] = None) -> LLMResponse:
        """
        Executes real LLM inference with greedy temperature=0.0 decoding.
        Fails fast if no real LLM is configured. Fail-closed: does not fall back across providers.
        """
        # Default resolved at call time so GENERATION_PROMPT_PROFILE applies (default 'full' = original prompt).
        system_prompt = system_prompt or get_generation_system_prompt()
        self._ensure_configured("answer generation")

        t0 = time.perf_counter()

        self._check_cooldown()
        if self.provider == "gemini":
            answer = await self._call_gemini(system_prompt, user_prompt)
        elif self.provider == "groq":
            answer = await self._call_groq(system_prompt, user_prompt)
        elif self.provider == "openai":
            answer = await self._call_openai(system_prompt, user_prompt)
        elif self.provider == "ollama":
            answer = await self._call_ollama(system_prompt, user_prompt)
        else:
            raise LLMUnavailableError(f"Unsupported LLM provider: '{self.provider}'")

        latency_ms = int((time.perf_counter() - t0) * 1000)

        return LLMResponse(
            answer=answer.strip(),
            modelVersion=self.get_model_version(),
            provider=self.provider,
            latencyMs=latency_ms
        )

    async def stream_answer(self, user_prompt: str, system_prompt: Optional[str] = None):
        """
        Executes real LLM streaming inference with greedy temperature=0.0 decoding.
        Yields newly generated user-visible text chunks as they arrive from the native model stream.
        Fails fast if no real LLM is configured.
        """
        # Default resolved at call time so GENERATION_PROMPT_PROFILE applies (default 'full' = original prompt).
        system_prompt = system_prompt or get_generation_system_prompt()
        self._ensure_configured("streaming")

        self._check_cooldown()
        if self.provider == "gemini":
            async for delta in self._stream_gemini(system_prompt, user_prompt):
                yield delta
        elif self.provider == "groq":
            async for delta in self._stream_groq(system_prompt, user_prompt):
                yield delta
        elif self.provider == "openai":
            async for delta in self._stream_openai(system_prompt, user_prompt):
                yield delta
        elif self.provider == "ollama":
            async for delta in self._stream_ollama(system_prompt, user_prompt):
                yield delta
        else:
            raise LLMUnavailableError(f"Unsupported LLM provider: '{self.provider}'")

    async def extract_claims(self, user_prompt: str, system_prompt: Optional[str] = None) -> str:
        """
        Executes real LLM structured claim extraction with temperature=0.0 and JSON response mode.
        """
        # Default resolved at call time so GENERATION_PROMPT_PROFILE applies (default 'full' = original prompt).
        system_prompt = system_prompt or get_extraction_system_prompt()
        self._ensure_configured("structured extraction")

        self._check_cooldown()
        if self.provider == "gemini":
            return await self._call_gemini(system_prompt, user_prompt, response_json=True)
        elif self.provider == "groq":
            return await self._call_groq(system_prompt, user_prompt, response_json=True)
        elif self.provider == "openai":
            return await self._call_openai(system_prompt, user_prompt, response_json=True)
        elif self.provider == "ollama":
            return await self._call_ollama(system_prompt, user_prompt, response_json=True)
        else:
            raise LLMUnavailableError(f"Unsupported LLM provider: '{self.provider}'")

    async def generate_structured(self, user_prompt: str, system_prompt: str) -> str:
        """Run a provider-specific JSON-capable completion for planning and extraction."""
        self._ensure_configured("structured generation")
        self._check_cooldown()
        if self.provider == "gemini":
            return await self._call_gemini(system_prompt, user_prompt, response_json=True)
        if self.provider == "groq":
            return await self._call_groq(system_prompt, user_prompt, response_json=True)
        if self.provider == "openai":
            return await self._call_openai(system_prompt, user_prompt, response_json=True)
        if self.provider == "ollama":
            return await self._call_ollama(system_prompt, user_prompt, response_json=True)
        raise LLMUnavailableError(f"Unsupported LLM provider: '{self.provider}'")

    async def _call_gemini(self, system_prompt: str, user_prompt: str, response_json: bool = False) -> str:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json"
        }
        generation_config: Dict[str, Any] = {
            "temperature": 0.0,
            "maxOutputTokens": 2048 if response_json else 1024
        }
        if response_json:
            generation_config["responseMimeType"] = "application/json"
        if _gemini_thinking_config():
            generation_config["thinkingConfig"] = _gemini_thinking_config()

        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": generation_config
        }
        def _sync_post():
            deadline = time.monotonic() + LLM_RETRY_BUDGET_SEC
            if llm_request_deadline.get() is not None:
                deadline = min(deadline, llm_request_deadline.get())
            for attempt in range(LLM_MAX_RETRIES + 1):
                delay = 1.0
                try:
                    res = requests.post(url, headers=headers, json=payload, timeout=_deadline_timeout(40.0))
                except requests.Timeout:
                    # Terminal: a 40s timeout already exceeds any reasonable retry budget.
                    raise LLMUnavailableError("gemini provider timed out", reason="timeout")
                except requests.RequestException as e:
                    logger.warning(f"[llm-runtime] gemini connection error: {e}")
                    err = LLMUnavailableError("gemini provider connection error", reason="connection")
                else:
                    if res.status_code == 200:
                        try:
                            return res.json()["candidates"][0]["content"]["parts"][0]["text"]
                        except (KeyError, IndexError, ValueError):
                            raise LLMUnavailableError("Malformed Gemini API response")
                    retry_after = _parse_retry_after(res.headers, res.text)
                    err = _provider_error("gemini", res.status_code, res.text, retry_after)
                    if res.status_code not in _RETRYABLE_STATUS:
                        raise err
                    delay = retry_after if retry_after is not None else 1.0 * (attempt + 1)
                # Honor retry guidance only if it fits the strict total retry budget.
                if attempt < LLM_MAX_RETRIES and time.monotonic() + delay <= deadline:
                    time.sleep(delay)
                    continue
                self._enter_cooldown(err)
                raise err
            raise LLMUnavailableError("gemini provider unavailable")

        return await asyncio.to_thread(_sync_post)

    async def _call_groq(self, system_prompt: str, user_prompt: str, response_json: bool = False) -> str:
        return await self._call_openai_compatible(
            provider="groq",
            base_url="https://api.groq.com/openai/v1",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_json=response_json,
        )

    async def _call_openai_compatible(
        self,
        provider: str,
        base_url: str,
        system_prompt: str,
        user_prompt: str,
        response_json: bool = False,
    ) -> str:
        url = f"{base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.0,
        }
        token_limit = 2048 if response_json else 1024
        if provider == "groq" and self.model.startswith("openai/gpt-oss-"):
            payload["max_completion_tokens"] = token_limit
        else:
            payload["max_tokens"] = token_limit
        if response_json:
            payload["response_format"] = {"type": "json_object"}

        deadline = time.monotonic() + LLM_RETRY_BUDGET_SEC
        if llm_request_deadline.get() is not None:
            deadline = min(deadline, llm_request_deadline.get())
        for attempt in range(LLM_MAX_RETRIES + 1):
            delay = 1.0
            try:
                async with httpx.AsyncClient(timeout=_deadline_timeout(45.0)) as client:
                    res = await client.post(url, headers=headers, json=payload)
            except httpx.TimeoutException:
                raise LLMUnavailableError(f"{provider} provider timed out", reason="timeout")
            except httpx.RequestError as exc:
                err = LLMUnavailableError(f"{provider} provider connection error", reason="connection")
                logger.warning("[llm-runtime] %s connection error: %s", provider, exc)
            else:
                if res.status_code == 200:
                    try:
                        return res.json()["choices"][0]["message"]["content"]
                    except (KeyError, IndexError, TypeError, ValueError):
                        raise LLMUnavailableError(f"Malformed {provider.title()} API response")
                retry_after = _parse_retry_after(res.headers, res.text)
                err = _provider_error(provider, res.status_code, res.text, retry_after)
                if res.status_code not in _RETRYABLE_STATUS:
                    raise err
                delay = retry_after if retry_after is not None else 1.0 * (attempt + 1)

            if attempt < LLM_MAX_RETRIES and time.monotonic() + delay <= deadline:
                await asyncio.sleep(delay)
                continue
            self._enter_cooldown(err)
            raise err

        raise LLMUnavailableError(f"{provider} provider unavailable")

    async def _call_openai(self, system_prompt: str, user_prompt: str, response_json: bool = False) -> str:
        return await self._call_openai_compatible(
            provider="openai",
            base_url=self.base_url or "https://api.openai.com/v1",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_json=response_json,
        )

    async def _call_ollama(self, system_prompt: str, user_prompt: str, response_json: bool = False) -> str:
        base = self.base_url or os.getenv("OLLAMA_HOST", "http://localhost:11434")
        url = f"{base.rstrip('/')}/api/generate"
        options: Dict[str, Any] = {"temperature": 0.0}
        payload: Dict[str, Any] = {
            "model": self.model,
            "system": system_prompt,
            "prompt": user_prompt,
            "stream": False,
            "options": options
        }
        if response_json:
            payload["format"] = "json"

        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(url, json=payload)
            if res.status_code != 200:
                raise _provider_error("ollama", res.status_code, res.text, _parse_retry_after(res.headers, res.text))
            data = res.json()
            return data.get("response", "")

    async def _stream_gemini(self, system_prompt: str, user_prompt: str):
        import json
        import re
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:streamGenerateContent?alt=sse"
        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json"
        }
        generation_config: Dict[str, Any] = {
            "temperature": 0.0,
            "maxOutputTokens": 1024
        }
        if _gemini_thinking_config():
            generation_config["thinkingConfig"] = _gemini_thinking_config()
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": generation_config
        }
        deadline = time.monotonic() + LLM_RETRY_BUDGET_SEC
        for attempt in range(LLM_MAX_RETRIES + 1):
            async with httpx.AsyncClient(timeout=45.0) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        body = (await response.aread()).decode("utf-8", errors="ignore")
                        retry_after = _parse_retry_after(response.headers, body)
                        err = _provider_error("gemini", response.status_code, body, retry_after)
                        delay = retry_after if retry_after is not None else 1.0 * (attempt + 1)
                        # Honor retry guidance only if it fits the strict total retry budget.
                        if (response.status_code in _RETRYABLE_STATUS and attempt < LLM_MAX_RETRIES
                                and time.monotonic() + delay <= deadline):
                            await asyncio.sleep(delay)
                            continue
                        self._enter_cooldown(err)
                        raise err

                    buffer = ""
                    async for chunk in response.aiter_text():
                        buffer += chunk
                        while True:
                            match = re.search(r'\r?\n\r?\n', buffer)
                            if not match:
                                break
                            block = buffer[:match.start()]
                            buffer = buffer[match.end():]
                            for line in block.splitlines():
                                line = line.strip()
                                if line.startswith("data:"):
                                    raw_data = line[5:].strip()
                                    try:
                                        data = json.loads(raw_data)
                                        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                                        # Extract ONLY user-visible answer text; do NOT expose thought or private reasoning
                                        delta = "".join(p.get("text", "") for p in parts if "text" in p and not p.get("thought"))
                                        if delta:
                                            yield delta
                                    except Exception:
                                        pass
                    return

    async def _stream_groq(self, system_prompt: str, user_prompt: str):
        import json
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.0,
            "stream": True
        }
        if self.model.startswith("openai/gpt-oss-"):
            payload["max_completion_tokens"] = 1024
        else:
            payload["max_tokens"] = 1024
        deadline = time.monotonic() + LLM_RETRY_BUDGET_SEC
        for attempt in range(LLM_MAX_RETRIES + 1):
            delay = 1.0
            try:
                async with httpx.AsyncClient(timeout=45.0) as client:
                    async with client.stream("POST", url, headers=headers, json=payload) as response:
                        if response.status_code != 200:
                            body = (await response.aread()).decode("utf-8", errors="ignore")
                            retry_after = _parse_retry_after(response.headers, body)
                            err = _provider_error("groq", response.status_code, body, retry_after)
                            if response.status_code not in _RETRYABLE_STATUS:
                                raise err
                            delay = retry_after if retry_after is not None else 1.0 * (attempt + 1)
                        else:
                            async for line in response.aiter_lines():
                                line = line.strip()
                                if line.startswith("data:"):
                                    raw_data = line[5:].strip()
                                    if raw_data == "[DONE]":
                                        break
                                    try:
                                        data = json.loads(raw_data)
                                        delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                        if delta:
                                            yield delta
                                    except Exception:
                                        pass
                            return
            except httpx.TimeoutException:
                raise LLMUnavailableError("groq provider timed out", reason="timeout")
            except httpx.RequestError as exc:
                err = LLMUnavailableError("groq provider connection error", reason="connection")
                logger.warning("[llm-runtime] groq connection error: %s", exc)

            if attempt < LLM_MAX_RETRIES and time.monotonic() + delay <= deadline:
                await asyncio.sleep(delay)
                continue
            self._enter_cooldown(err)
            raise err

    async def _stream_openai(self, system_prompt: str, user_prompt: str):
        import json
        base = self.base_url or "https://api.openai.com/v1"
        url = f"{base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.0,
            "max_tokens": 1024,
            "stream": True
        }
        async with httpx.AsyncClient(timeout=45.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    raise _provider_error("openai", response.status_code, err_body.decode('utf-8', errors='ignore'), None)
                async for line in response.aiter_lines():
                    line = line.strip()
                    if line.startswith("data:"):
                        raw_data = line[5:].strip()
                        if raw_data == "[DONE]":
                            break
                        try:
                            data = json.loads(raw_data)
                            delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            pass

    async def _stream_ollama(self, system_prompt: str, user_prompt: str):
        import json
        base = self.base_url or os.getenv("OLLAMA_HOST", "http://localhost:11434")
        url = f"{base.rstrip('/')}/api/generate"
        payload: Dict[str, Any] = {
            "model": self.model,
            "system": system_prompt,
            "prompt": user_prompt,
            "stream": True,
            "options": {"temperature": 0.0}
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    raise _provider_error("ollama", response.status_code, err_body.decode('utf-8', errors='ignore'), None)
                async for line in response.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            delta = data.get("response", "")
                            if delta:
                                yield delta
                        except Exception:
                            pass

# Singleton runtime instance
llm_runtime = RealLLMRuntime()
