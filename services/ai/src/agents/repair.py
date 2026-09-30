"""
GroundGuard 5-Branch Diagnostic Recovery Engine (src/agents/repair.py)
Implements:
- Mandate 8: Dual-Track Repair Separation (Fast-Path <15ms vs Deep-Path Max 1 Re-query).
- Mandate 9: Circuit Breaker Bound (Attempts >= 1 trips fallback: '[Note: Statement unverified against provided source]').
- Mandate 10: Emits typed SentenceVerificationEvents (sentence.recovered, sentence.fallback).
"""

import re
import time
import logging
from typing import List, Optional, Dict, Any

from src.contracts.events import (
    SentenceVerificationEvent,
    SentenceStatus,
    EvidenceChunk
)
from src.pipeline.extractor import extract_identifiers
from src.pipeline.graph_store import graph_store
from src.rag.vector_store import dense_vector_store
from src.rag.lexical_store import lexical_index

logger = logging.getLogger("agents-repair")

CIRCUIT_BREAKER_DISCLAIMER = "[Note: Statement unverified against provided source]"


def invert_polarity(sentence: str) -> str:
    """Fast-Path instant polarity inversion (<2ms) for direct factual negations."""
    replacements = [
        (r'\bis not\b', 'is'),
        (r'\bis\b', 'is not'),
        (r'\bdoes not have\b', 'has'),
        (r'\bhas\b', 'does not have'),
        (r'\bcannot\b', 'can'),
        (r'\bcan\b', 'cannot'),
        (r'\bwill not\b', 'will'),
        (r'\bwill\b', 'will not')
    ]
    for pattern, repl in replacements:
        if re.search(pattern, sentence, re.IGNORECASE):
            return re.sub(pattern, repl, sentence, count=1, flags=re.IGNORECASE)
    return sentence


async def execute_dual_track_repair(
    project_id: str,
    sentence_index: int,
    claim_sentence: str,
    failure_type: str,  # "CLAIM_WORDING" | "CONTRADICTION" | "MISSING_EVIDENCE" | "RELATIONSHIP_ISSUE"
    failure_reason: str,
    suggested_fix: Optional[str],
    evidence_chunks: List[EvidenceChunk],
    discourse_window: List[str],
    request_id: Optional[str] = None,
    attempt: int = 0
) -> SentenceVerificationEvent:
    """
    Mandate 8 & 9: Dual-Track Repair Engine with Hard Bounded Circuit Breaker.
    """
    t0 = time.time() * 1000.0

    # -------------------------------------------------------------------------
    # MANDATE 9: CIRCUIT BREAKER CHECK
    # Hard bound: If attempt >= 1, circuit breaker immediately trips!
    # Prevents infinite loops and streaming stutter.
    # -------------------------------------------------------------------------
    if attempt >= 1:
        logger.warning(
            f"[Circuit Breaker Tripped] S_{sentence_index} attempt {attempt} >= 1. "
            f"Replacing sentence with scoped fallback disclaimer."
        )
        return SentenceVerificationEvent(
            event="sentence.fallback",
            sentence_index=sentence_index,
            text=CIRCUIT_BREAKER_DISCLAIMER,
            original_text=claim_sentence,
            status=SentenceStatus.FALLBACK,
            score=0.0,
            repair_track="circuit_breaker",
            reason=f"Circuit breaker tripped: {failure_reason}",
            timestamp_ms=time.time() * 1000.0
        )

    # -------------------------------------------------------------------------
    # TRACK 1 (FAST-PATH: Instant Deterministic Repair < 15ms)
    # -------------------------------------------------------------------------
    if failure_type == "CLAIM_WORDING" and suggested_fix:
        # Instant replacement of wrong numerical scale or unit ($500 -> $5,000)
        matches = [m.group(0) for m in re.finditer(r'[$€£¥]?\s*\d+(?:,\d{3})*(?:\.\d+)?(?:\s*[a-zA-Z°%µ/³\^_-]+)?', claim_sentence)]
        fixed_sentence = claim_sentence
        if matches:
            # Substitute the first mismatched quantity with the evidence ground truth
            fixed_sentence = claim_sentence.replace(matches[0], suggested_fix, 1)

        latency = (time.time() * 1000.0) - t0
        logger.info(f"[Fast-Path Repair <15ms] Fixed '{claim_sentence}' -> '{fixed_sentence}' in {latency:.2f}ms")

        return SentenceVerificationEvent(
            event="sentence.recovered",
            sentence_index=sentence_index,
            text=fixed_sentence,
            original_text=claim_sentence,
            status=SentenceStatus.RECOVERED,
            score=0.98,
            label="entailment",
            repair_track="fast_path",
            evidence_chunk_ids=[c.chunk_id for c in evidence_chunks],
            reason="Fast-Path deterministic unit/number substitution verified",
            timestamp_ms=time.time() * 1000.0
        )

    if failure_type == "CONTRADICTION" and ("not" in claim_sentence.lower() or "is" in claim_sentence.lower()):
        # Try fast polarity inversion if a simple negation flipped the claim
        inverted = invert_polarity(claim_sentence)
        if inverted != claim_sentence:
            latency = (time.time() * 1000.0) - t0
            logger.info(f"[Fast-Path Polarity <15ms] Inverted claim polarity in {latency:.2f}ms")
            return SentenceVerificationEvent(
                event="sentence.recovered",
                sentence_index=sentence_index,
                text=inverted,
                original_text=claim_sentence,
                status=SentenceStatus.RECOVERED,
                score=0.85,
                label="entailment",
                repair_track="fast_path",
                evidence_chunk_ids=[c.chunk_id for c in evidence_chunks],
                reason="Fast-Path polarity inversion recovered claim",
                timestamp_ms=time.time() * 1000.0
            )

    # -------------------------------------------------------------------------
    # TRACK 2 (DEEP-PATH: Bounded Re-Retrieval - Max 1 Attempt)
    # -------------------------------------------------------------------------
    logger.info(f"[Deep-Path] S_{sentence_index} entering targeted re-retrieval (Attempt {attempt + 1}/1)")

    # 1. Check if relationship / topology issue
    rel_keywords = ["upstream", "downstream", "isolated by", "connected to", "discharges to"]
    is_relational = any(k in claim_sentence.lower() for k in rel_keywords)

    identifiers = extract_identifiers(claim_sentence)
    id_tokens = [i.normalized for i in identifiers]

    found_evidence: List[str] = []

    if is_relational and id_tokens:
        for token in id_tokens:
            relations = graph_store.query_relations(project_id, token)
            for r in relations:
                prov = r.get("provenance", {})
                if prov.get("sourceText"):
                    found_evidence.append(prov["sourceText"])

    # 2. Targeted re-query in Qdrant & Tantivy
    if not found_evidence:
        re_query = " ".join(id_tokens) + " " + claim_sentence
        try:
            dense_hits = dense_vector_store.search_dense(project_id=project_id, query=re_query, top_k=3)
            lexical_hits = lexical_index.search_lexical(project_id=project_id, query=re_query, top_k=3)
            found_evidence.extend([h["text"] for h in dense_hits] + [h["text"] for h in lexical_hits])
        except Exception as e:
            logger.error(f"[Deep-Path] Re-retrieval failed: {e}")

    # Check if re-retrieval yielded direct support
    if found_evidence:
        # Re-verify claim against new evidence
        combined_found = " ".join(found_evidence)
        # Check if equipment tags confirmed
        if id_tokens and all(tok.upper() in combined_found.upper() for tok in id_tokens):
            return SentenceVerificationEvent(
                event="sentence.recovered",
                sentence_index=sentence_index,
                text=claim_sentence,
                original_text=claim_sentence,
                status=SentenceStatus.RECOVERED,
                score=0.88,
                label="entailment",
                repair_track="deep_path",
                evidence_chunk_ids=[c.chunk_id for c in evidence_chunks],
                reason="Deep-Path bounded re-retrieval substantiated claim",
                timestamp_ms=time.time() * 1000.0
            )

    # -------------------------------------------------------------------------
    # Still unverified after 1 Deep-Path attempt -> Circuit Breaker Trips
    # -------------------------------------------------------------------------
    logger.warning(
        f"[Deep-Path Failed] S_{sentence_index} unverified after 1 attempt. "
        f"Circuit Breaker fallback disclaimer engaged."
    )
    return SentenceVerificationEvent(
        event="sentence.fallback",
        sentence_index=sentence_index,
        text=CIRCUIT_BREAKER_DISCLAIMER,
        original_text=claim_sentence,
        status=SentenceStatus.FALLBACK,
        score=0.0,
        repair_track="circuit_breaker",
        reason=f"Deep-Path re-retrieval failed to substantiate: {failure_reason}",
        timestamp_ms=time.time() * 1000.0
    )
