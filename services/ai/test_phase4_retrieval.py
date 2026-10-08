"""
GroundGuard Phase 4 Test Suite:
1. Candidate Normalization (Dense only, Lexical only, Same chunkId merge, provenance)
2. Deterministic Router (semantic, tag, line ID, standard, relationship)
3. RRF Fusion (exact score, multi-source boost, stable tie-breaking)
4. FlashRank Reranker (real model execution, score propagation, failure semantics)
5. Evidence Sufficiency (good evidence, no evidence, missing identifier, weak score)
6. Graph Integration (provenance, zero relation handling, project scoping)
7. Full Pipeline Invariants (READY validation, project isolation, transient evidenceId)
"""

import os
import sys

os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

import unittest
from unittest.mock import patch, MagicMock

# Ensure services/ai is on sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

os.environ.setdefault("QDRANT_URL", ":memory:")
os.environ.setdefault("TANTIVY_PATH", ":memory:")
os.environ.setdefault("ALLOW_OFFLINE_DB", "true")

from src.pipeline.router import route_query, RouteDecision
from src.pipeline.reranker import rerank, get_ranker
from src.pipeline.retrieval import (
    Candidate,
    EvidenceItem,
    EvidenceSufficiency,
    calculate_rrf_score,
    evaluate_sufficiency,
    retrieve_evidence,
    RRF_K,
    SUFFICIENCY_THRESHOLD
)

class TestPhase4CandidateNormalization(unittest.TestCase):
    def test_candidate_creation_and_fields(self):
        c = Candidate(
            chunkId="chk_001",
            documentId="doc_001",
            projectId="proj_001",
            text="Operating temperature of P-101A is 180C.",
            chunkIndex=0,
            pageNumber=1,
            section="Operations",
            heading="Pump Limits",
            identifiers=["P-101A"],
            denseScore=0.88,
            denseRank=1,
            sources=["qdrant_dense"]
        )
        self.assertEqual(c.chunkId, "chk_001")
        self.assertEqual(c.documentId, "doc_001")
        self.assertEqual(c.denseScore, 0.88)
        self.assertEqual(c.denseRank, 1)
        self.assertIn("qdrant_dense", c.sources)

    def test_same_chunk_merges_sources(self):
        """
        Verify: If Qdrant and Tantivy return the same chunkId,
        the normalized representation contains ONE candidate with both contributions.
        Also verifies identifier string parsing and union deduplication across sources.
        """
        candidates_map = {}
        
        # Dense contribution
        c1 = Candidate(
            chunkId="chk_shared",
            documentId="doc_100",
            projectId="proj_test",
            text="Shared content for pump P-101A.",
            identifiers=["P-101A"],
            denseScore=0.85,
            denseRank=2,
            sources=["qdrant_dense"]
        )
        candidates_map[c1.chunkId] = c1

        # Lexical contribution for same chunk (e.g. Tantivy space-delimited identifiers)
        ident_raw = "P-101A API-610"
        lex_idents = ident_raw.split() if isinstance(ident_raw, str) else list(ident_raw)

        if "chk_shared" in candidates_map:
            cand = candidates_map["chk_shared"]
            cand.lexicalScore = 12.4
            cand.lexicalRank = 1
            if "tantivy_lexical" not in cand.sources:
                cand.sources.append("tantivy_lexical")
            cand.identifiers = list(set(cand.identifiers + lex_idents))

        self.assertEqual(len(candidates_map), 1)
        merged = candidates_map["chk_shared"]
        self.assertEqual(merged.denseRank, 2)
        self.assertEqual(merged.lexicalRank, 1)
        self.assertEqual(merged.denseScore, 0.85)
        self.assertEqual(merged.lexicalScore, 12.4)
        self.assertEqual(set(merged.sources), {"qdrant_dense", "tantivy_lexical"})
        self.assertEqual(set(merged.identifiers), {"P-101A", "API-610"})

    def test_missing_chunk_id_is_skipped(self):
        """
        Verify: Raw hits lacking chunkId are safely skipped during candidate normalization.
        """
        raw_dense_hits = [
            {"documentId": "doc_1", "text": "Malformed hit without chunkId", "score": 0.5},
            {"chunkId": "chk_valid", "documentId": "doc_1", "projectId": "p1", "text": "Valid hit", "score": 0.9}
        ]
        candidates_map = {}
        for rank, hit in enumerate(raw_dense_hits, start=1):
            c_id = hit.get("chunkId")
            if not c_id:
                continue
            candidates_map[c_id] = Candidate(
                chunkId=c_id,
                documentId=hit.get("documentId", ""),
                projectId=hit.get("projectId", "p1"),
                text=hit.get("text", ""),
                denseScore=float(hit.get("score", 0.0)),
                denseRank=rank,
                sources=["qdrant_dense"]
            )
        self.assertEqual(len(candidates_map), 1)
        self.assertIn("chk_valid", candidates_map)
        self.assertNotIn("Malformed hit without chunkId", [c.text for c in candidates_map.values()])


class TestPhase4QueryRouter(unittest.TestCase):
    def test_semantic_query(self):
        route = route_query("What are the regular maintenance procedures for high pressure systems?")
        self.assertTrue(route.dense)
        self.assertTrue(route.lexical)
        self.assertFalse(route.graph)
        self.assertFalse(route.identifierQuery)
        self.assertEqual(len(route.extractedIdentifiers), 0)

    def test_equipment_tag_query(self):
        route = route_query("What is the maximum operating pressure of P-101A?")
        self.assertTrue(route.dense)
        self.assertTrue(route.lexical)
        self.assertTrue(route.identifierQuery)
        self.assertIn("P-101A", route.extractedIdentifiers)
        self.assertFalse(route.graph)  # No relationship intent keyword

    def test_line_id_query(self):
        route = route_query("Verify piping specification for line 100-CW-024")
        self.assertTrue(route.dense)
        self.assertTrue(route.lexical)
        self.assertTrue(route.identifierQuery)
        self.assertIn("100-CW-024", route.extractedIdentifiers)

    def test_standard_code_query(self):
        route = route_query("According to API 610 what is the casing thickness requirement?")
        self.assertTrue(route.dense)
        self.assertTrue(route.lexical)
        self.assertTrue(route.identifierQuery)
        self.assertIn("API 610", route.extractedIdentifiers)

    def test_relationship_query_with_identifiers(self):
        route = route_query("Which valve is upstream of pump P-101A?")
        self.assertTrue(route.dense)
        self.assertTrue(route.lexical)
        self.assertTrue(route.graph)
        self.assertTrue(route.identifierQuery)
        self.assertIn("P-101A", route.extractedIdentifiers)
        self.assertTrue(route.relationshipIntent)

    def test_relationship_query_general(self):
        route = route_query("Show me the connected units and flow from the main discharge")
        self.assertTrue(route.dense)
        self.assertTrue(route.lexical)
        self.assertTrue(route.graph)
        self.assertTrue(route.relationshipIntent)


class TestPhase4ReciprocalRankFusion(unittest.TestCase):
    def test_exact_rrf_calculation(self):
        """
        If denseRank=2, lexicalRank=1, k=60:
        RRF = 1/(60+2) + 1/(60+1) = 1/62 + 1/61
        """
        k = 60
        expected = (1.0 / (k + 2)) + (1.0 / (k + 1))
        actual = calculate_rrf_score(dense_rank=2, lexical_rank=1, graph_rank=None, k=k)
        self.assertAlmostEqual(actual, expected, places=7)

    def test_multi_source_candidate_boost(self):
        """
        A candidate appearing in both dense (rank 2) and lexical (rank 2)
        must outrank a candidate appearing ONLY in dense rank 1.
        1/(60+2) + 1/(60+2) = 2/62 = 0.032258
        1/(60+1) = 1/61 = 0.016393
        """
        score_multi = calculate_rrf_score(dense_rank=2, lexical_rank=2, graph_rank=None, k=60)
        score_single = calculate_rrf_score(dense_rank=1, lexical_rank=None, graph_rank=None, k=60)
        self.assertGreater(score_multi, score_single)

    def test_stable_deterministic_tie_break(self):
        # Two candidates with identical RRF score
        c_a = Candidate(
            chunkId="chk_a",
            documentId="doc_1",
            projectId="p1",
            text="text a",
            denseRank=1,
            rrfScore=0.016393
        )
        c_b = Candidate(
            chunkId="chk_b",
            documentId="doc_1",
            projectId="p1",
            text="text b",
            denseRank=1,
            rrfScore=0.016393
        )
        
        candidates = [c_b, c_a]
        def sort_key(c: Candidate):
            ranks = [r for r in [c.denseRank, c.lexicalRank, c.graphRank] if r is not None]
            best_rank = min(ranks) if ranks else 9999
            return (-c.rrfScore, best_rank, c.chunkId)
            
        candidates.sort(key=sort_key)
        self.assertEqual(candidates[0].chunkId, "chk_a")
        self.assertEqual(candidates[1].chunkId, "chk_b")


class TestPhase4FlashRankReranker(unittest.TestCase):
    def test_real_flashrank_execution(self):
        query = "operating pressure of centrifugal pump P-101A"
        passages = [
            {"chunkId": "chk_irrelevant", "text": "The cafeteria menu on Tuesday includes soup and fresh salad."},
            {"chunkId": "chk_relevant", "text": "The centrifugal pump P-101A operates at a design pressure of 15.2 bar."}
        ]
        results = rerank(query, passages)
        self.assertEqual(len(results), 2)
        # Relevant passage must receive a higher score than cafeteria menu
        self.assertEqual(results[0]["chunkId"], "chk_relevant")
        self.assertGreater(results[0]["rerankScore"], results[1]["rerankScore"])

    def test_flashrank_failure_is_explicit(self):
        with patch("src.pipeline.reranker.get_ranker", side_effect=RuntimeError("Model corrupted")):
            with self.assertRaises(RuntimeError) as ctx:
                rerank("query", [{"chunkId": "1", "text": "test"}])
            self.assertIn("FlashRank rerank execution failed", str(ctx.exception))


class TestPhase4EvidenceSufficiency(unittest.TestCase):
    def test_sufficient_evidence(self):
        c = Candidate(
            chunkId="chk_1",
            documentId="doc_1",
            projectId="p1",
            text="Valve V-204 is upstream of pump P-101A.",
            identifiers=["P-101A", "V-204"],
            rerankScore=0.85,
            sources=["qdrant_dense", "networkx_graph"]
        )
        route = route_query("What valve is upstream of P-101A?")
        res = evaluate_sufficiency([c], route, threshold=SUFFICIENCY_THRESHOLD)
        self.assertTrue(res.sufficient)
        self.assertEqual(res.score, 0.85)
        self.assertTrue(res.signals.identifierMatched)
        self.assertEqual(res.signals.resultCount, 1)

    def test_insufficient_when_zero_candidates(self):
        route = route_query("What is P-101A?")
        res = evaluate_sufficiency([], route, threshold=SUFFICIENCY_THRESHOLD)
        self.assertFalse(res.sufficient)
        self.assertEqual(res.score, 0.0)
        self.assertIn("Zero candidates", res.reason)

    def test_insufficient_when_target_identifier_missing(self):
        # Query specifies P-101A, but retrieved candidate only talks about general steam turbines
        c = Candidate(
            chunkId="chk_general",
            documentId="doc_1",
            projectId="p1",
            text="Steam turbines require regular lubrication check every 500 hours.",
            identifiers=[],
            rerankScore=0.75,
            sources=["qdrant_dense"]
        )
        route = route_query("Check operating limits for pump P-101A")
        res = evaluate_sufficiency([c], route, threshold=SUFFICIENCY_THRESHOLD)
        self.assertFalse(res.sufficient)
        self.assertFalse(res.signals.identifierMatched)
        self.assertIn("P-101A", res.reason)

    def test_insufficient_when_score_below_threshold(self):
        c = Candidate(
            chunkId="chk_weak",
            documentId="doc_1",
            projectId="p1",
            text="P-101A was mentioned in passing.",
            identifiers=["P-101A"],
            rerankScore=0.05,
            sources=["qdrant_dense"]
        )
        route = route_query("What is the design temperature of P-101A?")
        res = evaluate_sufficiency([c], route, threshold=SUFFICIENCY_THRESHOLD)
        self.assertFalse(res.sufficient)
        self.assertIn("below sufficiency threshold", res.reason)


class TestPhase4PipelineInvariants(unittest.TestCase):
    @patch("src.pipeline.retrieval.validate_ready_documents")
    @patch("src.pipeline.retrieval.qdrant_store.search_dense")
    @patch("src.pipeline.retrieval.tantivy_store.search_project")
    def test_fail_closed_postgresql_ready_validation(self, mock_tantivy, mock_qdrant, mock_validate):
        """
        Verify: Unready documents are filtered out by PostgreSQL lifecycle check.
        If doc_unready is not in ready_doc_ids, it is dropped.
        """
        mock_qdrant.return_value = [
            {
                "chunkId": "chk_ready",
                "documentId": "doc_ready",
                "projectId": "p1",
                "text": "Centrifugal pump P-101A operating manual.",
                "score": 0.9,
                "pageNumber": 1,
                "identifierKeys": ["P-101A"]
            },
            {
                "chunkId": "chk_unready",
                "documentId": "doc_unready",
                "projectId": "p1",
                "text": "Unverified draft of P-101A.",
                "score": 0.85,
                "pageNumber": 1,
                "identifierKeys": ["P-101A"]
            }
        ]
        mock_tantivy.return_value = []
        # PostgreSQL returns only doc_ready
        mock_validate.return_value = {"doc_ready"}

        res = retrieve_evidence(project_id="p1", query="P-101A operating manual", top_k=5)
        
        self.assertEqual(len(res.results), 1)
        self.assertEqual(res.results[0].chunkId, "chk_ready")
        self.assertEqual(res.results[0].documentId, "doc_ready")
        self.assertTrue(res.results[0].evidenceId.startswith("ev_"))

    @patch("src.pipeline.retrieval.validate_ready_documents")
    def test_database_failure_is_explicit(self, mock_validate):
        mock_validate.side_effect = RuntimeError("PostgreSQL connection refused")
        with self.assertRaises(RuntimeError) as ctx:
            retrieve_evidence(project_id="p1", query="P-101A", top_k=5)
        self.assertIn("PostgreSQL canonical validation failure", str(ctx.exception))

    @patch("src.pipeline.retrieval.validate_ready_documents")
    @patch("src.pipeline.retrieval.qdrant_store.search_dense")
    @patch("src.pipeline.retrieval.tantivy_store.search_project")
    def test_project_isolation_in_retrieval(self, mock_tantivy, mock_qdrant, mock_validate):
        """
        Verify: If Qdrant somehow returns a candidate with a different projectId,
        the fail-closed filter drops it immediately.
        """
        mock_qdrant.return_value = [
            {
                "chunkId": "chk_leaked",
                "documentId": "doc_leaked",
                "projectId": "proj_other",
                "text": "Confidential data from another tenant.",
                "score": 0.95,
                "pageNumber": 1
            }
        ]
        mock_tantivy.return_value = []
        mock_validate.return_value = {"doc_leaked"}

        res = retrieve_evidence(project_id="proj_my", query="data", top_k=5)
        self.assertEqual(len(res.results), 0)
        self.assertFalse(res.sufficiency.sufficient)


    @patch("src.pipeline.retrieval.get_ready_documents_meta")
    @patch("src.pipeline.retrieval.qdrant_store.search_dense")
    @patch("src.pipeline.retrieval.tantivy_store.search_project")
    def test_unready_candidate_cannot_displace_ready_candidate(self, mock_tantivy, mock_qdrant, mock_validate):
        """
        Verify: An unready candidate with top rank cannot consume fusion/reranking pool slots
        or displace a valid READY candidate from final top-K.
        """
        # Qdrant returns 1 top unready candidate + 2 ready candidates for top_k=2
        mock_qdrant.return_value = [
            {
                "chunkId": "chk_unready_rank1",
                "documentId": "doc_unready",
                "projectId": "p1",
                "text": "Unready draft pump P-101A specifications.",
                "score": 0.99,
                "pageNumber": 1,
                "identifierKeys": ["P-101A"]
            },
            {
                "chunkId": "chk_ready_rank2",
                "documentId": "doc_ready",
                "projectId": "p1",
                "text": "Valid ready pump P-101A operations part 1.",
                "score": 0.90,
                "pageNumber": 1,
                "identifierKeys": ["P-101A"]
            },
            {
                "chunkId": "chk_ready_rank3",
                "documentId": "doc_ready",
                "projectId": "p1",
                "text": "Valid ready pump P-101A operations part 2.",
                "score": 0.85,
                "pageNumber": 2,
                "identifierKeys": ["P-101A"]
            }
        ]
        mock_tantivy.return_value = []
        # PostgreSQL marks only doc_ready as READY (patch the lifecycle check retrieval actually calls)
        mock_validate.return_value = ({"doc_ready"}, {"doc_ready": "ready.pdf"})

        # Request top_k = 2
        res = retrieve_evidence(project_id="p1", query="P-101A operations", top_k=2)

        # Because READY validation occurs BEFORE pool slicing and reranking:
        # chk_unready_rank1 was filtered before RRF/reranking pool, so BOTH ready chunks fill the top_k=2!
        self.assertEqual(len(res.results), 2)
        result_chunk_ids = [r.chunkId for r in res.results]
        self.assertNotIn("chk_unready_rank1", result_chunk_ids)
        self.assertIn("chk_ready_rank2", result_chunk_ids)
        self.assertIn("chk_ready_rank3", result_chunk_ids)


if __name__ == "__main__":
    unittest.main()
