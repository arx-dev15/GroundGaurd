"""
GroundGuard 1-Sentence In-Flight Emission Delay Buffer (src/guardrail/buffer.py)
Implements real-time sentence-level guardrails:
- Holds sentence S_n in flight
- Gate A: Pint / Regex Symbolic Gate (<1ms)
- Gate B: DeBERTa ML call (<30ms) conditioned on discourse window (S_{n-2} + S_{n-1})
- Emits SentenceVerificationEvents and maintains sliding discourse history
"""

import time
import logging
from typing import List, AsyncGenerator, Optional, Dict, Any

from src.contracts.events import (
    SentenceVerificationEvent,
    SentenceStatus,
    EvidenceChunk
)
from src.guardrail.symbolic import verify_sentence_symbolic
from src.guardrail.ml_client import ml_service_client

logger = logging.getLogger("guardrail-buffer")


class InFlightVerificationBuffer:
    """
    Manages the 1-Sentence emission delay buffer, dual gates (Symbolic + Neural),
    and discourse window propagation.
    """
    def __init__(self, project_id: str, request_id: Optional[str] = None):
        self.project_id = project_id
        self.request_id = request_id
        self.discourse_window: List[str] = []  # Holds verified history [..., S_{n-2}, S_{n-1}]

    async def process_sentence_stream(
        self,
        raw_sentences: List[str],
        evidence_chunks: List[EvidenceChunk]
    ) -> AsyncGenerator[SentenceVerificationEvent, None]:
        """
        Processes sentences through the 1-sentence delay buffer.
        Yields real-time events for SSE streaming.
        """
        evidence_texts = [c.text for c in evidence_chunks]
        evidence_ids = [c.chunk_id for c in evidence_chunks]
        from src.agents.repair import execute_dual_track_repair

        for idx, sentence in enumerate(raw_sentences, start=1):
            s_clean = sentence.strip()
            if not s_clean:
                continue

            t_start = time.time() * 1000.0

            # -------------------------------------------------------------
            # GATE A: Fast Symbolic Gate (<1ms)
            # -------------------------------------------------------------
            sym_res = verify_sentence_symbolic(s_clean, evidence_texts)

            # If Gate A detects unit or numerical scaling error ($500 vs $5,000)
            if not sym_res.passed:
                logger.info(
                    f"[Buffer S_{idx}] Gate A Symbolic fail ({sym_res.discrepancy}). "
                    f"Entering Track 1 Fast-Path Repair."
                )
                repair_res = await execute_dual_track_repair(
                    project_id=self.project_id,
                    sentence_index=idx,
                    claim_sentence=s_clean,
                    failure_type="CLAIM_WORDING",
                    failure_reason=sym_res.discrepancy or "Numerical/Unit discrepancy",
                    suggested_fix=sym_res.suggested_fix,
                    evidence_chunks=evidence_chunks,
                    discourse_window=self.discourse_window,
                    request_id=self.request_id
                )

                self.discourse_window.append(repair_res.text)
                yield repair_res
                continue

            # -------------------------------------------------------------
            # GATE B: Neural Gate (<30ms) with Discourse Window (S_{n-2} + S_{n-1})
            # -------------------------------------------------------------
            combined_evidence_str = "\n".join(evidence_texts)
            neural_res = await ml_service_client.verify_sentence_with_discourse(
                current_sentence=s_clean,
                evidence_text=combined_evidence_str,
                discourse_window=self.discourse_window,
                request_id=self.request_id
            )

            # Check if Entailment / Verified
            if neural_res.is_verified:
                self.discourse_window.append(s_clean)
                yield SentenceVerificationEvent(
                    event="sentence.verified",
                    sentence_index=idx,
                    text=s_clean,
                    status=SentenceStatus.VERIFIED,
                    score=neural_res.score,
                    label="entailment",
                    evidence_chunk_ids=evidence_ids,
                    reason="Grounding confirmed by Symbolic & Neural gates",
                    timestamp_ms=time.time() * 1000.0
                )
            else:
                # Contradiction / Conflict / Missing Evidence
                fail_type = "CONTRADICTION" if neural_res.label == "contradiction" else "MISSING_EVIDENCE"
                logger.info(
                    f"[Buffer S_{idx}] Gate B Neural fail ({neural_res.label}, score={neural_res.score:.2f}). "
                    f"Entering Dual-Track Repair."
                )

                repair_res = await execute_dual_track_repair(
                    project_id=self.project_id,
                    sentence_index=idx,
                    claim_sentence=s_clean,
                    failure_type=fail_type,
                    failure_reason=f"Neural verification returned {neural_res.label}",
                    suggested_fix=None,
                    evidence_chunks=evidence_chunks,
                    discourse_window=self.discourse_window,
                    request_id=self.request_id
                )

                self.discourse_window.append(repair_res.text)
                yield repair_res
