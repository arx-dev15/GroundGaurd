"""
GroundGuard Lexical Search (src/rag/lexical_store.py)
Implements Tantivy BM25 lexical search strictly isolated by tenant project_id.
Filters distractor/glossary pages from high ranks.
"""

import os
import logging
from typing import List, Dict, Any, Optional

from src.contracts.events import EvidenceChunk
from src.pipeline.tantivy_store import tantivy_store

logger = logging.getLogger("rag-lexical-store")


class LexicalKeywordIndex:
    """
    Exact lexical keyword & technical tag matching with tenant boundary enforcement.
    """
    def index_chunks(self, chunks: List[EvidenceChunk]) -> int:
        if not chunks:
            return 0
        project_id = chunks[0].project_id
        doc_id = chunks[0].document_id

        # Convert to pipeline format
        p_chunks = [
            {
                "id": c.chunk_id,
                "text": c.text,
                "page_number": c.page_number,
                "identifierKeys": c.identifiers,
            }
            for c in chunks
        ]
        return tantivy_store.index_chunks(
            project_id=project_id,
            document_id=doc_id,
            chunks=p_chunks
        )

    def search_lexical(
        self,
        project_id: str,
        query: str,
        top_k: int = 15
    ) -> List[Dict[str, Any]]:
        """
        Executes BM25 search strictly scoped to project_id.
        """
        raw_hits = tantivy_store.search_project(project_id=project_id, query=query, top_k=top_k)
        results = []
        for h in raw_hits:
            if h.get("projectId") != project_id:
                logger.error(f"[SECURITY] Leaked Tantivy record rejected: {h}")
                continue
            results.append({
                "chunk_id": h.get("chunkId"),
                "document_id": h.get("documentId"),
                "project_id": h.get("projectId"),
                "text": h.get("text", ""),
                "page_number": h.get("pageNumber", 1),
                "identifiers": h.get("identifiers", "").split() if isinstance(h.get("identifiers"), str) else [],
                "score": float(h.get("score", 0.0)),
            })
        return results


lexical_index = LexicalKeywordIndex()
