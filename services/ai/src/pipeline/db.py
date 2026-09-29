import os
import logging
from typing import List, Set

logger = logging.getLogger("m2-ai-service")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/groundguard")

def get_connection():
    try:
        import psycopg
        return psycopg.connect(DATABASE_URL, connect_timeout=2)
    except Exception as e:
        logger.debug(f"psycopg direct connection failed ({e}). Trying fallback.")
        try:
            import psycopg2
            return psycopg2.connect(DATABASE_URL, connect_timeout=2)
        except Exception:
            return None

def validate_ready_documents(project_id: str, document_ids: List[str]) -> Set[str]:
    """
    Validates candidate documentIds against PostgreSQL canonical lifecycle truth.
    Returns only documentIds that are currently in status = 'ready' for the authorized project.
    Fails closed in production if canonical PostgreSQL database is unreachable.
    """
    if not document_ids:
        return set()

    conn = get_connection()
    if conn is None:
        env = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()
        if env == "production":
            raise RuntimeError(
                f"Canonical PostgreSQL lifecycle verification failed: database unavailable at {DATABASE_URL}"
            )
        logger.warning("PostgreSQL unreachable in dev/test environment. Allowing candidates for offline testing.")
        return set(document_ids)

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM documents
                WHERE id = ANY(%s) AND project_id = %s AND status = 'ready';
                """,
                (document_ids, project_id)
            )
            rows = cur.fetchall()
            return {r[0] for r in rows}
    except Exception as e:
        logger.error(f"Error validating ready documents in PostgreSQL: {e}")
        env = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()
        if env == "production":
            raise RuntimeError(f"PostgreSQL lifecycle validation failed: {e}")
        return set(document_ids)
    finally:
        conn.close()

def get_project_knowledge_summary(project_id: str) -> dict:
    """
    Retrieves ready document count and file names for project metadata and routing context.
    """
    conn = get_connection()
    if conn is None:
        return {"readyCount": 0, "filenames": []}

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT filename FROM documents
                WHERE project_id = %s AND status = 'ready'
                ORDER BY created_at ASC;
                """,
                (project_id,)
            )
            rows = cur.fetchall()
            filenames = [r[0] for r in rows if r[0]]
            return {
                "readyCount": len(filenames),
                "filenames": filenames
            }
    except Exception as e:
        logger.error(f"Error fetching project knowledge summary: {e}")
        return {"readyCount": 0, "filenames": []}
    finally:
        conn.close()

