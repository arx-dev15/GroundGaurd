import os
import time
import uuid
import logging
from typing import List, Dict, Any, Optional, Set
from pydantic import BaseModel, Field

from src.pipeline.embedder import generate_embeddings
from src.pipeline.qdrant_store import qdrant_store
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.graph_store import graph_store
from src.pipeline.db import validate_ready_documents
from src.pipeline.router import route_query, RouteDecision
from src.pipeline.reranker import rerank

logger = logging.getLogger("m2-retrieval")

# Bounded retrieval configuration
DENSE_CANDIDATE_K = int(os.getenv("DENSE_CANDIDATE_K", "15"))
LEXICAL_CANDIDATE_K = int(os.getenv("LEXICAL_CANDIDATE_K", "15"))
GRAPH_CANDIDATE_K = int(os.getenv("GRAPH_CANDIDATE_K", "10"))
RRF_POOL_K = int(os.getenv("RRF_POOL_K", "20"))
RERANK_CANDIDATE_K = int(os.getenv("RERANK_CANDIDATE_K", "20"))
FINAL_TOP_K = int(os.getenv("FINAL_TOP_K", "5"))

# Reciprocal Rank Fusion constant
RRF_K = int(os.getenv("RRF_K", "60"))

# Deterministic evidence sufficiency score threshold (S >= 0.35 per enterprise workflow)
SUFFICIENCY_THRESHOLD = float(os.getenv("SUFFICIENCY_THRESHOLD", "0.35"))


# Internal Canonical Candidate Representation
class Candidate(BaseModel):
    """
    Internal unified retrieval candidate representation.
    Normalized across Qdrant, Tantivy, and NetworkX.
    Preserves raw scores, source ranks, and provenance.
    """
    chunkId: str
    documentId: str
    projectId: str
    text: str
    chunkIndex: Optional[int] = 0
    pageNumber: Optional[int] = 1
    section: Optional[str] = None
    heading: Optional[str] = None
    identifiers: List[str] = Field(default_factory=list)

    denseScore: Optional[float] = None
    lexicalScore: Optional[float] = None
    graphScore: Optional[float] = None

    denseRank: Optional[int] = None
    lexicalRank: Optional[int] = None
    graphRank: Optional[int] = None

    sources: List[str] = Field(default_factory=list)
    graphRelations: Optional[List[Dict[str, Any]]] = None

    rrfScore: Optional[float] = None
    rerankScore: Optional[float] = None
    provenance: Optional[Dict[str, Any]] = None


# Evidence Sufficiency Signals & Decision
class EvidenceSufficiencySignals(BaseModel):
    resultCount: int
    topRerankScore: float
    identifierMatched: bool
    sourceCoverage: List[str]


class EvidenceSufficiency(BaseModel):
    sufficient: bool
    reason: str
    score: float
    signals: EvidenceSufficiencySignals


# Response Item & Envelope
class EvidenceItem(BaseModel):
    """
    Final evidence item returned from retrieval.
    Note on evidenceId: This is a transient retrieval-session identifier (e.g. 'ev_xxxx')
    used for response tracking in the current request. It is NOT a persisted database
    claim record ID. Stable canonical lineage is maintained via chunkId and documentId.
    """
    evidenceId: str
    chunkId: str
    documentId: Optional[str] = None
    text: str
    pageNumber: Optional[int] = 1
    section: Optional[str] = None
    heading: Optional[str] = None
    identifiers: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)
    rrfScore: Optional[float] = None
    rerankScore: Optional[float] = None
    score: Optional[float] = None  # Aligns with existing contracts (maps to rerankScore)
    graphRelations: Optional[List[Dict[str, Any]]] = None
    metadata: Optional[Dict[str, Any]] = None


class RetrieveMetadata(BaseModel):
    selectedSources: List[str]
    denseCandidateCount: int
    lexicalCandidateCount: int
    graphCandidateCount: int
    fusedCandidateCount: int
    rerankedCandidateCount: int
    finalCandidateCount: int
    latencyMs: float
    routeDecision: RouteDecision


class RetrieveResponse(BaseModel):
    results: List[EvidenceItem] = Field(default_factory=list)
    sufficiency: EvidenceSufficiency
    metadata: RetrieveMetadata


def calculate_rrf_score(
    dense_rank: Optional[int],
    lexical_rank: Optional[int],
    graph_rank: Optional[int],
    k: int = RRF_K
) -> float:
    """
    Calculates Reciprocal Rank Fusion (RRF) score:
    RRF = sum(1 / (k + rank)) for each contributing source.
    Ranks are 1-indexed.
    """
    score = 0.0
    if dense_rank is not None and dense_rank > 0:
        score += 1.0 / (k + dense_rank)
    if lexical_rank is not None and lexical_rank > 0:
        score += 1.0 / (k + lexical_rank)
    if graph_rank is not None and graph_rank > 0:
        score += 1.0 / (k + graph_rank)
    return score


def evaluate_sufficiency(
    candidates: List[Candidate],
    route: RouteDecision,
    threshold: float = SUFFICIENCY_THRESHOLD
) -> EvidenceSufficiency:
    """
    Deterministic evidence sufficiency evaluation without LLM.
    Evaluates result count, rerank score relevance, and identifier coverage.
    """
    if not candidates:
        return EvidenceSufficiency(
            sufficient=False,
            reason="Zero candidates retrieved",
            score=0.0,
            signals=EvidenceSufficiencySignals(
                resultCount=0,
                topRerankScore=0.0,
                identifierMatched=False,
                sourceCoverage=[]
            )
        )

    top_candidate = candidates[0]
    top_score = top_candidate.rerankScore if top_candidate.rerankScore is not None else 0.0

    # Aggregate source coverage across candidates
    all_sources = sorted(list(set(src for c in candidates for src in c.sources)))

    # Identifier validation: If query targeted specific identifier(s), verify match
    identifier_matched = True
    if route.identifierQuery and route.extractedIdentifiers:
        identifier_matched = False
        for ident in route.extractedIdentifiers:
            norm_ident = ident.upper()
            for cand in candidates:
                cand_idents = [i.upper() for i in cand.identifiers]
                if norm_ident in cand_idents or norm_ident in cand.text.upper():
                    identifier_matched = True
                    break
            if identifier_matched:
                break

    if not identifier_matched and route.identifierQuery:
        return EvidenceSufficiency(
            sufficient=False,
            reason=f"Target identifier '{route.extractedIdentifiers[0]}' not supported by retrieved evidence",
            score=top_score,
            signals=EvidenceSufficiencySignals(
                resultCount=len(candidates),
                topRerankScore=top_score,
                identifierMatched=False,
                sourceCoverage=all_sources
            )
        )

    if top_score < threshold:
        return EvidenceSufficiency(
            sufficient=False,
            reason=f"Top evidence score ({top_score:.4f}) below sufficiency threshold ({threshold:.4f})",
            score=top_score,
            signals=EvidenceSufficiencySignals(
                resultCount=len(candidates),
                topRerankScore=top_score,
                identifierMatched=identifier_matched,
                sourceCoverage=all_sources
            )
        )

    return EvidenceSufficiency(
        sufficient=True,
        reason="Evidence sufficient for generation",
        score=top_score,
        signals=EvidenceSufficiencySignals(
            resultCount=len(candidates),
            topRerankScore=top_score,
            identifierMatched=identifier_matched,
            sourceCoverage=all_sources
        )
    )


def retrieve_evidence(
    project_id: str,
    query: str,
    top_k: int = FINAL_TOP_K,
    request_id: Optional[str] = None
) -> RetrieveResponse:
    """
    Canonical M2 Retrieval Pipeline:
    1. Query Analysis & Deterministic Routing
    2. Parallel / Multi-Store Query Execution (Qdrant Dense, Tantivy Lexical, NetworkX Graph)
    3. Candidate Normalization (exact chunkId deduplication & multi-source merging)
    4. Reciprocal Rank Fusion (RRF with configurable k=60)
    5. Bounded Candidate Pool Selection
    6. Real FlashRank Cross-Encoder Reranking
    7. PostgreSQL Canonical Lifecycle Validation (READY status & project isolation)
    8. Deterministic Evidence Sufficiency Gate
    """
    start_time = time.perf_counter()
    req_id = request_id or f"req_{uuid.uuid4().hex[:12]}"
    bounded_top_k = min(max(1, top_k), RERANK_CANDIDATE_K)

    # 1. Deterministic Query Routing
    route = route_query(query)
    selected_sources = []
    if route.dense:
        selected_sources.append("qdrant_dense")
    if route.lexical:
        selected_sources.append("tantivy_lexical")
    if route.graph:
        selected_sources.append("networkx_graph")

    # 2. Multi-Source Candidate Retrieval
    raw_dense_hits: List[Dict[str, Any]] = []
    raw_lexical_hits: List[Dict[str, Any]] = []
    raw_graph_hits: List[Dict[str, Any]] = []

    # 2a. Qdrant Dense Retrieval
    if route.dense:
        try:
            query_vector = generate_embeddings([query])[0] if query else []
            raw_dense_hits = qdrant_store.search_dense(
                project_id=project_id,
                query_vector=query_vector,
                top_k=DENSE_CANDIDATE_K
            )
        except Exception as e:
            logger.error(f"Dense retrieval failed on Qdrant: {e}")
            raise RuntimeError(f"Qdrant retrieval infrastructure failure: {e}") from e

    # 2b. Tantivy Lexical Retrieval
    if route.lexical:
        try:
            raw_lexical_hits = tantivy_store.search_project(
                project_id=project_id,
                query=query,
                top_k=LEXICAL_CANDIDATE_K
            )
        except Exception as e:
            logger.error(f"Lexical retrieval failed on Tantivy: {e}")
            raise RuntimeError(f"Tantivy retrieval infrastructure failure: {e}") from e

    # 2c. NetworkX Graph Retrieval (conditionally activated for topology/relations)
    if route.graph:
        try:
            graph_tokens = list(route.extractedIdentifiers)
            if not graph_tokens:
                # Fallback to alphanumeric words in query
                words = [w.strip().upper() for w in query.split() if len(w) > 2]
                graph_tokens = words[:3]

            seen_edges = set()
            for token in graph_tokens:
                relations = graph_store.query_relations(project_id, token)
                for rel in relations:
                    prov = rel.get("provenance", {})
                    edge_key = (rel.get("source"), rel.get("target"), prov.get("chunkId"))
                    if edge_key not in seen_edges and prov.get("chunkId"):
                        seen_edges.add(edge_key)
                        raw_graph_hits.append({
                            "chunkId": prov.get("chunkId"),
                            "documentId": prov.get("documentId"),
                            "projectId": project_id,
                            "pageNumber": prov.get("pageNumber", 1),
                            "text": prov.get("sourceText", f"{rel.get('source')} {rel.get('relation')} {rel.get('target')}"),
                            "graphRelations": [rel],
                            "score": 1.0
                        })
                        if len(raw_graph_hits) >= GRAPH_CANDIDATE_K:
                            break
                if len(raw_graph_hits) >= GRAPH_CANDIDATE_K:
                    break
        except Exception as e:
            logger.error(f"Graph retrieval failed on NetworkX: {e}")
            raise RuntimeError(f"NetworkX retrieval infrastructure failure: {e}") from e

    # 3. Candidate Normalization & Multi-Source Merge
    # Invariant: If Qdrant and Tantivy both return chunkId = chk_123, exactly ONE candidate is stored with both contributions.
    candidates_map: Dict[str, Candidate] = {}

    # Ingest Dense hits
    for rank, hit in enumerate(raw_dense_hits, start=1):
        c_id = hit.get("chunkId")
        if not c_id:
            continue
        identifiers = hit.get("identifierKeys") or []
        if isinstance(identifiers, str):
            identifiers = [identifiers]
        
        cand = Candidate(
            chunkId=c_id,
            documentId=hit.get("documentId", ""),
            projectId=hit.get("projectId", project_id),
            text=hit.get("text", ""),
            chunkIndex=hit.get("chunkIndex", 0),
            pageNumber=hit.get("pageNumber", 1),
            section=hit.get("section"),
            heading=hit.get("heading"),
            identifiers=identifiers,
            denseScore=float(hit.get("score", 0.0)),
            denseRank=rank,
            sources=["qdrant_dense"]
        )
        candidates_map[c_id] = cand

    # Ingest Lexical hits (merge or insert)
    for rank, hit in enumerate(raw_lexical_hits, start=1):
        c_id = hit.get("chunkId")
        if not c_id:
            continue
        ident_raw = hit.get("identifiers", "")
        lex_idents = ident_raw.split() if isinstance(ident_raw, str) else list(ident_raw)

        if c_id in candidates_map:
            cand = candidates_map[c_id]
            cand.lexicalScore = float(hit.get("score", 0.0))
            cand.lexicalRank = rank
            if "tantivy_lexical" not in cand.sources:
                cand.sources.append("tantivy_lexical")
            # Combine identifiers
            merged_idents = list(set(cand.identifiers + lex_idents))
            cand.identifiers = merged_idents
        else:
            cand = Candidate(
                chunkId=c_id,
                documentId=hit.get("documentId", ""),
                projectId=hit.get("projectId", project_id),
                text=hit.get("text", ""),
                pageNumber=hit.get("pageNumber", 1),
                identifiers=lex_idents,
                lexicalScore=float(hit.get("score", 0.0)),
                lexicalRank=rank,
                sources=["tantivy_lexical"]
            )
            candidates_map[c_id] = cand

    # Ingest Graph hits (merge or insert)
    for rank, hit in enumerate(raw_graph_hits, start=1):
        c_id = hit.get("chunkId")
        if not c_id:
            continue
        relations = hit.get("graphRelations", [])

        if c_id in candidates_map:
            cand = candidates_map[c_id]
            cand.graphScore = float(hit.get("score", 1.0))
            cand.graphRank = rank
            if "networkx_graph" not in cand.sources:
                cand.sources.append("networkx_graph")
            existing_rels = cand.graphRelations or []
            cand.graphRelations = existing_rels + relations
        else:
            cand = Candidate(
                chunkId=c_id,
                documentId=hit.get("documentId", ""),
                projectId=hit.get("projectId", project_id),
                text=hit.get("text", ""),
                pageNumber=hit.get("pageNumber", 1),
                graphScore=float(hit.get("score", 1.0)),
                graphRank=rank,
                sources=["networkx_graph"],
                graphRelations=relations
            )
            candidates_map[c_id] = cand

    all_normalized = list(candidates_map.values())

    # 4. PostgreSQL Canonical Lifecycle & Isolation Validation (Fail-Closed)
    # Invariant: Evidence MUST belong to projectId AND have status = 'ready' in canonical PostgreSQL.
    # Pruning invalid/unready candidates BEFORE RRF & Reranking ensures unready documents
    # cannot consume fusion or reranking pool slots or displace valid READY candidates.
    candidate_doc_ids = list(set(c.documentId for c in all_normalized if c.documentId))
    ready_doc_ids: Set[str] = set()
    try:
        ready_doc_ids = validate_ready_documents(project_id, candidate_doc_ids)
    except Exception as e:
        logger.error(f"PostgreSQL lifecycle validation failed for project_id={project_id}: {e}")
        raise RuntimeError(f"PostgreSQL canonical validation failure: {e}") from e

    # Fail-closed filter: ensure candidate.projectId == project_id and document.status == 'ready'
    valid_candidates: List[Candidate] = []
    for c in all_normalized:
        if c.projectId != project_id:
            logger.warning(
                f"[retrieval] Candidate chunk {c.chunkId} rejected: projectId mismatch "
                f"(candidate='{c.projectId}', expected='{project_id}')"
            )
            continue
        if c.documentId not in ready_doc_ids:
            logger.info(
                f"[retrieval] Candidate chunk {c.chunkId} excluded: document {c.documentId} "
                f"not in READY state in project {project_id}"
            )
            continue
        valid_candidates.append(c)

    # 5. Reciprocal Rank Fusion (RRF) on Valid READY Candidates
    for cand in valid_candidates:
        cand.rrfScore = calculate_rrf_score(
            dense_rank=cand.denseRank,
            lexical_rank=cand.lexicalRank,
            graph_rank=cand.graphRank,
            k=RRF_K
        )

    # Deterministic tie-breaking:
    # 1. rrfScore DESC
    # 2. best source rank ASC
    # 3. chunkId ASC
    def sort_key(c: Candidate):
        ranks = [r for r in [c.denseRank, c.lexicalRank, c.graphRank] if r is not None]
        best_rank = min(ranks) if ranks else 9999
        return (-c.rrfScore, best_rank, c.chunkId)

    valid_candidates.sort(key=sort_key)

    # 6. Bounded Candidate Pool for Reranking (top 20 valid candidates)
    rrf_pool = valid_candidates[:RRF_POOL_K]

    # 7. FlashRank Reranking with Adaptive Bypass on Exact Equipment Tags
    exact_tag_matched = False
    if route.extractedIdentifiers and rrf_pool:
        top_cand = rrf_pool[0]
        cand_idents = [i.upper() for i in top_cand.identifiers]
        for tag in route.extractedIdentifiers:
            if tag.upper() in cand_idents or tag.upper() in top_cand.text.upper():
                exact_tag_matched = True
                break

    reranked_pool: List[Candidate] = []
    if exact_tag_matched and os.getenv("ENABLE_RERANKER_BYPASS", "true").lower() == "true":
        logger.info(
            f"[retrieval] Adaptive reranker bypass on exact equipment tags: {route.extractedIdentifiers}"
        )
        for c in rrf_pool:
            # When exact tag matches top candidate, assign high-confidence score above sufficiency threshold
            matches_tag = any(
                t.upper() in [i.upper() for i in c.identifiers] or t.upper() in c.text.upper()
                for t in route.extractedIdentifiers
            )
            c.rerankScore = max(0.50, float(c.rrfScore * 20.0)) if matches_tag else float(c.rrfScore)
            reranked_pool.append(c)
    elif rrf_pool and query:
        try:
            passages = [
                {"chunkId": c.chunkId, "text": c.text, "candidate": c}
                for c in rrf_pool
            ]
            rerank_results = rerank(query=query, passages=passages, top_n=RERANK_CANDIDATE_K)
            for res in rerank_results:
                cand = res["candidate"]
                cand.rerankScore = float(res.get("rerankScore", 0.0))
                reranked_pool.append(cand)
        except Exception as e:
            logger.error(f"Reranking stage failed: {e}")
            raise RuntimeError(f"FlashRank reranking infrastructure failure: {e}") from e
    else:
        reranked_pool = rrf_pool

    # 8. Deterministic Evidence Sufficiency Gate
    sufficiency = evaluate_sufficiency(reranked_pool, route)

    # Final bounded slice
    # Contract:
    # - if valid candidates exist but sufficiency is false: return ranked candidates + sufficiency.sufficient=false
    # - if no valid candidates exist: return results=[] + sufficiency.sufficient=false
    final_candidates = reranked_pool[:bounded_top_k]

    # Map to EvidenceItem response models
    evidence_items: List[EvidenceItem] = []
    for cand in final_candidates:
        evidence_items.append(EvidenceItem(
            evidenceId=f"ev_{uuid.uuid4().hex[:8]}",
            chunkId=cand.chunkId,
            documentId=cand.documentId,
            text=cand.text,
            pageNumber=cand.pageNumber,
            section=cand.section,
            heading=cand.heading,
            identifiers=cand.identifiers,
            sources=cand.sources,
            rrfScore=cand.rrfScore,
            rerankScore=cand.rerankScore,
            score=cand.rerankScore if cand.rerankScore is not None else cand.rrfScore,
            graphRelations=cand.graphRelations,
            metadata={
                "denseScore": cand.denseScore,
                "lexicalScore": cand.lexicalScore,
                "graphScore": cand.graphScore,
                "denseRank": cand.denseRank,
                "lexicalRank": cand.lexicalRank,
                "graphRank": cand.graphRank,
                "sources": cand.sources
            }
        ))

    latency_ms = (time.perf_counter() - start_time) * 1000.0

    metadata = RetrieveMetadata(
        selectedSources=selected_sources,
        denseCandidateCount=len(raw_dense_hits),
        lexicalCandidateCount=len(raw_lexical_hits),
        graphCandidateCount=len(raw_graph_hits),
        fusedCandidateCount=len(all_normalized),
        rerankedCandidateCount=len(reranked_pool),
        finalCandidateCount=len(evidence_items),
        latencyMs=latency_ms,
        routeDecision=route
    )

    logger.info(
        f"[/retrieve] req_id={req_id} project_id={project_id} query='{query}' "
        f"sources={selected_sources} counts=(dense={len(raw_dense_hits)}, "
        f"lexical={len(raw_lexical_hits)}, graph={len(raw_graph_hits)}, "
        f"fused={len(all_normalized)}, reranked={len(reranked_pool)}, "
        f"final={len(evidence_items)}) sufficiency={sufficiency.sufficient} "
        f"latency_ms={latency_ms:.1f}"
    )

    return RetrieveResponse(
        results=evidence_items,
        sufficiency=sufficiency,
        metadata=metadata
    )
