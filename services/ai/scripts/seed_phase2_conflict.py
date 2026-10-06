import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scripts.universal_generalization_eval import make_multipage_pdf, setup_evaluation_project
from src.pipeline.parser import parse_pdf
from src.pipeline.chunker import chunk_pages
from src.pipeline.embedder import generate_embeddings
from src.pipeline.qdrant_store import qdrant_store
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.graph_store import graph_store
from src.pipeline.db import get_connection

CONFLICT_DOCS = {
    "doc_conflict_sensor_a": {
        "filename": "Sensor_Spec_A.pdf",
        "text": "Model PT-301 pressure transmitter requires a 24V DC regulated supply."
    },
    "doc_conflict_sensor_b": {
        "filename": "Sensor_Spec_B.pdf",
        "text": "Model PT-301 pressure transmitter requires a 12V DC regulated supply."
    },
    "doc_conflict_valve_a": {
        "filename": "Valve_Layout_A.pdf",
        "text": "Emergency shutoff valve V-204 is upstream of primary feed pump P-101A."
    },
    "doc_conflict_valve_b": {
        "filename": "Valve_Layout_B.pdf",
        "text": "Emergency shutoff valve V-204 is downstream of primary feed pump P-101A."
    },
    "doc_conflict_breaker_a": {
        "filename": "Breaker_SOP_A.pdf",
        "text": "Main breaker BRK-400 is maintained open during standard operations."
    },
    "doc_conflict_breaker_b": {
        "filename": "Breaker_SOP_B.pdf",
        "text": "Main breaker BRK-400 is maintained closed during standard operations."
    },
    "doc_conflict_purge_a": {
        "filename": "Purge_Guide_A.pdf",
        "text": "The chemical purge cycle requires manual operator isolation before initiation."
    },
    "doc_conflict_purge_b": {
        "filename": "Purge_Guide_B.pdf",
        "text": "The chemical purge cycle uses automatic isolation; manual operator intervention is not required."
    },
    "doc_conflict_ppe_a": {
        "filename": "Safety_Standard_A.pdf",
        "text": "Maintenance personnel must wear full face shields inside the chamber."
    },
    "doc_conflict_ppe_b": {
        "filename": "Safety_Standard_B.pdf",
        "text": "Maintenance personnel shall not wear face shields inside the chamber due to optical fogging risks."
    },
    "doc_conflict_temp_a": {
        "filename": "Compressor_Limits_A.pdf",
        "text": "The maximum allowable casing temperature for Compressor C-10 is 70°C."
    },
    "doc_conflict_temp_b": {
        "filename": "Compressor_Limits_B.pdf",
        "text": "The maximum allowable casing temperature for Compressor C-10 is 95°C."
    },
    "doc_conflict_flow_a": {
        "filename": "Exchanger_Specs_A.pdf",
        "text": "Nominal cooling water flow rate through Exchanger E-102 is 50 m3/h."
    },
    "doc_conflict_flow_b": {
        "filename": "Exchanger_Specs_B.pdf",
        "text": "Nominal cooling water flow rate through Exchanger E-102 is 85 m3/h."
    },
    "doc_conflict_relay_a": {
        "filename": "Relay_Standby_A.pdf",
        "text": "Safety relay K-12 is energized during standby mode."
    },
    "doc_conflict_relay_b": {
        "filename": "Relay_Standby_B.pdf",
        "text": "Safety relay K-12 is de-energized during standby mode."
    },
    "doc_conflict_log_a": {
        "filename": "Control_Room_SOP_A.pdf",
        "text": "Hourly manual log entry by the control operator is strictly required."
    },
    "doc_conflict_log_b": {
        "filename": "Control_Room_SOP_B.pdf",
        "text": "Operator intervention is not required; manual logging by the control operator is forbidden."
    },
    "doc_spec_v1": {
        "filename": "Device_D9_RevA.pdf",
        "text": "Revision A specification: Device D-9 uses port 8080 for control network communication."
    },
    "doc_spec_v2": {
        "filename": "Device_D9_RevB.pdf",
        "text": "Revision B specification: Device D-9 uses port 8443 for control network communication."
    }
}

def seed_conflicts(proj_id: str = "proj_phase2_conflict"):
    print(f"Seeding conflict project: {proj_id}...")
    setup_evaluation_project(proj_id)
    conn = get_connection()

    for doc_id, meta in CONFLICT_DOCS.items():
        pdf_bytes = make_multipage_pdf([meta["text"]])
        pages_data = parse_pdf(pdf_bytes)
        chunks = chunk_pages(pages_data)
        texts = [c["text"] for c in chunks]
        embeddings = generate_embeddings(texts)

        qdrant_store.upsert_chunks(proj_id, doc_id, chunks, embeddings)
        tantivy_store.index_chunks(proj_id, doc_id, chunks)
        graph_store.process_and_persist_chunks(proj_id, doc_id, chunks)

        if conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO documents (id, project_id, filename, file_size, mime_type, file_path, status, chunks_count, created_at, updated_at)
                VALUES (%s, %s, %s, %s, 'application/pdf', %s, 'ready', %s, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE SET status = 'ready', chunks_count = %s, project_id = %s;
            """, (doc_id, proj_id, meta["filename"], len(pdf_bytes), f"/uploads/{meta['filename']}", len(chunks), len(chunks), proj_id))
            conn.commit()

    print(f"Successfully seeded {len(CONFLICT_DOCS)} conflict documents into {proj_id}.")

if __name__ == "__main__":
    seed_conflicts()
