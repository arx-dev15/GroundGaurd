import os
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
import sys
import uuid
import logging
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), ".env"))

# Ensure services/ai directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Header, Request, Response, File, UploadFile, Form, Query, HTTPException
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

ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "http://localhost:8001")

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

class ReconcileRequest(BaseModel):
    projectId: str
    validChunkIds: List[str]

class ReconcileResponse(BaseModel):
    projectId: str
    purgedVectorsCount: int
    success: bool

class GenerateRequest(BaseModel):
    requestId: Optional[str] = None
    generationId: Optional[str] = None
    projectId: str
    query: str
    options: Optional[Dict[str, Any]] = None

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
    candidateClaim: str
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

@app.post("/reconcile", response_model=ReconcileResponse)
async def reconcile_vectors(payload: ReconcileRequest, x_request_id: Optional[str] = Header(None)):
    """
    Reconciles derived vector index against PostgreSQL canonical chunk IDs (Flaw 6 Fix).
    Purges ghost/orphaned vector points remaining from interrupted ingests or failed compensating purges.
    """
    logger.info(f"[/reconcile] project_id={payload.projectId} valid_chunks={len(payload.validChunkIds)}")
    try:
        purged = qdrant_store.reconcile_project_vectors(
            project_id=payload.projectId,
            valid_chunk_ids=set(payload.validChunkIds)
        )
        return ReconcileResponse(
            projectId=payload.projectId,
            purgedVectorsCount=purged,
            success=True
        )
    except Exception as e:
        logger.error(f"Vector reconciliation failed for project {payload.projectId}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
    Canonical Phase 5 Grounded Generation Pipeline:
    1. Reuses canonical Phase 4 retrieve_evidence internally (zero self-HTTP)
    2. Evaluates Deterministic Evidence Sufficiency Gate
       - If insufficient / empty: abstains cleanly without calling LLM
    3. If sufficient: builds bounded evidence context and safe prompt
    4. Invokes Real LLM runtime (fails explicitly if unavailable)
    5. Returns grounded answer, evidence provenance, and sufficiency metadata.
    """
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    gen_id = payload.generationId or f"gen_{uuid.uuid4().hex[:12]}"
    top_k = (payload.options or {}).get("topK", 5)

    logger.info(f"[/generate start] project_id={payload.projectId} req_id={req_id} gen_id={gen_id} query='{payload.query}'")

    # Step 0: Conversational & Intent Routing Layer
    intent, sub_intent = classify_intent(payload.query)
    logger.info(f"[/generate intent] project_id={payload.projectId} req_id={req_id} intent={intent} sub_intent={sub_intent}")

    if intent == "conversational":
        reply = generate_conversational_response(sub_intent)
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=reply,
            evidence=[],
            sufficiency=None,
            modelVersion="groundguard-conversational",
            metadata={
                "intent": "conversational",
                "subIntent": sub_intent,
                "abstention": False,
            },
            claims=[]
        )

    if intent == "product_help":
        doc_summary = get_project_knowledge_summary(payload.projectId)
        reply = generate_product_help_response(doc_summary)
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=reply,
            evidence=[],
            sufficiency=None,
            modelVersion="groundguard-product-help",
            metadata={
                "intent": "product_help",
                "readyDocumentCount": doc_summary.get("readyCount", 0),
                "abstention": False,
            },
            claims=[]
        )

    # Step 1: Internal Phase 4 Retrieval Reuse (direct Python function call)
    try:
        retrieval_res = retrieve_evidence(
            project_id=payload.projectId,
            query=payload.query,
            top_k=top_k,
            request_id=req_id
        )
    except Exception as ret_err:
        logger.error(f"[/generate retrieval error] project_id={payload.projectId} req_id={req_id}: {ret_err}")
        raise HTTPException(
            status_code=503,
            detail=f"Retrieval infrastructure failure during generation: {ret_err}"
        )

    # Step 2: Deterministic Evidence Sufficiency Gate
    if not retrieval_res.sufficiency or not retrieval_res.sufficiency.sufficient or not retrieval_res.results:
        reason = retrieval_res.sufficiency.reason if retrieval_res.sufficiency else "No evidence retrieved"
        logger.info(f"[/generate abstained] project_id={payload.projectId} req_id={req_id} reason='{reason}'")
        doc_summary = get_project_knowledge_summary(payload.projectId)
        unsupported_msg = generate_unsupported_query_response(payload.query, doc_summary)
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
            },
            claims=[]
        )

    # Step 3: Context Building & Prompt Construction
    context_text, included_items, omitted_items = context_builder.build_context(retrieval_res.results)
    user_prompt = build_grounded_user_prompt(payload.query, context_text)

    # Step 4: Real LLM Inference
    try:
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
                "claimExtraction": claim_extraction_meta
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
    port = int(os.getenv("PORT", os.getenv("AI_SERVICE_PORT", 8000)))
    uvicorn.run(app, host="0.0.0.0", port=port)
