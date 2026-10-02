import os
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
import sys
import uuid
import json
import logging
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

# Ensure the service root directory (services/ml) is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, Header, Request, Response, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from src.config import PORT, HOST, SERVICE_NAME, MODEL_VERSION, MODEL_NAME, USE_NEURAL_ENGINE
from src.contracts import (
    VerifyRequest,
    VerifyResponse,
    BatchVerifyRequest,
    BatchVerifyResponse,
    HealthResponse,
    ModelInfoResponse,
)
from src.inference.mock_engine import mock_engine
from src.inference.predictor import neural_predictor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("groundguard-ml-service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-warms the neural cross-encoder at server startup."""
    if USE_NEURAL_ENGINE:
        logger.info(f"Pre-warming DeBERTa Cross-Encoder ({MODEL_NAME})...")
        try:
            neural_predictor.load_model()
            logger.info("DeBERTa Cross-Encoder loaded and ready!")
        except Exception as e:
            logger.error(f"FATAL: Required neural model failed to load from '{MODEL_NAME}': {e}", exc_info=True)
            raise RuntimeError(
                f"Failed to load required neural model '{MODEL_NAME}'. "
                "Ensure fine-tuned weights exist (e.g. models/groundguard-deberta-v1/model.safetensors). "
                "Silent fallback to mock engine is disabled when USE_NEURAL_ENGINE=true."
            ) from e
    else:
        logger.info("Explicit mock mode active (USE_NEURAL_ENGINE=false). Running deterministic mock engine.")
    yield
    logger.info("Shutting down GroundGuard ML Service...")

# Initialize FastAPI
app = FastAPI(
    title="GroundGuard ML Verification Service",
    description="Evidence-grounded claim verification service powered by DeBERTa-v3 Cross-Encoder",
    version="0.2.0",
    lifespan=lifespan,
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
        "modelInfo": "/model/info",
        "evaluate": "/evaluate"
    }

def get_active_engine():
    """Returns the neural predictor if loaded, otherwise returns mock engine only in explicit mock mode."""
    if USE_NEURAL_ENGINE:
        if neural_predictor.is_loaded:
            return neural_predictor
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Neural model required but not loaded into memory"
        )
    return mock_engine


@app.get("/health", response_model=HealthResponse)
async def health(response: Response):
    """Liveness & Readiness health probe for Member 3 and Docker."""
    if USE_NEURAL_ENGINE:
        if neural_predictor.is_loaded:
            return HealthResponse(
                service=SERVICE_NAME,
                status="ok",
                modelLoaded=True,
                modelVersion=MODEL_VERSION,
                device=str(neural_predictor.device)
            )
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(
            service=SERVICE_NAME,
            status="degraded",
            modelLoaded=False,
            modelVersion="unloaded",
            device="cpu"
        )
    return HealthResponse(
        service=SERVICE_NAME,
        status="ok",
        modelLoaded=False,
        modelVersion="mock-engine-v1",
        device="cpu"
    )

@app.get("/model/info", response_model=ModelInfoResponse)
async def model_info(response: Response):
    """Returns active model metadata for the frontend evaluation dashboard."""
    if USE_NEURAL_ENGINE:
        if neural_predictor.is_loaded:
            return ModelInfoResponse(
                modelVersion=MODEL_VERSION,
                engineType="deberta-cross-encoder",
                baseModel=MODEL_NAME,
                labels=["contradiction", "entailment", "neutral"],
                status="ready"
            )
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ModelInfoResponse(
            modelVersion="unloaded",
            engineType="none",
            baseModel=MODEL_NAME,
            labels=["contradiction", "entailment", "neutral"],
            status="not_ready"
        )
    return ModelInfoResponse(
        modelVersion="mock-engine-v1",
        engineType="mock-heuristic",
        baseModel="rule-based-mock",
        labels=["contradiction", "entailment", "neutral"],
        status="ready"
    )

@app.post("/verify", response_model=VerifyResponse)
async def verify(payload: VerifyRequest, x_request_id: Optional[str] = Header(None)):
    """Verifies a single factual claim against evidence chunks."""
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    claim_id = payload.claimId or "claim_1"
    
    logger.info(f"[/verify] req_id={req_id} claim_id={claim_id} claim='{payload.claim}'")
    
    engine = get_active_engine()
    label, scores, grounding_score = engine.verify_single(
        claim=payload.claim,
        evidence=payload.evidence,
        claim_id=claim_id
    )

    active_version = MODEL_VERSION if (USE_NEURAL_ENGINE and neural_predictor.is_loaded) else "mock-engine-v1"

    return VerifyResponse(
        requestId=req_id,
        claimId=claim_id,
        label=label,
        scores=scores,
        groundingScore=grounding_score,
        modelVersion=active_version,
    )

@app.post("/verify/batch", response_model=BatchVerifyResponse)
async def verify_batch(payload: BatchVerifyRequest, x_request_id: Optional[str] = Header(None)):
    """Verifies a batch of claims concurrently."""
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    logger.info(f"[/verify/batch] req_id={req_id} total_claims={len(payload.items)}")

    engine = get_active_engine()
    results = engine.verify_batch(payload.items)

    active_version = MODEL_VERSION if (USE_NEURAL_ENGINE and neural_predictor.is_loaded) else "mock-engine-v1"

    return BatchVerifyResponse(
        requestId=req_id,
        results=results,
        modelVersion=active_version,
    )

@app.api_route("/evaluate", methods=["GET", "POST"])
async def evaluate():
    """Returns golden benchmark and multi-baseline comparative metrics."""
    report_path = Path(__file__).resolve().parent.parent / "evaluation" / "reports" / "baseline_comparison.json"
    if report_path.exists():
        with open(report_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "modelVersion": MODEL_VERSION,
            "status": "evaluated",
            "baselines": data
        }
    return {
        "modelVersion": MODEL_VERSION,
        "status": "pending_benchmark",
        "message": "Run evaluation/baselines.py to generate comparative metrics"
    }

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting ML Verification Service on {HOST}:{PORT} (Version: {MODEL_VERSION})")
    uvicorn.run("src.main:app", host=HOST, port=PORT, reload=True)