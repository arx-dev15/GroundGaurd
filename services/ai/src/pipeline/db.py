import os
import logging
from typing import List, Set, Dict, Any, Tuple

logger = logging.getLogger("m2-db")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/groundguard")

# Explicit opt-in flag for offline unit testing only. Never enabled in production.
_ALLOW_OFFLINE_DB = os.getenv("ALLOW_OFFLINE_DB", "false").lower() == "true"
_ENV = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()

if _ALLOW_OFFLINE_DB and _ENV == "production":
    raise RuntimeError("FATAL: ALLOW_OFFLINE_DB=true is strictly forbidden in production.")


def get_connection():
    """
    Establishes connection to PostgreSQL canonical database.
    Attempts modern psycopg (v3) first, falls back to psycopg2.
    """
    try:
        import psycopg
        return psycopg.connect(DATABASE_URL, connect_timeout=3)
    except Exception as e:
        logger.warning(f"psycopg (v3) connection failed: {e}. Trying psycopg2 fallback...")
        try:
            import psycopg2
            return psycopg2.connect(DATABASE_URL, connect_timeout=3)
        except Exception as e2:
            logger.error(f"Both psycopg and psycopg2 failed to connect to {DATABASE_URL}: {e2}")
            return None


def get_ready_documents_meta(project_id: str, document_ids: List[str]) -> Tuple[Set[str], Dict[str, str]]:
    """
    Validates candidate documentIds against PostgreSQL canonical lifecycle truth and returns filenames.
    Returns: (ready_document_ids, {doc_id: filename})
    """
    if not document_ids:
        return set(), {}

    raw_opt = os.getenv("ALLOW_OFFLINE_DB")
    allow_offline = (raw_opt.lower() == "true") if raw_opt is not None else _ALLOW_OFFLINE_DB
    env = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()

    if allow_offline and env == "production":
        raise RuntimeError("FATAL: ALLOW_OFFLINE_DB=true is strictly forbidden in production.")

    conn = get_connection()
    if conn is None:
        if allow_offline and env != "production":
            return set(document_ids), {did: did for did in document_ids}
        raise RuntimeError(
            f"FATAL: Canonical PostgreSQL lifecycle verification failed: database unavailable at {DATABASE_URL}. "
            "Failing closed to prevent unauthorized or unready document retrieval."
        )

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, status, filename FROM documents
                WHERE id = ANY(%s) AND project_id = %s;
                """,
                (document_ids, project_id)
            )
            rows = cur.fetchall()
            if not rows and allow_offline and env != "production":
                return set(document_ids), {did: did for did in document_ids}
            ready_set = {str(r[0]) for r in rows if r[1] == 'ready'}
            filenames = {str(r[0]): str(r[2]) for r in rows if r[1] == 'ready' and r[2]}
            return ready_set, filenames
    except Exception as e:
        logger.error(f"Error validating ready documents in PostgreSQL: {e}")
        if allow_offline and env != "production":
            return set(document_ids), {did: did for did in document_ids}
        raise RuntimeError(f"FATAL: PostgreSQL lifecycle validation failed: {e}") from e
    finally:
        conn.close()


def validate_ready_documents(project_id: str, document_ids: List[str]) -> Set[str]:
    """
    Validates candidate documentIds against PostgreSQL canonical lifecycle truth.
    Returns only documentIds that are currently in status = 'ready' for the authorized project.
    """
    ready_set, _ = get_ready_documents_meta(project_id, document_ids)
    return ready_set


def get_project_knowledge_summary(project_id: str) -> Dict[str, Any]:
    """
    Retrieves ready document count and file names for project metadata and routing context.
    """
    conn = get_connection()
    if conn is None:
        if _ENV == "production":
            raise RuntimeError(f"FATAL: PostgreSQL unavailable at {DATABASE_URL} when querying project knowledge.")
        return {"readyCount": -1, "filenames": [], "error": "database_unavailable"}

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, filename FROM documents
                WHERE project_id = %s AND status = 'ready'
                ORDER BY created_at ASC;
                """,
                (project_id,)
            )
            rows = cur.fetchall()
            ready_docs = [{"id": str(r[0]), "filename": str(r[1])} for r in rows if r[1]]
            filenames = [d["filename"] for d in ready_docs]
            return {
                "readyCount": len(filenames),
                "filenames": filenames,
                "readyDocs": ready_docs,
            }
    except Exception as e:
        logger.error(f"Error fetching project knowledge summary: {e}")
        if _ENV == "production":
            raise RuntimeError(f"FATAL: Failed to query project knowledge summary: {e}") from e
        return {"readyCount": -1, "filenames": [], "error": str(e)}
    finally:
        conn.close()


def get_project_ready_documents_with_chunk_counts(project_id: str) -> List[Dict[str, Any]]:
    """
    Returns all documents in status = 'ready' for project_id, along with their
    canonical chunk count from PostgreSQL chunks table.
    """
    conn = get_connection()
    if conn is None:
        return []
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.id, d.filename, d.chunks_count, count(c.id) as actual_chunks
                FROM documents d
                LEFT JOIN chunks c ON c.document_id = d.id
                WHERE d.project_id = %s AND d.status = 'ready'
                GROUP BY d.id, d.filename, d.chunks_count
                ORDER BY d.created_at ASC;
                """,
                (project_id,)
            )
            rows = cur.fetchall()
            return [
                {
                    "document_id": str(r[0]),
                    "filename": str(r[1]),
                    "declared_chunks": int(r[2] or 0),
                    "actual_pg_chunks": int(r[3] or 0),
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Error fetching ready documents with chunk counts: {e}")
        return []
    finally:
        conn.close()


def get_document_canonical_chunks(document_id: str) -> List[Dict[str, Any]]:
    """
    Fetches raw chunk records from PostgreSQL for re-indexing / repair.
    """
    conn = get_connection()
    if conn is None:
        return []
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, chunk_index, page_number, text, section, heading, identifiers
                FROM chunks
                WHERE document_id = %s
                ORDER BY chunk_index ASC;
                """,
                (document_id,)
            )
            rows = cur.fetchall()
            return [
                {
                    "id": str(r[0]),
                    "chunk_index": int(r[1] or 0),
                    "page_number": int(r[2] or 1),
                    "text": str(r[3] or ""),
                    "section": r[4],
                    "heading": r[5],
                    "identifiers": r[6],
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Error fetching document canonical chunks: {e}")
        return []
    finally:
        conn.close()

