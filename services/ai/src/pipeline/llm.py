"""
GroundGuard Phase 5: Real LLM Runtime
Provides real inference integration for configured LLM providers (Gemini, Groq, OpenAI, Ollama).
Enforces zero mock generation, greedy temperature=0.0 decoding, and explicit unavailability semantics.
"""

import os
import time
import asyncio
import logging
from typing import Optional, Dict, Any
from pydantic import BaseModel
import httpx
import requests
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), ".env"), override=True)

from src.pipeline.prompts import GROUNDGUARD_SYSTEM_PROMPT, CLAIM_EXTRACTION_SYSTEM_PROMPT

logger = logging.getLogger("m2-llm-runtime")

class LLMUnavailableError(Exception):
    """Raised when no real LLM provider is configured or reachable."""
    pass

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
        self.provider = os.getenv("LLM_PROVIDER", "").lower()
        self.model = os.getenv("LLM_MODEL", "")

        # Auto-detect provider if explicit provider not set
        if not self.provider:
            if os.getenv("GEMINI_API_KEY"):
                self.provider = "gemini"
            elif os.getenv("GROQ_API_KEY"):
                self.provider = "groq"
            elif os.getenv("OPENAI_API_KEY"):
                self.provider = "openai"
            elif os.getenv("OLLAMA_HOST") or os.getenv("OLLAMA_MODEL"):
                self.provider = "ollama"

        # Explicitly map API key to configured provider (no silent fallback or key leaking)
        if self.provider == "gemini":
            self.api_key = os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY", "")
        elif self.provider == "groq":
            self.api_key = os.getenv("GROQ_API_KEY") or os.getenv("LLM_API_KEY", "")
        elif self.provider == "openai":
            self.api_key = os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY", "")
        else:
            self.api_key = os.getenv("LLM_API_KEY", "")

        self.base_url = os.getenv("LLM_BASE_URL", "")

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
        if not self.provider:
            return False
        if self.provider == "ollama":
            return True  # Ollama runs locally without API key
        return bool(self.api_key)

    def get_model_version(self) -> str:
        """Returns the full model identifier."""
        if not self.is_configured():
            return "unconfigured"
        return f"{self.provider}/{self.model}"

    async def generate_answer(self, user_prompt: str, system_prompt: str = GROUNDGUARD_SYSTEM_PROMPT) -> LLMResponse:
        """
        Executes real LLM inference with greedy temperature=0.0 decoding.
        Fails fast if no real LLM is configured. Fail-closed: does not fall back across providers.
        """
        if not self.is_configured():
            raise LLMUnavailableError(
                "PHASE 5 BLOCKED — REAL LLM RUNTIME NOT CONFIGURED: "
                "No valid LLM_PROVIDER or LLM_API_KEY configured in environment."
            )

        t0 = time.perf_counter()

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

    async def stream_answer(self, user_prompt: str, system_prompt: str = GROUNDGUARD_SYSTEM_PROMPT):
        """
        Executes real LLM streaming inference with greedy temperature=0.0 decoding.
        Yields newly generated user-visible text chunks as they arrive from the native model stream.
        Fails fast if no real LLM is configured.
        """
        if not self.is_configured():
            raise LLMUnavailableError(
                "PHASE 5 BLOCKED — REAL LLM RUNTIME NOT CONFIGURED: "
                "No valid LLM_PROVIDER or LLM_API_KEY configured in environment."
            )

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

    async def extract_claims(self, user_prompt: str, system_prompt: str = CLAIM_EXTRACTION_SYSTEM_PROMPT) -> str:
        """
        Executes real LLM structured claim extraction with temperature=0.0 and JSON response mode.
        """
        if not self.is_configured():
            raise LLMUnavailableError(
                "PHASE 6 BLOCKED — REAL LLM RUNTIME NOT CONFIGURED: "
                "No valid LLM_PROVIDER or LLM_API_KEY configured in environment."
            )

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

    async def _call_gemini(self, system_prompt: str, user_prompt: str, response_json: bool = False) -> str:
        models_to_try = [self.model, "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3-flash-preview"]
        seen_models = set()
        unique_models = []
        for m in models_to_try:
            if m and m not in seen_models:
                seen_models.add(m)
                unique_models.append(m)

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

        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": generation_config
        }

        def _sync_post():
            last_err = None
            for model_cand in unique_models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_cand}:generateContent"
                for attempt in range(2):
                    try:
                        res = requests.post(url, headers=headers, json=payload, timeout=40.0)
                        if res.status_code in (429, 503) and attempt < 1:
                            time.sleep(1.5)
                            continue
                        if res.status_code in (429, 503, 404):
                            logger.warning(f"[llm-runtime] Gemini model '{model_cand}' returned HTTP {res.status_code}, falling over to next model...")
                            last_err = LLMUnavailableError(f"Gemini API error (HTTP {res.status_code}): {res.text}")
                            break  # Try next model candidate
                        if res.status_code != 200:
                            raise LLMUnavailableError(f"Gemini API error (HTTP {res.status_code}): {res.text}")
                        data = res.json()
                        try:
                            self.model = model_cand  # Lock onto working model
                            return data["candidates"][0]["content"]["parts"][0]["text"]
                        except (KeyError, IndexError):
                            raise LLMUnavailableError("Malformed Gemini API response")
                    except Exception as e:
                        last_err = e
                        if attempt < 1:
                            time.sleep(1.0)
            raise LLMUnavailableError(f"Gemini API connection error: {last_err}")

        return await asyncio.to_thread(_sync_post)

    async def _call_groq(self, system_prompt: str, user_prompt: str, response_json: bool = False) -> str:
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
            "max_tokens": 2048 if response_json else 1024
        }
        if response_json:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=45.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code != 200:
                raise LLMUnavailableError(f"Groq API error (HTTP {res.status_code}): {res.text}")
            data = res.json()
            try:
                return data["choices"][0]["message"]["content"]
            except (KeyError, IndexError) as err:
                raise LLMUnavailableError(f"Malformed Groq API response: {data}")

    async def _call_openai(self, system_prompt: str, user_prompt: str, response_json: bool = False) -> str:
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
            "max_tokens": 2048 if response_json else 1024
        }
        if response_json:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=45.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code != 200:
                raise LLMUnavailableError(f"OpenAI API error (HTTP {res.status_code}): {res.text}")
            data = res.json()
            try:
                return data["choices"][0]["message"]["content"]
            except (KeyError, IndexError) as err:
                raise LLMUnavailableError(f"Malformed OpenAI API response: {data}")

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
                raise LLMUnavailableError(f"Ollama API error (HTTP {res.status_code}): {res.text}")
            data = res.json()
            return data.get("response", "")

    async def _stream_gemini(self, system_prompt: str, user_prompt: str):
        import json
        import re

        models_to_try = [self.model, "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3-flash-preview"]
        seen_models = set()
        unique_models = []
        for m in models_to_try:
            if m and m not in seen_models:
                seen_models.add(m)
                unique_models.append(m)

        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json"
        }
        generation_config: Dict[str, Any] = {
            "temperature": 0.0,
            "maxOutputTokens": 1024
        }
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": generation_config
        }

        stream_succeeded = False
        last_stream_err = None

        for model_cand in unique_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_cand}:streamGenerateContent?alt=sse"
            try:
                async with httpx.AsyncClient(timeout=45.0) as client:
                    async with client.stream("POST", url, headers=headers, json=payload) as response:
                        if response.status_code in (429, 503, 404):
                            err_body = await response.aread()
                            logger.warning(f"[llm-runtime] Gemini stream model '{model_cand}' returned HTTP {response.status_code}, falling over to next model...")
                            last_stream_err = LLMUnavailableError(f"Gemini stream error ({response.status_code}): {err_body.decode('utf-8', errors='ignore')}")
                            continue
                        if response.status_code != 200:
                            err_body = await response.aread()
                            raise LLMUnavailableError(f"Gemini streaming error (HTTP {response.status_code}): {err_body.decode('utf-8', errors='ignore')}")

                        self.model = model_cand
                        stream_succeeded = True
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
                        break
            except LLMUnavailableError:
                raise
            except Exception as stream_ex:
                last_stream_err = stream_ex
                continue

        if not stream_succeeded and last_stream_err:
            raise LLMUnavailableError(f"Gemini streaming unavailable: {last_stream_err}")

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
            "max_tokens": 1024,
            "stream": True
        }
        async with httpx.AsyncClient(timeout=45.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    raise LLMUnavailableError(f"Groq streaming error (HTTP {response.status_code}): {err_body.decode('utf-8', errors='ignore')}")
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
                    raise LLMUnavailableError(f"OpenAI streaming error (HTTP {response.status_code}): {err_body.decode('utf-8', errors='ignore')}")
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
                    raise LLMUnavailableError(f"Ollama streaming error (HTTP {response.status_code}): {err_body.decode('utf-8', errors='ignore')}")
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
