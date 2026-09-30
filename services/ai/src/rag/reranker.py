"""
GroundGuard Calibrated Fusion & Reranking Layer (src/rag/reranker.py)
Implements:
- Mandate 3: Calibrated Sufficiency Gate (S >= 0.35 AND Entity Match >= 1).
- Mandate 4: Distractor-Safe Bypass (Score >= 0.95 AND not distractor/glossary).
- Reciprocal Rank Fusion (RRF k=60).
"""

import os
import logging
from typing import List, Dict, Any, Tuple, Optional

from src.contracts.events import EvidenceChunk, SufficiencyResult
from src.pipeline.reranker import rerank
from src.pipeline.extractor import extract_identifiers
from src.rag.chunker import is_distractor_content

logger = logging.getLogger("rag-reranker")

RRF_K = int(os.getenv("RRF_K", "60"))
SUFFICIENCY_THRESHOLD = float(os.getenv("SUFFICIENCY_THRESHOLD", "0.35"))
DISTRACTOR_BYPASS_THRESHOLD = 0.95


def calculate_rrf_score(
    dense_rank: Optional[int],
    lexical_rank: Optional[int],
    graph_rank: Optional[int] = None,
    k: int = RRF_K
) -> float:
    score = 0.0
    if dense_rank is not None and dense_rank > 0:
        score += 1.0 / (k + dense_rank)
    if lexical_rank is not None and lexical_rank > 0:
        score += 1.0 / (k + lexical_rank)
    if graph_rank is not None and graph_rank > 0:
        score += 1.0 / (k + graph_rank)
    return score


def fuse_and_rerank_candidates(
    query: str,
    dense_hits: List[Dict[str, Any]],
    lexical_hits: List[Dict[str, Any]],
    graph_hits: Optional[List[Dict[str, Any]]] = None,
    top_n: int = 5
) -> Tuple[List[EvidenceChunk], SufficiencyResult]:
    """
    1. Multi-source candidate merging into unified EvidenceChunks.
    2. RRF score calculation (k=60).
    3. Mandate 4 Distractor-Safe Bypass:
       If top candidate score >= 0.95 AND is NOT a TOC/glossary distractor:
       -> Bypasses heavy neural reranker.
       Otherwise -> executes FlashRank cross-encoder.
    4. Mandate 3 Calibrated Sufficiency Gate:
       Evaluates (Fused Score >= 0.35) AND (Keyword/Entity Match >= 1).
       If failed -> returns SufficiencyResult with sufficient=False (triggers Pre-Filter Early Exit).
    """
    candidates_map: Dict[str, EvidenceChunk] = {}
    dense_ranks: Dict[str, int] = {}
    lexical_ranks: Dict[str, int] = {}
    graph_ranks: Dict[str, int] = {}

    for r, h in enumerate(dense_hits, start=1):
        cid = h["chunk_id"]
        dense_ranks[cid] = r
        if cid not in candidates_map:
            candidates_map[cid] = EvidenceChunk(
                chunk_id=cid,
                document_id=h["document_id"],
                project_id=h["project_id"],
                text=h["text"],
                page_number=h.get("page_number", 1),
                identifiers=h.get("identifiers", []),
                is_distractor=h.get("is_distractor", is_distractor_content(h["text"])),
                dense_score=h.get("score"),
                sources=["dense"]
            )
        else:
            candidates_map[cid].sources.append("dense")
            candidates_map[cid].dense_score = h.get("score")

    for r, h in enumerate(lexical_hits, start=1):
        cid = h["chunk_id"]
        lexical_ranks[cid] = r
        if cid not in candidates_map:
            candidates_map[cid] = EvidenceChunk(
                chunk_id=cid,
                document_id=h["document_id"],
                project_id=h["project_id"],
                text=h["text"],
                page_number=h.get("page_number", 1),
                identifiers=h.get("identifiers", []),
                is_distractor=is_distractor_content(h["text"]),
                lexical_score=h.get("score"),
                sources=["lexical"]
            )
        else:
            if "lexical" not in candidates_map[cid].sources:
                candidates_map[cid].sources.append("lexical")
            candidates_map[cid].lexical_score = h.get("score")

    if graph_hits:
        for r, h in enumerate(graph_hits, start=1):
            cid = h["chunk_id"]
            graph_ranks[cid] = r
            if cid in candidates_map:
                candidates_map[cid].sources.append("graph")
                candidates_map[cid].graph_score = 1.0

    all_candidates = list(candidates_map.values())
    if not all_candidates:
        return [], SufficiencyResult(
            sufficient=False,
            score=0.0,
            entity_matches=0,
            reason="Zero candidates retrieved across dense, lexical, and graph stores",
            is_early_exit=True
        )

    # 2. Compute RRF scores
    for cand in all_candidates:
        cand.rrf_score = calculate_rrf_score(
            dense_rank=dense_ranks.get(cand.chunk_id),
            lexical_rank=lexical_ranks.get(cand.chunk_id),
            graph_rank=graph_ranks.get(cand.chunk_id),
            k=RRF_K
        )

    all_candidates.sort(key=lambda c: c.rrf_score or 0.0, reverse=True)
    rrf_pool = all_candidates[:20]

    # 3. Mandate 4: Distractor-Safe Bypass check
    top_cand = rrf_pool[0]
    is_glossary_or_toc = top_cand.is_distractor or is_distractor_content(top_cand.text)
    
    # Check if normalized exact match gives >= 0.95 confidence
    can_bypass = False
    if top_cand.dense_score and top_cand.dense_score >= DISTRACTOR_BYPASS_THRESHOLD:
        if not is_glossary_or_toc:
            can_bypass = True
            logger.info(f"[reranker] Mandate 4 Distractor-Safe Bypass activated for {top_cand.chunk_id}")
        else:
            logger.warning(
                f"[reranker] Distractor/Glossary page detected on high score ({top_cand.dense_score:.4f}). "
                "Bypass FORBIDDEN. Enforcing cross-encoder reranking."
            )

    reranked_pool: List[EvidenceChunk] = []
    if can_bypass:
        for c in rrf_pool:
            c.rerank_score = c.dense_score or c.rrf_score
            reranked_pool.append(c)
    else:
        try:
            passages = [
                {"chunkId": c.chunk_id, "text": c.text, "candidate": c}
                for c in rrf_pool
            ]
            rerank_res = rerank(query=query, passages=passages, top_n=min(len(passages), top_n * 2))
            for res in rerank_res:
                c = res["candidate"]
                c.rerank_score = float(res.get("rerankScore", 0.0))
                reranked_pool.append(c)
        except Exception as e:
            logger.error(f"FlashRank execution error: {e}. Falling back to RRF ordering.")
            for c in rrf_pool:
                c.rerank_score = c.rrf_score
                reranked_pool.append(c)

    final_chunks = reranked_pool[:top_n]
    top_score = final_chunks[0].rerank_score if final_chunks and final_chunks[0].rerank_score is not None else 0.0

    # 4. Mandate 3: Calibrated Sufficiency Gate Evaluation
    # (Fused Score S >= 0.35) AND (Keyword/Entity Match >= 1)
    query_identifiers = [i.normalized.upper() for i in extract_identifiers(query)]
    entity_matches = 0

    if query_identifiers:
        for cand in final_chunks:
            cand_tags = [t.upper() for t in cand.identifiers] + [cand.text.upper()]
            for q_tag in query_identifiers:
                if any(q_tag in t for t in cand_tags):
                    entity_matches += 1
                    break
    else:
        # If no industrial tags, count significant alphanumeric technical tokens
        tokens = [t.upper() for t in query.split() if len(t) > 3]
        for cand in final_chunks:
            c_text = cand.text.upper()
            if any(tok in c_text for tok in tokens):
                entity_matches += 1
                break

    has_score = top_score >= SUFFICIENCY_THRESHOLD
    has_entity = (entity_matches >= 1) if (query_identifiers or len(query.split()) > 2) else True
    is_sufficient = has_score and has_entity

    reason = "Sufficiency satisfied"
    if not has_score:
        reason = f"Top score ({top_score:.4f}) below calibrated threshold ({SUFFICIENCY_THRESHOLD:.2f})"
    elif not has_entity:
        reason = f"Query entity/tag ({query_identifiers or 'keywords'}) not confirmed in retrieved evidence"

    sufficiency = SufficiencyResult(
        sufficient=is_sufficient,
        score=top_score,
        entity_matches=entity_matches,
        reason=reason,
        is_early_exit=(not is_sufficient)
    )

    return final_chunks, sufficiency
