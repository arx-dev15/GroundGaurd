"""
GroundGuard Index Consistency Verifier & Parity Manager
Ensures 3-way parity across:
1. PostgreSQL (canonical source of truth)
2. Qdrant (dense vectors)
3. Tantivy (BM25 lexical index)
Provides bounded repair and query-time safety checks.
"""

import os
import logging
from typing import Dict, Any, List, Optional, Tuple

from src.pipeline.db import (
    get_connection,
    get_project_ready_documents_with_chunk_counts,
    get_document_canonical_chunks,
)
from src.pipeline.embedder import generate_embeddings
from src.pipeline.extractor import extract_identifiers, get_identifier_keys
from src.pipeline.qdrant_store import qdrant_store
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.graph_store import graph_store

logger = logging.getLogger("m2-index-verifier")
_ENV = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()


def _dense_backend_problem() -> Optional[str]:
    """
    Returns a reason string if the dense backend cannot be trusted for parity checks or writes:
    unreachable, or a non-authoritative fallback store. Repairs against such a store would write
    vectors to the wrong place, and "missing" counts would wrongly mark READY documents FAILED.
    """
    status = qdrant_store.status()
    if not status.get("available"):
        return f"Qdrant dense backend unavailable ({status.get('backend')}): {status.get('error') or qdrant_store.last_error}"
    if not status.get("authoritative"):
        return f"Qdrant backend '{status.get('backend')}' is a non-authoritative fallback store"
    return None


def verify_document_index_parity(
    project_id: str,
    document_id: str,
    expected_count: Optional[int] = None
) -> Dict[str, Any]:
    """
    Verifies that Qdrant and Tantivy have the exact expected chunk count for (project_id, document_id).
    """
    try:
        q_count = qdrant_store.count_document_points(project_id, document_id)
    except Exception as e:
        logger.error(f"Qdrant count check failed for {document_id}: {e}")
        q_count = -1

    try:
        t_count = tantivy_store.count_document_records(project_id, document_id)
    except Exception as e:
        logger.error(f"Tantivy count check failed for {document_id}: {e}")
        t_count = -1

    consistent = False
    if q_count < 0 or t_count < 0:
        status = "unverifiable"
    elif q_count == 0 and t_count == 0 and not expected_count:
        # Nothing indexed and nothing expected: the document is missing, not "consistent".
        status = "missing"
    elif q_count == t_count and (expected_count is None or q_count == expected_count):
        consistent = True
        status = "consistent"
    else:
        status = "inconsistent"

    return {
        "consistent": consistent,
        "status": status,
        "documentId": document_id,
        "projectId": project_id,
        "qdrantCount": q_count,
        "tantivyCount": t_count,
        "expectedCount": expected_count,
    }


def repair_document_index(project_id: str, document_id: str) -> bool:
    """
    Reconstructs Qdrant and Tantivy derived index entries from PostgreSQL canonical chunks.
    Idempotent and atomic per document.
    """
    problem = _dense_backend_problem()
    if problem:
        logger.error(f"Refusing to repair document {document_id}: {problem}")
        return False

    raw_chunks = get_document_canonical_chunks(document_id)
    if not raw_chunks:
        logger.warning(f"Cannot repair document {document_id}: no canonical chunks found in PostgreSQL.")
        return False

    formatted_chunks = []
    for c in raw_chunks:
        text = c.get("text", "")
        idents = extract_identifiers(text)
        ident_keys = get_identifier_keys(idents)
        formatted_chunks.append({
            "id": c["id"],
            "chunk_index": c["chunk_index"],
            "page_number": c["page_number"],
            "text": text,
            "section": c.get("section"),
            "heading": c.get("heading"),
            "identifiers": [i.model_dump() for i in idents],
            "identifierKeys": ident_keys,
        })

    try:
        texts = [c["text"] for c in formatted_chunks]
        embeddings = generate_embeddings(texts)

        # 1. Qdrant (deterministic point ids -> upsert overwrites; then drop points from older chunkings)
        qdrant_store.upsert_chunks(project_id, document_id, formatted_chunks, embeddings)
        qdrant_store.delete_stale_document_points(project_id, document_id, [c["id"] for c in formatted_chunks])

        # 2. Tantivy
        tantivy_store.index_chunks(project_id, document_id, formatted_chunks)

        # 3. NetworkX
        try:
            graph_store.process_and_persist_chunks(project_id, document_id, formatted_chunks)
        except Exception as ge:
            logger.warning(f"Graph store repair notice for {document_id}: {ge}")

        # Verify parity
        parity = verify_document_index_parity(project_id, document_id, len(formatted_chunks))
        if parity["consistent"]:
            logger.info(f"Successfully repaired indexes for document {document_id} ({len(formatted_chunks)} chunks).")
            return True
        else:
            logger.error(f"Parity check failed after repair for {document_id}: {parity}")
            return False

    except Exception as e:
        logger.error(f"Failed to repair indexes for document {document_id}: {e}")
        return False


def verify_project_index_consistency(
    project_id: str,
    auto_repair: bool = True
) -> Dict[str, Any]:
    """
    Evaluates index consistency for all READY documents belonging to project_id.
    In development, safely auto-repairs missing indexes if canonical chunks exist.
    In production, reports inconsistencies without silent degradation.
    """
    ready_docs = get_project_ready_documents_with_chunk_counts(project_id)
    if not ready_docs:
        return {
            "consistent": True,
            "readyDocCount": 0,
            "inconsistentDocs": [],
        }

    problem = _dense_backend_problem()
    if problem:
        auto_repair = False
        logger.error(f"[index-verifier] Auto-repair disabled for project {project_id}: {problem}")

    inconsistent_docs = []

    for d in ready_docs:
        doc_id = d["document_id"]
        fn = d["filename"]
        pg_count = d["actual_pg_chunks"]

        parity = verify_document_index_parity(project_id, doc_id, pg_count)
        if not parity["consistent"]:
            # Check if auto-repair is permitted and bounded
            repaired = False
            if auto_repair and pg_count > 0 and pg_count <= 50 and _ENV != "production":
                logger.info(f"Attempting bounded auto-repair for {fn} ({doc_id}) in {project_id}...")
                repaired = repair_document_index(project_id, doc_id)

            if not repaired:
                inconsistent_docs.append({
                    "documentId": doc_id,
                    "filename": fn,
                    "pgCount": pg_count,
                    "qdrantCount": parity["qdrantCount"],
                    "tantivyCount": parity["tantivyCount"],
                })

    return {
        "consistent": len(inconsistent_docs) == 0,
        "readyDocCount": len(ready_docs),
        "inconsistentDocs": inconsistent_docs,
    }


def reconcile_legacy_indexes(
    dry_run: bool = False,
    max_documents: Optional[int] = None,
    target_project_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Automated reconciliation tooling (Section 4).
    Audits and reconciles all documents marked READY in PostgreSQL against downstream indexes.
    
    Guarantees:
    - Idempotent: safe to run multiple times.
    - Project-safe: preserves project isolation boundaries.
    - Document-safe: rebuilds search indexes only from canonical PostgreSQL chunks.
    - Bounded: limits batch size if max_documents is provided.
    - Observable: provides detailed per-document audit and structured summary.
    - Enforces Invariant: If a document cannot achieve parity (e.g. pg_chunks == 0),
      transitions to status = 'failed' with observable reason and removes orphan index points.
    """
    # Never audit or repair against an unreachable or fallback vector store: every READY document
    # would look "missing", be re-embedded into the wrong store, or be marked FAILED.
    problem = _dense_backend_problem()
    if problem:
        raise RuntimeError(f"Cannot reconcile indexes: {problem}")

    conn = get_connection()
    if conn is None:
        raise RuntimeError("Cannot reconcile indexes: PostgreSQL database unavailable.")

    query = """
        SELECT d.id, d.project_id, d.filename, d.status, d.chunks_count,
               COUNT(c.id) as actual_pg_chunks
        FROM documents d
        LEFT JOIN chunks c ON c.document_id = d.id
        WHERE d.status = 'ready'
    """
    params = []
    if target_project_id:
        query += " AND d.project_id = %s"
        params.append(target_project_id)

    query += " GROUP BY d.id, d.project_id, d.filename, d.status, d.chunks_count ORDER BY d.created_at ASC"

    if max_documents:
        query += f" LIMIT {int(max_documents)}"

    with conn.cursor() as cur:
        cur.execute(query, params)
        ready_docs = cur.fetchall()

    consistent = []
    repaired = []
    unrecoverable = []
    needs_repair = []
    unverifiable = []

    for doc in ready_docs:
        doc_id, proj_id, filename, status, declared_chunks, actual_pg_chunks = doc

        parity = verify_document_index_parity(proj_id, doc_id, actual_pg_chunks)
        if parity["qdrantCount"] < 0 or parity["tantivyCount"] < 0:
            # Count could not be read (store error) -- unknown is not "missing"; leave the document untouched.
            unverifiable.append({
                "documentId": doc_id,
                "projectId": proj_id,
                "filename": filename,
                "qdrantCount": parity["qdrantCount"],
                "tantivyCount": parity["tantivyCount"],
            })
            continue
        is_parity_ok = parity["consistent"] and actual_pg_chunks > 0

        if is_parity_ok:
            consistent.append({
                "documentId": doc_id,
                "projectId": proj_id,
                "filename": filename,
                "chunksCount": actual_pg_chunks,
            })
            continue

        if actual_pg_chunks > 0:
            if dry_run:
                needs_repair.append({
                    "documentId": doc_id,
                    "projectId": proj_id,
                    "filename": filename,
                    "pgChunks": actual_pg_chunks,
                    "qdrantCount": parity["qdrantCount"],
                    "tantivyCount": parity["tantivyCount"],
                })
            else:
                logger.info(f"[reconciliation] Repairing {filename} ({doc_id}) in {proj_id}...")
                success = repair_document_index(proj_id, doc_id)
                if success:
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE documents SET chunks_count = %s, updated_at = NOW() WHERE id = %s",
                            (actual_pg_chunks, doc_id)
                        )
                        conn.commit()
                    repaired.append({
                        "documentId": doc_id,
                        "projectId": proj_id,
                        "filename": filename,
                        "chunksCount": actual_pg_chunks,
                    })
                else:
                    err_msg = "Index parity verification failed after repair attempt"
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE documents SET status = 'failed', error_message = %s, updated_at = NOW() WHERE id = %s",
                            (err_msg, doc_id)
                        )
                        conn.commit()
                    unrecoverable.append({
                        "documentId": doc_id,
                        "projectId": proj_id,
                        "filename": filename,
                        "reason": err_msg,
                    })
        else:
            # actual_pg_chunks == 0: cannot establish parity
            err_msg = "Index parity cannot be established: no canonical chunks found in PostgreSQL"
            if not dry_run:
                logger.warning(f"[reconciliation] Document {filename} ({doc_id}) has 0 PG chunks. Marking failed.")
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE documents SET status = 'failed', error_message = %s, updated_at = NOW() WHERE id = %s",
                        (err_msg, doc_id)
                    )
                    conn.commit()
                # Purge any orphan points from downstream indexes
                try:
                    qdrant_store.delete_document(proj_id, doc_id)
                except Exception as qe:
                    logger.debug(f"Orphan Qdrant delete notice for {doc_id}: {qe}")
                try:
                    tantivy_store.delete_document(proj_id, doc_id)
                except Exception as te:
                    logger.debug(f"Orphan Tantivy delete notice for {doc_id}: {te}")

            unrecoverable.append({
                "documentId": doc_id,
                "projectId": proj_id,
                "filename": filename,
                "reason": err_msg,
            })

    # Final post-audit count
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM documents WHERE status = 'ready'")
        remaining_ready = cur.fetchone()[0]

    return {
        "dryRun": dry_run,
        "totalAudited": len(ready_docs),
        "alreadyConsistent": len(consistent),
        "repairedCount": len(repaired),
        "unrecoverableCount": len(unrecoverable),
        "needsRepairCount": len(needs_repair),
        "unverifiableCount": len(unverifiable),
        "remainingReadyDocs": remaining_ready,
        "repaired": repaired,
        "unrecoverable": unrecoverable,
        "needsRepair": needs_repair,
        "unverifiable": unverifiable,
        "denseBackend": qdrant_store.status(),
        "inconsistentReadyRemaining": len(unverifiable) + (0 if not dry_run else (len(needs_repair) + len(unrecoverable))),
    }
