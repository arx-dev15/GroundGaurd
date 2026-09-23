import os
import sys
import uuid
import logging
from pathlib import Path
from typing import Optional

# Ensure the service root directory (services/ml) is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from src.config import PORT, HOST, SERVICE_NAME, MODEL_VERSION
from src.contracts import (
    VerifyRequest,
    VerifyResponse,
    BatchVerifyRequest,
    BatchVerifyResponse,
    HealthResponse,
    ModelInfoResponse,
)
from src.inference.mock_engine import mock_engine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("groundguard-ml-service")

# Initialize FastAPI
app = FastAPI(
    title="GroundGuard ML Verification Service",
    description="Evidence-grounded claim verification service",
    version="0.1.0",
)

# Enable CORS for cross-service development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Ensures every incoming request has an x-request-id header attached."""
    req_id = request.headers.get("x-request-id", f"req_{uuid.uuid4().hex[:12]}")
    request.state.request_id = req_id
    response: Response = await call_next(request)
    response.headers["x-request-id"] = req_id
    return response

@app.get("/")
async def root():
    """Root endpoint providing service overview and documentation links."""
    return {
        "service": SERVICE_NAME,
        "status": "running",
        "version": MODEL_VERSION,
        "docs": "/docs",
        "health": "/health",
        "modelInfo": "/model/info"
    }

@app.get("/health", response_model=HealthResponse)
async def health():
    """Liveness & Readiness health probe for Member 3 and Docker."""
    return HealthResponse(
        service=SERVICE_NAME,
        status="ok",
        modelLoaded=True,
        modelVersion=MODEL_VERSION,
        device="cpu"
    )

@app.get("/model/info", response_model=ModelInfoResponse)
async def model_info():
    """Returns active model metadata for the frontend evaluation dashboard."""
    return ModelInfoResponse(
        modelVersion=MODEL_VERSION,
        engineType="mock-heuristic",
        baseModel="rule-based-mock",
        labels=["entailment", "contradiction", "neutral"],
        status="ready"
    )

@app.post("/verify", response_model=VerifyResponse)
async def verify(payload: VerifyRequest, x_request_id: Optional[str] = Header(None)):
    """Verifies a single factual claim against evidence chunks."""
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    claim_id = payload.claimId or "claim_1"
    
    logger.info(f"[/verify] req_id={req_id} claim_id={claim_id} claim='{payload.claim}'")
    
    label, scores, grounding_score = mock_engine.verify_single(
        claim=payload.claim,
        evidence=payload.evidence,
        claim_id=claim_id
    )

    return VerifyResponse(
        requestId=req_id,
        claimId=claim_id,
        label=label,
        scores=scores,
        groundingScore=grounding_score,
        modelVersion=MODEL_VERSION,
    )

@app.post("/verify/batch", response_model=BatchVerifyResponse)
async def verify_batch(payload: BatchVerifyRequest, x_request_id: Optional[str] = Header(None)):
    """Verifies a batch of claims concurrently."""
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    logger.info(f"[/verify/batch] req_id={req_id} total_claims={len(payload.items)}")

    results = mock_engine.verify_batch(payload.items)

    return BatchVerifyResponse(
        requestId=req_id,
        results=results,
        modelVersion=MODEL_VERSION,
    )

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting ML Verification Service on {HOST}:{PORT} (Version: {MODEL_VERSION})")
    uvicorn.run("src.main:app", host=HOST, port=PORT, reload=True)