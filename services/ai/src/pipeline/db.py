import os
import logging
from typing import List, Set, Dict, Any

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


def validate_ready_documents(project_id: str, document_ids: List[str]) -> Set[str]:
    """
    Validates candidate documentIds against PostgreSQL canonical lifecycle truth.
    Returns only documentIds that are currently in status = 'ready' for the authorized project.

    INVARIANTS:
    - Fails closed: If PostgreSQL is unreachable, raises RuntimeError.
    - Never allows unverified documents to pass through unless ALLOW_OFFLINE_DB=true (unit test mode).
    - Scope isolation: Only returns documents matching both id = ANY(...) AND project_id = project_id.
    """
    if not document_ids:
        return set()

    raw_opt = os.getenv("ALLOW_OFFLINE_DB")
    allow_offline = (raw_opt.lower() == "true") if raw_opt is not None else _ALLOW_OFFLINE_DB
    env = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()

    if allow_offline and env == "production":
        raise RuntimeError("FATAL: ALLOW_OFFLINE_DB=true is strictly forbidden in production.")

    conn = get_connection()
    if conn is None:
        if allow_offline and env != "production":
            logger.warning(
                "PostgreSQL unreachable with ALLOW_OFFLINE_DB=true. "
                "Allowing candidate documents for offline unit testing only."
            )
            return set(document_ids)
        raise RuntimeError(
            f"FATAL: Canonical PostgreSQL lifecycle verification failed: database unavailable at {DATABASE_URL}. "
            f"Failing closed to prevent unauthorized or unready document retrieval."
        )

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, status FROM documents
                WHERE id = ANY(%s) AND project_id = %s;
                """,
                (document_ids, project_id)
            )
            rows = cur.fetchall()
            if not rows and allow_offline and env != "production":
                # Unit testing with synthetic documents not present in PostgreSQL
                return set(document_ids)
            return {r[0] for r in rows if r[1] == 'ready'}
    except Exception as e:
        logger.error(f"Error validating ready documents in PostgreSQL: {e}")
        if allow_offline and env != "production":
            return set(document_ids)
        raise RuntimeError(f"FATAL: PostgreSQL lifecycle validation failed: {e}") from e
    finally:
        conn.close()


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

