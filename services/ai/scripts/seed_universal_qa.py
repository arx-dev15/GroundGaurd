import os
import sys
import io

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scripts.universal_generalization_eval import DOCUMENTS, make_multipage_pdf, setup_evaluation_project
from src.pipeline.parser import parse_pdf
from src.pipeline.chunker import chunk_pages
from src.pipeline.embedder import generate_embeddings
from src.pipeline.qdrant_store import qdrant_store
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.graph_store import graph_store
from src.pipeline.db import get_connection

def seed_project(project_id: str = "proj_universal_qa"):
    print(f"Seeding project: {project_id}...")
    setup_evaluation_project(project_id)
    conn = get_connection()
    
    total_docs = len(DOCUMENTS)
    total_chunks = 0
    
    for idx, (doc_id, doc_meta) in enumerate(DOCUMENTS.items(), start=1):
        pages_text = [p["text"] for p in doc_meta["pages"]]
        pdf_bytes = make_multipage_pdf(pages_text)
        
        pages_data = parse_pdf(pdf_bytes)
        chunks = chunk_pages(pages_data)
        texts = [c["text"] for c in chunks]
        embeddings = generate_embeddings(texts)
        
        qdrant_store.upsert_chunks(
            project_id=project_id,
            document_id=doc_id,
            chunks=chunks,
            embeddings=embeddings
        )
        
        tantivy_store.index_chunks(
            project_id=project_id,
            document_id=doc_id,
            chunks=chunks
        )
        
        graph_store.process_and_persist_chunks(
            project_id=project_id,
            document_id=doc_id,
            chunks=chunks
        )
        
        if conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO documents (id, project_id, filename, file_size, mime_type, file_path, status, chunks_count, created_at, updated_at)
                VALUES (%s, %s, %s, %s, 'application/pdf', %s, 'ready', %s, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE SET status = 'ready', chunks_count = %s, project_id = %s;
                """,
                (doc_id, project_id, doc_meta["filename"], len(pdf_bytes), f"/uploads/{doc_meta['filename']}", len(chunks), len(chunks), project_id)
            )
            conn.commit()
            cur.close()
            
        total_chunks += len(chunks)
        print(f"  [{idx}/{total_docs}] Ingested {doc_id}: {len(chunks)} chunks")
        
    if conn:
        conn.close()
        
    print(f"Successfully seeded {total_docs} documents ({total_chunks} chunks) into {project_id}!")

if __name__ == "__main__":
    seed_project("proj_universal_qa")
