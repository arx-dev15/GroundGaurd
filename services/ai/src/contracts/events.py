"""
GroundGuard Contracts: Dual-Track Verification Events and Structured Lineage
Defines the canonical typed schemas for EvidenceChunks and in-flight SentenceVerificationEvents.
"""

import time
from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class SentenceStatus(str, Enum):
    VERIFIED = "VERIFIED"
    RECOVERED = "RECOVERED"
    FALLBACK = "FALLBACK"
    UNVERIFIED = "UNVERIFIED"
    REJECTED = "REJECTED"


class EvidenceChunk(BaseModel):
    """
    Typed, project-scoped evidence chunk stamped with complete lineage.
    Enforces tenant boundaries and metadata preservation.
    """
    chunk_id: str
    document_id: str
    project_id: str
    text: str
    page_number: int = 1
    section: Optional[str] = None
    heading: Optional[str] = None
    identifiers: List[str] = Field(default_factory=list)
    is_distractor: bool = False  # Set to True for TOC, Index, or Glossary pages
    dense_score: Optional[float] = None
    lexical_score: Optional[float] = None
    graph_score: Optional[float] = None
    rrf_score: Optional[float] = None
    rerank_score: Optional[float] = None
    sources: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SentenceVerificationEvent(BaseModel):
    """
    Real-time streaming event emitted for each in-flight generated sentence.
    Matches SSE microservice contracts: sentence.verified, sentence.recovered, sentence.fallback.
    """
    event: str  # "sentence.verified" | "sentence.recovered" | "sentence.fallback" | "prefilter.exit"
    sentence_index: int
    text: str
    original_text: Optional[str] = None
    status: SentenceStatus
    score: float = 0.0
    label: Optional[str] = None  # "entailment" | "contradiction" | "neutral"
    repair_track: Optional[str] = None  # "fast_path" | "deep_path" | None
    evidence_chunk_ids: List[str] = Field(default_factory=list)
    reason: Optional[str] = None
    timestamp_ms: float = Field(default_factory=lambda: time.time() * 1000.0)


class SufficiencyResult(BaseModel):
    """
    Calibrated Sufficiency Gate decision.
    Requires both S >= 0.35 AND entity match >= 1.
    """
    sufficient: bool
    score: float
    entity_matches: int
    reason: str
    is_early_exit: bool = False
