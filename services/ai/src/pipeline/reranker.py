import os
import logging
import threading
from typing import List, Dict, Any, Optional

logger = logging.getLogger("m2-reranker")

FLASHRANK_MODEL = os.getenv("FLASHRANK_MODEL", "ms-marco-TinyBERT-L-2-v2")
_ranker_instance = None
_ranker_lock = threading.Lock()
RANKER_INIT_MS: float = 0.0

def get_ranker():
    """
    Returns the singleton FlashRank Ranker instance.
    Cached once per process; avoids reloading model per request.
    Raises RuntimeError if FlashRank is unavailable or fails to initialize.
    """
    global _ranker_instance, RANKER_INIT_MS
    if _ranker_instance is not None:
        return _ranker_instance
    with _ranker_lock:
        return _load_ranker()


def _load_ranker():
    global _ranker_instance, RANKER_INIT_MS
    if _ranker_instance is None:
        import time as _time
        _init_started = _time.perf_counter()
        try:
            from flashrank import Ranker
            logger.info(f"Initializing FlashRank Ranker with model '{FLASHRANK_MODEL}'...")
            _ranker_instance = Ranker(model_name=FLASHRANK_MODEL)
            RANKER_INIT_MS = round((_time.perf_counter() - _init_started) * 1000.0, 1)
            logger.info("FlashRank Ranker initialized successfully.")
        except Exception as e:
            logger.error(f"FlashRank initialization failed: {e}")
            raise RuntimeError(f"FlashRank reranker unavailable: {e}")
    return _ranker_instance

def rerank(
    query: str,
    passages: List[Dict[str, Any]],
    top_n: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Reranks candidate passages using FlashRank cross-encoder.
    Input passages format: [{'id': str|int, 'text': str, ...}]
    Returns list of dicts with updated 'score' field (float), sorted descending by score.
    Raises RuntimeError on failure.
    """
    if not passages or not query:
        return []

    try:
        ranker = get_ranker()
        from flashrank import RerankRequest
        # Format input for FlashRank
        formatted_passages = [
            {"id": p.get("chunkId", p.get("id", str(i))), "text": p.get("text", "")}
            for i, p in enumerate(passages)
        ]
        
        req = RerankRequest(query=query, passages=formatted_passages)
        results = ranker.rerank(req)
        
        # Build mapping from id to rerank score
        score_map = {res["id"]: float(res["score"]) for res in results}
        
        # Enrich original passages with rerankScore
        reranked = []
        for p in passages:
            p_id = p.get("chunkId", p.get("id"))
            score = score_map.get(p_id, 0.0)
            p_copy = dict(p)
            p_copy["rerankScore"] = score
            reranked.append(p_copy)
            
        # Sort descending by rerankScore
        reranked.sort(key=lambda x: x.get("rerankScore", 0.0), reverse=True)
        
        if top_n is not None and top_n > 0:
            reranked = reranked[:top_n]
            
        return reranked
    except Exception as e:
        logger.error(f"FlashRank rerank execution failed: {e}")
        raise RuntimeError(f"FlashRank rerank execution failed: {e}")
