from typing import List, Optional
from pydantic import BaseModel, Field

class EvidenceChunk(BaseModel):
    chunkId: str = Field(..., description="Unique ID of the retrieved document chunk")
    text: str = Field(..., description="The raw evidence text retrieved from the document")

class VerifyRequest(BaseModel):
    requestId: Optional[str] = Field(None, description="Unique trace ID for the end-to-end request")
    claimId: Optional[str] = Field(None, description="Unique identifier of the claim")
    claim: str = Field(..., description="The extracted sentence/claim to verify")
    evidence: List[EvidenceChunk] = Field(default_factory=list, description="Array of supporting evidence chunks")

class VerifyItem(BaseModel):
    claimId: str = Field(..., description="Identifier for this specific claim")
    claim: str = Field(..., description="The claim text")
    evidence: List[EvidenceChunk] = Field(default_factory=list, description="Evidence chunks for this claim")

class BatchVerifyRequest(BaseModel):
    requestId: Optional[str] = Field(None, description="Trace ID for the batch request")
    items: List[VerifyItem] = Field(..., description="List of claims to verify concurrently")