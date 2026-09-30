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


class MLServiceClient:
    """
    HTTP Client to services/ml with discourse window enrichment.
    Resolves pronoun ambiguities by prefixing S_{n-2} + S_{n-1} context.
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
        Mandate 7: Passes 2-sentence discourse window ($S_{n-2} + S_{n-1}$)
        Prefixes discourse history when pronouns ('they', 'this', 'it', 'these', 'the unit')
        are detected to anchor cross-sentence coreference before dispatching to DeBERTa-v3.
        """
        t0 = time.perf_counter()

        # Check for pronoun / referential markers
        pronoun_markers = ["they", "this", "it", "these", "those", "the pump", "the valve", "the unit", "its", "their"]
        has_referential = any(re_mark in current_sentence.lower().split() for re_mark in pronoun_markers)

        # Condition claim on discourse window S_{n-2} + S_{n-1}
        conditioned_claim = current_sentence
        if has_referential and discourse_window:
            prefix = " ".join(discourse_window[-2:]).strip()
            conditioned_claim = f"[Context: {prefix}] {current_sentence}"
            logger.info(f"[ml-client] Discourse conditioning applied: '{conditioned_claim[:100]}...'")

        headers = {"Content-Type": "application/json"}
        if request_id:
            headers["X-Request-ID"] = request_id

        payload = {
            "premise": evidence_text,
            "hypothesis": conditioned_claim
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
