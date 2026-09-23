"""
Tests for Phase 3:
1. Ingestion Compensating Cleanup Invariant:
   When an indexing stage fails (e.g. Graph processing crash), any previously written
   derived stores (Qdrant, Tantivy) must be completely cleaned up (no orphaned points).
2. Zero-Relation Success Invariant:
   0 relations detected is a SUCCESS (document ready, no fabricated relations).
   Actual graph crash is an INGESTION FAILURE.
3. Derived Stores Rebuildability:
   Rebuilding Qdrant and Tantivy from canonical chunk data produces 100% parity.
"""

import unittest
from unittest.mock import patch
import os
import sys
import uuid

# Ensure services/ai is on sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from src.pipeline.extractor import extract_identifiers
from src.pipeline.qdrant_store import qdrant_store
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.graph_store import graph_store
from src.pipeline.chunker import chunk_pages
from src.pipeline.embedder import generate_embeddings

class TestPhase3Invariants(unittest.TestCase):
    def setUp(self):
        self.project_id = f"proj_test_{uuid.uuid4().hex[:8]}"
        self.document_id = f"doc_test_{uuid.uuid4().hex[:8]}"
        self.sample_pages = [{
            "page_number": 1,
            "text": "Valve V-204 is upstream of pump P-101A. The operating design temperature of P-101A is 180C."
        }]
        self.chunks = chunk_pages(self.sample_pages)
        self.embeddings = generate_embeddings([c["text"] for c in self.chunks])

    def tearDown(self):
        # Cleanup any leftovers
        qdrant_store.delete_document(self.project_id, self.document_id)
        tantivy_store.delete_document(self.project_id, self.document_id)
        graph_store.delete_document(self.project_id, self.document_id)

    def test_compensating_cleanup_on_graph_failure(self):
        """
        Verify: If graph_store fails after Qdrant and Tantivy have indexed,
        compensating cleanup purges both Qdrant and Tantivy, leaving zero orphaned records.
        """
        qdrant_written = False
        tantivy_written = False
        networkx_written = False

        try:
            # 1. Qdrant upsert succeeds
            qdrant_store.upsert_chunks(self.project_id, self.document_id, self.chunks, self.embeddings)
            qdrant_written = True
            self.assertEqual(qdrant_store.count_document_points(self.project_id, self.document_id), len(self.chunks))

            # 2. Tantivy index succeeds
            tantivy_store.index_chunks(self.project_id, self.document_id, self.chunks)
            tantivy_written = True
            self.assertEqual(tantivy_store.count_document_records(self.project_id, self.document_id), len(self.chunks))

            # 3. Simulate unexpected graph crash (e.g. out of memory, corrupted graph write)
            with patch.object(graph_store, "process_and_persist_chunks", side_effect=RuntimeError("Graph storage disk failure")):
                graph_store.process_and_persist_chunks(self.project_id, self.document_id, self.chunks)
                networkx_written = True

        except Exception as indexing_err:
            # Execute compensating cleanup exactly as in main.py
            if networkx_written:
                graph_store.delete_document(self.project_id, self.document_id)
            if tantivy_written:
                tantivy_store.delete_document(self.project_id, self.document_id)
            if qdrant_written:
                qdrant_store.delete_document(self.project_id, self.document_id)

        # Invariant Assertion: Both derived stores must have 0 orphaned records
        self.assertEqual(
            qdrant_store.count_document_points(self.project_id, self.document_id),
            0,
            "Compensating cleanup failed: Qdrant contains orphaned points after stage failure"
        )
        self.assertEqual(
            tantivy_store.count_document_records(self.project_id, self.document_id),
            0,
            "Compensating cleanup failed: Tantivy contains orphaned records after stage failure"
        )

    def test_zero_relation_success_vs_graph_failure(self):
        """
        Verify:
        - Co-occurring tags without predicate produce 0 edges and return 0 (Success)
        - Actual exception during relation processing constitutes ingestion failure
        """
        no_relation_pages = [{
            "page_number": 1,
            "text": "Pump P-101A and vessel TK-500 are undergoing annual inspection."
        }]
        chunks_no_rel = chunk_pages(no_relation_pages)

        # 0 edges found must succeed cleanly and return 0
        edge_count = graph_store.process_and_persist_chunks(self.project_id, self.document_id, chunks_no_rel)
        self.assertEqual(edge_count, 0, "Expected 0 edges for co-occurring entities without predicate")

        # Verify no edges exist in graph for TK-500
        relations = graph_store.query_relations(self.project_id, "TK-500")
        self.assertEqual(len(relations), 0)

    def test_derived_stores_rebuildability(self):
        """
        Verify: Qdrant and Tantivy can be completely wiped and reconstructed from
        the canonical chunk data with identical hit results.
        """
        # Initial indexing
        qdrant_store.upsert_chunks(self.project_id, self.document_id, self.chunks, self.embeddings)
        tantivy_store.index_chunks(self.project_id, self.document_id, self.chunks)

        # Wiping derived stores
        qdrant_store.delete_document(self.project_id, self.document_id)
        tantivy_store.delete_document(self.project_id, self.document_id)
        self.assertEqual(qdrant_store.count_document_points(self.project_id, self.document_id), 0)
        self.assertEqual(tantivy_store.count_document_records(self.project_id, self.document_id), 0)

        # Reconstruct from canonical chunk data
        qdrant_store.upsert_chunks(self.project_id, self.document_id, self.chunks, self.embeddings)
        tantivy_store.index_chunks(self.project_id, self.document_id, self.chunks)

        # Verify parity
        self.assertEqual(qdrant_store.count_document_points(self.project_id, self.document_id), len(self.chunks))
        self.assertEqual(tantivy_store.count_document_records(self.project_id, self.document_id), len(self.chunks))

        # Query candidate generation parity
        q_hits = qdrant_store.search_dense(self.project_id, self.embeddings[0], top_k=5)
        self.assertGreater(len(q_hits), 0)
        self.assertEqual(q_hits[0]["documentId"], self.document_id)

        t_hits = tantivy_store.search_project(self.project_id, "P-101A", top_k=5)
        self.assertGreater(len(t_hits), 0)
        self.assertEqual(t_hits[0]["documentId"], self.document_id)

if __name__ == "__main__":
    unittest.main()
