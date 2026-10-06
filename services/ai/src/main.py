import os
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
import sys
import re
import uuid
import time
import logging
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), ".env"), override=True)

# Ensure services/ai directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List, Optional, Dict, Any, AsyncIterator
import json
from fastapi import FastAPI, Header, Request, Response, File, UploadFile, Form, Query, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.pipeline.parser import parse_pdf
from src.pipeline.chunker import chunk_pages
from src.pipeline.embedder import generate_embeddings
from src.pipeline.db import validate_ready_documents, get_project_knowledge_summary
from src.pipeline.intent_classifier import (
    classify_intent,
    generate_conversational_response,
    generate_product_help_response,
    generate_unsupported_query_response,
)
from src.pipeline.conversational import (
    generate_social_response,
    generate_product_help_response as generate_product_help_llm,
    generate_abstention_response as generate_abstention_llm,
    generate_clarification_response as generate_clarification_llm,
)
from src.pipeline.query_understanding import (
    understand_query,
    QueryPlan,
    build_telemetry,
    _make_fallback_plan,
)
from src.pipeline.qdrant_store import qdrant_store
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.graph_store import graph_store
from src.pipeline.retrieval import (
    retrieve_evidence,
    RetrieveResponse,
    EvidenceItem,
    EvidenceSufficiency,
    RetrieveMetadata
)
from src.pipeline.context import context_builder
from src.pipeline.prompts import build_grounded_user_prompt
from src.pipeline.llm import llm_runtime, LLMUnavailableError
from src.pipeline.claim_extractor import extract_and_validate_claims, ProvenanceValidationError

# Backwards compatibility alias
RetrieveResult = RetrieveResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("m2-ai-service")

app = FastAPI(title="GroundGuard M2 AI Service", version="0.3.0")

# Models for contracts
class IndexStatus(BaseModel):
    qdrant: bool = False
    tantivy: bool = False
    networkx: bool = False
    graphEdgesCount: int = 0

class IngestResponse(BaseModel):
    documentId: str
    status: str = "completed"
    chunksCreated: int = 0
    errorMessage: Optional[str] = None
    indexStatus: Optional[IndexStatus] = None
    chunks: Optional[List[Dict[str, Any]]] = None

class RetrieveRequest(BaseModel):
    projectId: str
    query: str
    topK: Optional[int] = 5

class DeleteDocumentResult(BaseModel):
    success: bool
    documentId: str
    projectId: str
    error: Optional[str] = None

class GenerateRequest(BaseModel):
    requestId: Optional[str] = None
    generationId: Optional[str] = None
    projectId: str
    query: str
    conversationId: Optional[str] = None
    options: Optional[Dict[str, Any]] = None
    conversationContext: Optional[List[Dict[str, Any]]] = None

class ClaimItem(BaseModel):
    claimId: str
    text: str
    status: str = "pending"
    ordinal: Optional[int] = 0
    sourceText: Optional[str] = None
    verification: Optional[Dict[str, Any]] = None
    evidence: List[EvidenceItem] = []

class GenerateResult(BaseModel):
    requestId: str
    generationId: str
    status: str = "completed"
    answer: str
    evidence: List[EvidenceItem] = []
    sufficiency: Optional[EvidenceSufficiency] = None
    modelVersion: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    claims: List[ClaimItem] = []
    error: Optional[Dict[str, Any]] = None

class RecoverRequest(BaseModel):
    requestId: Optional[str] = None
    projectId: str
    claimId: str
    claim: str
    failureReason: str
    existingEvidence: List[Dict[str, Any]] = []
    attempt: int = 1
    useLangGraph: Optional[bool] = True

class RecoverResponse(BaseModel):
    requestId: str
    claimId: str
    action: str  # "keep" | "revise" | "abstain"
    candidateClaim: Optional[str] = None
    recoveryEvidence: List[EvidenceItem] = []
    modelVersion: str
    reason: Optional[str] = None

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", f"req_{uuid.uuid4().hex[:12]}")
    request.state.request_id = request_id
    response: Response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response

@app.get("/health")
async def health():
    return {"service": "ai", "status": "ok"}

@app.post("/ingest", response_model=IngestResponse)
async def ingest(
    file: Optional[UploadFile] = File(None),
    documentId: Optional[str] = Form(None),
    projectId: Optional[str] = Form(None),
    x_request_id: Optional[str] = Header(None)
):
    req_id = x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    doc_id = documentId or f"doc_temp"
    proj_id = projectId or f"proj_temp"
    logger.info(f"[/ingest] doc_id={doc_id} project_id={proj_id} req_id={req_id}")

    if not file:
        return IngestResponse(
            documentId=doc_id,
            status="failed",
            chunksCreated=0,
            errorMessage="Missing PDF file attachment"
        )

    try:
        file_bytes = await file.read()
        pages_data = parse_pdf(file_bytes)

        if not pages_data:
            return IngestResponse(
                documentId=doc_id,
                status="failed",
                chunksCreated=0,
                errorMessage="Failed to extract readable text from PDF"
            )

        chunks = chunk_pages(pages_data)
        if not chunks:
            return IngestResponse(
                documentId=doc_id,
                status="failed",
                chunksCreated=0,
                errorMessage="No valid chunks generated from PDF text"
            )

        texts = [c["text"] for c in chunks]
        embeddings = generate_embeddings(texts)

        # Multi-Store Indexing with Compensating Cleanup on Partial Failure
        qdrant_written = False
        tantivy_written = False
        networkx_written = False
        edges_count = 0

        try:
            # Stage 2: Qdrant Dense Indexing
            qdrant_store.upsert_chunks(
                project_id=proj_id,
                document_id=doc_id,
                chunks=chunks,
                embeddings=embeddings
            )
            qdrant_written = True

            # Stage 3: Tantivy Lexical BM25 Indexing
            tantivy_store.index_chunks(
                project_id=proj_id,
                document_id=doc_id,
                chunks=chunks
            )
            tantivy_written = True

            # Stage 4: NetworkX Evidence-Grounded Extraction
            edges_count = graph_store.process_and_persist_chunks(
                project_id=proj_id,
                document_id=doc_id,
                chunks=chunks
            )
            networkx_written = True

        except Exception as indexing_err:
            logger.error(f"Ingestion indexing failure at doc_id={doc_id}: {indexing_err}. Initiating compensating cleanup...")
            cleanup_errors = []

            # Compensating cleanup: Purge derived stores already written
            if networkx_written:
                try:
                    graph_store.delete_document(proj_id, doc_id)
                except Exception as ce:
                    cleanup_errors.append(f"NetworkX purge error: {ce}")
            if tantivy_written:
                try:
                    tantivy_store.delete_document(proj_id, doc_id)
                except Exception as ce:
                    cleanup_errors.append(f"Tantivy purge error: {ce}")
            if qdrant_written:
                try:
                    qdrant_store.delete_document(proj_id, doc_id)
                except Exception as ce:
                    cleanup_errors.append(f"Qdrant purge error: {ce}")

            if cleanup_errors:
                logger.critical(f"Compensating cleanup failed for doc_id={doc_id}: {cleanup_errors}")

            return IngestResponse(
                documentId=doc_id,
                status="failed",
                chunksCreated=0,
                errorMessage=f"Indexing failure: {indexing_err}. Compensating cleanup: {'clean' if not cleanup_errors else '; '.join(cleanup_errors)}"
            )

        return IngestResponse(
            documentId=doc_id,
            status="completed",
            chunksCreated=len(chunks),
            indexStatus=IndexStatus(
                qdrant=True,
                tantivy=True,
                networkx=True,
                graphEdgesCount=edges_count
            ),
            chunks=chunks
        )

    except Exception as e:
        logger.error(f"[/ingest error] doc_id={doc_id}: {e}")
        return IngestResponse(
            documentId=doc_id,
            status="failed",
            chunksCreated=0,
            errorMessage="Internal error during PDF parsing/embedding"
        )

@app.delete("/documents/{document_id}", response_model=DeleteDocumentResult)
async def delete_document(
    document_id: str,
    projectId: str = Query(..., description="Project ID owning the document"),
    x_request_id: Optional[str] = Header(None)
):
    """
    Purges derived indexes (Qdrant, Tantivy, NetworkX) for document_id within projectId.
    Must succeed before M3 deletes the canonical record from PostgreSQL.
    """
    logger.info(f"[/documents/delete] document_id={document_id} project_id={projectId} req_id={x_request_id}")
    try:
        # 1. Purge Qdrant
        qdrant_store.delete_document(projectId, document_id)
        # 2. Purge Tantivy
        tantivy_store.delete_document(projectId, document_id)
        # 3. Purge NetworkX
        graph_store.delete_document(projectId, document_id)

        return DeleteDocumentResult(
            success=True,
            documentId=document_id,
            projectId=projectId
        )
    except Exception as e:
        logger.error(f"Failed to purge derived indexes for document_id={document_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Derived index purge failed: {e}"
        )

@app.post("/retrieve", response_model=RetrieveResponse)
async def retrieve(payload: RetrieveRequest, x_request_id: Optional[str] = Header(None)):
    """
    Canonical Phase 4 Multi-Source Retrieval Pipeline:
    Deterministic Routing -> Qdrant Dense + Tantivy BM25 + NetworkX Graph ->
    Candidate Normalization -> RRF Fusion -> FlashRank Cross-Encoder ->
    PostgreSQL READY Validation -> Deterministic Evidence Sufficiency Gate.
    """
    req_id = x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    logger.info(f"[/retrieve] project_id={payload.projectId} query='{payload.query}' req_id={req_id}")
    try:
        return retrieve_evidence(
            project_id=payload.projectId,
            query=payload.query,
            top_k=payload.topK or 5,
            request_id=req_id
        )
    except Exception as e:
        logger.error(f"[/retrieve error] project_id={payload.projectId}: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Retrieval infrastructure failure: {e}"
        )

@app.get("/sanity/search")
async def sanity_search(projectId: str, query: str, topK: int = 5):
    """
    Sanity check endpoint for test verification of Qdrant, Tantivy, and NetworkX.
    """
    query_vector = generate_embeddings([query])[0] if query else []
    qdrant_res = qdrant_store.search_dense(projectId, query_vector, topK)
    tantivy_res = tantivy_store.search_project(projectId, query, topK)
    relations_res = graph_store.query_relations(projectId, query)

    return {
        "projectId": projectId,
        "query": query,
        "qdrantHits": qdrant_res,
        "tantivyHits": tantivy_res,
        "graphRelations": relations_res
    }

@app.post("/generate", response_model=GenerateResult)
async def generate(payload: GenerateRequest, x_request_id: Optional[str] = Header(None)):
    """
    Canonical Phase 5 Grounded Generation Pipeline with Query Intelligence:
    0a. Conversational/product-help fast path (no retrieval)
    0b. Semantic QueryPlan via understand_query (1 Gemini call max; safe fallback on failure)
    1.  QueryPlan-guided retrieval:
        - focused: single retrieve_evidence call on standalone_query
        - broad/comparative: multi-query retrieve_evidence, merge, deduplicate by chunkId
    2.  Sufficiency gate (threshold=0.35, unchanged)
    3.  On insufficient + plausibly-project-related: ONE semantic fallback expansion
    4.  If clarification needed: return clarification question
    5.  If still insufficient: abstain
    6.  LLM grounded generation with claim extraction
    M2 never calls M1. Planner failure MUST NOT cause 500.
    """
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    gen_id = payload.generationId or f"gen_{uuid.uuid4().hex[:12]}"
    top_k = (payload.options or {}).get("topK", 5)

    logger.info(
        "[/generate start] project_id=%s req_id=%s gen_id=%s query='%s'",
        payload.projectId, req_id, gen_id, payload.query
    )

    # Step 0a: Legacy conversational/product-help fast path (fast deterministic routing -> natural LLM generation)
    intent, sub_intent = classify_intent(payload.query)
    logger.info(
        "[/generate intent] project_id=%s req_id=%s intent=%s sub_intent=%s",
        payload.projectId, req_id, intent, sub_intent
    )

    try:
        proj_context = get_project_knowledge_summary(payload.projectId)
    except Exception:
        proj_context = {}
    project_name = proj_context.get("projectName") if isinstance(proj_context, dict) else None

    if intent == "conversational":
        logger.info("[/generate responseMode] conversational_llm")
        reply = await generate_social_response(
            user_message=payload.query,
            sub_intent=sub_intent or "greeting",
            project_name=project_name,
            recent_context=payload.conversationContext,
            llm_runtime=llm_runtime,
        )
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=reply,
            evidence=[],
            sufficiency=None,
            modelVersion="groundguard-conversational",
            metadata={"intent": "conversational", "subIntent": sub_intent, "abstention": False},
            claims=[]
        )

    if intent == "product_help":
        logger.info("[/generate responseMode] conversational_llm")
        reply = await generate_product_help_llm(
            user_message=payload.query,
            project_name=project_name,
            recent_context=payload.conversationContext,
            llm_runtime=llm_runtime,
        )
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=reply,
            evidence=[],
            sufficiency=None,
            modelVersion="groundguard-product-help",
            metadata={"intent": "product_help", "abstention": False},
            claims=[]
        )

    # Step 0b: Semantic Query Understanding (1 Gemini call; safe fallback on any failure)
    try:
        plan = await understand_query(
            query=payload.query,
            conversation_context=payload.conversationContext,
            project_context=proj_context,
        )
    except Exception as plan_err:
        logger.warning("[/generate planner error] %s — using fallback plan", plan_err)
        plan = _make_fallback_plan(payload.query)

    logger.info(
        "[/generate plan] task=%s mode=%s queries=%d standalone='%s'",
        plan.task, plan.retrieval_mode, len(plan.search_queries), plan.standalone_query[:80]
    )

    # If planner signals clarification needed, return naturally phrased clarification
    if plan.needs_clarification:
        logger.info("[/generate responseMode] clarification")
        clarification_msg = await generate_clarification_llm(
            user_query=payload.query,
            structured_clarification=plan.clarification_question,
            llm_runtime=llm_runtime,
        )
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=clarification_msg,
            evidence=[],
            sufficiency=None,
            modelVersion="groundguard-clarification",
            metadata={"intent": "clarification", "abstention": False, "task": plan.task},
            claims=[]
        )

    # For social/product_help tasks from planner (for less-obvious phrasings the
    # deterministic classifier missed, but planner recognized):
    if plan.task == "social":
        logger.info("[/generate responseMode] conversational_llm")
        reply = await generate_social_response(
            user_message=payload.query,
            sub_intent="greeting",
            project_name=project_name,
            recent_context=payload.conversationContext,
            llm_runtime=llm_runtime,
        )
        return GenerateResult(
            requestId=req_id, generationId=gen_id, status="completed",
            answer=reply, evidence=[], sufficiency=None,
            modelVersion="groundguard-conversational",
            metadata={"intent": "social", "abstention": False}, claims=[]
        )
    if plan.task == "product_help":
        logger.info("[/generate responseMode] conversational_llm")
        reply = await generate_product_help_llm(
            user_message=payload.query,
            project_name=project_name,
            recent_context=payload.conversationContext,
            llm_runtime=llm_runtime,
        )
        return GenerateResult(
            requestId=req_id, generationId=gen_id, status="completed",
            answer=reply, evidence=[], sufficiency=None,
            modelVersion="groundguard-product-help",
            metadata={"intent": "product_help", "abstention": False}, claims=[]
        )

    # Step 1: 4-Dimensional Information-Need Guided Retrieval Orchestration
    # Strategies:
    # 1. coverage: document overview / contents / summary (representative chunks in reading order)
    # 2. section: exact heading lexical match + bounded successor chunk neighborhood expansion
    # 3. procedural: source-ordered evidence (pageNumber, chunkIndex)
    # 4. comparative / cross_document / broad: multi-query retrieval with document diversity
    # 5. focused: high-precision single-query retrieval with preserved technical tokens
    search_queries = plan.search_queries if plan.search_queries else [plan.standalone_query or payload.query]
    retrieval_mode = plan.retrieval_mode
    retrieval_res = None

    def _merge_evidence(results_list):
        seen = set()
        merged = []
        for items in results_list:
            for ev in items:
                cid = ev.chunkId
                if cid not in seen:
                    seen.add(cid)
                    merged.append(ev)
        return merged

    def _fetch_successor_chunk(project_id: str, document_id: str, chunk_index: int) -> Optional[Dict[str, Any]]:
        try:
            from qdrant_client.http.models import Filter, FieldCondition, MatchValue
            res = qdrant_store.client.scroll(
                collection_name="groundguard_chunks",
                scroll_filter=Filter(
                    must=[
                        FieldCondition(key="projectId", match=MatchValue(value=project_id)),
                        FieldCondition(key="documentId", match=MatchValue(value=document_id)),
                        FieldCondition(key="chunkIndex", match=MatchValue(value=chunk_index)),
                    ]
                ),
                limit=1
            )
            if res and res[0]:
                return res[0][0].payload
        except Exception as e:
            logger.warning("[/generate successor error] %s", e)
        return None

    try:
        # Strategy A: Document Coverage (overview / contents / summary)
        if plan.retrieval_strategy == "coverage":
            target_doc_id = plan.resolved_document_id
            if not target_doc_id and proj_context:
                ready_docs_list = proj_context.get("readyDocs") or []
                if len(ready_docs_list) == 1:
                    target_doc_id = ready_docs_list[0].get("id")
                elif plan.resolved_document_name:
                    for d in ready_docs_list:
                        if d.get("filename", "").lower() == plan.resolved_document_name.lower():
                            target_doc_id = d.get("id")
                            break

            if target_doc_id:
                try:
                    from qdrant_client.http.models import Filter, FieldCondition, MatchValue
                    scroll_filter = Filter(must=[
                        FieldCondition(key="projectId", match=MatchValue(value=payload.projectId)),
                        FieldCondition(key="documentId", match=MatchValue(value=target_doc_id))
                    ])
                    scroll_res = qdrant_store.client.scroll(
                        collection_name="groundguard_chunks",
                        scroll_filter=scroll_filter,
                        limit=100
                    )
                    points = scroll_res[0] if scroll_res else []
                    if points:
                        points.sort(key=lambda p: (p.payload.get("pageNumber", 1), p.payload.get("chunkIndex", 0)))
                        if len(points) <= 8:
                            selected_points = points
                        else:
                            stride = (len(points) - 1) / 7.0
                            selected_indices = sorted(list({int(round(i * stride)) for i in range(8)}))
                            selected_points = [points[idx] for idx in selected_indices if idx < len(points)]

                        coverage_items = []
                        for p in selected_points:
                            payload_d = p.payload or {}
                            coverage_items.append(EvidenceItem(
                                evidenceId=f"ev_{uuid.uuid4().hex[:8]}",
                                chunkId=payload_d.get("chunkId", ""),
                                documentId=payload_d.get("documentId"),
                                text=payload_d.get("text", ""),
                                pageNumber=payload_d.get("pageNumber", 1),
                                section=payload_d.get("section"),
                                heading=payload_d.get("heading"),
                                identifiers=payload_d.get("identifierKeys", []),
                                sources=["qdrant_dense", "document_coverage"],
                                rrfScore=1.0,
                                rerankScore=1.0,
                                score=1.0,
                                metadata={
                                    "chunkIndex": payload_d.get("chunkIndex", 0),
                                    **(payload_d.get("metadata") or {})
                                }
                            ))
                        from src.pipeline.retrieval import EvidenceSufficiency, EvidenceSufficiencySignals
                        coverage_suf = EvidenceSufficiency(
                            sufficient=True,
                            reason="Document coverage evidence sufficient",
                            score=1.0,
                            signals=EvidenceSufficiencySignals(
                                resultCount=len(coverage_items),
                                topRerankScore=1.0,
                                identifierMatched=False,
                                sourceCoverage=[target_doc_id]
                            )
                        )
                        retrieval_res = type("_CoverageResult", (), {"results": coverage_items, "sufficiency": coverage_suf})()
                        logger.info("[/generate coverage] Retrieved %d representative chunks for doc=%s", len(coverage_items), target_doc_id)
                except Exception as cov_err:
                    logger.warning("[/generate coverage error] %s — falling back to standard retrieval", cov_err)

        # Strategy B: Broad / Comparative / Cross-Document Multi-Query
        if retrieval_res is None and retrieval_mode in ("broad", "comparative", "cross_document") and len(search_queries) > 1:
            all_results = []
            last_sufficiency = None
            for sq in search_queries:
                try:
                    sq_res = retrieve_evidence(
                        project_id=payload.projectId,
                        query=sq,
                        top_k=top_k,
                        search_queries=plan.search_queries,
                        lexical_anchors=plan.lexical_anchors,
                        question_slot=plan.question_slot,
                        request_id=req_id
                    )
                    all_results.append(sq_res.results)
                    last_sufficiency = sq_res.sufficiency
                except Exception as sq_err:
                    logger.warning("[/generate broad sq error] sq='%s': %s", sq[:60], sq_err)

            merged_items = _merge_evidence(all_results)
            if merged_items:
                top_score = max((ev.rerankScore or ev.score or 0.0) for ev in merged_items)
                from src.pipeline.retrieval import EvidenceSufficiency, EvidenceSufficiencySignals, SUFFICIENCY_THRESHOLD
                broad_sufficient = top_score >= SUFFICIENCY_THRESHOLD
                broad_suf = EvidenceSufficiency(
                    sufficient=broad_sufficient,
                    reason="Broad multi-query evidence sufficient" if broad_sufficient else "Broad multi-query evidence insufficient",
                    score=top_score,
                    signals=EvidenceSufficiencySignals(
                        resultCount=len(merged_items),
                        topRerankScore=top_score,
                        identifierMatched=False,
                        sourceCoverage=list({ev.documentId for ev in merged_items if ev.documentId}),
                    )
                )
                retrieval_res = type("_BroadResult", (), {"results": merged_items, "sufficiency": broad_suf})()
            elif last_sufficiency:
                retrieval_res = type("_BroadResult", (), {"results": [], "sufficiency": last_sufficiency})()
            else:
                from src.pipeline.retrieval import EvidenceSufficiency, EvidenceSufficiencySignals
                retrieval_res = type("_BroadResult", (), {"results": [], "sufficiency": EvidenceSufficiency(
                    sufficient=False, reason="No evidence retrieved", score=0.0,
                    signals=EvidenceSufficiencySignals(resultCount=0, topRerankScore=0.0, identifierMatched=False, sourceCoverage=[])
                )})()

        # Strategy C: Focused / Section Retrieval
        if retrieval_res is None:
            focused_q = (plan.search_queries[0] if plan.search_queries else None) or plan.target or plan.standalone_query or payload.query
            retrieval_res = retrieve_evidence(
                project_id=payload.projectId,
                query=focused_q,
                top_k=top_k,
                request_id=req_id,
                search_queries=plan.search_queries,
                lexical_anchors=plan.lexical_anchors,
                question_slot=plan.question_slot,
            )

        # Strategy D: Section Neighborhood Expansion (if section requested and heading matched)
        if retrieval_res and retrieval_res.results and (plan.retrieval_strategy == "section" or plan.target):
            target_norm = (plan.target or "").strip().lower()
            matching_idx = None
            for idx, ev in enumerate(retrieval_res.results):
                heading_text = (ev.heading or "").lower()
                body_text = (ev.text or "").lower()
                if (target_norm and target_norm in heading_text) or (len(target_norm) >= 4 and target_norm in body_text):
                    matching_idx = idx
                    break

            if matching_idx is not None:
                matched_ev = retrieval_res.results[matching_idx]
                doc_id = matched_ev.documentId
                c_idx = matched_ev.metadata.get("chunkIndex") if matched_ev.metadata else None
                if doc_id and c_idx is not None:
                    succ_payload = _fetch_successor_chunk(payload.projectId, doc_id, c_idx + 1)
                    if succ_payload:
                        succ_chunk_id = succ_payload.get("chunkId")
                        if not any(e.chunkId == succ_chunk_id for e in retrieval_res.results):
                            succ_ev = EvidenceItem(
                                evidenceId=f"ev_{uuid.uuid4().hex[:8]}",
                                chunkId=succ_chunk_id,
                                documentId=doc_id,
                                text=succ_payload.get("text", ""),
                                pageNumber=succ_payload.get("pageNumber", matched_ev.pageNumber),
                                section=succ_payload.get("section", matched_ev.section),
                                heading=succ_payload.get("heading"),
                                identifiers=succ_payload.get("identifierKeys", []),
                                sources=["section_neighborhood"],
                                rrfScore=matched_ev.rrfScore,
                                rerankScore=matched_ev.rerankScore,
                                score=matched_ev.score,
                                metadata={
                                    "chunkIndex": succ_payload.get("chunkIndex", c_idx + 1),
                                    **(succ_payload.get("metadata") or {})
                                }
                            )
                            retrieval_res.results.insert(matching_idx + 1, succ_ev)
                            logger.info("[/generate section] Expanded neighborhood with chunkIndex=%d for doc=%s", c_idx + 1, doc_id)

                # Ensure high sufficiency if exact heading matched in evidence
                if retrieval_res.sufficiency and not retrieval_res.sufficiency.sufficient:
                    retrieval_res.sufficiency.sufficient = True
                    retrieval_res.sufficiency.reason = f"Section heading '{plan.target}' matched in document evidence"
                    retrieval_res.sufficiency.score = max(retrieval_res.sufficiency.score or 0.0, 0.85)

        # Strategy E: Procedural Order Preservation
        if plan.retrieval_strategy == "procedural" or plan.operation == "procedure":
            if retrieval_res and retrieval_res.results:
                retrieval_res.results.sort(
                    key=lambda ev: (
                        ev.documentId or "",
                        ev.pageNumber or 1,
                        (ev.metadata.get("chunkIndex", 0) if ev.metadata else 0)
                    )
                )
                logger.info("[/generate procedure] Sorted %d evidence items into source reading order", len(retrieval_res.results))

        # Strategy F: Technical Parameter Grounding (Section 29, 30)
        if retrieval_res and retrieval_res.results and plan.operation in ("lookup", "extract"):
            top_ev = retrieval_res.results[0]
            if retrieval_res.sufficiency and not retrieval_res.sufficiency.sufficient:
                query_tokens = [w.lower() for w in re.findall(r'[A-Za-z0-9_]+', (plan.target or "") + " " + " ".join(plan.search_queries or [])) if len(w) >= 2]
                body_tokens = set(re.findall(r'[A-Za-z0-9_]+', top_ev.text.lower()))
                overlap = sum(1 for t in query_tokens if t in body_tokens)
                if overlap >= 2 or (top_ev.rrfScore and top_ev.rrfScore > 0.015):
                    retrieval_res.sufficiency.sufficient = True
                    retrieval_res.sufficiency.reason = f"Technical parameter matched in document evidence ({overlap} token matches)"
                    retrieval_res.sufficiency.score = max(retrieval_res.sufficiency.score or 0.0, 0.75)
                    logger.info("[/generate lookup] Technical parameter match validated (score=0.75)")

    except Exception as ret_err:
        logger.error(
            "[/generate retrieval error] project_id=%s req_id=%s: %s",
            payload.projectId, req_id, ret_err
        )
        raise HTTPException(
            status_code=503,
            detail=f"Retrieval infrastructure failure during generation: {ret_err}"
        )

    # Step 2: Deterministic Evidence Sufficiency Gate (threshold=0.35 unchanged)
    first_pass_sufficient = bool(
        retrieval_res.sufficiency
        and retrieval_res.sufficiency.sufficient
        and retrieval_res.results
    )
    fallback_used = False

    # Step 3: ONE bounded semantic fallback if insufficient and query is plausibly project-related
    if not first_pass_sufficient and intent != "unsupported_query":
        first_q = (plan.search_queries[0] if plan.search_queries else None) or plan.standalone_query or payload.query
        candidate_fallbacks = [sq for sq in plan.search_queries[1:] if sq and sq != first_q]
        if plan.standalone_query and plan.standalone_query != first_q and plan.standalone_query not in candidate_fallbacks:
            candidate_fallbacks.append(plan.standalone_query)
        if payload.query != first_q and payload.query not in candidate_fallbacks:
            candidate_fallbacks.append(payload.query)
        fallback_q = candidate_fallbacks[0] if candidate_fallbacks else None

        if fallback_q and fallback_q != first_q:
            logger.info(
                "[/generate fallback] First pass insufficient, trying semantic fallback. fallback_q='%s'",
                fallback_q[:80]
            )
            try:
                fallback_res = retrieve_evidence(
                    project_id=payload.projectId,
                    query=fallback_q,
                    top_k=top_k,
                    request_id=req_id
                )
                if (
                    fallback_res.sufficiency
                    and fallback_res.sufficiency.sufficient
                    and fallback_res.results
                ):
                    retrieval_res = fallback_res
                    fallback_used = True
                    logger.info("[/generate fallback] Fallback succeeded")
            except Exception as fb_err:
                logger.warning("[/generate fallback error] %s", fb_err)

    if not retrieval_res.sufficiency or not retrieval_res.sufficiency.sufficient or not retrieval_res.results:
        reason = retrieval_res.sufficiency.reason if retrieval_res.sufficiency else "No evidence retrieved"
        logger.info(
            "[/generate abstained] project_id=%s req_id=%s reason='%s'",
            payload.projectId, req_id, reason
        )
        logger.info("[/generate responseMode] grounded_abstention")
        doc_summary = get_project_knowledge_summary(payload.projectId)
        doc_titles = doc_summary.get("filenames", []) if isinstance(doc_summary, dict) else []
        unsupported_msg = await generate_abstention_llm(
            query=payload.query,
            insufficiency_reason=reason,
            project_name=project_name,
            target_doc=plan.resolved_document_name,
            llm_runtime=llm_runtime,
        )
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=unsupported_msg,
            evidence=retrieval_res.results,
            sufficiency=retrieval_res.sufficiency,
            modelVersion="groundguard-abstention-gate",
            metadata={
                "abstention": True,
                "reason": reason,
                "candidateCount": len(retrieval_res.results),
                "intent": "grounded_query_insufficient",
                "task": plan.task,
                "fallbackUsed": fallback_used,
            },
            claims=[]
        )

    # Step 3: Context Building & Prompt Construction
    # Preserve BOTH: original instruction (payload.query) and resolved retrieval subject (plan.standalone_query)
    context_text, included_items, omitted_items = context_builder.build_context(retrieval_res.results)
    user_prompt = build_grounded_user_prompt(
        query=payload.query,
        evidence_context=context_text,
        conversation_context=payload.conversationContext,
        standalone_query=plan.standalone_query,
        operation=plan.operation,
        is_proposition=plan.is_proposition,
    )

    # Step 4: Real LLM Inference
    try:
        logger.info("[/generate responseMode] grounded_generation")
        llm_res = await llm_runtime.generate_answer(user_prompt)
        logger.info(
            f"[/generate completed] project_id={payload.projectId} req_id={req_id} "
            f"model={llm_res.modelVersion} latency={llm_res.latencyMs}ms"
        )
        # Step 5: Phase 6 Claim Extraction & Evidence Provenance Association
        claims = []
        claim_extraction_meta = {"status": "skipped"}
        try:
            raw_claims = await extract_and_validate_claims(
                answer=llm_res.answer,
                evidence=included_items
            )
            claims = [ClaimItem(**c) for c in raw_claims]
            claim_extraction_meta = {
                "status": "completed",
                "claimCount": len(claims)
            }
        except Exception as claim_err:
            logger.error(f"[/generate claim extraction error] project_id={payload.projectId} req_id={req_id}: {claim_err}")
            claim_extraction_meta = {
                "status": "failed",
                "error": str(claim_err)
            }

        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=llm_res.answer,
            evidence=included_items,
            sufficiency=retrieval_res.sufficiency,
            modelVersion=llm_res.modelVersion,
            metadata={
                "abstention": False,
                "evidenceCount": len(included_items),
                "omittedCount": len(omitted_items),
                "llmLatencyMs": llm_res.latencyMs,
                "provider": llm_res.provider,
                "claimExtraction": claim_extraction_meta,
                "task": plan.task,
                "retrievalMode": plan.retrieval_mode,
                "retrievalStrategy": plan.retrieval_strategy,
                "operation": plan.operation,
                "sourceScope": plan.source_scope,
                "target": plan.target,
                "resolvedDocumentId": plan.resolved_document_id,
                "resolvedDocumentName": plan.resolved_document_name,
                "fallbackUsed": fallback_used,
            },
            claims=claims
        )
    except LLMUnavailableError as unavail_err:
        logger.error(f"[/generate LLM unavailable] project_id={payload.projectId} req_id={req_id}: {unavail_err}")
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="failed",
            answer="",
            evidence=retrieval_res.results,
            sufficiency=retrieval_res.sufficiency,
            modelVersion=llm_runtime.get_model_version(),
            error={
                "code": "LLM_UNAVAILABLE",
                "message": str(unavail_err)
            },
            claims=[]
        )
    except Exception as llm_err:
        logger.error(f"[/generate LLM failure] project_id={payload.projectId} req_id={req_id}: {llm_err}")
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="failed",
            answer="",
            evidence=retrieval_res.results,
            sufficiency=retrieval_res.sufficiency,
            modelVersion=llm_runtime.get_model_version(),
            error={
                "code": "LLM_ERROR",
                "message": f"LLM generation failed: {llm_err}"
            },
            claims=[]
        )

@app.post("/generate/stream")
async def generate_stream(payload: GenerateRequest, x_request_id: Optional[str] = Header(None)):
    """
    Internal streaming generation endpoint consumed by M3:
    1. Executes pre-generation stages (intent classification, query planning, retrieval, sufficiency gate).
    2. Immediately upon sufficiency, emits `answer.started`.
    3. Streams REAL model tokens as `answer.delta` SSE events as soon as Gemini begins producing them.
    4. Upon completion of LLM stream, emits `answer.completed`.
    5. Runs claim extraction on the completed answer text and emits `claims.completed`.
    6. Emits final `generation.completed` with all evidence, claims, and metadata.
    """
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    gen_id = payload.generationId or f"gen_{uuid.uuid4().hex[:12]}"
    top_k = (payload.options or {}).get("topK", 5)

    async def event_generator():
        seq = 1

        def _format_sse(evt_type: str, data: dict) -> str:
            return f"event: {evt_type}\ndata: {json.dumps(data)}\n\n"

        yield _format_sse("generation.started", {"generationId": gen_id, "requestId": req_id})

        # Step 0a: Intent classification
        intent, sub_intent = classify_intent(payload.query)
        try:
            proj_context = get_project_knowledge_summary(payload.projectId)
        except Exception:
            proj_context = {}
        project_name = proj_context.get("projectName") if isinstance(proj_context, dict) else None

        if intent == "conversational":
            reply = await generate_social_response(
                user_message=payload.query,
                sub_intent=sub_intent or "greeting",
                project_name=project_name,
                recent_context=payload.conversationContext,
                llm_runtime=llm_runtime,
            )
            yield _format_sse("answer.started", {"generationId": gen_id})
            yield _format_sse("answer.delta", {"generationId": gen_id, "delta": reply, "sequence": seq})
            seq += 1
            yield _format_sse("answer.completed", {"generationId": gen_id, "answer": reply})
            yield _format_sse("claims.completed", {"generationId": gen_id, "claims": []})
            final_res = GenerateResult(
                requestId=req_id,
                generationId=gen_id,
                status="completed",
                answer=reply,
                evidence=[],
                sufficiency=None,
                modelVersion="groundguard-conversational",
                metadata={"intent": "conversational", "subIntent": sub_intent, "abstention": False},
                claims=[]
            )
            yield _format_sse("generation.completed", final_res.model_dump())
            return

        if intent == "product_help":
            reply = await generate_product_help_llm(
                user_message=payload.query,
                project_name=project_name,
                recent_context=payload.conversationContext,
                llm_runtime=llm_runtime,
            )
            yield _format_sse("answer.started", {"generationId": gen_id})
            yield _format_sse("answer.delta", {"generationId": gen_id, "delta": reply, "sequence": seq})
            seq += 1
            yield _format_sse("answer.completed", {"generationId": gen_id, "answer": reply})
            yield _format_sse("claims.completed", {"generationId": gen_id, "claims": []})
            final_res = GenerateResult(
                requestId=req_id,
                generationId=gen_id,
                status="completed",
                answer=reply,
                evidence=[],
                sufficiency=None,
                modelVersion="groundguard-product-help",
                metadata={"intent": "product_help", "abstention": False},
                claims=[]
            )
            yield _format_sse("generation.completed", final_res.model_dump())
            return

        # Step 0b: Semantic Query Understanding
        try:
            plan = await understand_query(
                query=payload.query,
                conversation_context=payload.conversationContext,
                project_context=proj_context,
            )
        except Exception as plan_err:
            logger.warning("[/generate/stream planner error] %s — using fallback plan", plan_err)
            plan = _make_fallback_plan(payload.query)

        if plan.needs_clarification:
            clarification_msg = await generate_clarification_llm(
                user_query=payload.query,
                structured_clarification=plan.clarification_question,
                llm_runtime=llm_runtime,
            )
            yield _format_sse("answer.started", {"generationId": gen_id})
            yield _format_sse("answer.delta", {"generationId": gen_id, "delta": clarification_msg, "sequence": seq})
            seq += 1
            yield _format_sse("answer.completed", {"generationId": gen_id, "answer": clarification_msg})
            yield _format_sse("claims.completed", {"generationId": gen_id, "claims": []})
            final_res = GenerateResult(
                requestId=req_id,
                generationId=gen_id,
                status="completed",
                answer=clarification_msg,
                evidence=[],
                sufficiency=None,
                modelVersion="groundguard-clarification",
                metadata={"intent": "clarification", "abstention": False, "task": plan.task},
                claims=[]
            )
            yield _format_sse("generation.completed", final_res.model_dump())
            return

        if plan.task == "social":
            reply = await generate_social_response(
                user_message=payload.query,
                sub_intent="greeting",
                project_name=project_name,
                recent_context=payload.conversationContext,
                llm_runtime=llm_runtime,
            )
            yield _format_sse("answer.started", {"generationId": gen_id})
            yield _format_sse("answer.delta", {"generationId": gen_id, "delta": reply, "sequence": seq})
            seq += 1
            yield _format_sse("answer.completed", {"generationId": gen_id, "answer": reply})
            yield _format_sse("claims.completed", {"generationId": gen_id, "claims": []})
            final_res = GenerateResult(
                requestId=req_id, generationId=gen_id, status="completed",
                answer=reply, evidence=[], sufficiency=None,
                modelVersion="groundguard-conversational",
                metadata={"intent": "social", "abstention": False}, claims=[]
            )
            yield _format_sse("generation.completed", final_res.model_dump())
            return

        if plan.task == "product_help":
            reply = await generate_product_help_llm(
                user_message=payload.query,
                project_name=project_name,
                recent_context=payload.conversationContext,
                llm_runtime=llm_runtime,
            )
            yield _format_sse("answer.started", {"generationId": gen_id})
            yield _format_sse("answer.delta", {"generationId": gen_id, "delta": reply, "sequence": seq})
            seq += 1
            yield _format_sse("answer.completed", {"generationId": gen_id, "answer": reply})
            yield _format_sse("claims.completed", {"generationId": gen_id, "claims": []})
            final_res = GenerateResult(
                requestId=req_id, generationId=gen_id, status="completed",
                answer=reply, evidence=[], sufficiency=None,
                modelVersion="groundguard-product-help",
                metadata={"intent": "product_help", "abstention": False}, claims=[]
            )
            yield _format_sse("generation.completed", final_res.model_dump())
            return

        # Step 1: Retrieval
        search_queries = plan.search_queries if plan.search_queries else [plan.standalone_query or payload.query]
        retrieval_mode = plan.retrieval_mode
        retrieval_res = None

        try:
            # Focused or broad retrieval
            focused_q = (plan.search_queries[0] if plan.search_queries else None) or plan.target or plan.standalone_query or payload.query
            retrieval_res = retrieve_evidence(
                project_id=payload.projectId,
                query=focused_q,
                top_k=top_k,
                request_id=req_id,
                search_queries=plan.search_queries,
                lexical_anchors=plan.lexical_anchors,
                question_slot=plan.question_slot,
            )
        except Exception as ret_err:
            logger.error("[/generate/stream retrieval error] %s", ret_err)
            yield _format_sse("generation.failed", {"code": "RETRIEVAL_ERROR", "message": str(ret_err)})
            return

        yield _format_sse("retrieval.completed", {"generationId": gen_id, "evidenceCount": len(retrieval_res.results)})

        # Sufficiency check
        first_pass_sufficient = bool(
            retrieval_res.sufficiency
            and retrieval_res.sufficiency.sufficient
            and retrieval_res.results
        )
        fallback_used = False
        if not first_pass_sufficient and intent != "unsupported_query":
            candidate_fallbacks = [sq for sq in plan.search_queries[1:] if sq and sq != focused_q]
            if plan.standalone_query and plan.standalone_query != focused_q and plan.standalone_query not in candidate_fallbacks:
                candidate_fallbacks.append(plan.standalone_query)
            if payload.query != focused_q and payload.query not in candidate_fallbacks:
                candidate_fallbacks.append(payload.query)
            fallback_q = candidate_fallbacks[0] if candidate_fallbacks else None
            if fallback_q:
                try:
                    fallback_res = retrieve_evidence(
                        project_id=payload.projectId,
                        query=fallback_q,
                        top_k=top_k,
                        request_id=req_id
                    )
                    if fallback_res.sufficiency and fallback_res.sufficiency.sufficient and fallback_res.results:
                        retrieval_res = fallback_res
                        fallback_used = True
                except Exception:
                    pass

        if not retrieval_res.sufficiency or not retrieval_res.sufficiency.sufficient or not retrieval_res.results:
            reason = retrieval_res.sufficiency.reason if retrieval_res.sufficiency else "No evidence retrieved"
            doc_summary = get_project_knowledge_summary(payload.projectId)
            doc_titles = doc_summary.get("filenames", []) if isinstance(doc_summary, dict) else []
            unsupported_msg = await generate_abstention_llm(
                query=payload.query,
                insufficiency_reason=reason,
                project_name=project_name,
                target_doc=plan.resolved_document_name,
                llm_runtime=llm_runtime,
            )
            yield _format_sse("answer.started", {"generationId": gen_id})
            yield _format_sse("answer.delta", {"generationId": gen_id, "delta": unsupported_msg, "sequence": seq})
            seq += 1
            yield _format_sse("answer.completed", {"generationId": gen_id, "answer": unsupported_msg})
            yield _format_sse("claims.completed", {"generationId": gen_id, "claims": []})
            final_res = GenerateResult(
                requestId=req_id,
                generationId=gen_id,
                status="completed",
                answer=unsupported_msg,
                evidence=retrieval_res.results,
                sufficiency=retrieval_res.sufficiency,
                modelVersion="groundguard-abstention-gate",
                metadata={
                    "abstention": True,
                    "reason": reason,
                    "candidateCount": len(retrieval_res.results),
                    "intent": "grounded_query_insufficient",
                    "task": plan.task,
                    "fallbackUsed": fallback_used,
                },
                claims=[]
            )
            yield _format_sse("generation.completed", final_res.model_dump())
            return

        # Context & prompt
        context_text, included_items, omitted_items = context_builder.build_context(retrieval_res.results)
        user_prompt = build_grounded_user_prompt(
            query=payload.query,
            evidence_context=context_text,
            conversation_context=payload.conversationContext,
            standalone_query=plan.standalone_query,
            operation=plan.operation,
            is_proposition=plan.is_proposition,
        )

        # Real LLM Streaming
        full_answer_chunks: List[str] = []
        yield _format_sse("answer.started", {"generationId": gen_id})

        t_llm_start = time.perf_counter()
        try:
            async for chunk in llm_runtime.stream_answer(user_prompt):
                if chunk:
                    full_answer_chunks.append(chunk)
                    yield _format_sse("answer.delta", {"generationId": gen_id, "delta": chunk, "sequence": seq})
                    seq += 1
        except Exception as stream_err:
            logger.error("[/generate/stream LLM failure] %s", stream_err)
            yield _format_sse("generation.failed", {"code": "LLM_ERROR", "message": f"LLM stream failed: {stream_err}"})
            return

        llm_latency_ms = int((time.perf_counter() - t_llm_start) * 1000)
        full_answer = "".join(full_answer_chunks).strip()
        yield _format_sse("answer.completed", {"generationId": gen_id, "answer": full_answer})

        # Claim extraction on completed answer
        claims: List[ClaimItem] = []
        claim_meta = {"status": "skipped"}
        try:
            raw_claims = await extract_and_validate_claims(
                answer=full_answer,
                evidence=included_items
            )
            claims = [ClaimItem(**c) for c in raw_claims]
            claim_meta = {"status": "completed", "claimCount": len(claims)}
        except Exception as c_err:
            logger.error("[/generate/stream claim extraction error] %s", c_err)
            claim_meta = {"status": "failed", "error": str(c_err)}

        yield _format_sse("claims.completed", {"generationId": gen_id, "claims": [c.model_dump() for c in claims]})

        final_res = GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=full_answer,
            evidence=included_items,
            sufficiency=retrieval_res.sufficiency,
            modelVersion=llm_runtime.get_model_version(),
            metadata={
                "abstention": False,
                "evidenceCount": len(included_items),
                "omittedCount": len(omitted_items),
                "llmLatencyMs": llm_latency_ms,
                "provider": llm_runtime.provider,
                "claimExtraction": claim_meta,
                "task": plan.task,
                "retrievalMode": plan.retrieval_mode,
                "retrievalStrategy": plan.retrieval_strategy,
                "operation": plan.operation,
                "sourceScope": plan.source_scope,
                "target": plan.target,
                "resolvedDocumentId": plan.resolved_document_id,
                "resolvedDocumentName": plan.resolved_document_name,
                "fallbackUsed": fallback_used,
            },
            claims=claims
        )
        yield _format_sse("generation.completed", final_res.model_dump())

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

@app.post("/recover", response_model=RecoverResponse)
async def recover(payload: RecoverRequest, x_request_id: Optional[str] = Header(None)):
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    logger.info(
        f"[/recover] claim_id={payload.claimId} req_id={req_id} "
        f"attempt={payload.attempt} reason={payload.failureReason} "
        f"useLangGraph={payload.useLangGraph}"
    )
    if payload.useLangGraph:
        from src.pipeline.recovery_graph import run_langgraph_recovery
        result = await run_langgraph_recovery(
            project_id=payload.projectId,
            claim_id=payload.claimId,
            claim=payload.claim,
            failure_reason=payload.failureReason,
            attempt=payload.attempt,
            request_id=req_id
        )
    else:
        from src.pipeline.recovery import execute_recovery
        result = await execute_recovery(
            project_id=payload.projectId,
            claim_id=payload.claimId,
            claim=payload.claim,
            failure_reason=payload.failureReason,
            attempt=payload.attempt,
            request_id=req_id
        )

    return RecoverResponse(
        requestId=req_id,
        claimId=payload.claimId,
        action=result.action,
        candidateClaim=result.candidateClaim,
        recoveryEvidence=result.recoveryEvidence,
        modelVersion=result.modelVersion,
        reason=result.reason
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_SERVICE_PORT", os.getenv("AI_PORT", 8000)))
    uvicorn.run(app, host="0.0.0.0", port=port)
