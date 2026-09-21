import os
import uuid
import logging
from typing import List, Optional, Dict
from fastapi import FastAPI, Header, Request, Response
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("m1-mock-ml-service")

app = FastAPI(title="GroundGuard Mock M1 ML Service", version="0.1.0")

class EvidenceItem(BaseModel):
    chunkId: str
    text: str

class VerifyRequest(BaseModel):
    requestId: Optional[str] = None
    claimId: str
    claim: str
    evidence: List[EvidenceItem] = []

class VerifyResponse(BaseModel):
    requestId: str
    claimId: str
    label: str
    scores: Dict[str, float]
    groundingScore: float
    modelVersion: str

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", f"req_{uuid.uuid4().hex[:12]}")
    request.state.request_id = request_id
    response: Response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response

@app.get("/health")
async def health():
    return {"service": "ml", "status": "ok"}

@app.post("/verify", response_model=VerifyResponse)
async def verify(payload: VerifyRequest, x_request_id: Optional[str] = Header(None)):
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    logger.info(f"[/verify] claim_id={payload.claimId} req_id={req_id} claim='{payload.claim}'")
    
    # Simple deterministic logic for mock testing if claim mentions specific numbers or text
    # Default is mock contradiction as per spec example
    label = "contradiction"
    scores = {"entailment": 0.01, "contradiction": 0.96, "neutral": 0.03}
    grounding_score = 0.01

    if "entail" in payload.claim.lower() or (payload.evidence and payload.evidence[0].text == payload.claim):
        label = "entailment"
        scores = {"entailment": 0.97, "contradiction": 0.01, "neutral": 0.02}
        grounding_score = 0.97

    return VerifyResponse(
        requestId=req_id,
        claimId=payload.claimId,
        label=label,
        scores=scores,
        groundingScore=grounding_score,
        modelVersion="mock-grounding-v1"
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
