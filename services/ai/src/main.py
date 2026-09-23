import os
import sys
import uuid
import logging

# Ensure services/ai directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Header, Request, Response, File, UploadFile, Form, Query, HTTPException
from pydantic import BaseModel, Field

from src.pipeline.parser import parse_pdf
from src.pipeline.chunker import chunk_pages
from src.pipeline.embedder import generate_embeddings
from src.pipeline.db import validate_ready_documents
from src.pipeline.qdrant_store import qdrant_store
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.graph_store import graph_store

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

class EvidenceItem(BaseModel):
    evidenceId: Optional[str] = None
    chunkId: str
    documentId: Optional[str] = None
    text: str
    score: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None

class RetrieveResult(BaseModel):
    results: List[EvidenceItem] = []

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
    options: Optional[Dict[str, Any]] = None

class ClaimItem(BaseModel):
    claimId: str
    text: str
    status: str
    verification: Optional[Dict[str, Any]] = None
    evidence: List[EvidenceItem] = []

class GenerateResult(BaseModel):
    requestId: str
    generationId: str
    status: str = "completed"
    answer: str
    claims: List[ClaimItem] = []
    note: str = "Placeholder contract: real RAG & LLM generation deferred to Phase 5"

class RecoverRequest(BaseModel):
    requestId: Optional[str] = None
    claimId: str
    claim: str
    evidence: List[EvidenceItem] = []
    failureReason: str

class RecoverResponse(BaseModel):
    requestId: str
    claimId: str
    status: str = "recovered"
    recoveredClaim: str
    note: str = "Placeholder contract: recovery agent deferred to Phase 5"

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

@app.post("/retrieve", response_model=RetrieveResult)
async def retrieve(payload: RetrieveRequest, x_request_id: Optional[str] = Header(None)):
    """
    Multi-source candidate retrieval:
    1. Query-level project-isolated candidate retrieval from Qdrant (dense vectors) and Tantivy (lexical BM25).
    2. PostgreSQL canonical lifecycle validation (ensures only documents in status='ready' are returned).
    3. Union deduplication by chunkId.
    (Note: Query routing, reciprocal rank fusion, and cross-encoder reranking belong to Phase 4).
    """
    logger.info(f"[/retrieve] project_id={payload.projectId} query='{payload.query}' req_id={x_request_id}")
    top_k = payload.topK or 5

    try:
        # 1. Dense Search via Qdrant (project-isolated)
        query_vector = generate_embeddings([payload.query])[0] if payload.query else []
        qdrant_hits = qdrant_store.search_dense(payload.projectId, query_vector, top_k)

        # 2. Lexical Search via Tantivy (project-isolated)
        tantivy_hits = tantivy_store.search_project(payload.projectId, payload.query, top_k)

        # 3. PostgreSQL Lifecycle Validation Invariant:
        # Ensure evidence only comes from documents that are actively 'ready' in the authorized project
        candidate_doc_ids = list(set(
            [h["documentId"] for h in qdrant_hits if h.get("documentId")] +
            [h["documentId"] for h in tantivy_hits if h.get("documentId")]
        ))

        ready_doc_ids = validate_ready_documents(payload.projectId, candidate_doc_ids)

        # 4. Filter candidates
        valid_qdrant = [h for h in qdrant_hits if h.get("documentId") in ready_doc_ids]
        valid_tantivy = [h for h in tantivy_hits if h.get("documentId") in ready_doc_ids]

        # Combine results deduplicating by chunkId
        combined: Dict[str, EvidenceItem] = {}
        for hit in valid_qdrant:
            c_id = hit["chunkId"]
            if c_id not in combined:
                combined[c_id] = EvidenceItem(
                    evidenceId=f"ev_{uuid.uuid4().hex[:8]}",
                    chunkId=c_id,
                    documentId=hit.get("documentId"),
                    text=hit.get("text", ""),
                    score=hit.get("score"),
                    metadata={
                        "source": "qdrant_dense",
                        "page": hit.get("pageNumber"),
                        "chunkIndex": hit.get("chunkIndex"),
                        "section": hit.get("section"),
                        "heading": hit.get("heading")
                    }
                )

        for hit in valid_tantivy:
            c_id = hit["chunkId"]
            if c_id not in combined:
                combined[c_id] = EvidenceItem(
                    evidenceId=f"ev_{uuid.uuid4().hex[:8]}",
                    chunkId=c_id,
                    documentId=hit.get("documentId"),
                    text=hit.get("text", ""),
                    score=hit.get("score"),
                    metadata={
                        "source": "tantivy_lexical",
                        "page": hit.get("pageNumber"),
                        "identifiers": hit.get("identifiers")
                    }
                )

        return RetrieveResult(results=list(combined.values())[:top_k])

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
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    gen_id = payload.generationId or f"gen_{uuid.uuid4().hex[:12]}"
    logger.info(f"[/generate] project_id={payload.projectId} req_id={req_id} gen_id={gen_id}")
    return GenerateResult(
        requestId=req_id,
        generationId=gen_id,
        status="completed",
        answer=f"This is a placeholder answer for query '{payload.query}'. Full generation deferred to Phase 5.",
        claims=[]
    )

@app.post("/recover", response_model=RecoverResponse)
async def recover(payload: RecoverRequest, x_request_id: Optional[str] = Header(None)):
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    logger.info(f"[/recover] claim_id={payload.claimId} req_id={req_id}")
    return RecoverResponse(
        requestId=req_id,
        claimId=payload.claimId,
        status="recovered",
        recoveredClaim=f"Recovered version of: {payload.claim}"
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
