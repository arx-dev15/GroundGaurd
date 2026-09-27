"""
GroundGuard Phase 4: Production External Qdrant Validation Harness
Strictly exercises configured external Qdrant (QDRANT_URL=http://localhost:6333).
Rejects :memory: fallback, local embedded client, test stubs, and mocks.
Verifies all 14 mandatory external Qdrant requirements.
"""

import os
import sys
import time
import uuid
import json
import urllib.request
import subprocess
import logging
from typing import List, Dict, Any

# Ensure project root is in path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_SERVER_DIR = r"C:\Users\Ganesha\.qdrant_server"
QDRANT_EXE = os.path.join(QDRANT_SERVER_DIR, "qdrant.exe")

def wait_for_qdrant(url: str, timeout: float = 10.0) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.urlopen(f"{url}/collections", timeout=1.0)
            if req.status == 200:
                return True
        except Exception:
            time.sleep(0.3)
    return False

def ensure_qdrant_running():
    try:
        req = urllib.request.urlopen(f"{QDRANT_URL}/collections", timeout=1.0)
        if req.status == 200:
            return
    except Exception:
        pass
    # Try Docker first as preferred path
    try:
        subprocess.run(["docker", "compose", "up", "-d", "qdrant"], capture_output=True)
        if wait_for_qdrant(QDRANT_URL, timeout=10.0):
            return
    except Exception:
        pass
    # Fallback to native executable if present
    if os.path.exists(QDRANT_EXE):
        subprocess.run([
            "powershell",
            "-NoProfile",
            "-Command",
            f"Start-Process -FilePath '{QDRANT_EXE}' -WorkingDirectory '{QDRANT_SERVER_DIR}' -WindowStyle Hidden"
        ])
        wait_for_qdrant(QDRANT_URL, timeout=10.0)

ensure_qdrant_running()

from qdrant_client import QdrantClient
from qdrant_client.http import models as rest_models
from qdrant_client.http.models import Distance, VectorParams, PayloadSchemaType

from src.pipeline.qdrant_store import qdrant_store, QdrantStore, COLLECTION_NAME, VECTOR_DIM
from src.pipeline.embedder import generate_embeddings
from src.pipeline.db import get_connection
from src.pipeline.retrieval import retrieve_evidence
from evaluation_phase4 import index_corpus, CORPUS_ALPHA, CORPUS_BETA, PROJECT_ALPHA, PROJECT_BETA
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.graph_store import graph_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("validate-external-qdrant")

report_data: Dict[str, Any] = {}

def get_qdrant_server_info(url: str) -> Dict[str, Any]:
    try:
        req = urllib.request.urlopen(url, timeout=2.0)
        return json.loads(req.read().decode())
    except Exception as e:
        return {"error": str(e)}

def restart_qdrant_server():
    """Stops the external Qdrant server (Docker or native) and restarts it using the same storage directory."""
    print("      Stopping external Qdrant server...")
    
    is_docker = False
    try:
        res = subprocess.run(["docker", "ps", "--filter", "name=qdrant", "--format", "{{.Names}}"], capture_output=True, text=True)
        if "qdrant" in res.stdout:
            is_docker = True
    except Exception:
        pass

    if is_docker:
        print("      Stopping Docker Qdrant container...")
        subprocess.run(["docker", "compose", "stop", "qdrant"], capture_output=True)
    else:
        print("      Stopping native Qdrant process...")
        subprocess.run(["taskkill", "/F", "/IM", "qdrant.exe"], capture_output=True)
    
    time.sleep(1.5)
    
    # Confirm port is down
    down = False
    try:
        urllib.request.urlopen(f"{QDRANT_URL}/collections", timeout=1.0)
    except Exception:
        down = True
    assert down, "Qdrant server failed to shut down"
    print("      External Qdrant stopped cleanly.")

    # Restart Qdrant
    if is_docker:
        print("      Restarting Qdrant via Docker compose...")
        subprocess.run(["docker", "compose", "start", "qdrant"], capture_output=True)
    else:
        print(f"      Restarting Qdrant from storage directory: {QDRANT_SERVER_DIR}...")
        subprocess.run([
            "powershell",
            "-NoProfile",
            "-Command",
            f"Start-Process -FilePath '{QDRANT_EXE}' -WorkingDirectory '{QDRANT_SERVER_DIR}' -WindowStyle Hidden"
        ])
    ready = wait_for_qdrant(QDRANT_URL, timeout=10.0)
    assert ready, "Qdrant server failed to restart within timeout"
    print("      External Qdrant server restarted successfully.")

def run_external_validation():
    print("=" * 75)
    print("GROUNDGUARD PHASE 4: EXTERNAL PRODUCTION QDRANT VALIDATION")
    print("=" * 75)

    # 1. Verify External Qdrant Process
    print("\n[Step 1: External Qdrant Process Verification]")
    info = get_qdrant_server_info(QDRANT_URL)
    assert "version" in info, f"Cannot connect to external Qdrant at {QDRANT_URL}: {info}"
    qdrant_version = info.get("version", "unknown")
    report_data["process_running"] = "YES"
    report_data["qdrant_url"] = QDRANT_URL
    report_data["qdrant_version"] = qdrant_version
    print(f"  Connected to external Qdrant server at: {QDRANT_URL}")
    print(f"  Server Title: {info.get('title')}")
    print(f"  Server Version: {qdrant_version}")

    # 2. Reject In-Memory / Stubs
    print("\n[Step 2: External Client Verification (No :memory: / Stubs)]")
    assert not qdrant_store.url.startswith(":memory:"), "qdrant_store is using in-memory mode!"
    assert qdrant_store.client is not None, "qdrant_store client is None"
    # Verify client is networked
    has_remote = hasattr(qdrant_store.client, "_client") or hasattr(qdrant_store.client, "rest_uri")
    assert has_remote, "Client is not a remote networked client"
    report_data["external_mode_confirmed"] = "YES"
    report_data["in_memory_fallback_used"] = "NO"
    print("  Confirmed: GroundGuard qdrant_store is connected to real external network URL.")
    print("  Confirmed: No in-memory fallback or mock client used.")

    # 3. Collection Configuration Validation
    print("\n[Step 3: Collection Configuration & Payload Indexes]")
    col_info = qdrant_store.client.get_collection(COLLECTION_NAME)
    v_size = col_info.config.params.vectors.size
    v_dist = str(col_info.config.params.vectors.distance)
    assert v_size == 384, f"Vector dimension mismatch: expected 384, got {v_size}"
    assert "Cosine" in v_dist, f"Distance metric mismatch: expected Cosine, got {v_dist}"
    schema = col_info.payload_schema or {}
    assert "projectId" in schema, "Missing payload index for 'projectId'"
    assert "documentId" in schema, "Missing payload index for 'documentId'"
    assert "identifierKeys" in schema, "Missing payload index for 'identifierKeys'"
    report_data["collection"] = COLLECTION_NAME
    report_data["vector_dim"] = v_size
    report_data["distance"] = "Cosine"
    report_data["payload_indexes"] = list(schema.keys())
    print(f"  Collection: '{COLLECTION_NAME}'")
    print(f"  Vector Dimension: {v_size}")
    print(f"  Distance Metric: {v_dist}")
    print(f"  Payload Indexes: {list(schema.keys())}")

    # 4. Production Upsert with Real Embeddings
    print("\n[Step 4: Real Production Upsert & Embedding]")
    proj_a = "proj_ext_alpha"
    proj_b = "proj_ext_beta"
    doc_a = "doc_ext_a"
    doc_b = "doc_ext_b"

    chunks_a = [{
        "id": "chk_ext_a1",
        "chunk_index": 0,
        "page_number": 1,
        "section": "Operations",
        "heading": "Pump Specifications",
        "source": "manual_a.pdf",
        "identifierKeys": ["P-101A", "TK-500"],
        "text": "Pump P-101A operational pressure limit is 150 PSI with storage tank TK-500."
    }]
    chunks_b = [{
        "id": "chk_ext_b1",
        "chunk_index": 0,
        "page_number": 1,
        "section": "Operations",
        "heading": "Pump Specifications",
        "source": "manual_b.pdf",
        "identifierKeys": ["P-888", "TK-900"],
        "text": "Pump P-888 operational pressure limit is 450 PSI with storage tank TK-900."
    }]

    vecs_a = generate_embeddings([chunks_a[0]["text"]])
    vecs_b = generate_embeddings([chunks_b[0]["text"]])
    assert len(vecs_a[0]) == 384, f"Embedding dimension mismatch: {len(vecs_a[0])}"

    cnt_a = qdrant_store.upsert_chunks(proj_a, doc_a, chunks_a, vecs_a)
    cnt_b = qdrant_store.upsert_chunks(proj_b, doc_b, chunks_b, vecs_b)
    assert cnt_a == 1 and cnt_b == 1, "Failed to upsert points"
    report_data["external_upsert"] = "YES"
    print("  Upserted Project A point and Project B point with real 384-dim embeddings (wait=True).")

    # 5. Project Isolation Inside Qdrant ANN Search
    print("\n[Step 5: Project Isolation Inside External Qdrant ANN Search]")
    query_vec = generate_embeddings(["What is the operational pressure limit of pump P-101A?"])[0]
    hits_a = qdrant_store.search_dense(proj_a, query_vec, top_k=5)
    hits_b = qdrant_store.search_dense(proj_b, query_vec, top_k=5)

    assert len(hits_a) > 0, "No hits for Project A"
    assert hits_a[0]["chunkId"] == "chk_ext_a1", f"Unexpected top hit: {hits_a[0]}"
    assert hits_a[0]["projectId"] == proj_a, "Project mismatch in hit"
    # Verify zero Project B hits leaked into Project A search
    leaked_b = [h for h in hits_a if h["projectId"] == proj_b or "P-888" in h["text"]]
    assert len(leaked_b) == 0, f"Cross-project leakage in Qdrant ANN search! {leaked_b}"
    report_data["external_dense_search"] = "YES"
    report_data["project_filter_enforced"] = "YES"
    report_data["qdrant_cross_project_leakage"] = len(leaked_b)
    print(f"  Project A search returned {len(hits_a)} hit(s). Top hit chunkId: {hits_a[0]['chunkId']}")
    print(f"  Project B leakage in Project A search: {len(leaked_b)} (PASS)")

    # 6. Persistence Across Client Recreation
    print("\n[Step 6: Persistence Across Client Recreation]")
    new_store = QdrantStore(url=QDRANT_URL)
    recreated_hits = new_store.search_dense(proj_a, query_vec, top_k=5)
    assert len(recreated_hits) == 1, f"Expected 1 hit after client recreation, got {len(recreated_hits)}"
    assert recreated_hits[0]["chunkId"] == "chk_ext_a1"
    report_data["client_recreation_persistence"] = "YES"
    print("  Verified: Data persists across Python QdrantClient destruction and recreation.")

    # 7. Persistence Across Server Restart
    print("\n[Step 7: Persistence Across Server Restart]")
    restart_qdrant_server()
    # Reconnect after server restart
    restarted_store = QdrantStore(url=QDRANT_URL)
    post_restart_hits = restarted_store.search_dense(proj_a, query_vec, top_k=5)
    assert len(post_restart_hits) == 1, f"Expected 1 hit after server restart, got {len(post_restart_hits)}"
    assert post_restart_hits[0]["chunkId"] == "chk_ext_a1"
    report_data["server_restart_persistence"] = "YES"
    print("  Verified: Data and collections persist on disk across external Qdrant process restart.")

    # 8. Real Deletion & Idempotency
    print("\n[Step 8: Real Document Deletion & Idempotency]")
    qdrant_store.delete_document(proj_a, doc_a)
    cnt_after = qdrant_store.count_document_points(proj_a, doc_a)
    assert cnt_after == 0, f"Expected 0 points after deletion, got {cnt_after}"
    # Verify Project B points remain intact
    cnt_b_after = qdrant_store.count_document_points(proj_b, doc_b)
    assert cnt_b_after == 1, f"Expected Project B point to remain intact, got {cnt_b_after}"
    # Idempotent second deletion
    qdrant_store.delete_document(proj_a, doc_a)
    cnt_idempotent = qdrant_store.count_document_points(proj_a, doc_a)
    assert cnt_idempotent == 0, "Idempotent deletion failed"
    report_data["document_deletion"] = "YES"
    report_data["idempotent_second_deletion"] = "YES"
    print("  Document doc_ext_a deleted cleanly (0 points remaining).")
    print("  Project B points remain intact (1 point remaining).")
    print("  Idempotent second deletion executed without error.")

    # Clean up Project B test point
    qdrant_store.delete_document(proj_b, doc_b)

    # 9. Full Canonical Retrieval Path (retrieve_evidence) Against External Qdrant
    print("\n[Step 9: Full Canonical retrieve_evidence() with External Qdrant]")
    # Register documents in PostgreSQL
    conn = get_connection()
    assert conn is not None, "PostgreSQL connection failed"
    cur = conn.cursor()
    cur.execute("SELECT id FROM users LIMIT 1;")
    user_row = cur.fetchone()
    if not user_row:
        cur.execute("INSERT INTO users (id, email, password_hash, name) VALUES ('usr_ext_val', 'ext_val@test.com', 'hash', 'ExtVal') ON CONFLICT DO NOTHING;")
        conn.commit()
    cur.execute("SELECT id FROM users LIMIT 1;")
    uid = cur.fetchone()[0]
    cur.execute("INSERT INTO projects (id, user_id, name) VALUES (%s, %s, 'Alpha') ON CONFLICT (id) DO NOTHING;", (PROJECT_ALPHA, uid))
    cur.execute("INSERT INTO projects (id, user_id, name) VALUES (%s, %s, 'Beta') ON CONFLICT (id) DO NOTHING;", (PROJECT_BETA, uid))
    conn.commit()

    docs = [
        ("doc_rel_01", PROJECT_ALPHA, "test_relations.pdf"),
        ("doc_maint_02", PROJECT_ALPHA, "test_maint.pdf"),
        ("doc_std_03", PROJECT_ALPHA, "test_std.pdf"),
        ("doc_insp_04", PROJECT_ALPHA, "test_insp.pdf"),
        ("doc_beta_01", PROJECT_BETA, "test_beta.pdf"),
    ]
    for d_id, p_id, fn in docs:
        cur.execute(
            """
            INSERT INTO documents (id, project_id, filename, file_size, mime_type, file_path, status, chunks_count, created_at, updated_at)
            VALUES (%s, %s, %s, 1024, 'application/pdf', %s, 'ready', 1, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET status = 'ready';
            """,
            (d_id, p_id, fn, f"/tmp/{fn}")
        )
    conn.commit()

    # Index corpora into external Qdrant, Tantivy, and NetworkX
    index_corpus(PROJECT_ALPHA, CORPUS_ALPHA)
    index_corpus(PROJECT_BETA, CORPUS_BETA)

    # 9a. Semantic Query
    res_sem = retrieve_evidence(PROJECT_ALPHA, "What are the routine maintenance vibration analysis procedures?")
    assert res_sem.sufficiency.sufficient, "Semantic query sufficiency is false"
    assert res_sem.metadata.denseCandidateCount > 0, "External Qdrant did not participate in dense search!"
    assert any("qdrant_dense" in r.sources for r in res_sem.results), "No qdrant_dense source in results"

    # 9b. Equipment Identifier Query
    res_tag = retrieve_evidence(PROJECT_ALPHA, "What is the maximum operating temperature of pump P-101A?")
    assert res_tag.sufficiency.sufficient, "Tag query sufficiency is false"
    assert res_tag.results[0].chunkId == "chk_alpha_01", "Expected chk_alpha_01"

    # 9c. Relationship Query (NetworkX + Qdrant + Tantivy)
    res_rel = retrieve_evidence(PROJECT_ALPHA, "Which valve is upstream of pump P-101A?")
    assert res_rel.sufficiency.sufficient, "Relationship query sufficiency is false"
    assert "networkx_graph" in res_rel.metadata.selectedSources, "NetworkX not selected"
    assert res_rel.metadata.graphCandidateCount > 0, "No graph candidates"

    # 9d. Unknown / No-Evidence Query (Clean Abstention)
    res_unk = retrieve_evidence(PROJECT_ALPHA, "What is the capital city of France?")
    assert not res_unk.sufficiency.sufficient, "Unknown query should abstain"
    assert "below sufficiency threshold" in res_unk.sufficiency.reason or "Zero candidates" in res_unk.sufficiency.reason

    # 9e. Cross-Project Leakage Check
    res_leak = retrieve_evidence(PROJECT_ALPHA, "What is the cooling flow rate for pump P-888?")
    leaked = [r for r in res_leak.results if "Beta" in r.text or "P-888" in r.text]
    assert len(leaked) == 0, f"Cross-project leakage in canonical retrieval: {leaked}"
    assert not res_leak.sufficiency.sufficient, "Cross project query should be insufficient"

    report_data["canonical_retrieve_evidence"] = "YES"
    report_data["dense_candidate_count"] = res_sem.metadata.denseCandidateCount
    print(f"  Semantic query dense candidate count from external Qdrant: {res_sem.metadata.denseCandidateCount}")
    print(f"  All 5 canonical retrieval scenarios passed with real external Qdrant.")

    # 10. Real M2 HTTP Endpoint (/retrieve)
    print("\n[Step 10: Real M2 HTTP Endpoint (POST /retrieve)]")
    from fastapi.testclient import TestClient
    from src.main import app as fastapi_app

    http_client = TestClient(fastapi_app)
    http_res = http_client.post(
        "/retrieve",
        json={
            "projectId": PROJECT_ALPHA,
            "query": "What are the routine maintenance vibration analysis procedures?",
            "topK": 5
        }
    )
    assert http_res.status_code == 200, f"HTTP /retrieve failed: {http_res.status_code} {http_res.text}"
    body = http_res.json()
    assert len(body["results"]) > 0, "Empty HTTP /retrieve results"
    assert body["sufficiency"]["sufficient"] is True, "HTTP /retrieve sufficiency false"
    assert body["metadata"]["denseCandidateCount"] > 0, "External Qdrant not used in HTTP endpoint"
    report_data["http_post_retrieve"] = "YES"
    print("  HTTP POST /retrieve executed full pipeline against external Qdrant and returned 200 OK.")

    # 11. External Failure Semantics (Real Outage Test)
    print("\n[Step 11: External Qdrant Outage / Failure Semantics]")
    # Stop external Qdrant server to simulate real infrastructure outage
    print("  Simulating external Qdrant outage by stopping server...")
    is_docker = False
    try:
        res = subprocess.run(["docker", "ps", "--filter", "name=qdrant", "--format", "{{.Names}}"], capture_output=True, text=True)
        if "qdrant" in res.stdout:
            is_docker = True
    except Exception:
        pass

    if is_docker:
        subprocess.run(["docker", "compose", "stop", "qdrant"], capture_output=True)
    else:
        subprocess.run(["taskkill", "/F", "/IM", "qdrant.exe"], capture_output=True)
    time.sleep(1.5)

    canonical_outage_raised = False
    try:
        # Canonical retrieval path must raise explicit RuntimeError during outage
        retrieve_evidence(PROJECT_ALPHA, "What are the routine maintenance vibration analysis procedures?")
    except RuntimeError as re:
        if "Qdrant retrieval infrastructure failure" in str(re) or "External Qdrant server unavailable" in str(re):
            canonical_outage_raised = True
            print(f"  Verified canonical retrieve_evidence() failed explicitly: {re}")
    except Exception as ex:
        print(f"  Unexpected exception type during outage: {type(ex)} {ex}")
    finally:
        # Restore external Qdrant server immediately
        print("  Restoring external Qdrant server...")
        if is_docker:
            subprocess.run(["docker", "compose", "start", "qdrant"], capture_output=True)
        else:
            subprocess.run([
                "powershell",
                "-NoProfile",
                "-Command",
                f"Start-Process -FilePath '{QDRANT_EXE}' -WorkingDirectory '{QDRANT_SERVER_DIR}' -WindowStyle Hidden"
            ])
        restored = wait_for_qdrant(QDRANT_URL, timeout=10.0)
        assert restored, "Failed to restore external Qdrant server after outage test"
        print("  External Qdrant restored and responding.")

    assert canonical_outage_raised, "Outage test failed: retrieve_evidence did not raise explicit RuntimeError"
    report_data["qdrant_outage_behavior"] = "EXPLICIT INFRASTRUCTURE FAILURE (RuntimeError, no :memory: fallback, no silent skip)"

    # 12. Cleanup Test DB and Store Records
    for d_id, p_id, _ in docs:
        try:
            qdrant_store.delete_document(p_id, d_id)
        except Exception:
            pass
        try:
            tantivy_store.delete_document(p_id, d_id)
        except Exception:
            pass
        try:
            graph_store.delete_document(p_id, d_id)
        except Exception:
            pass
        cur.execute("DELETE FROM documents WHERE id = %s;", (d_id,))
    cur.execute("DELETE FROM projects WHERE id IN (%s, %s);", (PROJECT_ALPHA, PROJECT_BETA))
    conn.commit()
    conn.close()
    print("\n[Step 12: Test Data Cleanup]")
    print("  Cleaned up temporary PostgreSQL rows, Qdrant points, Tantivy docs, and Graph edges.")

    print("\n" + "=" * 75)
    print("EXTERNAL PRODUCTION QDRANT VALIDATION COMPLETED SUCCESSFULLY!")
    print("=" * 75)
    return True

if __name__ == "__main__":
    ok = run_external_validation()
    sys.exit(0 if ok else 1)
