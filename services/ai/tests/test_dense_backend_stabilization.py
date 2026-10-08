"""
Regression suite: Stabilization Phase 01 -- dense retrieval & index consistency (audit 2026-10-08).

Defect: with the configured Qdrant server unreachable, the AI service silently switched to a stale
embedded store holding 0/31 READY documents. Dense retrieval returned nothing, /health said "ok",
and reconciliation would have re-embedded into (or marked FAILED against) the wrong store.

Covers:
1. Outage -> retrieval degrades to lexical-only and says so in metadata (no silent switch).
2. Healthy dense backend -> hybrid fusion merges real dense + lexical candidates.
3. /health reports "degraded" and /ready returns 503 when dense is unavailable.
4. Reconciliation refuses to run against an unavailable/fallback store and never marks docs FAILED.
5. Parity check identifies missing vectors.
6. Repair is idempotent (no duplicate points) and removes stale points after re-chunking.
7. Dense search stays project-isolated.
"""

import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.pipeline.qdrant_store import QdrantStore, QdrantUnavailableError
from src.pipeline import index_verifier
from src.pipeline.retrieval import retrieve_evidence

DIM = 384


def _vec(seed: int):
    v = [0.0] * DIM
    v[seed % DIM] = 1.0
    return v


def _lex_hit(cid, did, text, project="p1"):
    return {"chunkId": cid, "documentId": did, "projectId": project, "text": text, "score": 5.0, "pageNumber": 1}


def _dense_hit(cid, did, text, project="p1"):
    return {"chunkId": cid, "documentId": did, "projectId": project, "text": text, "score": 0.8,
            "pageNumber": 1, "chunkIndex": 0, "identifierKeys": []}


def _passthrough_rerank(query, passages, top_n):
    return [{"chunkId": p["chunkId"], "candidate": p["candidate"], "rerankScore": 0.6} for p in passages[:top_n]]


# ---------------------------------------------------------------------------
# 1 & 2. Retrieval behaviour under dense outage vs healthy dense backend
# ---------------------------------------------------------------------------

@patch("src.pipeline.retrieval.rerank", side_effect=_passthrough_rerank)
@patch("src.pipeline.retrieval.get_ready_documents_meta", return_value=({"doc_a"}, {"doc_a": "stud.pdf"}))
@patch("src.pipeline.retrieval.generate_embeddings", side_effect=lambda texts: [_vec(1) for _ in texts])
@patch("src.pipeline.retrieval.tantivy_store.search_project")
@patch("src.pipeline.retrieval.qdrant_store.search_dense")
def test_dense_outage_degrades_to_explicit_lexical_only(mock_dense, mock_lex, *_):
    mock_dense.side_effect = QdrantUnavailableError("Qdrant dense backend unavailable: connection refused")
    mock_lex.return_value = [_lex_hit("chk_1", "doc_a", "Topics covered in the course syllabus.")]

    res = retrieve_evidence(project_id="p1", query="What topics does the course cover?", top_k=5)

    assert res.metadata.denseAvailable is False
    assert res.metadata.retrievalMode == "lexical_only"
    assert "unavailable" in (res.metadata.degradationReason or "")
    assert res.metadata.denseCandidateCount == 0
    assert res.metadata.lexicalCandidateCount == 1
    assert [r.chunkId for r in res.results] == ["chk_1"]


@patch("src.pipeline.retrieval.rerank", side_effect=_passthrough_rerank)
@patch("src.pipeline.retrieval.get_ready_documents_meta", return_value=({"doc_a"}, {"doc_a": "stud.pdf"}))
@patch("src.pipeline.retrieval.generate_embeddings", side_effect=lambda texts: [_vec(1) for _ in texts])
@patch("src.pipeline.retrieval.tantivy_store.search_project")
@patch("src.pipeline.retrieval.qdrant_store.search_dense")
def test_healthy_dense_fuses_dense_and_lexical(mock_dense, mock_lex, *_):
    mock_dense.return_value = [
        _dense_hit("chk_shared", "doc_a", "Course units and subjects."),
        _dense_hit("chk_dense_only", "doc_a", "Semester-wise subject list."),
    ]
    mock_lex.return_value = [_lex_hit("chk_shared", "doc_a", "Course units and subjects.")]

    res = retrieve_evidence(project_id="p1", query="What topics does the course cover?", top_k=5)

    assert res.metadata.denseAvailable is True
    assert res.metadata.degradationReason is None
    assert res.metadata.denseCandidateCount == 2
    shared = next(r for r in res.results if r.chunkId == "chk_shared")
    assert set(shared.sources) >= {"qdrant_dense", "tantivy_lexical"}
    assert any(r.chunkId == "chk_dense_only" for r in res.results)


@patch("src.pipeline.retrieval.get_ready_documents_meta", return_value=(set(), {}))
@patch("src.pipeline.retrieval.generate_embeddings", side_effect=lambda texts: [_vec(1) for _ in texts])
@patch("src.pipeline.retrieval.tantivy_store.search_project", return_value=[])
@patch("src.pipeline.retrieval.qdrant_store.search_dense")
def test_non_outage_qdrant_errors_still_fail_closed(mock_dense, *_):
    mock_dense.side_effect = ValueError("bad filter")
    with pytest.raises(RuntimeError, match="Qdrant retrieval infrastructure failure"):
        retrieve_evidence(project_id="p1", query="What topics does the course cover?", top_k=5)


# ---------------------------------------------------------------------------
# 3. Health / readiness
# ---------------------------------------------------------------------------

def _client():
    from fastapi.testclient import TestClient
    from src import main
    return TestClient(main.app), main


def test_health_reports_degraded_when_dense_unavailable():
    client, main = _client()
    down = {"backend": "server", "url": "http://127.0.0.1:6333", "available": False,
            "authoritative": True, "error": "connection refused"}
    with patch.object(main.qdrant_store, "status", return_value=down):
        body = client.get("/health").json()
        assert body["service"] == "ai"
        assert body["status"] == "degraded"
        assert body["retrievalMode"] == "lexical_only"
        assert body["dense"]["available"] is False
        r = client.get("/ready")
        assert r.status_code == 503
        assert r.json()["status"] == "degraded"


def test_health_flags_fallback_store_as_degraded():
    client, main = _client()
    fallback = {"backend": "embedded_fallback", "available": True, "authoritative": False, "pointsCount": 50}
    with patch.object(main.qdrant_store, "status", return_value=fallback):
        body = client.get("/health").json()
        assert body["status"] == "degraded"
        assert body["retrievalMode"] == "hybrid_fallback_store"


def test_health_ok_when_dense_available_on_authoritative_store():
    client, main = _client()
    up = {"backend": "server", "available": True, "authoritative": True, "pointsCount": 694, "vectorSize": DIM}
    with patch.object(main.qdrant_store, "status", return_value=up):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["retrievalMode"] == "hybrid"


# ---------------------------------------------------------------------------
# 4. Reconciliation safety
# ---------------------------------------------------------------------------

def test_reconcile_refuses_unavailable_backend_and_touches_nothing():
    down = {"backend": "server", "available": False, "authoritative": True, "error": "connection refused"}
    with patch.object(index_verifier.qdrant_store, "status", return_value=down), \
         patch("src.pipeline.index_verifier.get_connection") as mock_conn, \
         patch("src.pipeline.index_verifier.repair_document_index") as mock_repair:
        with pytest.raises(RuntimeError, match="unavailable"):
            index_verifier.reconcile_legacy_indexes(dry_run=False)
        mock_conn.assert_not_called()
        mock_repair.assert_not_called()


def test_reconcile_refuses_fallback_store():
    fallback = {"backend": "embedded_fallback", "available": True, "authoritative": False}
    with patch.object(index_verifier.qdrant_store, "status", return_value=fallback), \
         patch("src.pipeline.index_verifier.get_connection") as mock_conn:
        with pytest.raises(RuntimeError, match="non-authoritative"):
            index_verifier.reconcile_legacy_indexes(dry_run=True)
        mock_conn.assert_not_called()


def test_reconcile_unknown_count_is_not_marked_failed():
    """A store read error (count=-1) must be reported as unverifiable, never flip READY -> FAILED."""
    up = {"backend": "server", "available": True, "authoritative": True}
    cur = MagicMock()
    cur.fetchall.return_value = [("doc_a", "p1", "stud.pdf", "ready", 3, 3)]
    cur.fetchone.return_value = (1,)
    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    with patch.object(index_verifier.qdrant_store, "status", return_value=up), \
         patch("src.pipeline.index_verifier.get_connection", return_value=conn), \
         patch("src.pipeline.index_verifier.qdrant_store.count_document_points", side_effect=RuntimeError("timeout")), \
         patch("src.pipeline.index_verifier.tantivy_store.count_document_records", return_value=3), \
         patch("src.pipeline.index_verifier.repair_document_index") as mock_repair:
        res = index_verifier.reconcile_legacy_indexes(dry_run=False)
    mock_repair.assert_not_called()
    executed = " ".join(str(c.args[0]) for c in cur.execute.call_args_list)
    assert "status = 'failed'" not in executed
    assert res["unverifiableCount"] == 1
    assert res["inconsistentReadyRemaining"] == 1


# ---------------------------------------------------------------------------
# 5-7. Real (in-memory) Qdrant: missing-vector detection, idempotent repair, isolation
# ---------------------------------------------------------------------------

@pytest.fixture
def mem_store():
    with patch.dict(os.environ, {"ENVIRONMENT": "development"}):
        return QdrantStore(url=":memory:")


def _pg_chunks(ids):
    return [{"id": cid, "chunk_index": i, "page_number": 1, "text": f"chunk text {cid}"} for i, cid in enumerate(ids)]


def _repair(store, pg_rows, tantivy_count):
    with patch.object(index_verifier, "qdrant_store", store), \
         patch("src.pipeline.index_verifier.get_document_canonical_chunks", return_value=pg_rows), \
         patch("src.pipeline.index_verifier.generate_embeddings", side_effect=lambda t: [_vec(i) for i in range(len(t))]), \
         patch("src.pipeline.index_verifier.tantivy_store.index_chunks"), \
         patch("src.pipeline.index_verifier.tantivy_store.count_document_records", return_value=tantivy_count), \
         patch("src.pipeline.index_verifier.graph_store.process_and_persist_chunks"):
        return index_verifier.repair_document_index("p1", "doc_a")


def test_parity_identifies_missing_vectors(mem_store):
    with patch.object(index_verifier, "qdrant_store", mem_store), \
         patch("src.pipeline.index_verifier.tantivy_store.count_document_records", return_value=562):
        res = index_verifier.verify_document_index_parity("p1", "doc_a", 562)
    assert res["consistent"] is False
    assert res["qdrantCount"] == 0
    assert res["tantivyCount"] == 562


def test_repair_is_idempotent_and_drops_stale_points(mem_store):
    assert _repair(mem_store, _pg_chunks(["c0", "c1", "c2"]), 3) is True
    assert _repair(mem_store, _pg_chunks(["c0", "c1", "c2"]), 3) is True
    assert mem_store.count_document_points("p1", "doc_a") == 3  # no duplicates on re-run

    # Document re-chunked in PostgreSQL with fewer, new chunk ids -> old points must not linger.
    assert _repair(mem_store, _pg_chunks(["n0", "n1"]), 2) is True
    assert mem_store.count_document_points("p1", "doc_a") == 2
    pts, _ = mem_store.client.scroll("groundguard_chunks", limit=10)
    assert sorted(p.payload["chunkId"] for p in pts) == ["n0", "n1"]


def test_repair_refused_when_backend_unavailable():
    down = {"backend": "server", "available": False, "authoritative": True, "error": "connection refused"}
    with patch.object(index_verifier.qdrant_store, "status", return_value=down), \
         patch("src.pipeline.index_verifier.get_document_canonical_chunks") as mock_pg:
        assert index_verifier.repair_document_index("p1", "doc_a") is False
        mock_pg.assert_not_called()


def test_dense_search_is_project_isolated(mem_store):
    mem_store.upsert_chunks("p1", "doc_a", [{"id": "a0", "chunk_index": 0, "text": "alpha"}], [_vec(5)])
    mem_store.upsert_chunks("p2", "doc_b", [{"id": "b0", "chunk_index": 0, "text": "beta"}], [_vec(5)])
    hits = mem_store.search_dense("p1", _vec(5), top_k=10)
    assert [h["chunkId"] for h in hits] == ["a0"]
    assert all(h["projectId"] == "p1" for h in hits)


def test_unreachable_server_raises_explicit_unavailable_error():
    with patch.dict(os.environ, {"ENVIRONMENT": "development", "QDRANT_ALLOW_EMBEDDED_FALLBACK": "false",
                                 "ALLOW_IN_MEMORY_FALLBACK": "false"}):
        store = QdrantStore(url="http://127.0.0.1:1", path="")
    assert store.backend == "server" and not store.available
    with pytest.raises(QdrantUnavailableError):
        store.search_dense("p1", _vec(1), top_k=3)
    with pytest.raises(QdrantUnavailableError):
        store.upsert_chunks("p1", "doc_a", [{"id": "x", "chunk_index": 0, "text": "t"}], [_vec(1)])
