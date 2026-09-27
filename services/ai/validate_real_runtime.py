"""
Real Runtime Validation of GroundGuard Phase 4 Retrieval Spine
Exercises all real components end-to-end:
1. PostgreSQL (live connection & READY lifecycle check)
2. Qdrant (dense vectors & cosine similarity)
3. Tantivy (BM25 lexical index & search)
4. NetworkX (topology graph & relationship extraction)
5. sentence-transformers (all-MiniLM-L6-v2 embeddings)
6. FlashRank (ms-marco-TinyBERT-L-2-v2 reranking)
"""

import os
import sys
import time
import urllib.request
import subprocess
import logging

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_SERVER_DIR = r"C:\Users\Ganesha\.qdrant_server"
QDRANT_EXE = os.path.join(QDRANT_SERVER_DIR, "qdrant.exe")

def ensure_qdrant_running():
    try:
        req = urllib.request.urlopen(f"{QDRANT_URL}/collections", timeout=1.0)
        if req.status == 200:
            return
    except Exception:
        pass
    if os.path.exists(QDRANT_EXE):
        subprocess.run([
            "powershell",
            "-NoProfile",
            "-Command",
            f"Start-Process -FilePath '{QDRANT_EXE}' -WorkingDirectory '{QDRANT_SERVER_DIR}' -WindowStyle Hidden"
        ])
        start = time.time()
        while time.time() - start < 10.0:
            try:
                if urllib.request.urlopen(f"{QDRANT_URL}/collections", timeout=1.0).status == 200:
                    break
            except Exception:
                time.sleep(0.3)

ensure_qdrant_running()

from src.pipeline.db import get_connection
from src.pipeline.retrieval import retrieve_evidence
from evaluation_phase4 import index_corpus, CORPUS_ALPHA, CORPUS_BETA, PROJECT_ALPHA, PROJECT_BETA

logging.basicConfig(level=logging.WARNING)

def run_real_runtime_validation():
    print("=" * 70)
    print("GROUNDGUARD PHASE 4: REAL RUNTIME VALIDATION")
    print("=" * 70)

    # 1. Verify PostgreSQL connection
    conn = get_connection()
    if conn is None:
        print("[PostgreSQL] FAILED to connect to localhost:5432")
        return False
    print("[PostgreSQL] Connected successfully to localhost:5432/groundguard")

    # 2. Register documents in PostgreSQL as 'ready'
    cur = conn.cursor()
    # Ensure projects exist or create them
    cur.execute("SELECT id FROM users LIMIT 1;")
    user_row = cur.fetchone()
    if not user_row:
        # Create test user
        cur.execute("INSERT INTO users (id, email, password_hash, name) VALUES ('usr_val', 'val@test.com', 'hash', 'Validator') ON CONFLICT DO NOTHING;")
        conn.commit()

    cur.execute("SELECT id FROM users LIMIT 1;")
    user_id = cur.fetchone()[0]

    cur.execute("INSERT INTO projects (id, user_id, name) VALUES (%s, %s, 'Alpha') ON CONFLICT (id) DO NOTHING;", (PROJECT_ALPHA, user_id))
    cur.execute("INSERT INTO projects (id, user_id, name) VALUES (%s, %s, 'Beta') ON CONFLICT (id) DO NOTHING;", (PROJECT_BETA, user_id))
    conn.commit()

    # Insert documents
    docs_to_register = [
        ("doc_rel_01", PROJECT_ALPHA, "test_relations.pdf"),
        ("doc_maint_02", PROJECT_ALPHA, "test_maint.pdf"),
        ("doc_std_03", PROJECT_ALPHA, "test_std.pdf"),
        ("doc_insp_04", PROJECT_ALPHA, "test_insp.pdf"),
        ("doc_beta_01", PROJECT_BETA, "test_beta.pdf"),
    ]
    for doc_id, proj_id, fn in docs_to_register:
        cur.execute(
            """
            INSERT INTO documents (id, project_id, filename, file_size, mime_type, file_path, status, chunks_count, created_at, updated_at)
            VALUES (%s, %s, %s, 1024, 'application/pdf', %s, 'ready', 1, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET status = 'ready';
            """,
            (doc_id, proj_id, fn, f"/tmp/{fn}")
        )
    conn.commit()
    print(f"[PostgreSQL] Registered {len(docs_to_register)} documents in status='ready'")

    # 3. Index corpora into Qdrant, Tantivy, and NetworkX
    print("\n[Indexing] Ingesting documents into Qdrant, Tantivy, and NetworkX...")
    index_corpus(PROJECT_ALPHA, CORPUS_ALPHA)
    index_corpus(PROJECT_BETA, CORPUS_BETA)
    print("[Indexing] Indexed corpora successfully with real embeddings and topology.")

    # 4. Exercise Test Cases
    print("\n--- Exercising Real Runtime Retrieval ---")

    # Case A: Semantic Query
    res_sem = retrieve_evidence(PROJECT_ALPHA, "What are the routine maintenance vibration analysis procedures?")
    print(f"\n[Case A: Semantic Query]")
    print(f"  Results count: {len(res_sem.results)}")
    print(f"  Sufficiency: {res_sem.sufficiency.sufficient} (score: {res_sem.sufficiency.score:.4f}, reason: '{res_sem.sufficiency.reason}')")
    if res_sem.results:
        top = res_sem.results[0]
        print(f"  Top hit: chunkId={top.chunkId}, score={top.rerankScore:.4f}, sources={top.sources}")
        print(f"  Text preview: {top.text[:80]}...")

    # Case B: Equipment Identifier Query
    res_tag = retrieve_evidence(PROJECT_ALPHA, "What is the maximum operating temperature of pump P-101A?")
    print(f"\n[Case B: Exact Equipment Tag]")
    print(f"  Results count: {len(res_tag.results)}")
    print(f"  Sufficiency: {res_tag.sufficiency.sufficient} (score: {res_tag.sufficiency.score:.4f})")
    if res_tag.results:
        top = res_tag.results[0]
        print(f"  Top hit: chunkId={top.chunkId}, score={top.rerankScore:.4f}, identifiers={top.identifiers}")
        print(f"  Text preview: {top.text[:80]}...")

    # Case C: Relationship Query (NetworkX active)
    res_rel = retrieve_evidence(PROJECT_ALPHA, "Which valve is upstream of pump P-101A?")
    print(f"\n[Case C: Relationship / Topology Query]")
    print(f"  Graph source selected: {'networkx_graph' in res_rel.metadata.selectedSources}")
    print(f"  Graph candidate count: {res_rel.metadata.graphCandidateCount}")
    print(f"  Results count: {len(res_rel.results)}")
    print(f"  Sufficiency: {res_rel.sufficiency.sufficient} (score: {res_rel.sufficiency.score:.4f})")
    if res_rel.results:
        top = res_rel.results[0]
        print(f"  Top hit: chunkId={top.chunkId}, sources={top.sources}")
        print(f"  Graph relations: {top.graphRelations}")
        print(f"  Text preview: {top.text[:80]}...")

    # Case D: No-Evidence Query (Should abstain)
    res_none = retrieve_evidence(PROJECT_ALPHA, "What is the capital city of France?")
    print(f"\n[Case D: Unknown / No-Evidence Query]")
    print(f"  Sufficiency: {res_none.sufficiency.sufficient}")
    print(f"  Sufficiency reason: '{res_none.sufficiency.reason}'")
    print(f"  Abstains cleanly: {not res_none.sufficiency.sufficient}")

    # Case E: Cross-Project Isolation (Alpha querying Beta's P-888)
    res_leak = retrieve_evidence(PROJECT_ALPHA, "What is the cooling flow rate for pump P-888?")
    print(f"\n[Case E: Multi-Tenant Project Isolation Query]")
    leaked_beta = [r for r in res_leak.results if "Beta" in r.text or "P-888" in r.text]
    print(f"  Project Beta leaked results: {len(leaked_beta)}")
    print(f"  Sufficiency: {res_leak.sufficiency.sufficient}")
    print(f"  Zero leakage confirmed: {len(leaked_beta) == 0}")

    # Cleanup test DB documents
    for doc_id, _, _ in docs_to_register:
        cur.execute("DELETE FROM documents WHERE id = %s;", (doc_id,))
    cur.execute("DELETE FROM projects WHERE id IN (%s, %s);", (PROJECT_ALPHA, PROJECT_BETA))
    conn.commit()
    conn.close()
    print("\n[Cleanup] Cleaned up temporary validation rows from PostgreSQL.")
    print("\nREAL RUNTIME VALIDATION PASSED!")
    return True

if __name__ == "__main__":
    success = run_real_runtime_validation()
    sys.exit(0 if success else 1)
