import os
import datetime
import logging
from typing import List, Dict, Any

logger = logging.getLogger("m2-ai-service")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/groundguard")

def get_connection():
    try:
        import psycopg
        return psycopg.connect(DATABASE_URL)
    except Exception as e:
        logger.warning(f"psycopg direct connection error: {e}. Falling back to standard psycopg2 / raw pool.")
        import psycopg2
        return psycopg2.connect(DATABASE_URL)

def save_chunks_to_db(document_id: str, chunks: List[Dict[str, Any]], embeddings: List[List[float]]) -> int:
    if not chunks:
        return 0

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # 1. Atomic Idempotency: delete old chunks for document_id
            cur.execute("DELETE FROM chunks WHERE document_id = %s;", (document_id,))

            # 2. Insert new chunks in transaction
            now = datetime.datetime.now(datetime.timezone.utc)
            for chunk, vector in zip(chunks, embeddings):
                vector_str = "[" + ",".join(str(f) for f in vector) + "]"
                cur.execute(
                    """
                    INSERT INTO chunks (id, document_id, chunk_index, page_number, text, embedding, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s::vector, %s);
                    """,
                    (
                        chunk["id"],
                        document_id,
                        chunk["chunk_index"],
                        chunk["page_number"],
                        chunk["text"],
                        vector_str,
                        now
                    )
                )
        conn.commit()
        logger.info(f"Successfully persisted {len(chunks)} chunks for document_id={document_id}")
        return len(chunks)
    except Exception as e:
        conn.rollback()
        logger.error(f"Failed to persist chunks for document_id={document_id}: {e}")
        raise e
    finally:
        conn.close()

def retrieve_ready_chunks(project_id: str, query_vector: List[float], top_k: int = 5) -> List[Dict[str, Any]]:
    if not query_vector:
        return []

    conn = get_connection()
    try:
        vector_str = "[" + ",".join(str(f) for f in query_vector) + "]"
        query = """
            SELECT c.id, c.document_id, c.chunk_index, c.page_number, c.text
            FROM chunks c
            JOIN documents d ON c.document_id = d.id
            WHERE d.project_id = %s
              AND d.status = 'ready'
            ORDER BY c.embedding <=> %s::vector
            LIMIT %s;
        """
        with conn.cursor() as cur:
            cur.execute(query, (project_id, vector_str, top_k))
            rows = cur.fetchall()

        results = []
        for r in rows:
            results.append({
                "chunkId": r[0],
                "documentId": r[1],
                "chunkIndex": r[2],
                "pageNumber": r[3],
                "text": r[4]
            })
        return results
    except Exception as e:
        logger.error(f"Error querying ready chunks for project_id={project_id}: {e}")
        return []
    finally:
        conn.close()
