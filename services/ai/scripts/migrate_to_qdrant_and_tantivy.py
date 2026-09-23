"""
GroundGuard Phase 3 Migration & Re-indexing Utility
Reads canonical 'ready' chunks from PostgreSQL and reconstructs derived indexes:
1. Qdrant (dense vectors + UUIDv5 points + keyword payload indexes)
2. Tantivy (BM25 lexical index + commit + reload)
3. NetworkX (evidence-grounded relationship graph)
"""

import sys
import os
import logging
from typing import List, Dict, Any
from collections import defaultdict

# Ensure services/ai directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.pipeline.db import get_connection
from src.pipeline.embedder import generate_embeddings, MODEL_NAME
from src.pipeline.extractor import extract_identifiers, get_identifier_keys
from src.pipeline.qdrant_store import qdrant_store
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.graph_store import graph_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migrate-qdrant-tantivy")

def migrate_ready_data():
    logger.info(f"=== Starting Phase 3 Multi-Store Knowledge Re-indexing (Model: {MODEL_NAME}) ===")
    conn = get_connection()
    if conn is None:
        logger.error("Cannot connect to PostgreSQL database.")
        raise RuntimeError("PostgreSQL database unavailable for migration.")

    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT c.id, c.document_id, d.project_id, c.chunk_index, c.page_number, c.text, c.section, c.heading, c.identifiers
                FROM chunks c
                JOIN documents d ON c.document_id = d.id
                WHERE d.status = 'ready'
                ORDER BY d.id, c.chunk_index;
            """)
            rows = cur.fetchall()

        logger.info(f"Fetched {len(rows)} canonical ready chunks from PostgreSQL")
        if not rows:
            logger.info("No ready chunks to migrate. Database is clean.")
            return {"status": "ok", "total_chunks": 0, "documents": 0}

        docs = defaultdict(list)
        for r in rows:
            chunk_id, doc_id, proj_id, chunk_index, page_number, text, section, heading, identifiers = r

            # Ensure identifiers are extracted
            idents = extract_identifiers(text)
            ident_keys = get_identifier_keys(idents)

            docs[(proj_id, doc_id)].append({
                "id": chunk_id,
                "document_id": doc_id,
                "project_id": proj_id,
                "chunk_index": chunk_index,
                "page_number": page_number,
                "text": text,
                "section": section,
                "heading": heading,
                "identifiers": [i.model_dump() for i in idents],
                "identifierKeys": ident_keys
            })

        total_qdrant = 0
        total_tantivy = 0
        total_edges = 0

        for (proj_id, doc_id), chunk_list in docs.items():
            logger.info(f"Re-indexing doc_id={doc_id} in project_id={proj_id} ({len(chunk_list)} chunks)...")
            texts = [c["text"] for c in chunk_list]
            embeddings = generate_embeddings(texts)

            # 1. Qdrant
            q_count = qdrant_store.upsert_chunks(proj_id, doc_id, chunk_list, embeddings)
            total_qdrant += q_count

            # 2. Tantivy
            t_count = tantivy_store.index_chunks(proj_id, doc_id, chunk_list)
            total_tantivy += t_count

            # 3. NetworkX
            edges_count = graph_store.process_and_persist_chunks(proj_id, doc_id, chunk_list)
            total_edges += edges_count

        logger.info("=== Migration Summary ===")
        logger.info(f"Documents re-indexed: {len(docs)}")
        logger.info(f"Total chunks in PostgreSQL: {len(rows)}")
        logger.info(f"Total points indexed in Qdrant: {total_qdrant}")
        logger.info(f"Total documents indexed in Tantivy: {total_tantivy}")
        logger.info(f"Total relationships persisted in NetworkX: {total_edges}")

        assert total_qdrant == len(rows), f"Qdrant count mismatch: {total_qdrant} vs {len(rows)}"
        assert total_tantivy == len(rows), f"Tantivy count mismatch: {total_tantivy} vs {len(rows)}"
        logger.info("PARITY VERIFIED: 100% of PostgreSQL chunks are indexed in Qdrant and Tantivy.")
        return {
            "status": "ok",
            "total_chunks": len(rows),
            "documents": len(docs),
            "qdrant_points": total_qdrant,
            "tantivy_docs": total_tantivy,
            "graph_edges": total_edges
        }

    finally:
        conn.close()

if __name__ == "__main__":
    try:
        migrate_ready_data()
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        sys.exit(1)
