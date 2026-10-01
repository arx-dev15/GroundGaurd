"""
GroundGuard Neural Verifier Bridge (src/guardrail/ml_client.py)
Implements Mandate 7: Multi-Sentence Discourse Window ($S_{n-2} + S_{n-1}$)
Dispatches sentence pairs to services/ml conditioned on preceding context to resolve pronouns ("They", "This", "It").
"""

import os
import time
import httpx
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("guardrail-ml-client")

ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "http://localhost:8001")


class NeuralVerifierResult:
    def __init__(self, label: str, score: float, latency_ms: float = 0.0, error: Optional[str] = None):
        self.label = label  # "entailment" | "contradiction" | "neutral"
        self.score = score
        self.latency_ms = latency_ms
        self.error = error

    @property
    def is_verified(self) -> bool:
        return self.label == "entailment" and self.score >= 0.50


import re
from src.pipeline.extractor import extract_identifiers


def resolve_anaphoric_pronouns(current_sentence: str, discourse_window: List[str]) -> str:
    """
    Resolves anaphoric pronouns ("they", "this", "these", "it", "the unit", "this system")
    in current_sentence using the concrete referent/subject from the preceding discourse (S_{n-1}).
    Yields a single, standalone sentence S_n for DeBERTa NLI evaluation.
    This eliminates compound hypothesis attention dilution across 50+ tokens (Flaw 3 Fix).
    """
    if not discourse_window:
        return current_sentence

    prev_sentence = discourse_window[-1].strip()
    if not prev_sentence:
        return current_sentence

    # 1. Identify primary technical tag or identifier in previous sentence (e.g., P-101A, V-204)
    prev_ids = extract_identifiers(prev_sentence)
    referent = None
    if prev_ids:
        referent = prev_ids[0].normalized
    else:
        # Fallback to key noun phrases: e.g. "the cooling pump", "the isolation valve", "the system"
        noun_match = re.search(r'\b(?:the|this)\s+([a-zA-Z0-9_\- ]{3,25}?)(?=\s+(?:is|was|are|were|has|have|can|must|should|feeds|discharges|\.))\b', prev_sentence, re.IGNORECASE)
        if noun_match:
            referent = noun_match.group(0).strip()

    if not referent:
        return current_sentence

    # 2. Perform targeted anaphoric substitution in current sentence
    resolved = current_sentence
    patterns = [
        (r'^(?:they|these|those)\s+', f"{referent} "),
        (r'^(?:it|this\s+unit|this\s+system|the\s+unit)\s+', f"{referent} "),
        (r'\b(?:they|these)\b', referent),
        (r'\b(?:it|this\s+unit)\b', referent),
    ]
    for pat, rep in patterns:
        if re.search(pat, resolved, re.IGNORECASE):
            resolved = re.sub(pat, rep, resolved, count=1, flags=re.IGNORECASE)
            logger.info(f"[ml-client] Anaphoric pronoun resolved: '{current_sentence}' -> '{resolved}' using referent '{referent}'")
            break

    return resolved


class MLServiceClient:
    """
    HTTP Client to services/ml with anaphoric pronoun resolution.
    Resolves pronoun ambiguities in S_n using S_{n-1} and feeds only
    the single resolved sentence to DeBERTa to preserve sharp self-attention.
    """
    def __init__(self, base_url: str = ML_SERVICE_URL):
        self.base_url = base_url.rstrip("/")

    async def verify_sentence_with_discourse(
        self,
        current_sentence: str,
        evidence_text: str,
        discourse_window: List[str],  # [S_{n-2}, S_{n-1}]
        request_id: Optional[str] = None
    ) -> NeuralVerifierResult:
        """
        Evaluates single-sentence hypothesis against evidence.
        Resolves pronouns in S_n using S_{n-1} prior to DeBERTa dispatch.
        """
        t0 = time.perf_counter()

        # Flaw 3 Fix: Resolve pronouns to concrete referents from S_{n-1}
        # Passes ONLY the single resolved sentence S_n, never a compound 3-sentence blob
        resolved_claim = resolve_anaphoric_pronouns(current_sentence, discourse_window)

        headers = {"Content-Type": "application/json"}
        if request_id:
            headers["X-Request-ID"] = request_id

        payload = {
            "requestId": request_id,
            "claimId": f"claim_{int(time.time() * 1000)}",
            "claim": resolved_claim,
            "evidence": [
                {"chunkId": "ev_chunk_1", "text": evidence_text}
            ]
        }

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.post(
                    f"{self.base_url}/verify",
                    json=payload,
                    headers=headers
                )
                latency = (time.perf_counter() - t0) * 1000.0

                if res.status_code == 200:
                    data = res.json()
                    label = str(data.get("label", "neutral")).lower()
                    score = float(data.get("groundingScore", data.get("score", 0.0)))
                    return NeuralVerifierResult(label=label, score=score, latency_ms=latency)
                else:
                    return NeuralVerifierResult(
                        label="neutral",
                        score=0.0,
                        latency_ms=latency,
                        error=f"ML Service HTTP {res.status_code}"
                    )
        except Exception as e:
            latency = (time.perf_counter() - t0) * 1000.0
            logger.warning(f"ML Service verification call failed ({e}). Defaulting to neutral.")
            return NeuralVerifierResult(label="neutral", score=0.0, latency_ms=latency, error=str(e))


ml_service_client = MLServiceClient()
