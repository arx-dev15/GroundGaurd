import os
import uuid
import logging
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Header, Request, Response, File, UploadFile, Form
from pydantic import BaseModel, Field

from src.pipeline.parser import parse_pdf
from src.pipeline.chunker import chunk_pages
from src.pipeline.embedder import generate_embeddings
from src.pipeline.db import save_chunks_to_db, retrieve_ready_chunks

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("m2-ai-service")

app = FastAPI(title="GroundGuard M2 AI Service", version="0.1.0")

ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "http://localhost:8001")

# Models for contracts
class IngestResponse(BaseModel):
    documentId: str
    status: str = "completed"
    chunksCreated: int = 0
    errorMessage: Optional[str] = None

class RetrieveRequest(BaseModel):
    projectId: str
    query: str
    topK: Optional[int] = 5

class EvidenceItem(BaseModel):
    evidenceId: Optional[str] = None
    chunkId: str
    documentId: Optional[str] = None
    text: str
    metadata: Optional[Dict[str, Any]] = None

class RetrieveResult(BaseModel):
    results: List[EvidenceItem] = []

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
    note: str = "Placeholder contract: real RAG & LLM generation deferred"

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
    note: str = "Placeholder contract: recovery agent deferred"

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
        return IngestResponse(documentId=doc_id, status="failed", chunksCreated=0, errorMessage="Missing PDF file attachment")

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
        chunks_count = save_chunks_to_db(doc_id, chunks, embeddings)

        return IngestResponse(
            documentId=doc_id,
            status="completed",
            chunksCreated=chunks_count
        )
    except Exception as e:
        logger.error(f"[/ingest error] doc_id={doc_id}: {e}")
        return IngestResponse(
            documentId=doc_id,
            status="failed",
            chunksCreated=0,
            errorMessage="Internal error during PDF parsing/embedding"
        )

@app.post("/retrieve", response_model=RetrieveResult)
async def retrieve(payload: RetrieveRequest, x_request_id: Optional[str] = Header(None)):
    logger.info(f"[/retrieve] project_id={payload.projectId} query='{payload.query}' req_id={x_request_id}")
    # Phase 3 scope defers HTTP retrieval to Phase 4. Internal retrieve_ready_chunks helper remains intact in db.py.
    return RetrieveResult(
        results=[
            EvidenceItem(
                evidenceId="ev_placeholder_001",
                chunkId="chk_placeholder_001",
                documentId="doc_placeholder_001",
                text=f"Placeholder evidence for query '{payload.query}' in project '{payload.projectId}'. Full vector retrieval deferred to Phase 4.",
                metadata={"page": 1, "chunkIndex": 0}
            )
        ]
    )

@app.post("/generate", response_model=GenerateResult)
async def generate(payload: GenerateRequest, x_request_id: Optional[str] = Header(None)):
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    gen_id = payload.generationId or f"gen_{uuid.uuid4().hex[:12]}"
    logger.info(f"[/generate] project_id={payload.projectId} req_id={req_id} gen_id={gen_id}")
    return GenerateResult(
        requestId=req_id,
        generationId=gen_id,
        status="completed",
        answer=f"This is a placeholder answer for query '{payload.query}'.",
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
