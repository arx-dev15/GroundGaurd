import re
import logging
from typing import List, Optional
from pydantic import BaseModel, Field

from src.pipeline.extractor import extract_identifiers, Identifier

logger = logging.getLogger("m2-router")

# Relationship/topology keywords and phrases
RELATIONSHIP_PATTERNS = [
    re.compile(r'\bupstream\b', re.IGNORECASE),
    re.compile(r'\bdownstream\b', re.IGNORECASE),
    re.compile(r'\bconnect(?:ed|s|ing)?(?:\s+to)?\b', re.IGNORECASE),
    re.compile(r'\bfeeds?(?:\s+into)?\b', re.IGNORECASE),
    re.compile(r'\bfed\s+by\b', re.IGNORECASE),
    re.compile(r'\bsuppl(?:ies|y|ied)\b', re.IGNORECASE),
    re.compile(r'\brelationship(?:s)?\b', re.IGNORECASE),
    re.compile(r'\bbetween\b', re.IGNORECASE),
    re.compile(r'\blink(?:ed|s|ing)?\b', re.IGNORECASE),
    re.compile(r'\bflow\s+(?:from|to)\b', re.IGNORECASE),
    re.compile(r'\bisolated\s+by\b', re.IGNORECASE),
    re.compile(r'\bdischarges?\s+(?:in)?to\b', re.IGNORECASE),
    re.compile(r'\btopology\b', re.IGNORECASE),
]

class RouteDecision(BaseModel):
    dense: bool = True
    lexical: bool = True
    graph: bool = False
    identifierQuery: bool = False
    extractedIdentifiers: List[str] = Field(default_factory=list)
    relationshipIntent: bool = False
    reasons: List[str] = Field(default_factory=list)
    rawQuery: Optional[str] = None

def route_query(query: str) -> RouteDecision:
    """
    Deterministically routes the query to appropriate stores.
    - dense = True (always in Phase 4 MVP)
    - lexical = True (always in Phase 4 MVP)
    - identifierQuery = True if normalized technical codes/equipment tags detected
    - graph = True ONLY if relationship/topology intent is detected
    """
    clean_query = (query or "").strip()
    reasons = ["Dense retrieval enabled (baseline)", "Lexical retrieval enabled (BM25 keyword/tag matching)"]

    # 1. Identifier extraction using Phase 3 extractor
    identifiers: List[Identifier] = extract_identifiers(clean_query)
    extracted_tokens = [ident.normalized for ident in identifiers]
    is_identifier_query = len(extracted_tokens) > 0
    if is_identifier_query:
        reasons.append(f"Identifier recognized: {', '.join(extracted_tokens)}")

    # 2. Relationship / topology intent detection
    has_relationship_intent = False
    for pat in RELATIONSHIP_PATTERNS:
        if pat.search(clean_query):
            has_relationship_intent = True
            break

    # Graph routing: activate NetworkX only for relationship/topology queries
    # Either explicit relationship keywords with or without identifiers
    graph_enabled = has_relationship_intent
    if graph_enabled:
        reasons.append("Relationship intent detected: NetworkX topology enabled")

    return RouteDecision(
        dense=True,
        lexical=True,
        graph=graph_enabled,
        identifierQuery=is_identifier_query,
        extractedIdentifiers=extracted_tokens,
        relationshipIntent=has_relationship_intent,
        reasons=reasons,
        rawQuery=clean_query
    )
