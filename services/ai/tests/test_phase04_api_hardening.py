"""Stabilization Phase 04: request validation, ingest errors, index-check states, safe reconcile default."""
import os, sys
from unittest.mock import patch
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
from src import main
from src.pipeline import index_verifier

client = TestClient(main.app)


@pytest.mark.parametrize("query", ["", "   "])
def test_generate_and_retrieve_reject_blank_query(query):
    assert client.post("/generate", json={"projectId": "p1", "query": query}).status_code == 422
    assert client.post("/retrieve", json={"projectId": "p1", "query": query}).status_code == 422


@pytest.mark.parametrize("top_k", [0, -1, 51, 10000])
def test_retrieve_rejects_invalid_topk(top_k):
    assert client.post("/retrieve", json={"projectId": "p1", "query": "flow", "topK": top_k}).status_code == 422


@pytest.mark.parametrize("params", ["projectId=p1&query=", "projectId=p1&query=%20%20", "projectId=p1&query=x&topK=0"])
def test_sanity_search_rejects_invalid_input_without_500(params):
    assert client.get(f"/sanity/search?{params}").status_code == 422


@pytest.mark.parametrize("payload,detail", [
    (b"", "empty"), (b"hello, not a pdf", "not a valid PDF"), (b"%PDF-1.4 truncated garbage", "could not be read"),
])
def test_ingest_invalid_upload_is_4xx_without_internal_detail(payload, detail):
    r = client.post("/ingest", data={"documentId": "doc_x", "projectId": "p1"},
                    files={"file": ("x.pdf", payload, "application/pdf")})
    assert r.status_code == 422 and detail in r.json()["detail"]
    assert "Traceback" not in r.text and "pypdf" not in r.text.lower()


def test_ingest_missing_file_is_422():
    assert client.post("/ingest", data={"documentId": "doc_x", "projectId": "p1"}).status_code == 422


def test_index_check_reports_missing_and_unverifiable():
    with patch.object(index_verifier.qdrant_store, "count_document_points", return_value=0), \
         patch.object(index_verifier.tantivy_store, "count_document_records", return_value=0):
        r = index_verifier.verify_document_index_parity("p1", "doc_missing")
    assert r["consistent"] is False and r["status"] == "missing"
    with patch.object(index_verifier.qdrant_store, "count_document_points", side_effect=RuntimeError("down")), \
         patch.object(index_verifier.tantivy_store, "count_document_records", return_value=3):
        r = index_verifier.verify_document_index_parity("p1", "doc_a", 3)
    assert r["consistent"] is False and r["status"] == "unverifiable"
    with patch.object(index_verifier.qdrant_store, "count_document_points", return_value=3), \
         patch.object(index_verifier.tantivy_store, "count_document_records", return_value=3):
        assert index_verifier.verify_document_index_parity("p1", "doc_a", 3)["status"] == "consistent"


@pytest.mark.parametrize("body,expect_dry", [(None, True), ({}, True), ({"dryRun": True}, True), ({"dryRun": False}, False)])
def test_reconcile_defaults_to_dry_run(body, expect_dry):
    with patch("src.pipeline.index_verifier.reconcile_legacy_indexes", return_value={"ok": True}) as rec:
        r = client.post("/admin/reconcile-indexes", json=body) if body is not None else client.post("/admin/reconcile-indexes")
    assert r.status_code == 200 and rec.call_args.kwargs["dry_run"] is expect_dry


@pytest.mark.parametrize("raw,expected", [
    ("Flow is 450 gpm [pump_p101a_specs.pdf, pp. 1].", "[pump_p101a_specs.pdf, p. 1]"),
    ("Flow is 450 gpm [pump_p101a_specs.pdf, page 1].", "[pump_p101a_specs.pdf, page 1]"),
    ("See [Architecture.pdf, pp. 1–2].", "[Architecture.pdf, pp. 1–2]"),
    ("See [Architecture.pdf, p 3-4].", "[Architecture.pdf, pp. 3-4]"),
])
def test_citation_titles_and_page_labels(raw, expected):
    assert expected in main.sanitize_user_facing_answer(raw, [])
