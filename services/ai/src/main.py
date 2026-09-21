import os
import uuid
import logging
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Header, Request, Response
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("m2-ai-service")

app = FastAPI(title="GroundGuard M2 AI Service", version="0.1.0")

ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "http://localhost:8001")

# Models for contracts
class IngestRequest(BaseModel):
    documentId: str
    projectId: str
    filePath: str

class IngestResponse(BaseModel):
    documentId: str
    status: str = "completed"
    chunksCreated: int = 0
    note: str = "Placeholder contract: real parsing/chunking deferred"

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
async def ingest(payload: IngestRequest, x_request_id: Optional[str] = Header(None)):
    logger.info(f"[/ingest] doc_id={payload.documentId} project_id={payload.projectId} req_id={x_request_id}")
    return IngestResponse(documentId=payload.documentId, status="completed", chunksCreated=0)

@app.post("/retrieve", response_model=RetrieveResult)
async def retrieve(payload: RetrieveRequest, x_request_id: Optional[str] = Header(None)):
    logger.info(f"[/retrieve] project_id={payload.projectId} query='{payload.query}' req_id={x_request_id}")
    return RetrieveResult(results=[])

@app.post("/generate", response_model=GenerateResult)
async def generate(payload: GenerateRequest, x_request_id: Optional[str] = Header(None)):
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    gen_id = payload.generationId or f"gen_{uuid.uuid4().hex[:12]}"
    logger.info(f"[/generate] project_id={payload.projectId} req_id={req_id} gen_id={gen_id}")
    
    mock_claim = ClaimItem(
        claimId="claim_1",
        text=f"Mock answer statement for query: {payload.query}",
        status="verified",
        verification={
            "label": "entailment",
            "scores": {"entailment": 0.98, "contradiction": 0.01, "neutral": 0.01},
            "groundingScore": 0.98,
            "modelVersion": "mock-grounding-v1"
        },
        evidence=[
            EvidenceItem(
                chunkId="chunk_1",
                documentId="doc_1",
                text="Mock evidence text matching query context.",
                metadata={"page": 1}
            )
        ]
    )
    
    return GenerateResult(
        requestId=req_id,
        generationId=gen_id,
        status="completed",
        answer=f"This is a placeholder answer for query '{payload.query}'.",
        claims=[mock_claim]
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
