from typing import List, Optional
from pydantic import BaseModel, Field

class Scores(BaseModel):
    entailment: float = Field(..., description="Probability of entailment")
    contradiction: float = Field(..., description="Probability of contradiction")
    neutral: float = Field(..., description="Probability of neutral")

class VerifyResponse(BaseModel):
    requestId: str = Field(..., description="Trace ID for the request")
    claimId: Optional[str] = Field(None, description="Claim identifier")
    label: str = Field(..., description="Result: 'entailment' | 'contradiction' | 'neutral'")
    scores: Scores = Field(..., description="Distribution of class probabilities")
    groundingScore: float = Field(..., description="Calibrated factual confidence score (0.0 to 1.0)")
    modelVersion: str = Field(..., description="Identifier of the model used for inference")

class VerifyResultItem(BaseModel):
    claimId: str = Field(..., description="Claim identifier")
    label: str = Field(..., description="'entailment' | 'contradiction' | 'neutral'")
    scores: Scores = Field(..., description="Probabilities")
    groundingScore: float = Field(..., description="Factual confidence score")

class BatchVerifyResponse(BaseModel):
    requestId: str = Field(..., description="Trace ID for the batch request")
    results: List[VerifyResultItem] = Field(..., description="Verification results for all claims")
    modelVersion: str = Field(..., description="Model version")

class HealthResponse(BaseModel):
    service: str = Field("ml", description="Service identifier")
    status: str = Field("ok", description="Health status")
    modelLoaded: bool = Field(True, description="Whether the inference engine is loaded")
    modelVersion: str = Field(..., description="Active model version")
    device: str = Field("cpu", description="Hardware device running the model")

class ModelInfoResponse(BaseModel):
    modelVersion: str = Field(..., description="Model version string")
    engineType: str = Field(..., description="Engine type (mock, deberta-cross-encoder, onnx)")
    baseModel: str = Field(..., description="Base model name or architecture")
    labels: List[str] = Field(default=["entailment", "contradiction", "neutral"], description="Classification labels")
    status: str = Field("ready", description="Model readiness")