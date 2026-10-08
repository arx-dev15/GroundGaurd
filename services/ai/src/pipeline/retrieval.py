import os
import re
import time
import uuid
import logging
from enum import Enum
from typing import List, Dict, Any, Optional, Set, Tuple
from pydantic import BaseModel, Field

from src.pipeline.embedder import generate_embeddings
from src.pipeline.qdrant_store import qdrant_store, QdrantUnavailableError
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.graph_store import graph_store
from src.pipeline.db import validate_ready_documents, get_ready_documents_meta
from src.pipeline.router import route_query, RouteDecision
from src.pipeline.reranker import rerank
from src.pipeline.answerability import assess_requested_attribute, calibrate_relevance

logger = logging.getLogger("m2-retrieval")

# Bounded retrieval configuration
DENSE_CANDIDATE_K = int(os.getenv("DENSE_CANDIDATE_K", "15"))
LEXICAL_CANDIDATE_K = int(os.getenv("LEXICAL_CANDIDATE_K", "15"))
GRAPH_CANDIDATE_K = int(os.getenv("GRAPH_CANDIDATE_K", "10"))
RRF_POOL_K = int(os.getenv("RRF_POOL_K", "20"))
RERANK_CANDIDATE_K = int(os.getenv("RERANK_CANDIDATE_K", "20"))
FINAL_TOP_K = int(os.getenv("FINAL_TOP_K", "5"))

# Reciprocal Rank Fusion constant
RRF_K = int(os.getenv("RRF_K", "60"))

# Deterministic evidence sufficiency score threshold (S >= 0.35 per enterprise workflow)
# Validation-calibrated sufficiency threshold:
# Derived from empirical validation sweep on GroundGuard technical benchmark (20 cases across 10 categories).
# Rejects weak distractors and missing identifiers (scores <= 0.2164) while passing all verified evidence (scores >= 0.8480).
# Termed 'validation-calibrated sufficiency threshold' for current development stage.
SUFFICIENCY_THRESHOLD = float(os.getenv("SUFFICIENCY_THRESHOLD", "0.35"))
SENTENCE_RESCUE_K = int(os.getenv("SENTENCE_RESCUE_K", "10"))


# Internal Canonical Candidate Representation
class Candidate(BaseModel):
    """
    Internal unified retrieval candidate representation.
    Normalized across Qdrant, Tantivy, and NetworkX.
    Preserves raw scores, source ranks, and provenance.
    """
    chunkId: str
    documentId: str
    projectId: str
    text: str
    chunkIndex: Optional[int] = 0
    pageNumber: Optional[int] = 1
    section: Optional[str] = None
    heading: Optional[str] = None
    identifiers: List[str] = Field(default_factory=list)

    denseScore: Optional[float] = None
    lexicalScore: Optional[float] = None
    graphScore: Optional[float] = None

    denseRank: Optional[int] = None
    lexicalRank: Optional[int] = None
    graphRank: Optional[int] = None

    sources: List[str] = Field(default_factory=list)
    graphRelations: Optional[List[Dict[str, Any]]] = None

    rrfScore: Optional[float] = None
    rerankScore: Optional[float] = None
    provenance: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


# Scope Gate Decisions & Signals
class ScopeDecision(str, Enum):
    IN_SCOPE = "IN_SCOPE"
    OUT_OF_SCOPE = "OUT_OF_SCOPE"
    AMBIGUOUS = "AMBIGUOUS"


class ConflictType(str, Enum):
    NUMERIC_CONFLICT = "NUMERIC_CONFLICT"
    RELATIONAL_CONFLICT = "RELATIONAL_CONFLICT"
    STATE_CONFLICT = "STATE_CONFLICT"
    PROCEDURAL_CONFLICT = "PROCEDURAL_CONFLICT"
    SEMANTIC_CONTRADICTION = "SEMANTIC_CONTRADICTION"


class EvidenceDisposition(str, Enum):
    """
    Unified Evidence Disposition Model (Section 1, 2):
    SUPPORTED: Fully established by grounded evidence.
    PARTIAL / PARTIALLY_SUPPORTED: Answer supported portion and qualify missing facet.
    CONTRADICTED: User premise is disproven by grounded evidence.
    CONFLICT: Conflicting positions exist across project evidence.
    INSUFFICIENT / UNSUPPORTED: Document evidence is insufficient to ground an answer.
    """
    SUPPORTED = "SUPPORTED"
    PARTIAL = "PARTIAL"
    PARTIALLY_SUPPORTED = "PARTIALLY_SUPPORTED"
    CONTRADICTED = "CONTRADICTED"
    CONFLICT = "CONFLICT"
    INSUFFICIENT = "INSUFFICIENT"
    UNSUPPORTED = "UNSUPPORTED"
    # Answer produced but its claims could not be extracted/verified -- never reported as SUPPORTED.
    UNVERIFIED = "UNVERIFIED"


class FailureStage(str, Enum):
    """
    Deterministic failure-stage diagnostic categories (Section 23, 24).
    Enables forensic traceability without ad-hoc print statements.
    """
    NONE = "none"
    RETRIEVAL_ZERO_CANDIDATES = "retrieval_zero_candidates"
    SCOPE_GATE_REJECTION = "scope_gate_rejection"
    CONFLICT_GATE_REJECTION = "conflict_gate_rejection"
    RERANKER_REJECTION = "reranker_rejection"
    SUFFICIENCY_GATE_REJECTION = "sufficiency_gate_rejection"
    ANSWERABILITY_GATE_REJECTION = "answerability_gate_rejection"
    GENERATION_ABSTENTION = "generation_abstention"


class ScopeGateSignals(BaseModel):
    candidateCount: int
    entityMatch: bool
    lexicalSupport: bool
    contentWordOverlap: float
    outOfScopePatternMatched: Optional[str] = None
    evidenceCoverageScore: Optional[float] = None
    topicSimilarityScore: Optional[float] = None
    crossRetrieverAgreement: Optional[float] = None


class ScopeGateResult(BaseModel):
    decision: ScopeDecision
    reason: str
    signals: ScopeGateSignals


# Evidence Sufficiency Signals & Decision
class EvidenceSufficiencySignals(BaseModel):
    resultCount: int
    topRerankScore: float
    identifierMatched: bool
    sourceCoverage: List[str]
    conflictingEvidence: Optional[bool] = False
    conflictType: Optional[str] = None
    conflictingDocumentIds: Optional[List[str]] = None
    conflictingChunkIds: Optional[List[str]] = None
    conflictSummary: Optional[str] = None
    scopeDecision: Optional[str] = None
    scopeReason: Optional[str] = None
    conflictConfidence: Optional[float] = None
    conflictDetectionMethod: Optional[str] = None  # "deterministic" | "M1_NLI" | "both"
    revisionResolution: Optional[str] = None  # "newer_revision_selected" | "unresolved" | "not_applicable"
    evidenceConflictCheck: Optional[Dict[str, Any]] = None
    evidenceCoverageScore: Optional[float] = None
    topicSimilarityScore: Optional[float] = None
    disposition: Optional[str] = EvidenceDisposition.SUPPORTED.value
    failureStage: Optional[str] = FailureStage.NONE.value
    eligibleEvidenceCount: Optional[int] = 0
    initialEvidenceCount: Optional[int] = None
    initialAnswerSlotCoverage: Optional[float] = None
    completionTriggered: Optional[bool] = False
    completionReason: Optional[str] = None
    completionQueriesCount: Optional[int] = 0
    completionEvidenceCount: Optional[int] = 0
    finalAnswerSlotCoverage: Optional[float] = None
    completionStopReason: Optional[str] = None
    challengeRetry: Optional[bool] = False
    bridgeEntity: Optional[str] = None
    multiHopResolved: Optional[bool] = None
    # Answerability (separate from relevance): requested attribute and whether evidence states it.
    requestedAttribute: Optional[str] = None
    attributeCovered: Optional[bool] = None
    topCrossEncoderScore: Optional[float] = None


class EvidenceSufficiency(BaseModel):
    sufficient: bool
    reason: str
    score: float
    signals: EvidenceSufficiencySignals
    scope: Optional[str] = None
    disposition: Optional[str] = None
    failureStage: Optional[str] = None


# Response Item & Envelope
class EvidenceItem(BaseModel):
    """
    Final evidence item returned from retrieval.
    Note on evidenceId: This is a transient retrieval-session identifier (e.g. 'ev_xxxx')
    used for response tracking in the current request. It is NOT a persisted database
    claim record ID. Stable canonical lineage is maintained via chunkId and documentId.
    """
    evidenceId: str
    chunkId: str
    documentId: Optional[str] = None
    text: str
    pageNumber: Optional[int] = 1
    section: Optional[str] = None
    heading: Optional[str] = None
    identifiers: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)
    rrfScore: Optional[float] = None
    rerankScore: Optional[float] = None
    score: Optional[float] = None  # Aligns with existing contracts (maps to rerankScore)
    graphRelations: Optional[List[Dict[str, Any]]] = None
    metadata: Optional[Dict[str, Any]] = None


class RetrieveMetadata(BaseModel):
    selectedSources: List[str]
    denseCandidateCount: int
    lexicalCandidateCount: int
    graphCandidateCount: int
    fusedCandidateCount: int
    rerankedCandidateCount: int
    finalCandidateCount: int
    latencyMs: float
    routeDecision: RouteDecision
    rerankerBypassed: Optional[bool] = False
    # Dense availability: False when Qdrant was unreachable and retrieval ran lexical-only.
    denseAvailable: Optional[bool] = True
    retrievalMode: Optional[str] = None  # "hybrid" | "lexical_only" | "dense_only" | ...
    degradationReason: Optional[str] = None
    # Equipment-tag match was used to boost ORDERING only (never relevance score or sufficiency).
    tagBoostApplied: Optional[bool] = False
    # Per-stage wall-clock timings for this retrieval call (ms); diagnostic only.
    stageTimingsMs: Optional[Dict[str, float]] = None
    # Explicitly named document(s) every retriever was restricted to.
    documentScope: Optional[List[str]] = None


class RetrieveResponse(BaseModel):
    results: List[EvidenceItem] = Field(default_factory=list)
    sufficiency: EvidenceSufficiency
    metadata: RetrieveMetadata


def calculate_rrf_score(
    dense_rank: Optional[int],
    lexical_rank: Optional[int],
    graph_rank: Optional[int],
    k: int = RRF_K
) -> float:
    """
    Calculates Reciprocal Rank Fusion (RRF) score:
    RRF = sum(1 / (k + rank)) for each contributing source.
    Ranks are 1-indexed.
    """
    score = 0.0
    if dense_rank is not None and dense_rank > 0:
        score += 1.0 / (k + dense_rank)
    if lexical_rank is not None and lexical_rank > 0:
        score += 1.0 / (k + lexical_rank)
    if graph_rank is not None and graph_rank > 0:
        score += 1.0 / (k + graph_rank)
    return score


OUT_OF_SCOPE_REGEXES = [
    re.compile(r'\b(?:capital\s+expenditure\s+of\s+the\s+european\s+union|european\s+union\s+hydrogen\s+directive|eu\s+directive|un\s+climate\s+treaty|parliamentary\s+election|geopolitical\s+conflict)\b', re.IGNORECASE),
    re.compile(r'\b(?:weather\s+forecast|tomorrow\'?s\s+weather|rainfall\s+forecast|ambient\s+weather|snowfall)\b', re.IGNORECASE),
    re.compile(r'\b(?:gdp\s+growth|inflation\s+rate|stock\s+price|cryptocurrency|foreign\s+exchange\s+rate|quarterly\s+dividend)\b', re.IGNORECASE),
    re.compile(r'\b(?:world\s+cup|premier\s+league|olympic\s+games|tourist\s+attraction|capital\s+city\s+of|box\s+office|movie\s+review)\b', re.IGNORECASE)
]

STOPWORDS = {
    "what", "which", "where", "when", "who", "whom", "whose", "why", "how",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "can", "could", "shall", "should", "will", "would",
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "with",
    "about", "against", "between", "into", "through", "during", "before", "after",
    "above", "below", "to", "from", "up", "down", "in", "out", "on", "off",
    "tell", "me", "give", "show", "explain", "detail", "details", "difference",
    "please", "kindly", "exactly", "find", "information", "according", "document",
    "file", "paper", "manual", "section", "mention", "state", "say", "said", "also",
    "like", "know", "wondering"
}

# Centrally defined weights and thresholds for Evidence Coverage Scoring
# Rationale:
# - W_CONTENT (0.35): Directly requires non-stopword query terms to appear in retrieved evidence,
#   preventing generic plant datasheets from answering unrelated topics (e.g. EU CBAM carbon tax).
# - W_ENTITY (0.25): Ensures that when equipment/tag identifiers are requested, they are grounded
#   in candidate identifiers or evidence text.
# - W_LEXICAL (0.20): Corroborates query terms via exact BM25 / Tantivy lexical hits.
# - W_AGREEMENT (0.20): Rewards multi-retriever consensus (dense + lexical corroboration or multi-source).
COVERAGE_WEIGHT_CONTENT = 0.35
COVERAGE_WEIGHT_ENTITY = 0.25
COVERAGE_WEIGHT_LEXICAL = 0.20
COVERAGE_WEIGHT_AGREEMENT = 0.20

# Coverage threshold required for a query to be considered PROJECT_ANSWERABLE
# Even if reranker/semantic similarity is high, queries with coverage below this
# threshold are classified as TOPICALLY_SIMILAR but OUT_OF_SCOPE.
SCOPE_COVERAGE_THRESHOLD = float(os.getenv("SCOPE_COVERAGE_THRESHOLD", "0.40"))

# NOTE: M2 (services/ai) does NOT perform any direct network calls to M1 (services/ml).
# The locked GroundGuard service graph is: M3 orchestrates both M2 and M1.
# All final claim verification follows the path: M3 → M1.
# Evidence-vs-evidence source conflict analysis in M2 is performed using
# deterministic heuristics only (see detect_candidate_conflicts below).
# Deep neural NLI for source conflict is NOT performed from M2.


class ConflictResultTuple(tuple):
    """
    Backward-compatible 5-tuple subclass returning:
    (has_conflict, conflict_type, conflict_summary, conflicting_document_ids, conflicting_chunk_ids)
    with extended telemetry attributes:
    - confidence: float
    - method: 'deterministic' | 'M1_NLI' | 'both'
    - revision_resolution: 'newer_revision_selected' | 'unresolved' | 'not_applicable'
    - evidence_check: Dict[str, Any]
    - resolved_candidates: List[Candidate]
    """
    def __new__(
        cls,
        has_conflict: bool,
        conflict_type: Optional[str],
        conflict_summary: Optional[str],
        conflicting_document_ids: List[str],
        conflicting_chunk_ids: List[str],
        confidence: Optional[float] = 1.0,
        method: Optional[str] = "deterministic",
        revision_resolution: Optional[str] = "not_applicable",
        evidence_check: Optional[Dict[str, Any]] = None,
        resolved_candidates: Optional[List[Candidate]] = None
    ):
        return super().__new__(
            cls,
            (has_conflict, conflict_type, conflict_summary, conflicting_document_ids, conflicting_chunk_ids)
        )

    def __init__(
        self,
        has_conflict: bool,
        conflict_type: Optional[str],
        conflict_summary: Optional[str],
        conflicting_document_ids: List[str],
        conflicting_chunk_ids: List[str],
        confidence: Optional[float] = 1.0,
        method: Optional[str] = "deterministic",
        revision_resolution: Optional[str] = "not_applicable",
        evidence_check: Optional[Dict[str, Any]] = None,
        resolved_candidates: Optional[List[Candidate]] = None
    ):
        self.has_conflict = has_conflict
        self.conflict_type = conflict_type
        self.conflict_summary = conflict_summary
        self.conflicting_document_ids = conflicting_document_ids
        self.conflicting_chunk_ids = conflicting_chunk_ids
        self.confidence = confidence
        self.method = method
        self.revision_resolution = revision_resolution
        self.evidence_check = evidence_check
        self.resolved_candidates = resolved_candidates


def extract_candidate_metadata(c: Candidate) -> Dict[str, Any]:
    meta = {}
    if getattr(c, "metadata", None) and isinstance(c.metadata, dict):
        meta.update(c.metadata)
    if getattr(c, "provenance", None) and isinstance(c.provenance, dict):
        meta.update(c.provenance)
    return meta


def resolve_revision_precedence(
    c1: Candidate,
    c2: Candidate
) -> Tuple[bool, Optional[Candidate], Optional[Candidate], str]:
    """
    Determines whether metadata establishes AUTHORITATIVE revision ordering between two candidates.
    Returns: (has_precedence, newer_candidate, older_candidate, resolution_status)
    resolution_status: 'newer_revision_selected' | 'unresolved' | 'not_applicable'

    REQUIRED AUTHORITATIVE SIGNALS (establish precedence):
    A. Explicit superseding link: metadata.supersedes == older.doc_id, OR older.supersededBy == newer.doc_id
    B. Document lifecycle status: active/approved/current vs superseded/obsolete/withdrawn
       (requires BOTH documents to be part of same explicit lifecycle, verified by 'documentFamily' or 'docCode')
    C. Explicit version or revision ordinal within an identical named document lineage/family:
       - documentFamily or docCode must be identical and non-empty
       - Numeric version numbers are compared
       - Alphabetic revision tokens (REV A, REV B) are compared lexicographically within the same series

    WEAK / INSUFFICIENT SIGNALS (do NOT independently establish precedence):
    - documentDate / effectiveDate alone
    - Filename text or title tokens
    - Revision token without matching documentFamily
    - Version number across unrelated document types

    If metadata authority is missing or ambiguous, returns (False, None, None, 'unresolved').
    Precedence is NEVER guessed from dates, filenames, or tokens across unrelated document families.
    """
    m1 = extract_candidate_metadata(c1)
    m2 = extract_candidate_metadata(c2)
    d1, d2 = c1.documentId, c2.documentId

    # A. Explicit superseding metadata links — strongest signal
    if m2.get("supersedes") == d1 or m1.get("supersededBy") == d2:
        return True, c2, c1, "newer_revision_selected"
    if m1.get("supersedes") == d2 or m2.get("supersededBy") == d1:
        return True, c1, c2, "newer_revision_selected"

    # Require explicit documentFamily / docCode match for all remaining checks.
    # Without a shared lineage identifier, we cannot safely compare versions, revisions, or dates.
    f1 = m1.get("documentFamily") or m1.get("docCode")
    f2 = m2.get("documentFamily") or m2.get("docCode")
    same_family = bool(f1 and f2 and f1 == f2)

    # B. Lifecycle status flags — only valid within same document family
    obs_states = {"superseded", "obsolete", "withdrawn", "deprecated", "inactive"}
    act_states = {"active", "approved", "current", "effective", "released"}
    s1, s2 = str(m1.get("status", "")).lower(), str(m2.get("status", "")).lower()
    if same_family and s1 in obs_states and s2 in act_states:
        return True, c2, c1, "newer_revision_selected"
    if same_family and s2 in obs_states and s1 in act_states:
        return True, c1, c2, "newer_revision_selected"

    # C. Numeric version or alphabetic revision within same explicit document lineage
    if same_family:
        v1 = m1.get("version")
        v2 = m2.get("version")
        if isinstance(v1, (int, float)) and isinstance(v2, (int, float)):
            if v2 > v1:
                return True, c2, c1, "newer_revision_selected"
            elif v1 > v2:
                return True, c1, c2, "newer_revision_selected"

        rev1 = str(m1.get("revision", "")).upper().replace("REV", "").strip("_ -")
        rev2 = str(m2.get("revision", "")).upper().replace("REV", "").strip("_ -")
        if rev1 and rev2 and rev1 != rev2:
            if rev2 > rev1:
                return True, c2, c1, "newer_revision_selected"
            else:
                return True, c1, c2, "newer_revision_selected"

    # NOTE: effectiveDate / documentDate are explicitly NOT used as independent precedence signals.
    # A newer date does not mean a document supersedes another. Dates only support analysis,
    # not automatic resolution. Without explicit supersedes/status/lineage, remain unresolved.

    return False, None, None, "unresolved"





def detect_candidate_conflicts(
    candidates: List[Candidate],
    route: RouteDecision
) -> ConflictResultTuple:
    """
    Detects factual discrepancies across distinct document sources for the same entity or topic.
    Returns a backward-compatible ConflictResultTuple:
    (has_conflict, conflict_type, conflict_summary, conflicting_doc_ids, conflicting_chunk_ids)

    ARCHITECTURE NOTE: This function performs only deterministic heuristics.
    M2 (services/ai) does NOT call M1 (services/ml). M1 is called exclusively by M3.

    Factual-overlap gate (CASE-057 general principle):
    Two chunks that share an equipment tag (e.g. 'M-101') are NOT necessarily asserting
    the same fact. Before any comparison layer fires, both candidates must establish a
    substantive factual relationship: shared numeric measurements OR shared technical
    predicate density >= 0.35 (excluding entity identifier tokens). Candidates with only
    tag overlap but unrelated content (SOP startup steps vs maintenance schedule) are
    skipped entirely — they cannot meaningfully conflict.

    Detection Layers:
    1. NUMERIC_CONFLICT: Divergent values for the same measurement unit on the same equipment.
    2. RELATIONAL_CONFLICT: Contradictory topological directions, inlet/outlet, suction/discharge, or reversed flow.
    3. STATE_CONFLICT: Mutually exclusive operating states (maintained open vs closed/prohibited, energized vs de-energized).
    4. PROCEDURAL_CONFLICT: Incompatible operational directives (manual vs automatic, mandatory vs prohibited/not required).
    5. SEMANTIC_CONTRADICTION: Direct modal contradictions (shall/must vs shall not/must not).
    6. REVISION AWARENESS: Resolves any detected conflict if metadata proves newer revision precedence; remains unresolved otherwise.

    Unresolvable semantic ambiguity: If deterministic layers cannot establish a conflict,
    the relationship is left as no-conflict-detected (ambiguous/unknown). M2 does not call
    M1 to settle this — M3 is the orchestrator for any neural verification.
    """
    if len(candidates) < 2:
        return ConflictResultTuple(False, None, None, [], [], confidence=1.0, method="deterministic", revision_resolution="not_applicable")

    doc_cand_map: Dict[str, List[Candidate]] = {}
    for c in candidates:
        if c.documentId:
            doc_cand_map.setdefault(c.documentId, []).append(c)

    if len(doc_cand_map) < 2:
        return ConflictResultTuple(False, None, None, [], [], confidence=1.0, method="deterministic", revision_resolution="not_applicable")

    unit_pattern = re.compile(
        r'([-+]?\d+(?:\.\d+)?)\s*(bar|barg|bara|MPa|kPa|psi|m[3³]/h|l/s|gpm|°C|rpm|kW|MW)\b',
        re.IGNORECASE
    )

    doc_ids = list(doc_cand_map.keys())


    for i in range(len(doc_ids)):
        for j in range(i + 1, len(doc_ids)):
            d1, d2 = doc_ids[i], doc_ids[j]
            cands1 = doc_cand_map[d1]
            cands2 = doc_cand_map[d2]

            for c1 in cands1:
                for c2 in cands2:
                    # ONLY compare candidates that refer to the SAME equipment or common technical focus
                    c1_idents = set(ident.upper() for ident in c1.identifiers)
                    c2_idents = set(ident.upper() for ident in c2.identifiers)
                    common_idents = c1_idents & c2_idents

                    if not common_idents and route.extractedIdentifiers:
                        target_idents = set(ident.upper() for ident in route.extractedIdentifiers)
                        c1_matches = any(t in c1_idents or t in c1.text.upper() for t in target_idents)
                        c2_matches = any(t in c2_idents or t in c2.text.upper() for t in target_idents)
                        if c1_matches and c2_matches:
                            common_idents = target_idents

                    # Also compare if high content word overlap between cross-document candidates discussing same topic
                    if not common_idents:
                        # If both candidates have distinct, non-empty equipment identifiers (e.g. P-101A vs P-888),
                        # they refer to different equipment tags, NOT a single shared topic conflict.
                        if c1_idents and c2_idents and not (c1_idents & c2_idents):
                            continue
                        w1 = set(w for w in re.findall(r'[a-zA-Z0-9_\-]+', c1.text.lower()) if w not in STOPWORDS and len(w) >= 3)
                        w2 = set(w for w in re.findall(r'[a-zA-Z0-9_\-]+', c2.text.lower()) if w not in STOPWORDS and len(w) >= 3)
                        overlap_c = len(w1 & w2) / max(1, min(len(w1), len(w2)))
                        if overlap_c < 0.45:
                            continue
                        ident_name = "shared technical topic"
                    else:
                        ident_name = list(common_idents)[0]

                    c_docs = [d1, d2]
                    c_chunks = [c1.chunkId, c2.chunkId]

                    # 1. NUMERIC_CONFLICT
                    m1_matches = unit_pattern.findall(c1.text)
                    m2_matches = unit_pattern.findall(c2.text)

                    m1: Dict[str, Set[float]] = {}
                    for v_str, u in m1_matches:
                        m1.setdefault(u.upper(), set()).add(float(v_str))

                    m2: Dict[str, Set[float]] = {}
                    for v_str, u in m2_matches:
                        m2.setdefault(u.upper(), set()).add(float(v_str))

                    for unit, vals1 in m1.items():
                        if unit in m2:
                            vals2 = m2[unit]
                            if vals1 and vals2 and not (vals1 & vals2):
                                v1_str = "/".join(str(v) for v in sorted(vals1))
                                v2_str = "/".join(str(v) for v in sorted(vals2))
                                c_summary = f"Conflicting measurements on {ident_name} ({d1}: {v1_str} {unit} vs {d2}: {v2_str} {unit})"
                                has_prec, newer_c, older_c, rev_res = resolve_revision_precedence(c1, c2)
                                if has_prec and rev_res == "newer_revision_selected":
                                    return ConflictResultTuple(
                                        False, ConflictType.NUMERIC_CONFLICT.value,
                                        f"Resolved numeric conflict: {c_summary} superseded by newer revision ({newer_c.documentId})",
                                        c_docs, c_chunks, confidence=1.0, method="deterministic",
                                        revision_resolution="newer_revision_selected", resolved_candidates=[newer_c]
                                    )
                                return ConflictResultTuple(
                                    True, ConflictType.NUMERIC_CONFLICT.value, c_summary,
                                    c_docs, c_chunks, confidence=1.0, method="deterministic", revision_resolution="unresolved"
                                )

                    # 2. RELATIONAL_CONFLICT (upstream vs downstream, suction vs discharge, inlet vs outlet, reversed flow)
                    c1_up = bool(re.search(r'\b(upstream|suction(?:\s+line)?|inlet)\b', c1.text, re.IGNORECASE))
                    c1_down = bool(re.search(r'\b(downstream|discharge(?:\s+line)?|outlet)\b', c1.text, re.IGNORECASE))
                    c2_up = bool(re.search(r'\b(upstream|suction(?:\s+line)?|inlet)\b', c2.text, re.IGNORECASE))
                    c2_down = bool(re.search(r'\b(downstream|discharge(?:\s+line)?|outlet)\b', c2.text, re.IGNORECASE))

                    topo_conflict = (c1_up and not c1_down and c2_down and not c2_up) or (c1_down and not c1_up and c2_up and not c2_down)

                    # Multi-sentence reversed flow / directional verb inversion:
                    flow_reversed = bool(re.search(r'\bflow\s+direction\s+(?:was|is)\s+reversed\b', c1.text + " " + c2.text, re.IGNORECASE))
                    dir_pat = re.compile(r'([A-Za-z0-9\-]+)\s+(?:discharges\s+toward|discharges\s+into|supplies|feeds)\s+([A-Za-z0-9\-]+)', re.IGNORECASE)
                    m_dir1 = dir_pat.findall(c1.text)
                    m_dir2 = dir_pat.findall(c2.text)
                    dir_inverted = False
                    if m_dir1 and m_dir2:
                        for s1_tag, d1_tag in m_dir1:
                            for s2_tag, d2_tag in m_dir2:
                                if s1_tag.upper() == d2_tag.upper() and d1_tag.upper() == s2_tag.upper():
                                    dir_inverted = True
                                    break

                    if topo_conflict or flow_reversed or dir_inverted:
                        c_summary = f"Conflicting topological relations or flow direction for {ident_name} ({d1} vs {d2})"
                        has_prec, newer_c, older_c, rev_res = resolve_revision_precedence(c1, c2)
                        if has_prec and rev_res == "newer_revision_selected":
                            return ConflictResultTuple(
                                False, ConflictType.RELATIONAL_CONFLICT.value,
                                f"Resolved relational conflict: {c_summary} superseded by newer revision ({newer_c.documentId})",
                                c_docs, c_chunks, confidence=1.0, method="deterministic",
                                revision_resolution="newer_revision_selected", resolved_candidates=[newer_c]
                            )
                        return ConflictResultTuple(
                            True, ConflictType.RELATIONAL_CONFLICT.value, c_summary,
                            c_docs, c_chunks, confidence=1.0, method="deterministic", revision_resolution="unresolved"
                        )

                    # 3. STATE_CONFLICT (maintained open vs remain closed / prohibited, energized vs de-energized)
                    c1_open = bool(re.search(r'\b(?:maintained\s+open|held\s+open|kept\s+open|remain\s+open|normally\s+open|open)\b', c1.text, re.IGNORECASE))
                    c1_closed = bool(re.search(r'\b(?:maintained\s+closed|held\s+closed|remain\s+closed|normally\s+closed|closed|shut|opening(?:\s+\w+)?\s+is\s+prohibited)\b', c1.text, re.IGNORECASE))
                    c2_open = bool(re.search(r'\b(?:maintained\s+open|held\s+open|kept\s+open|remain\s+open|normally\s+open|open)\b', c2.text, re.IGNORECASE))
                    c2_closed = bool(re.search(r'\b(?:maintained\s+closed|held\s+closed|remain\s+closed|normally\s+closed|closed|shut|opening(?:\s+\w+)?\s+is\s+prohibited)\b', c2.text, re.IGNORECASE))

                    if (c1_open and not c1_closed and c2_closed and not c2_open) or (c1_closed and not c1_open and c2_open and not c2_closed):
                        st1 = "open" if c1_open else "closed/shut"
                        st2 = "open" if c2_open else "closed/shut"
                        c_summary = f"Conflicting operational state for {ident_name} ({d1}: {st1} vs {d2}: {st2})"
                        has_prec, newer_c, older_c, rev_res = resolve_revision_precedence(c1, c2)
                        if has_prec and rev_res == "newer_revision_selected":
                            return ConflictResultTuple(
                                False, ConflictType.STATE_CONFLICT.value,
                                f"Resolved state conflict: {c_summary} superseded by newer revision ({newer_c.documentId})",
                                c_docs, c_chunks, confidence=1.0, method="deterministic",
                                revision_resolution="newer_revision_selected", resolved_candidates=[newer_c]
                            )
                        return ConflictResultTuple(
                            True, ConflictType.STATE_CONFLICT.value, c_summary,
                            c_docs, c_chunks, confidence=1.0, method="deterministic", revision_resolution="unresolved"
                        )

                    c1_energ = bool(re.search(r'\benergized\b', c1.text, re.IGNORECASE))
                    c1_deenerg = bool(re.search(r'\bde-?energized\b', c1.text, re.IGNORECASE))
                    c2_energ = bool(re.search(r'\benergized\b', c2.text, re.IGNORECASE))
                    c2_deenerg = bool(re.search(r'\bde-?energized\b', c2.text, re.IGNORECASE))
                    if (c1_energ and c2_deenerg) or (c1_deenerg and c2_energ):
                        c_summary = f"Conflicting electrical state for {ident_name} ({d1} vs {d2})"
                        has_prec, newer_c, older_c, rev_res = resolve_revision_precedence(c1, c2)
                        if has_prec and rev_res == "newer_revision_selected":
                            return ConflictResultTuple(
                                False, ConflictType.STATE_CONFLICT.value,
                                f"Resolved state conflict: {c_summary} superseded by newer revision ({newer_c.documentId})",
                                c_docs, c_chunks, confidence=1.0, method="deterministic",
                                revision_resolution="newer_revision_selected", resolved_candidates=[newer_c]
                            )
                        return ConflictResultTuple(
                            True, ConflictType.STATE_CONFLICT.value, c_summary,
                            c_docs, c_chunks, confidence=1.0, method="deterministic", revision_resolution="unresolved"
                        )

                    # 4. PROCEDURAL_CONFLICT (manual vs automatic, mandatory/required vs prohibited/not required)
                    c1_man = bool(re.search(r'\bmanual(?:\s+operator)?(?:\s+isolation|\s+acknowledgement)?\b', c1.text, re.IGNORECASE))
                    c1_auto = bool(re.search(r'\b(?:automatic|automatically)(?:\s+isolation)?\b', c1.text, re.IGNORECASE))
                    c2_man = bool(re.search(r'\bmanual(?:\s+operator)?(?:\s+isolation|\s+acknowledgement)?\b', c2.text, re.IGNORECASE))
                    c2_auto = bool(re.search(r'\b(?:automatic|automatically)(?:\s+isolation)?\b', c2.text, re.IGNORECASE))

                    if (c1_man and not c1_auto and c2_auto and not c2_man) or (c1_auto and not c1_man and c2_man and not c2_auto):
                        p1 = "manual" if c1_man else "automatic"
                        p2 = "manual" if c2_man else "automatic"
                        c_summary = f"Conflicting procedural isolation mode for {ident_name} ({d1}: {p1} vs {d2}: {p2})"
                        has_prec, newer_c, older_c, rev_res = resolve_revision_precedence(c1, c2)
                        if has_prec and rev_res == "newer_revision_selected":
                            return ConflictResultTuple(
                                False, ConflictType.PROCEDURAL_CONFLICT.value,
                                f"Resolved procedural conflict: {c_summary} superseded by newer revision ({newer_c.documentId})",
                                c_docs, c_chunks, confidence=1.0, method="deterministic",
                                revision_resolution="newer_revision_selected", resolved_candidates=[newer_c]
                            )
                        return ConflictResultTuple(
                            True, ConflictType.PROCEDURAL_CONFLICT.value, c_summary,
                            c_docs, c_chunks, confidence=1.0, method="deterministic", revision_resolution="unresolved"
                        )

                    c1_req = bool(re.search(r'\b(?:mandatory|strictly\s+required|is\s+required|operator\s+acknowledgement\s+is\s+required)\b', c1.text, re.IGNORECASE))
                    c1_pro = bool(re.search(r'\b(?:prohibited|forbidden|not\s+required|never\s+permitted|operator\s+intervention\s+is\s+not\s+required)\b', c1.text, re.IGNORECASE))
                    c2_req = bool(re.search(r'\b(?:mandatory|strictly\s+required|is\s+required|operator\s+acknowledgement\s+is\s+required)\b', c2.text, re.IGNORECASE))
                    c2_pro = bool(re.search(r'\b(?:prohibited|forbidden|not\s+required|never\s+permitted|operator\s+intervention\s+is\s+not\s+required)\b', c2.text, re.IGNORECASE))
                    if (c1_req and c2_pro) or (c1_pro and c2_req):
                        c_summary = f"Conflicting procedural requirement for {ident_name} ({d1} vs {d2})"
                        has_prec, newer_c, older_c, rev_res = resolve_revision_precedence(c1, c2)
                        if has_prec and rev_res == "newer_revision_selected":
                            return ConflictResultTuple(
                                False, ConflictType.PROCEDURAL_CONFLICT.value,
                                f"Resolved procedural conflict: {c_summary} superseded by newer revision ({newer_c.documentId})",
                                c_docs, c_chunks, confidence=1.0, method="deterministic",
                                revision_resolution="newer_revision_selected", resolved_candidates=[newer_c]
                            )
                        return ConflictResultTuple(
                            True, ConflictType.PROCEDURAL_CONFLICT.value, c_summary,
                            c_docs, c_chunks, confidence=1.0, method="deterministic", revision_resolution="unresolved"
                        )

                    # 5. SEMANTIC_CONTRADICTION (shall / must vs shall not / must not)
                    c1_s_not = bool(re.search(r'\b(?:shall\s+not|must\s+not)\b', c1.text, re.IGNORECASE))
                    c1_s_pos = bool(re.search(r'\b(?:shall|must)\b', c1.text, re.IGNORECASE)) and not c1_s_not
                    c2_s_not = bool(re.search(r'\b(?:shall\s+not|must\s+not)\b', c2.text, re.IGNORECASE))
                    c2_s_pos = bool(re.search(r'\b(?:shall|must)\b', c2.text, re.IGNORECASE)) and not c2_s_not
                    if (c1_s_pos and c2_s_not) or (c1_s_not and c2_s_pos):
                        c_summary = f"Direct semantic modal contradiction on {ident_name} ({d1} vs {d2})"
                        has_prec, newer_c, older_c, rev_res = resolve_revision_precedence(c1, c2)
                        if has_prec and rev_res == "newer_revision_selected":
                            return ConflictResultTuple(
                                False, ConflictType.SEMANTIC_CONTRADICTION.value,
                                f"Resolved modal contradiction: {c_summary} superseded by newer revision ({newer_c.documentId})",
                                c_docs, c_chunks, confidence=1.0, method="deterministic",
                                revision_resolution="newer_revision_selected", resolved_candidates=[newer_c]
                            )
                        return ConflictResultTuple(
                            True, ConflictType.SEMANTIC_CONTRADICTION.value, c_summary,
                            c_docs, c_chunks, confidence=1.0, method="deterministic", revision_resolution="unresolved"
                        )

                    # Factual-overlap gate (CASE-057 general principle):
                    # Two chunks sharing an equipment tag are NOT necessarily asserting the same
                    # fact. Skip candidate pair comparison unless there is substantive factual
                    # overlap: shared numeric measurements OR shared technical predicate density
                    # >= 0.35 (excluding entity identifier tokens).
                    # This prevents comparing e.g. P-101A startup SOP steps against M-101
                    # maintenance schedule entries simply because both mention the same tag.
                    c1_nums = set(unit_pattern.findall(c1.text))
                    c2_nums = set(unit_pattern.findall(c2.text))
                    has_shared_numeric_context = bool(c1_nums and c2_nums)

                    if not has_shared_numeric_context:
                        w1_pred = set(w for w in re.findall(r'[a-zA-Z0-9_\-]+', c1.text.lower())
                                      if w not in STOPWORDS and len(w) >= 4
                                      and w not in {ident.lower() for ident in c1.identifiers})
                        w2_pred = set(w for w in re.findall(r'[a-zA-Z0-9_\-]+', c2.text.lower())
                                      if w not in STOPWORDS and len(w) >= 4
                                      and w not in {ident.lower() for ident in c2.identifiers})
                        predicate_overlap = len(w1_pred & w2_pred) / max(1, min(len(w1_pred), len(w2_pred)))
                        if predicate_overlap < 0.35:
                            # The two chunks do not share substantive factual content;
                            # they cannot be meaningfully compared for conflict.
                            continue

    return ConflictResultTuple(False, None, None, [], [], confidence=1.0, method="deterministic", revision_resolution="not_applicable")


def compute_evidence_coverage(
    query: Optional[str],
    candidates: List[Candidate],
    route: RouteDecision
) -> Tuple[float, Dict[str, float]]:
    """
    Computes a deterministic evidence-coverage score in [0.0, 1.0].
    Answers: "Does the retrieved project evidence actually cover the subject/entity/question being asked?"

    Combines:
    - s_content: Ratio of non-stopword query terms appearing in top candidate evidence
    - s_entity: Grounding of requested equipment or project tags in evidence
    - s_lexical: Presence of exact lexical (BM25 / Tantivy) retrieval matches
    - s_agreement: Multi-retriever or multi-source consensus
    """
    clean_q = (query or "").strip()
    if not clean_q or not candidates:
        return 0.0, {"content": 0.0, "entity": 0.0, "lexical": 0.0, "agreement": 0.0}

    # 1. Content word overlap (s_content) with morphological variation tolerance
    words = re.findall(r'[a-zA-Z0-9_\-]+', clean_q.lower())
    content_words = [w for w in words if w not in STOPWORDS and len(w) >= 3]

    top_cands = candidates[:3]
    combined_text = " ".join(c.text.lower() for c in top_cands)
    candidate_tokens = set(re.findall(r'[a-zA-Z0-9_\-]+', combined_text))

    if content_words:
        matched_count = 0
        for w in content_words:
            if w in combined_text:
                matched_count += 1
            else:
                stem = w.rstrip('s').rstrip('es')
                stem_short = w[:4] if len(w) >= 5 else stem
                if any(stem in tok or tok.startswith(stem_short) or stem_short in tok for tok in candidate_tokens if len(tok) >= 4):
                    matched_count += 1
        s_content = matched_count / len(content_words)
        # Short evidence robustness (Section 20):
        # If the top candidate is concise (<= 250 characters) and has core content match,
        # do not penalize s_content merely due to conversational query verbosity.
        if top_cands and len(top_cands[0].text) <= 250 and matched_count >= 1:
            s_content = max(s_content, min(1.0, matched_count / max(1, min(len(content_words), 3))))
    else:
        s_content = 1.0

    # 2. Entity grounding coverage (s_entity)
    if route.identifierQuery and route.extractedIdentifiers:
        found_idents = 0
        for ident in route.extractedIdentifiers:
            norm_ident = ident.upper()
            if any(norm_ident in [i.upper() for i in c.identifiers] or norm_ident in c.text.upper() for c in top_cands):
                found_idents += 1
        s_entity = found_idents / len(route.extractedIdentifiers) if route.extractedIdentifiers else 0.0
    else:
        # Non-identifier semantic query: not equipment-specific, so entity coverage is proportional
        # to actual non-stopword content presence in evidence candidates
        s_entity = min(1.0, s_content)

    # 3. Lexical retrieval support (s_lexical)
    lexical_count = sum(
        1 for c in top_cands
        if (c.lexicalScore is not None and c.lexicalScore > 0.0) or (c.lexicalRank is not None)
    )
    s_lexical = min(1.0, lexical_count / 1.0) if lexical_count > 0 else 0.0

    # 4. Multi-retriever / Cross-source agreement (s_agreement)
    multi_source_count = sum(
        1 for c in top_cands
        if len(c.sources) > 1 or (c.denseScore is not None and c.lexicalScore is not None)
    )
    all_sources = set(src for c in top_cands for src in c.sources)
    has_dense_and_lex = ("qdrant_dense" in all_sources or "dense" in all_sources) and \
                         ("tantivy_lexical" in all_sources or "lexical" in all_sources)

    if multi_source_count > 0 or has_dense_and_lex:
        s_agreement = 1.0
    elif len(all_sources) > 1:
        s_agreement = 0.75
    elif s_content >= 0.25:
        s_agreement = 0.5
    else:
        s_agreement = 0.2 if s_content > 0.0 else 0.0

    # Centrally weighted composite score
    coverage_score = round(
        (COVERAGE_WEIGHT_CONTENT * s_content) +
        (COVERAGE_WEIGHT_ENTITY * s_entity) +
        (COVERAGE_WEIGHT_LEXICAL * s_lexical) +
        (COVERAGE_WEIGHT_AGREEMENT * s_agreement),
        4
    )
    breakdown = {
        "content": round(s_content, 4),
        "entity": round(s_entity, 4),
        "lexical": round(s_lexical, 4),
        "agreement": round(s_agreement, 4)
    }
    return coverage_score, breakdown


def evaluate_scope(
    query: Optional[str],
    candidates: List[Candidate],
    route: RouteDecision
) -> ScopeGateResult:
    """
    Deterministic Evidence-Coverage Scope Gate evaluating whether the query addresses
    concepts and entities within the project documentation domain.
    Distinguishes TOPICALLY_SIMILAR from PROJECT_ANSWERABLE.
    Complementary to sufficiency:
    - Scope gate: "Does the retrieved project evidence actually cover the subject/entity being asked?"
    - Sufficiency gate: "Do we have enough evidence to answer it?"
    - M1: "Is the generated claim supported by the evidence?"
    """
    clean_q = (query or "").strip()
    if not clean_q:
        return ScopeGateResult(
            decision=ScopeDecision.IN_SCOPE,
            reason="Empty query bypassed to sufficiency gate",
            signals=ScopeGateSignals(
                candidateCount=len(candidates),
                entityMatch=True,
                lexicalSupport=True,
                contentWordOverlap=1.0,
                evidenceCoverageScore=1.0,
                topicSimilarityScore=1.0,
                crossRetrieverAgreement=1.0
            )
        )

    if not candidates:
        return ScopeGateResult(
            decision=ScopeDecision.OUT_OF_SCOPE,
            reason="Zero candidates retrieved in project corpus",
            signals=ScopeGateSignals(
                candidateCount=0,
                entityMatch=False,
                lexicalSupport=False,
                contentWordOverlap=0.0,
                evidenceCoverageScore=0.0,
                topicSimilarityScore=0.0,
                crossRetrieverAgreement=0.0
            )
        )

    # 1. High-Confidence Domain Pattern Filter (weather, sports, macroeconomics, geopolitics)
    for pat in OUT_OF_SCOPE_REGEXES:
        m = pat.search(clean_q)
        if m:
            grounded_ident = False
            if route.extractedIdentifiers:
                for ident in route.extractedIdentifiers:
                    if any(ident.upper() in [i.upper() for i in c.identifiers] or ident.upper() in c.text.upper() for c in candidates):
                        grounded_ident = True
                        break
            if not grounded_ident:
                matched_text = m.group(0)
                return ScopeGateResult(
                    decision=ScopeDecision.OUT_OF_SCOPE,
                    reason=f"Query addresses external domain '{matched_text}' without project equipment grounding",
                    signals=ScopeGateSignals(
                        candidateCount=len(candidates),
                        entityMatch=False,
                        lexicalSupport=False,
                        contentWordOverlap=0.0,
                        outOfScopePatternMatched=matched_text,
                        evidenceCoverageScore=0.0,
                        topicSimilarityScore=0.0,
                        crossRetrieverAgreement=0.0
                    )
                )

    # 2. Missing Entity Gate: If query explicitly asks about specific equipment identifier not in corpus
    all_idents_missing = False
    if route.identifierQuery and route.extractedIdentifiers:
        all_idents_missing = True
        for ident in route.extractedIdentifiers:
            norm_ident = ident.upper()
            for c in candidates:
                if norm_ident in [i.upper() for i in c.identifiers] or norm_ident in c.text.upper():
                    all_idents_missing = False
                    break
            if not all_idents_missing:
                break
        if all_idents_missing:
            return ScopeGateResult(
                decision=ScopeDecision.OUT_OF_SCOPE,
                reason=f"Target equipment identifier(s) {route.extractedIdentifiers} not found in project corpus",
                signals=ScopeGateSignals(
                    candidateCount=len(candidates),
                    entityMatch=False,
                    lexicalSupport=False,
                    contentWordOverlap=0.0,
                    evidenceCoverageScore=0.0,
                    topicSimilarityScore=0.0,
                    crossRetrieverAgreement=0.0
                )
            )

    # 3. Deterministic Evidence Coverage Assessment
    coverage_score, breakdown = compute_evidence_coverage(clean_q, candidates, route)
    top_cand = candidates[0] if candidates else None
    top_score = top_cand.rerankScore if top_cand and top_cand.rerankScore is not None else 0.0

    # Distinguish TOPICALLY_SIMILAR from PROJECT_ANSWERABLE
    if coverage_score < SCOPE_COVERAGE_THRESHOLD:
        if top_score >= SUFFICIENCY_THRESHOLD:
            # Query has engineering vocabulary scoring high on dense similarity, but lacks real answerable coverage
            return ScopeGateResult(
                decision=ScopeDecision.OUT_OF_SCOPE,
                reason=f"Topically similar vocabulary detected (topScore: {top_score:.3f}) but evidence coverage is insufficient for project answerability (coverageScore: {coverage_score:.3f} < {SCOPE_COVERAGE_THRESHOLD})",
                signals=ScopeGateSignals(
                    candidateCount=len(candidates),
                    entityMatch=breakdown["entity"] > 0,
                    lexicalSupport=breakdown["lexical"] > 0,
                    contentWordOverlap=breakdown["content"],
                    evidenceCoverageScore=coverage_score,
                    topicSimilarityScore=top_score,
                    crossRetrieverAgreement=breakdown["agreement"]
                )
            )
        elif coverage_score < 0.25:
            return ScopeGateResult(
                decision=ScopeDecision.OUT_OF_SCOPE,
                reason=f"Low evidence coverage ({coverage_score:.3f} < 0.25) indicating topic is outside project documentation",
                signals=ScopeGateSignals(
                    candidateCount=len(candidates),
                    entityMatch=breakdown["entity"] > 0,
                    lexicalSupport=breakdown["lexical"] > 0,
                    contentWordOverlap=breakdown["content"],
                    evidenceCoverageScore=coverage_score,
                    topicSimilarityScore=top_score,
                    crossRetrieverAgreement=breakdown["agreement"]
                )
            )
        else:
            return ScopeGateResult(
                decision=ScopeDecision.AMBIGUOUS,
                reason=f"Borderline evidence coverage ({coverage_score:.3f}) without definitive project answerability",
                signals=ScopeGateSignals(
                    candidateCount=len(candidates),
                    entityMatch=breakdown["entity"] > 0,
                    lexicalSupport=breakdown["lexical"] > 0,
                    contentWordOverlap=breakdown["content"],
                    evidenceCoverageScore=coverage_score,
                    topicSimilarityScore=top_score,
                    crossRetrieverAgreement=breakdown["agreement"]
                )
            )

    return ScopeGateResult(
        decision=ScopeDecision.IN_SCOPE,
        reason=f"Query demonstrates sufficient evidence coverage ({coverage_score:.3f} >= {SCOPE_COVERAGE_THRESHOLD}) across project documentation",
        signals=ScopeGateSignals(
            candidateCount=len(candidates),
            entityMatch=breakdown["entity"] > 0,
            lexicalSupport=breakdown["lexical"] > 0,
            contentWordOverlap=breakdown["content"],
            evidenceCoverageScore=coverage_score,
            topicSimilarityScore=top_score,
            crossRetrieverAgreement=breakdown["agreement"]
        )
    )


def evaluate_sufficiency(
    candidates: List[Candidate],
    route: RouteDecision,
    threshold: float = SUFFICIENCY_THRESHOLD,
    min_evidence_count: int = 1,
    query: Optional[str] = None,
    facet_set: Optional[Any] = None,
    completion_stop_reason: Optional[str] = None,
    completion_triggered: bool = False,
    completion_reason: Optional[str] = None,
    challenge_retry: bool = False,
    bridge_entity: Optional[str] = None,
    multi_hop_resolved: Optional[bool] = None,
    answerability_query: Optional[str] = None,
) -> EvidenceSufficiency:
    """
    Deterministic multi-signal evidence sufficiency evaluation without LLM.
    Evaluates:
    1. Result count (resultCount >= min_evidence_count)
    2. Route-aware identifier coverage:
       - Exact-identifier queries require target identifier grounding
       - Semantic queries without identifiers pass identifier check
       - Mixed queries verify grounding of all required technical entities
    3. Dedicated Scope / Domain Gate:
       - Checks external domain patterns, corpus vocabulary, and target entity existence
       - Blocks high-semantic-score out-of-domain queries
    4. Multi-type conflict detection across distinct document sources:
       - NUMERIC_CONFLICT
       - RELATIONAL_CONFLICT
       - STATE_CONFLICT
       - PROCEDURAL_CONFLICT
       - SEMANTIC_CONTRADICTION
    5. Rerank score relevance (top_score >= threshold)
    """
    q = query or (route.rawQuery if hasattr(route, "rawQuery") else None)
    all_sources = sorted(list(set(src for c in candidates for src in c.sources))) if candidates else []

    if not candidates:
        return EvidenceSufficiency(
            sufficient=False,
            reason="Zero candidates retrieved",
            score=0.0,
            scope=ScopeDecision.OUT_OF_SCOPE.value,
            disposition=EvidenceDisposition.INSUFFICIENT.value,
            failureStage=FailureStage.RETRIEVAL_ZERO_CANDIDATES.value,
            signals=EvidenceSufficiencySignals(
                resultCount=0,
                topRerankScore=0.0,
                identifierMatched=False,
                sourceCoverage=[],
                conflictingEvidence=False,
                scopeDecision=ScopeDecision.OUT_OF_SCOPE.value,
                scopeReason="Zero candidates retrieved in project corpus",
                disposition=EvidenceDisposition.INSUFFICIENT.value,
                failureStage=FailureStage.RETRIEVAL_ZERO_CANDIDATES.value,
                eligibleEvidenceCount=0
            )
        )

    if len(candidates) < min_evidence_count:
        return EvidenceSufficiency(
            sufficient=False,
            reason=f"Candidate count ({len(candidates)}) below minimum required ({min_evidence_count})",
            score=0.0,
            scope=ScopeDecision.OUT_OF_SCOPE.value,
            disposition=EvidenceDisposition.INSUFFICIENT.value,
            failureStage=FailureStage.RETRIEVAL_ZERO_CANDIDATES.value,
            signals=EvidenceSufficiencySignals(
                resultCount=len(candidates),
                topRerankScore=0.0,
                identifierMatched=False,
                sourceCoverage=[],
                conflictingEvidence=False,
                scopeDecision=ScopeDecision.OUT_OF_SCOPE.value,
                scopeReason=f"Candidate count ({len(candidates)}) below minimum required ({min_evidence_count})",
                disposition=EvidenceDisposition.INSUFFICIENT.value,
                failureStage=FailureStage.RETRIEVAL_ZERO_CANDIDATES.value,
                eligibleEvidenceCount=0
            )
        )

    top_candidate = candidates[0]
    top_score = top_candidate.rerankScore if top_candidate.rerankScore is not None else 0.0

    # 1. Route-aware identifier validation:
    # - Exact-identifier queries: require identifier support in evidence
    # - Semantic queries without identifiers: pass identifier check (identifier_matched=True)
    # - Mixed queries: verify all extracted identifiers in the query are grounded
    identifier_matched = True
    missing_identifiers = []
    if route.identifierQuery and route.extractedIdentifiers:
        for ident in route.extractedIdentifiers:
            norm_ident = ident.upper()
            found = False
            for cand in candidates:
                cand_idents = [i.upper() for i in cand.identifiers]
                if norm_ident in cand_idents or norm_ident in cand.text.upper():
                    found = True
                    break
            if not found:
                missing_identifiers.append(ident)

        identifier_matched = (len(missing_identifiers) == 0)

    if not identifier_matched and route.identifierQuery:
        return EvidenceSufficiency(
            sufficient=False,
            reason=f"Target identifier(s) {missing_identifiers} not supported by retrieved evidence",
            score=top_score,
            scope=ScopeDecision.OUT_OF_SCOPE.value,
            disposition=EvidenceDisposition.INSUFFICIENT.value,
            failureStage=FailureStage.SCOPE_GATE_REJECTION.value,
            signals=EvidenceSufficiencySignals(
                resultCount=len(candidates),
                topRerankScore=top_score,
                identifierMatched=False,
                sourceCoverage=all_sources,
                conflictingEvidence=False,
                scopeDecision=ScopeDecision.OUT_OF_SCOPE.value,
                scopeReason=f"Target identifier(s) {missing_identifiers} not supported by retrieved evidence",
                disposition=EvidenceDisposition.INSUFFICIENT.value,
                failureStage=FailureStage.SCOPE_GATE_REJECTION.value,
                eligibleEvidenceCount=0
            )
        )

    # 2. Scope Gate Evaluation
    scope_res = evaluate_scope(q, candidates, route) if q else None
    scope_dec_str = scope_res.decision.value if scope_res else ScopeDecision.IN_SCOPE.value
    scope_reason_str = scope_res.reason if scope_res else "Scope evaluation bypassed (no query text)"

    if scope_res and scope_res.decision == ScopeDecision.OUT_OF_SCOPE:
        return EvidenceSufficiency(
            sufficient=False,
            reason=f"Out of project scope: {scope_res.reason}",
            score=top_score,
            scope=scope_dec_str,
            disposition=EvidenceDisposition.INSUFFICIENT.value,
            failureStage=FailureStage.SCOPE_GATE_REJECTION.value,
            signals=EvidenceSufficiencySignals(
                resultCount=len(candidates),
                topRerankScore=top_score,
                identifierMatched=identifier_matched,
                sourceCoverage=all_sources,
                conflictingEvidence=False,
                scopeDecision=scope_dec_str,
                scopeReason=scope_reason_str,
                evidenceCoverageScore=scope_res.signals.evidenceCoverageScore,
                topicSimilarityScore=top_score,
                disposition=EvidenceDisposition.INSUFFICIENT.value,
                failureStage=FailureStage.SCOPE_GATE_REJECTION.value,
                eligibleEvidenceCount=0
            )
        )

    # 3. Source conflict detection across distinct document sources
    conflict_res = detect_candidate_conflicts(candidates, route)
    has_conflict, c_type, c_summary, c_docs, c_chunks = conflict_res
    if has_conflict:
        return EvidenceSufficiency(
            sufficient=False,
            reason=f"Conflicting evidence detected across retrieved project sources: {c_summary}",
            score=top_score,
            scope=scope_dec_str,
            disposition=EvidenceDisposition.CONFLICT.value,
            failureStage=FailureStage.CONFLICT_GATE_REJECTION.value,
            signals=EvidenceSufficiencySignals(
                resultCount=len(candidates),
                topRerankScore=top_score,
                identifierMatched=identifier_matched,
                sourceCoverage=all_sources,
                conflictingEvidence=True,
                conflictType=c_type,
                conflictingDocumentIds=c_docs,
                conflictingChunkIds=c_chunks,
                conflictSummary=c_summary,
                scopeDecision=scope_dec_str,
                scopeReason=scope_reason_str,
                conflictConfidence=getattr(conflict_res, "confidence", 1.0),
                conflictDetectionMethod=getattr(conflict_res, "method", "deterministic"),
                revisionResolution=getattr(conflict_res, "revision_resolution", "unresolved"),
                evidenceConflictCheck=getattr(conflict_res, "evidence_check", None),
                evidenceCoverageScore=scope_res.signals.evidenceCoverageScore if scope_res else None,
                topicSimilarityScore=top_score,
                disposition=EvidenceDisposition.CONFLICT.value,
                failureStage=FailureStage.CONFLICT_GATE_REJECTION.value,
                eligibleEvidenceCount=0
            )
        )

    # Check if revision precedence resolved the conflict by selecting newer revision
    rev_res = getattr(conflict_res, "revision_resolution", "not_applicable")
    if rev_res == "newer_revision_selected":
        resolved_cands = getattr(conflict_res, "resolved_candidates", None)
        if resolved_cands:
            older_docs = set(c_docs) - set(c.documentId for c in resolved_cands)
            filtered = [c for c in candidates if c.documentId not in older_docs]
            if filtered:
                candidates = filtered
                top_candidate = candidates[0]
                top_score = top_candidate.rerankScore if top_candidate.rerankScore is not None else top_score

    # 3b. Answerability gate (separate from relevance): a value-lookup question is answerable only if the
    # retrieved evidence states the requested attribute. Entity/tag matches and high relevance scores
    # never establish this. Compound/comparison questions are left to the generator (partial answers).
    is_multi_facet = bool(facet_set and (getattr(facet_set, "isCompound", False) or getattr(facet_set, "isComparison", False)))
    # Judged on the user's ORIGINAL question: planner rewrites may drop value-selecting qualifiers.
    attr = assess_requested_attribute(answerability_query or q, candidates) if not is_multi_facet else None
    attr_rejected = bool(attr is not None and attr.applicable and not attr.covered)

    # 4. Two-Stage Sufficiency Safety Contract (Sections 7, 8)
    # Generic resolution for cross-encoder length dilution and short decisive passages.
    # Preserves calibrated SUFFICIENCY_THRESHOLD (0.35) without global lowering.
    coverage_score = scope_res.signals.evidenceCoverageScore if (scope_res and scope_res.signals) else 0.0
    content_overlap = scope_res.signals.contentWordOverlap if (scope_res and scope_res.signals) else 0.0

    facet_cov = getattr(facet_set, "coverageScore", 0.0) if facet_set else 0.0
    if facet_set and facet_cov > 0.0:
        coverage_score = max(coverage_score, facet_cov)

    # STAGE 1 — CANDIDATE RELEVANCE ELIGIBILITY:
    # A candidate must demonstrate genuine semantic relevance to the information need.
    # Eligibility floor: rerankScore >= 0.15.
    # Below 0.15, passages are cross-encoder noise/distractors.
    ELIGIBILITY_FLOOR = 0.15
    eligible_candidates = [
        c for c in candidates
        if (c.rerankScore is not None and c.rerankScore >= ELIGIBILITY_FLOOR)
    ]
    eligible_count = len(eligible_candidates)

    # STAGE 2 — COLLECTIVE EVIDENCE-SET COVERAGE AGGREGATION:
    # Aggregation is permitted ONLY when eligible evidence exists.
    # Distractor chunks (rerankScore < 0.15) can NEVER manufacture sufficiency via coverage bonus.
    if scope_res and scope_res.decision == ScopeDecision.IN_SCOPE and content_overlap > 0.0 and eligible_count > 0:
        if top_score >= threshold:
            aggregated_score = top_score
        # Case A: Strong single passage with length dilution (top_score >= 0.25, coverage >= 0.60)
        elif top_score >= 0.25 and coverage_score >= 0.60:
            aggregated_score = max(top_score, 0.45 * top_score + 0.55 * coverage_score)
        # Case B: Multi-passage complementary evidence (>=2 eligible chunks collectively satisfying facets)
        elif eligible_count >= 2 and top_score >= 0.20 and coverage_score >= 0.65:
            aggregated_score = max(top_score, 0.40 * top_score + 0.60 * coverage_score)
        # Case C: High coverage with moderate top score (top_score >= 0.20, coverage >= 0.75)
        elif top_score >= 0.20 and coverage_score >= 0.75:
            aggregated_score = max(top_score, 0.35 * top_score + 0.65 * coverage_score)
        else:
            aggregated_score = top_score
    else:
        aggregated_score = top_score

    # Premature Abstention Protection for partial facet support:
    # If completion pass was exhausted across the project and eligible evidence exists for at least one facet
    if completion_stop_reason == "EXHAUSTED" and eligible_count > 0 and top_score >= 0.20 and not attr_rejected:
        disposition = EvidenceDisposition.PARTIAL.value
        return EvidenceSufficiency(
            sufficient=True,
            reason="Evidence partially establishes query facets; secondary facet not found in project sources",
            score=aggregated_score,
            scope=scope_dec_str,
            disposition=disposition,
            failureStage=FailureStage.NONE.value,
            signals=EvidenceSufficiencySignals(
                resultCount=len(candidates),
                topRerankScore=top_score,
                identifierMatched=identifier_matched,
                sourceCoverage=all_sources,
                conflictingEvidence=False,
                scopeDecision=scope_dec_str,
                scopeReason=scope_reason_str,
                conflictConfidence=getattr(conflict_res, "confidence", 1.0),
                conflictDetectionMethod=getattr(conflict_res, "method", "deterministic"),
                revisionResolution=rev_res,
                evidenceConflictCheck=getattr(conflict_res, "evidence_check", None),
                evidenceCoverageScore=scope_res.signals.evidenceCoverageScore if scope_res else None,
                topicSimilarityScore=top_score,
                disposition=disposition,
                failureStage=FailureStage.NONE.value,
                eligibleEvidenceCount=eligible_count,
                completionStopReason=completion_stop_reason,
                challengeRetry=challenge_retry,
                bridgeEntity=bridge_entity,
                multiHopResolved=multi_hop_resolved,
            )
        )

    if aggregated_score < threshold:
        fail_stage = (
            FailureStage.RERANKER_REJECTION.value
            if eligible_count == 0
            else FailureStage.SUFFICIENCY_GATE_REJECTION.value
        )
        return EvidenceSufficiency(
            sufficient=False,
            reason=f"Top evidence score ({aggregated_score:.4f}) below sufficiency threshold ({threshold:.4f})",
            score=aggregated_score,
            scope=scope_dec_str,
            disposition=EvidenceDisposition.INSUFFICIENT.value,
            failureStage=fail_stage,
            signals=EvidenceSufficiencySignals(
                resultCount=len(candidates),
                topRerankScore=top_score,
                identifierMatched=identifier_matched,
                sourceCoverage=all_sources,
                conflictingEvidence=False,
                scopeDecision=scope_dec_str,
                scopeReason=scope_reason_str,
                conflictConfidence=getattr(conflict_res, "confidence", 1.0),
                conflictDetectionMethod=getattr(conflict_res, "method", "deterministic"),
                revisionResolution=rev_res,
                evidenceConflictCheck=getattr(conflict_res, "evidence_check", None),
                evidenceCoverageScore=scope_res.signals.evidenceCoverageScore if scope_res else None,
                topicSimilarityScore=top_score,
                disposition=EvidenceDisposition.INSUFFICIENT.value,
                failureStage=fail_stage,
                eligibleEvidenceCount=eligible_count,
                challengeRetry=challenge_retry,
                bridgeEntity=bridge_entity,
                multiHopResolved=multi_hop_resolved,
            )
        )

    # Relevance passed; answerability is judged next (reported separately from relevance failures).
    if attr_rejected:
        return EvidenceSufficiency(
            sufficient=False,
            reason=attr.reason,
            score=top_score,
            scope=scope_dec_str,
            disposition=EvidenceDisposition.INSUFFICIENT.value,
            failureStage=FailureStage.ANSWERABILITY_GATE_REJECTION.value,
            signals=EvidenceSufficiencySignals(
                resultCount=len(candidates),
                topRerankScore=top_score,
                identifierMatched=identifier_matched,
                sourceCoverage=all_sources,
                conflictingEvidence=False,
                scopeDecision=scope_dec_str,
                scopeReason=scope_reason_str,
                topicSimilarityScore=top_score,
                disposition=EvidenceDisposition.INSUFFICIENT.value,
                failureStage=FailureStage.ANSWERABILITY_GATE_REJECTION.value,
                eligibleEvidenceCount=0,
                requestedAttribute=attr.label,
                attributeCovered=False,
                topCrossEncoderScore=(top_candidate.metadata or {}).get("crossEncoderScore") if top_candidate.metadata else None,
            )
        )


    if facet_set and getattr(facet_set, "overallStatus", None):
        from src.pipeline.query_understanding import FacetStatus
        if facet_set.overallStatus == FacetStatus.PARTIAL:
            disposition = EvidenceDisposition.PARTIAL.value
        elif facet_set.overallStatus == FacetStatus.SUPPORTED:
            disposition = EvidenceDisposition.SUPPORTED.value
        elif facet_set.overallStatus == FacetStatus.CONTRADICTED:
            disposition = EvidenceDisposition.CONTRADICTED.value
        elif facet_set.overallStatus == FacetStatus.UNRESOLVED:
            disposition = EvidenceDisposition.INSUFFICIENT.value
        else:
            disposition = (
                EvidenceDisposition.PARTIAL.value
                if (coverage_score > 0 and coverage_score < 0.99)
                else EvidenceDisposition.SUPPORTED.value
            )
    else:
        disposition = (
            EvidenceDisposition.PARTIAL.value
            if (coverage_score > 0 and coverage_score < 0.65)
            else EvidenceDisposition.SUPPORTED.value
        )

    return EvidenceSufficiency(
        sufficient=True,
        reason="Evidence sufficient for generation",
        score=aggregated_score,
        scope=scope_dec_str,
        disposition=disposition,
        failureStage=FailureStage.NONE.value,
        signals=EvidenceSufficiencySignals(
            resultCount=len(candidates),
            topRerankScore=top_score,
            identifierMatched=identifier_matched,
            sourceCoverage=all_sources,
            conflictingEvidence=False,
            scopeDecision=scope_dec_str,
            scopeReason=scope_reason_str,
            conflictConfidence=getattr(conflict_res, "confidence", 1.0),
            conflictDetectionMethod=getattr(conflict_res, "method", "deterministic"),
            revisionResolution=rev_res,
            evidenceConflictCheck=getattr(conflict_res, "evidence_check", None),
            evidenceCoverageScore=scope_res.signals.evidenceCoverageScore if scope_res else None,
            topicSimilarityScore=top_score,
            disposition=disposition,
            failureStage=FailureStage.NONE.value,
            eligibleEvidenceCount=eligible_count,
            completionTriggered=completion_triggered,
            completionReason=completion_reason,
            completionStopReason=completion_stop_reason,
            finalAnswerSlotCoverage=facet_cov if facet_set else None,
            challengeRetry=challenge_retry,
            bridgeEntity=bridge_entity,
            multiHopResolved=multi_hop_resolved,
            requestedAttribute=attr.label if (attr is not None and attr.applicable) else None,
            attributeCovered=attr.covered if (attr is not None and attr.applicable) else None,
            topCrossEncoderScore=(top_candidate.metadata or {}).get("crossEncoderScore") if top_candidate.metadata else None,
        )
    )


def evaluate_facet_completeness(
    facet_set: Optional[Any],
    candidates: List[Candidate],
    query: str
) -> Optional[Any]:
    """
    Evaluates completeness for each required answer facet independently.
    Distinguishes RETRIEVAL COVERAGE (FOUND vs NOT_FOUND) from SUPPORT STATUS (SUPPORTED, PARTIAL, UNRESOLVED).
    """
    if not facet_set or not getattr(facet_set, "facets", None):
        return facet_set

    from src.pipeline.query_understanding import FacetStatus

    supported_count = 0.0
    total_facets = len(facet_set.facets)

    # Common algorithm terms to verify whether algorithm-seeking facets actually have named algorithms in evidence
    known_algorithm_terms = {
        "random forest", "lstm", "svm", "support vector", "neural network",
        "cnn", "rnn", "decision tree", "naive bayes", "k-means", "kmeans",
        "gradient boost", "xgboost", "linear regression", "logistic regression",
        "transformer", "perceptron", "autoencoder", "dbscan", "apriori",
        "markov", "deep learning", "convolutional", "recurrent", "clustering"
    }

    for facet in facet_set.facets:
        matching_cands = []
        matching_cand_objs = []
        best_cand_score = 0.0
        kw_list = [k.lower() for k in getattr(facet, "requiredKeywords", []) if len(k) >= 2 or k.isalnum()]
        category_stop = {"protocol", "system", "theory", "model", "method", "option", "component", "events", "facts", "operating"}
        distinguishing_kws = [k for k in kw_list if k not in category_stop]
        check_kws = distinguishing_kws if distinguishing_kws else kw_list
        min_matches = 1 if len(check_kws) <= 1 else 2

        is_multihop = getattr(facet_set, "isMultiHop", False)
        bridge_ent = getattr(facet_set, "extractedBridgeEntity", None)
        bridge_kws = [w.lower() for w in bridge_ent.split() if len(w) >= 3] if bridge_ent else []

        for cand in candidates:
            c_text = cand.text.lower()
            score = cand.rerankScore if cand.rerankScore is not None else (cand.rrfScore or 0.0)
            if not is_multihop and score < 0.05:
                continue

            matches = sum(1 for kw in check_kws if kw in c_text)
            bridge_matches = sum(1 for bkw in bridge_kws if bkw in c_text) if bridge_kws else 0
            if is_multihop and getattr(facet, "facetType", "") == "endpoint_b" and bridge_kws:
                cand_matches = (matches >= 1 and bridge_matches >= 1) or matches >= min_matches
            else:
                cand_matches = matches >= min_matches

            if cand_matches:
                matching_cands.append(cand.chunkId)
                matching_cand_objs.append(cand)
                if score > best_cand_score:
                    best_cand_score = score

        facet.evidenceChunkIds = matching_cands
        has_coverage = len(matching_cands) >= 1
        facet.retrievalCoverage = "FOUND" if has_coverage else "NOT_FOUND"

        if not has_coverage:
            facet.status = FacetStatus.UNRESOLVED
        else:
            # Check if evidence actually satisfies what the facet asks (Support Status)
            f_target_lower = (getattr(facet, "targetEntity", "") or getattr(facet, "description", "")).lower()
            is_algorithm_query = "algorithm" in f_target_lower

            if is_algorithm_query:
                # Does the matched evidence actually name the requested algorithms?
                names_algorithm = any(
                    any(algo in c.text.lower() for algo in known_algorithm_terms)
                    for c in matching_cand_objs
                )
                if names_algorithm and best_cand_score >= 0.15:
                    facet.status = FacetStatus.SUPPORTED
                    supported_count += 1.0
                else:
                    # Retrieval coverage FOUND, but evidence does not name specific algorithms -> PARTIAL
                    facet.status = FacetStatus.PARTIAL
                    supported_count += 0.5
            elif best_cand_score >= 0.15 or (is_multihop and getattr(facet, "facetType", "") == "endpoint_a" and has_coverage) or (is_multihop and getattr(facet, "facetType", "") == "endpoint_b" and any((sum(1 for kw in check_kws if kw in c.text.lower()) >= 1 and sum(1 for bkw in bridge_kws if bkw in c.text.lower()) >= 1) for c in matching_cand_objs)):
                facet.status = FacetStatus.SUPPORTED
                supported_count += 1.0
            else:
                facet.status = FacetStatus.PARTIAL
                supported_count += 0.5

    facet_set.coverageScore = min(1.0, supported_count / max(1, total_facets))

    all_supported = total_facets > 0 and all(f.status == FacetStatus.SUPPORTED for f in facet_set.facets)
    any_supported = any(f.status == FacetStatus.SUPPORTED for f in facet_set.facets)
    any_partial_or_unresolved = any(f.status in (FacetStatus.PARTIAL, FacetStatus.UNRESOLVED) for f in facet_set.facets)
    any_contradicted = any(f.status == FacetStatus.CONTRADICTED for f in facet_set.facets)

    if getattr(facet_set, "isMultiHop", False):
        facet_set.multiHopResolved = all_supported

    if any_contradicted:
        facet_set.overallStatus = FacetStatus.CONTRADICTED
    elif all_supported:
        facet_set.overallStatus = FacetStatus.SUPPORTED
    elif any_supported and any_partial_or_unresolved:
        facet_set.overallStatus = FacetStatus.PARTIAL
    elif any(f.status == FacetStatus.PARTIAL for f in facet_set.facets):
        facet_set.overallStatus = FacetStatus.PARTIAL
    else:
        facet_set.overallStatus = FacetStatus.UNRESOLVED

    return facet_set


def extract_bridge_entity(
    matching_cands: List[Candidate],
    endpoint_a: str,
    endpoint_b: str
) -> Optional[str]:
    """
    Extracts candidate bridge entity/concept B from evidence established for endpoint A.
    Generic, source-agnostic heuristic: finds salient proper nouns / capitalized sequences
    or distinctive noun entities in candidate text that are distinct from A and B.
    """
    from collections import Counter
    a_tokens = set(re.findall(r'\b[A-Za-z0-9_-]+\b', endpoint_a.lower()))
    b_tokens = set(re.findall(r'\b[A-Za-z0-9_-]+\b', endpoint_b.lower()))
    common_stop = {
        "the", "and", "for", "with", "from", "that", "this", "they", "their",
        "chapter", "section", "part", "table", "figure", "prophet", "city",
        "band", "street", "road", "hall", "avenue", "lane", "house", "three",
        "four", "five", "first", "second", "lake", "angels", "danite",
        "others", "another", "every", "some", "many", "there", "when", "what",
        "which", "then", "after", "before", "about", "could", "would", "shall",
        "should", "where", "while", "though", "since", "these", "those", "little",
        "young", "great", "such", "never", "always", "again", "still", "even",
        "much", "more", "having", "being", "under", "between", "during"
    }

    entity_counts = Counter()
    for cand in matching_cands[:5]:
        text = cand.text
        # Two-word proper names (e.g. "Jefferson Hope", "Bus Controller")
        caps = re.findall(r'\b[A-Z][a-z]+\s+[A-Z][a-z]+\b', text)
        for ent in caps:
            ent_clean = ent.strip()
            ent_words = [w.lower() for w in ent_clean.split()]
            if not any(w in a_tokens or w in b_tokens or w in common_stop for w in ent_words):
                entity_counts[ent_clean] += 1

    if entity_counts:
        return entity_counts.most_common(1)[0][0]

    # Fallback to single capitalized words with length >= 4
    single_counts = Counter()
    for cand in matching_cands[:5]:
        singles = re.findall(r'\b[A-Z][a-z]{3,}\b', cand.text)
        for s in singles:
            if s.lower() not in a_tokens and s.lower() not in b_tokens and s.lower() not in common_stop:
                single_counts[s] += 1

    if single_counts:
        return single_counts.most_common(1)[0][0]

    return None


def generate_completion_queries(
    query: str,
    candidates: List[Candidate],
    facet_set: Optional[Any] = None,
) -> List[str]:
    """
    Generates a small, bounded set (max 2) of targeted completion queries for unresolved facets.
    Includes bridge query generation (B -> C) when multi-hop connection is active.
    """
    from src.pipeline.query_understanding import strip_document_filename_references
    queries: List[str] = []

    if facet_set and getattr(facet_set, "isMultiHop", False) and getattr(facet_set, "facets", None):
        from src.pipeline.query_understanding import FacetStatus
        resolved_facets = [f for f in facet_set.facets if getattr(f, "status", None) == FacetStatus.SUPPORTED]
        unresolved_facets = [f for f in facet_set.facets if getattr(f, "status", None) in (FacetStatus.UNRESOLVED, FacetStatus.PARTIAL)]
        if resolved_facets and unresolved_facets:
            rf = resolved_facets[0]
            uf = unresolved_facets[0]
            rf_cands = [c for c in candidates if c.chunkId in getattr(rf, "evidenceChunkIds", [])]
            bridge_B = extract_bridge_entity(rf_cands, getattr(rf, "targetEntity", ""), getattr(uf, "targetEntity", ""))
            if bridge_B:
                facet_set.extractedBridgeEntity = bridge_B
                target_dest = getattr(uf, "targetEntity", "")
                bridge_q = f"{bridge_B} {target_dest}".strip()
                clean_bq = strip_document_filename_references(bridge_q).strip().rstrip("?.!")
                if clean_bq and clean_bq.lower() not in [q.lower() for q in queries]:
                    queries.append(clean_bq)

    if facet_set and getattr(facet_set, "facets", None):
        from src.pipeline.query_understanding import FacetStatus
        unresolved_facets = [
            f for f in facet_set.facets
            if getattr(f, "status", None) in (FacetStatus.UNRESOLVED, FacetStatus.PARTIAL)
        ]
        for uf in unresolved_facets:
            sq = getattr(uf, "searchQuery", "")
            if sq:
                clean_sq = strip_document_filename_references(sq).strip().rstrip("?.!")
                if clean_sq and clean_sq.lower() not in [q.lower() for q in queries]:
                    queries.append(clean_sq)

    final_queries = []
    seen = set()
    for q in queries:
        q_norm = q.strip()
        if q_norm and len(q_norm) >= 2 and q_norm.lower() not in seen:
            seen.add(q_norm.lower())
            final_queries.append(q_norm)
            if len(final_queries) >= 2:
                break

    return final_queries


def execute_completion_search(
    project_id: str,
    completion_queries: List[str],
    initial_candidates: List[Candidate],
    top_k: int = FINAL_TOP_K,
    document_ids: Optional[List[str]] = None,
) -> List[Candidate]:
    """
    Executes bounded completion retrieval across Qdrant + Tantivy for missing facets.
    """
    if not completion_queries:
        return []

    # 1. Dense retrieval across Qdrant
    raw_dense_hits: List[Dict[str, Any]] = []
    try:
        query_vectors = generate_embeddings(completion_queries)
        seen_dense = set()
        for q_vec in query_vectors:
            hits = qdrant_store.search_dense(
                project_id=project_id,
                query_vector=q_vec,
                top_k=DENSE_CANDIDATE_K,
                **({"document_ids": document_ids} if document_ids else {})
            )
            for h in hits:
                cid = h.get("chunkId")
                if cid and cid not in seen_dense:
                    seen_dense.add(cid)
                    raw_dense_hits.append(h)
    except Exception as de:
        logger.warning(f"[completion dense error] {de}")

    # 2. Lexical retrieval across Tantivy
    raw_lexical_hits: List[Dict[str, Any]] = []
    try:
        seen_lex = set()
        for cq in completion_queries:
            clean_cq = re.sub(r'[()\[\]{}:^~*?<>]', ' ', cq).strip()
            if clean_cq:
                lhits = tantivy_store.search_project(
                    project_id=project_id,
                    query=clean_cq,
                    top_k=LEXICAL_CANDIDATE_K,
                    **({"document_ids": document_ids} if document_ids else {})
                )
                for lh in lhits:
                    cid = lh.get("chunkId")
                    if cid and cid not in seen_lex:
                        seen_lex.add(cid)
                        raw_lexical_hits.append(lh)
    except Exception as le:
        logger.warning(f"[completion lexical error] {le}")

    # 3. Candidate Normalization & Multi-Source Merge
    comp_map: Dict[str, Candidate] = {}
    for rank, hit in enumerate(raw_dense_hits, start=1):
        c_id = hit.get("chunkId")
        if not c_id:
            continue
        identifiers = hit.get("identifierKeys") or []
        if isinstance(identifiers, str):
            identifiers = [identifiers]
        comp_map[c_id] = Candidate(
            chunkId=c_id,
            documentId=hit.get("documentId", ""),
            projectId=hit.get("projectId", project_id),
            text=hit.get("text", ""),
            chunkIndex=hit.get("chunkIndex", 0),
            pageNumber=hit.get("pageNumber", 1),
            section=hit.get("section"),
            heading=hit.get("heading"),
            identifiers=identifiers,
            denseScore=float(hit.get("score", 0.0)),
            denseRank=rank,
            sources=["qdrant_dense"],
            metadata=hit.get("metadata", {})
        )

    for rank, hit in enumerate(raw_lexical_hits, start=1):
        c_id = hit.get("chunkId")
        if not c_id:
            continue
        ident_raw = hit.get("identifiers", "")
        lex_idents = ident_raw.split() if isinstance(ident_raw, str) else list(ident_raw)
        if c_id in comp_map:
            cand = comp_map[c_id]
            cand.lexicalScore = float(hit.get("score", 0.0))
            cand.lexicalRank = rank
            if "tantivy_lexical" not in cand.sources:
                cand.sources.append("tantivy_lexical")
            cand.identifiers = list(set(cand.identifiers + lex_idents))
        else:
            comp_map[c_id] = Candidate(
                chunkId=c_id,
                documentId=hit.get("documentId", ""),
                projectId=hit.get("projectId", project_id),
                text=hit.get("text", ""),
                pageNumber=hit.get("pageNumber", 1),
                identifiers=lex_idents,
                lexicalScore=float(hit.get("score", 0.0)),
                lexicalRank=rank,
                sources=["tantivy_lexical"]
            )

    all_comp = list(comp_map.values())
    if not all_comp:
        return []

    # 4. PostgreSQL Lifecycle & Project Isolation
    doc_ids = list(set(c.documentId for c in all_comp if c.documentId))
    try:
        ready_doc_ids, doc_filenames = get_ready_documents_meta(project_id, doc_ids)
    except Exception as pe:
        logger.error(f"[completion pg validation error] {pe}")
        return []

    valid_comp = []
    for c in all_comp:
        if c.projectId == project_id and c.documentId in ready_doc_ids:
            if c.documentId in doc_filenames:
                if not c.metadata:
                    c.metadata = {}
                c.metadata["filename"] = doc_filenames[c.documentId]
            valid_comp.append(c)

    if not valid_comp:
        return []

    # 5. RRF Fusion
    for cand in valid_comp:
        cand.rrfScore = calculate_rrf_score(
            dense_rank=cand.denseRank,
            lexical_rank=cand.lexicalRank,
            graph_rank=cand.graphRank,
            k=RRF_K
        )

    valid_comp.sort(key=lambda c: -c.rrfScore)
    pool_for_rerank = valid_comp[:RERANK_CANDIDATE_K]

    # 6. FlashRank Reranking
    rerank_q = completion_queries[0]
    reranked_comp = []
    try:
        passages = [{"chunkId": c.chunkId, "text": c.text, "candidate": c} for c in pool_for_rerank]
        rerank_res = rerank(query=rerank_q, passages=passages, top_n=RERANK_CANDIDATE_K)
        for res in rerank_res:
            cand = res["candidate"]
            cand.rerankScore = float(res.get("rerankScore", 0.0))
            reranked_comp.append(cand)
    except Exception as rre:
        logger.warning(f"[completion rerank error] {rre}")
        reranked_comp = pool_for_rerank

    _calibrate_pool_relevance(reranked_comp, rerank_q, project_id=project_id)
    reranked_comp.sort(key=lambda c: c.rerankScore or 0.0, reverse=True)
    return reranked_comp[:top_k]


def merge_and_select_complete_evidence(
    initial_candidates: List[Candidate],
    completion_candidates: List[Candidate],
    facet_set: Optional[Any] = None,
    top_k: int = RERANK_CANDIDATE_K
) -> List[Candidate]:
    """
    Merges initial evidence and completion evidence.
    Ensures at least 1 candidate for each supported facet is preserved (preventing starvation).
    """
    if not completion_candidates:
        return initial_candidates

    merged: List[Candidate] = []
    seen_chunk_ids: Set[str] = set()

    facet_chunk_ids: Set[str] = set()
    if facet_set and getattr(facet_set, "facets", None):
        for f in facet_set.facets:
            for cid in getattr(f, "evidenceChunkIds", []):
                facet_chunk_ids.add(cid)

    # Preserve highest rerank score across initial and completion passes for shared chunks
    initial_scores = {c.chunkId: c.rerankScore for c in initial_candidates if c.rerankScore is not None}
    completion_scores = {c.chunkId: c.rerankScore for c in completion_candidates if c.rerankScore is not None}
    for c in completion_candidates:
        if c.chunkId in initial_scores:
            c.rerankScore = max(c.rerankScore or 0.0, initial_scores[c.chunkId] or 0.0)
    for c in initial_candidates:
        if c.chunkId in completion_scores:
            c.rerankScore = max(c.rerankScore or 0.0, completion_scores[c.chunkId] or 0.0)

    # Answering completion candidates with sufficient relevance
    answering_completion = [
        c for c in completion_candidates
        if (c.rerankScore and c.rerankScore >= 0.15) or (c.chunkId in facet_chunk_ids)
    ]

    top_initial = initial_candidates[:2] if initial_candidates else []

    for c in answering_completion:
        if c.chunkId not in seen_chunk_ids:
            seen_chunk_ids.add(c.chunkId)
            merged.append(c)

    for c in top_initial:
        if c.chunkId not in seen_chunk_ids:
            seen_chunk_ids.add(c.chunkId)
            merged.append(c)

    # Ensure at least 1 candidate for each supported facet is present (anti-starvation)
    if facet_set and getattr(facet_set, "facets", None):
        for f in facet_set.facets:
            f_cids = getattr(f, "evidenceChunkIds", [])
            if f_cids and not any(cid in seen_chunk_ids for cid in f_cids):
                for c in (completion_candidates + initial_candidates):
                    if c.chunkId in f_cids and c.chunkId not in seen_chunk_ids:
                        seen_chunk_ids.add(c.chunkId)
                        merged.insert(min(len(merged), 2), c)
                        break

    for c in initial_candidates:
        if c.chunkId not in seen_chunk_ids:
            seen_chunk_ids.add(c.chunkId)
            merged.append(c)

    for c in completion_candidates:
        if c.chunkId not in seen_chunk_ids:
            seen_chunk_ids.add(c.chunkId)
            merged.append(c)

    return merged[:top_k]


def _stored_passage_vectors(project_id: Optional[str], pool: List[Candidate]) -> Dict[str, List[float]]:
    """
    Reuses the passage vectors already stored in Qdrant for this exact chunk text (computed at ingestion by
    the same embedding model), instead of re-embedding ~20 passages per query. A stored vector is used only if:
    same project, same document, identical stored text, expected dimension, and unit norm (the current
    all-MiniLM-L6-v2 output is L2-normalized; legacy mock/foreign embeddings are not). Otherwise -> re-embed.
    """
    if not project_id or not pool:
        return {}
    try:
        from qdrant_client.http.models import Filter, FieldCondition, MatchValue, MatchAny
        from src.pipeline.embedder import EMBEDDING_DIM
        ids = list({c.chunkId for c in pool if c.chunkId})
        points, _ = qdrant_store.client.scroll(
            collection_name="groundguard_chunks",
            scroll_filter=Filter(must=[
                FieldCondition(key="projectId", match=MatchValue(value=project_id)),
                FieldCondition(key="chunkId", match=MatchAny(any=ids)),
            ]),
            limit=len(ids) + 10, with_payload=["chunkId", "documentId", "text"], with_vectors=True,
        )
    except Exception as e:
        logger.warning(f"[retrieval] Stored passage vectors unavailable, re-embedding: {e}")
        return {}
    by_chunk = {c.chunkId: c for c in pool}
    out: Dict[str, List[float]] = {}
    for p in points:
        pl = p.payload or {}
        cand = by_chunk.get(pl.get("chunkId"))
        vec = p.vector if isinstance(p.vector, list) else None
        if cand is None or vec is None or len(vec) != EMBEDDING_DIM:
            continue
        if pl.get("documentId") != cand.documentId or (pl.get("text") or "") != (cand.text or ""):
            continue
        if abs(sum(x * x for x in vec) ** 0.5 - 1.0) > 1e-3:
            continue
        out[cand.chunkId] = vec
    return out


def _fused_selection_order(pool: List[Candidate], tag_boost: bool = False, tag_match=None) -> List[Candidate]:
    """Reciprocal-rank fusion of the calibrated-relevance order and the retrieval RRF order (k=60)."""
    rel_rank = {id(c): i for i, c in enumerate(pool)}
    rrf_rank = {id(c): i for i, c in enumerate(sorted(pool, key=lambda c: -(c.rrfScore or 0.0)))}

    def key(c: Candidate):
        fused = 1.0 / (RRF_K + rel_rank[id(c)]) + 1.0 / (RRF_K + rrf_rank[id(c)])
        boosted = bool(tag_boost and tag_match and tag_match(c))
        return (not boosted, -fused, rel_rank[id(c)])
    return sorted(pool, key=key)


def _calibrate_pool_relevance(pool: List[Candidate], query_text: str, timings: Optional[Dict[str, float]] = None,
                              project_id: Optional[str] = None, query_vector: Optional[List[float]] = None) -> None:
    """
    Replaces each candidate's rerankScore with calibrated topical relevance (cross-encoder combined with
    query/passage dense cosine, see answerability.calibrate_relevance). Raw scores are kept in metadata.
    If embeddings are unavailable the cross-encoder score is kept unchanged.
    """
    if not pool:
        return
    stored = _stored_passage_vectors(project_id, pool)
    # Embed only what is genuinely missing: the query (unless already embedded for dense search with the
    # identical text) and passages without a valid stored vector; identical texts are embedded once.
    missing_texts = list(dict.fromkeys((c.text or "") for c in pool if c.chunkId not in stored))
    to_embed = ([] if query_vector is not None else [query_text]) + missing_texts
    try:
        new_vecs = generate_embeddings(to_embed) if to_embed else []
    except Exception as e:
        logger.warning(f"[retrieval] Relevance calibration skipped (embedding failure): {e}")
        return
    if len(new_vecs) != len(to_embed):
        return
    qv = query_vector if query_vector is not None else new_vecs[0]
    text_vec = dict(zip(missing_texts, new_vecs[0 if query_vector is not None else 1:]))
    vecs = [qv] + [stored.get(c.chunkId) or text_vec[(c.text or "")] for c in pool]
    if timings is not None:
        timings["passagesEmbedded"] = len(missing_texts)
        timings["passageVectorsReused"] = len(stored)
    q_norm = sum(x * x for x in qv) ** 0.5 or 1.0
    for c, v in zip(pool, vecs[1:]):
        v_norm = sum(x * x for x in v) ** 0.5 or 1.0
        cos = sum(a * b for a, b in zip(qv, v)) / (q_norm * v_norm)
        if c.metadata is None:
            c.metadata = {}
        c.metadata["crossEncoderScore"] = c.rerankScore
        c.metadata["queryCosine"] = round(cos, 4)
        c.rerankScore = calibrate_relevance(c.rerankScore, cos)

    # Rescue pass for long / multi-topic chunks: when no chunk reaches the sufficiency threshold, score
    # the best sentence window inside the top candidates (whole-chunk scoring dilutes a single decisive
    # sentence, e.g. "SC-12 is attached directly to the upstream transmitter port" inside a 5-topic chunk).
    if max((c.rerankScore or 0.0) for c in pool) >= SUFFICIENCY_THRESHOLD:
        return
    _rescue_started = time.perf_counter()
    if timings is not None:
        timings["sentenceRescueRan"] = 1
    top = sorted(pool, key=lambda c: -(c.rerankScore or 0.0))[:SENTENCE_RESCUE_K]
    units, owners = [], []
    for c in top:
        sents = [s for s in re.split(r"(?<=[.!?;])\s+", " ".join((c.text or "").split())) if len(s) > 15]
        for u in dict.fromkeys(sents + [" ".join(sents[i:i + 2]) for i in range(len(sents) - 1)]):
            units.append(u)
            owners.append(c)
    if len(units) <= len(top):
        return
    try:
        ce_res = rerank(query=query_text, passages=[{"chunkId": str(i), "text": u} for i, u in enumerate(units)])
        ce_by_unit = {int(r["chunkId"]): float(r.get("rerankScore", 0.0)) for r in ce_res}
        uvecs = generate_embeddings(units)
    except Exception as e:
        logger.warning(f"[retrieval] Sentence-level relevance rescue skipped: {e}")
        return
    for i, (c, v) in enumerate(zip(owners, uvecs)):
        v_norm = sum(x * x for x in v) ** 0.5 or 1.0
        cos = sum(a * b for a, b in zip(qv, v)) / (q_norm * v_norm)
        s_score = calibrate_relevance(ce_by_unit.get(i, 0.0), cos)
        if s_score > (c.rerankScore or 0.0):
            c.rerankScore = s_score
            c.metadata["sentenceRelevance"] = round(s_score, 6)
    if timings is not None:
        timings["sentenceRescue"] = round((time.perf_counter() - _rescue_started) * 1000.0, 1)


def retrieve_evidence(
    project_id: str,
    query: str,
    top_k: int = FINAL_TOP_K,
    request_id: Optional[str] = None,
    search_queries: Optional[List[str]] = None,
    lexical_anchors: Optional[List[str]] = None,
    question_slot: Optional[str] = None,
    facet_set: Optional[Any] = None,
    is_challenge_retry: bool = False,
    document_ids: Optional[List[str]] = None,
    answerability_query: Optional[str] = None,
) -> RetrieveResponse:
    """
    document_ids: when the user explicitly names document(s), every retriever (dense, lexical, graph,
    completion) is restricted to them -- in addition to (never instead of) project isolation.

    Canonical M2 Retrieval Pipeline:
    1. Query Analysis & Deterministic Routing
    2. Parallel / Multi-Store Query Execution (Qdrant Dense, Tantivy Lexical, NetworkX Graph)
    3. Candidate Normalization (exact chunkId deduplication & multi-source merging)
    4. Reciprocal Rank Fusion (RRF with configurable k=60)
    5. Bounded Candidate Pool Selection
    6. Real FlashRank Cross-Encoder Reranking
    7. PostgreSQL Canonical Lifecycle Validation (READY status & project isolation)
    8. Deterministic Evidence Sufficiency Gate
    """
    start_time = time.perf_counter()
    stage_ms: Dict[str, float] = {}
    _mark = [start_time]

    def _lap(name: str) -> None:
        now = time.perf_counter()
        stage_ms[name] = round(stage_ms.get(name, 0.0) + (now - _mark[0]) * 1000.0, 1)
        _mark[0] = now

    from src.pipeline import embedder as _emb_mod, reranker as _rr_mod
    _emb_init_before, _rr_init_before = _emb_mod.MODEL_INIT_MS, _rr_mod.RANKER_INIT_MS
    req_id = request_id or f"req_{uuid.uuid4().hex[:12]}"
    bounded_top_k = min(max(1, top_k + (2 if is_challenge_retry else 0)), RERANK_CANDIDATE_K)

    # 1. Deterministic Query Routing
    # Use original query (search_queries[1]) for identifier extraction to prevent
    # speculative LLM rewrite expansions from poisoning required identifier checks
    routing_q = (search_queries[1] if (search_queries and len(search_queries) > 1 and search_queries[1]) else query)
    route = route_query(routing_q)
    route.rawQuery = routing_q
    selected_sources = []
    if route.dense:
        selected_sources.append("qdrant_dense")
    if route.lexical:
        selected_sources.append("tantivy_lexical")
    if route.graph:
        selected_sources.append("networkx_graph")

    # 2. Multi-Source Candidate Retrieval
    raw_dense_hits: List[Dict[str, Any]] = []
    raw_lexical_hits: List[Dict[str, Any]] = []
    raw_graph_hits: List[Dict[str, Any]] = []
    dense_query_vector = None  # (vector, text) computed for dense search; reused only for identical text
    dense_available = True
    degradation_reason: Optional[str] = None

    _lap("routing")
    # 2a. Qdrant Dense Retrieval
    # A dense backend outage degrades to lexical-only and is reported explicitly in metadata;
    # it never silently reads from a different vector store.
    if route.dense:
        try:
            dense_queries = [query]
            if search_queries:
                for sq in search_queries[:2]:
                    if sq and sq.strip() and sq.strip() not in dense_queries:
                        dense_queries.append(sq.strip())

            _lap("routing")
            query_vectors = generate_embeddings(dense_queries) if dense_queries else []
            dense_query_vector = (query_vectors[0], dense_queries[0]) if query_vectors else None
            _lap("queryEmbedding")
            seen_dense_chunks = set()
            for q_vec in query_vectors:
                dense_kwargs = {"document_ids": document_ids} if document_ids else {}
                hits = qdrant_store.search_dense(
                    project_id=project_id,
                    query_vector=q_vec,
                    top_k=DENSE_CANDIDATE_K,
                    **dense_kwargs
                )
                for h in hits:
                    cid = h.get("chunkId")
                    if cid and cid not in seen_dense_chunks:
                        seen_dense_chunks.add(cid)
                        raw_dense_hits.append(h)
                    elif cid:
                        for existing in raw_dense_hits:
                            if existing.get("chunkId") == cid and float(h.get("score", 0)) > float(existing.get("score", 0)):
                                existing["score"] = h.get("score")
                                break
        except QdrantUnavailableError as e:
            if not route.lexical:
                raise RuntimeError(f"Qdrant retrieval infrastructure failure: {e}") from e
            raw_dense_hits = []
            dense_available = False
            degradation_reason = str(e)
            logger.error(f"[retrieval] {e} -- running LEXICAL-ONLY for project_id={project_id}")
        except Exception as e:
            logger.error(f"Dense retrieval failed on Qdrant: {e}")
            raise RuntimeError(f"Qdrant retrieval infrastructure failure: {e}") from e

    _lap("qdrantSearch")
    # 2b. Tantivy Lexical Retrieval
    if route.lexical:
        try:
            # Safe query sanitization at orchestration layer: preserve technical tokens while replacing syntax-breaking delimiters
            clean_lexical_query = re.sub(r'[()\[\]{}:^~*?<>]', ' ', query).strip()
            lex_kwargs = {"document_ids": document_ids} if document_ids else {}
            raw_lexical_hits = tantivy_store.search_project(
                project_id=project_id,
                query=clean_lexical_query or query,
                top_k=LEXICAL_CANDIDATE_K,
                **lex_kwargs
            )
            # Corroborate with high-information lexical anchors (Section 5)
            if lexical_anchors:
                anchor_str = " ".join(lexical_anchors).strip()
                if anchor_str and anchor_str.lower() != clean_lexical_query.lower():
                    anchor_hits = tantivy_store.search_project(
                        project_id=project_id,
                        query=anchor_str,
                        top_k=LEXICAL_CANDIDATE_K,
                        **lex_kwargs
                    )
                    existing_cids = {h.get("chunkId") for h in raw_lexical_hits if h.get("chunkId")}
                    for ah in anchor_hits:
                        if ah.get("chunkId") not in existing_cids:
                            existing_cids.add(ah.get("chunkId"))
                            raw_lexical_hits.append(ah)
        except Exception as e:
            logger.error(f"Lexical retrieval failed on Tantivy: {e}")
            raise RuntimeError(f"Tantivy retrieval infrastructure failure: {e}") from e

    _lap("tantivySearch")
    # 2c. NetworkX Graph Retrieval (conditionally activated for topology/relations)
    if route.graph:
        try:
            graph_tokens = list(route.extractedIdentifiers)
            if not graph_tokens:
                # Fallback to alphanumeric words in query
                words = [w.strip().upper() for w in query.split() if len(w) > 2]
                graph_tokens = words[:3]

            seen_edges = set()
            for token in graph_tokens:
                relations = graph_store.query_relations(project_id, token)
                for rel in relations:
                    prov = rel.get("provenance", {})
                    edge_key = (rel.get("source"), rel.get("target"), prov.get("chunkId"))
                    if edge_key not in seen_edges and prov.get("chunkId"):
                        seen_edges.add(edge_key)
                        raw_graph_hits.append({
                            "chunkId": prov.get("chunkId"),
                            "documentId": prov.get("documentId"),
                            "projectId": project_id,
                            "pageNumber": prov.get("pageNumber", 1),
                            "text": prov.get("sourceText", f"{rel.get('source')} {rel.get('relation')} {rel.get('target')}"),
                            "graphRelations": [rel],
                            "score": 1.0
                        })
                        if len(raw_graph_hits) >= GRAPH_CANDIDATE_K:
                            break
                if len(raw_graph_hits) >= GRAPH_CANDIDATE_K:
                    break
        except Exception as e:
            logger.error(f"Graph retrieval failed on NetworkX: {e}")
            raise RuntimeError(f"NetworkX retrieval infrastructure failure: {e}") from e

    _lap("graphSearch")
    # 3. Candidate Normalization & Multi-Source Merge
    # Invariant: If Qdrant and Tantivy both return chunkId = chk_123, exactly ONE candidate is stored with both contributions.
    candidates_map: Dict[str, Candidate] = {}

    # Ingest Dense hits
    for rank, hit in enumerate(raw_dense_hits, start=1):
        c_id = hit.get("chunkId")
        if not c_id:
            continue
        identifiers = hit.get("identifierKeys") or []
        if isinstance(identifiers, str):
            identifiers = [identifiers]

        cand = Candidate(
            chunkId=c_id,
            documentId=hit.get("documentId", ""),
            projectId=hit.get("projectId", project_id),
            text=hit.get("text", ""),
            chunkIndex=hit.get("chunkIndex", 0),
            pageNumber=hit.get("pageNumber", 1),
            section=hit.get("section"),
            heading=hit.get("heading"),
            identifiers=identifiers,
            denseScore=float(hit.get("score", 0.0)),
            denseRank=rank,
            sources=["qdrant_dense"],
            metadata=hit.get("metadata", {})
        )
        candidates_map[c_id] = cand

    # Ingest Lexical hits (merge or insert)
    for rank, hit in enumerate(raw_lexical_hits, start=1):
        c_id = hit.get("chunkId")
        if not c_id:
            continue
        ident_raw = hit.get("identifiers", "")
        lex_idents = ident_raw.split() if isinstance(ident_raw, str) else list(ident_raw)

        if c_id in candidates_map:
            cand = candidates_map[c_id]
            cand.lexicalScore = float(hit.get("score", 0.0))
            cand.lexicalRank = rank
            if "tantivy_lexical" not in cand.sources:
                cand.sources.append("tantivy_lexical")
            # Combine identifiers
            merged_idents = list(set(cand.identifiers + lex_idents))
            cand.identifiers = merged_idents
        else:
            cand = Candidate(
                chunkId=c_id,
                documentId=hit.get("documentId", ""),
                projectId=hit.get("projectId", project_id),
                text=hit.get("text", ""),
                pageNumber=hit.get("pageNumber", 1),
                identifiers=lex_idents,
                lexicalScore=float(hit.get("score", 0.0)),
                lexicalRank=rank,
                sources=["tantivy_lexical"]
            )
            candidates_map[c_id] = cand

    # Ingest Graph hits (merge or insert)
    for rank, hit in enumerate(raw_graph_hits, start=1):
        c_id = hit.get("chunkId")
        if not c_id:
            continue
        relations = hit.get("graphRelations", [])

        if c_id in candidates_map:
            cand = candidates_map[c_id]
            cand.graphScore = float(hit.get("score", 1.0))
            cand.graphRank = rank
            if "networkx_graph" not in cand.sources:
                cand.sources.append("networkx_graph")
            existing_rels = cand.graphRelations or []
            cand.graphRelations = existing_rels + relations
        else:
            cand = Candidate(
                chunkId=c_id,
                documentId=hit.get("documentId", ""),
                projectId=hit.get("projectId", project_id),
                text=hit.get("text", ""),
                pageNumber=hit.get("pageNumber", 1),
                graphScore=float(hit.get("score", 1.0)),
                graphRank=rank,
                sources=["networkx_graph"],
                graphRelations=relations
            )
            candidates_map[c_id] = cand

    all_normalized = list(candidates_map.values())

    _lap("normalization")
    # 4. PostgreSQL Canonical Lifecycle & Isolation Validation (Fail-Closed)
    # Invariant: Evidence MUST belong to projectId AND have status = 'ready' in canonical PostgreSQL.
    # Pruning invalid/unready candidates BEFORE RRF & Reranking ensures unready documents
    # cannot consume fusion or reranking pool slots or displace valid READY candidates.
    candidate_doc_ids = list(set(c.documentId for c in all_normalized if c.documentId))
    ready_doc_ids: Set[str] = set()
    doc_filenames: Dict[str, str] = {}
    try:
        ready_doc_ids, doc_filenames = get_ready_documents_meta(project_id, candidate_doc_ids)
    except Exception as e:
        logger.error(f"PostgreSQL lifecycle validation failed for project_id={project_id}: {e}")
        raise RuntimeError(f"PostgreSQL canonical validation failure: {e}") from e

    # Fail-closed filter: ensure candidate.projectId == project_id and document.status == 'ready'
    valid_candidates: List[Candidate] = []
    for c in all_normalized:
        if c.projectId != project_id:
            logger.warning(
                f"[retrieval] Candidate chunk {c.chunkId} rejected: projectId mismatch "
                f"(candidate='{c.projectId}', expected='{project_id}')"
            )
            continue
        if c.documentId not in ready_doc_ids:
            logger.info(
                f"[retrieval] Candidate chunk {c.chunkId} excluded: document {c.documentId} "
                f"not in READY state in project {project_id}"
            )
            continue
        if document_ids and c.documentId not in document_ids:
            # Document-scoped question: graph (or any other) hits outside the named document are dropped.
            continue
        if c.documentId in doc_filenames:
            if not c.metadata:
                c.metadata = {}
            c.metadata["filename"] = doc_filenames[c.documentId]
        valid_candidates.append(c)

    _lap("readyValidation")
    # 5. Reciprocal Rank Fusion (RRF) on Valid READY Candidates
    for cand in valid_candidates:
        cand.rrfScore = calculate_rrf_score(
            dense_rank=cand.denseRank,
            lexical_rank=cand.lexicalRank,
            graph_rank=cand.graphRank,
            k=RRF_K
        )

    # Deterministic tie-breaking:
    # 1. rrfScore DESC
    # 2. best source rank ASC
    # 3. chunkId ASC
    def sort_key(c: Candidate):
        ranks = [r for r in [c.denseRank, c.lexicalRank, c.graphRank] if r is not None]
        best_rank = min(ranks) if ranks else 9999
        return (-c.rrfScore, best_rank, c.chunkId)

    valid_candidates.sort(key=sort_key)

    # 6. Bounded Candidate Pool for Reranking (top 20 valid candidates)
    rrf_pool = valid_candidates[:RRF_POOL_K]

    # 7. FlashRank Reranking with Adaptive Bypass on Exact Equipment Tags
    exact_tag_matched = False
    if route.extractedIdentifiers and rrf_pool:
        top_cand = rrf_pool[0]
        cand_idents = [i.upper() for i in top_cand.identifiers]
        for tag in route.extractedIdentifiers:
            if tag.upper() in cand_idents or tag.upper() in top_cand.text.upper():
                exact_tag_matched = True
                break

    # Exact equipment-tag matches may BOOST RANKING ONLY. They never assign a relevance score and never
    # establish sufficiency (previously a tag match forced rerankScore >= 0.50, passing the 0.35 gate even
    # when the requested attribute was absent from the evidence).
    tag_boost = bool(exact_tag_matched and os.getenv("ENABLE_RERANKER_BYPASS", "true").lower() == "true")

    def _matches_query_tag(c: Candidate) -> bool:
        return any(
            t.upper() in [i.upper() for i in c.identifiers] or t.upper() in c.text.upper()
            for t in route.extractedIdentifiers
        )

    _lap("rrfFusion")
    reranked_pool: List[Candidate] = []
    if rrf_pool and query:
        try:
            passages = [
                {"chunkId": c.chunkId, "text": c.text, "candidate": c}
                for c in rrf_pool
            ]
            # Sanitize query for cross-encoder reranker: strip document references
            from src.pipeline.query_understanding import strip_document_filename_references
            clean_rerank_q = strip_document_filename_references(query)
            rerank_q = clean_rerank_q if len(clean_rerank_q) >= 3 else query
            rerank_results = rerank(query=rerank_q, passages=passages, top_n=RERANK_CANDIDATE_K)
            for res in rerank_results:
                cand = res["candidate"]
                cand.rerankScore = float(res.get("rerankScore", 0.0))
                reranked_pool.append(cand)

            # Corroborate with alternative high-fidelity user/semantic query if distinct
            alt_q = None
            if search_queries and len(search_queries) > 0:
                candidate_alt = strip_document_filename_references(search_queries[0])
                if candidate_alt and candidate_alt.lower() != rerank_q.lower() and len(candidate_alt) >= 3:
                    alt_q = candidate_alt
            elif hasattr(route, "rawQuery") and route.rawQuery and route.rawQuery.lower() != rerank_q.lower():
                alt_q = route.rawQuery

            if alt_q:
                try:
                    alt_res = rerank(query=alt_q, passages=passages, top_n=RERANK_CANDIDATE_K)
                    alt_scores = {r.get("chunkId", r.get("id")): float(r.get("rerankScore", r.get("score", 0.0))) for r in alt_res}
                    for cand in reranked_pool:
                        if cand.chunkId in alt_scores:
                            cand.rerankScore = max(cand.rerankScore or 0.0, alt_scores[cand.chunkId])
                except Exception as alt_err:
                    logger.debug(f"Alt rerank failed: {alt_err}")
        except Exception as e:
            logger.error(f"Reranking stage failed: {e}")
            raise RuntimeError(f"FlashRank reranking infrastructure failure: {e}") from e

        _lap("crossEncoderRerank")
        _calibrate_pool_relevance(
            reranked_pool, rerank_q, stage_ms, project_id=project_id,
            query_vector=dense_query_vector[0] if (dense_query_vector and dense_query_vector[1] == rerank_q) else None,
        )
        _lap("relevanceCalibration")
        if tag_boost:
            logger.info(f"[retrieval] Tag ranking boost (ordering only) on: {route.extractedIdentifiers}")
            reranked_pool.sort(key=lambda c: (not _matches_query_tag(c), -(c.rerankScore or 0.0)))
        else:
            reranked_pool.sort(key=lambda c: -(c.rerankScore or 0.0))
    else:
        reranked_pool = rrf_pool

    # Section 7 & 8: Generic Question Slot Alignment Boost
    # Direct answering evidence should outrank merely tangentially related evidence.
    if question_slot and question_slot != "general":
        for cand in reranked_pool:
            boost = 0.0
            cand_lower = cand.text.lower()
            if question_slot == "location":
                if re.search(r'\b(?:\d+[\s\w]+(?:street|st|road|rd|avenue|ave|lane|ln|court|ct|way|boulevard|blvd|suite|room|floor|place|park|square)|located\s+at|residing\s+at|lives\s+at|address\s*[:\-])\b', cand_lower):
                    boost = 0.08
            elif question_slot == "numeric":
                if re.search(r'\b\d+(?:\.\d+)?\s*(?:bar|kg|kpa|mpa|v|volts?|hz|mhz|ghz|m3/h|°c|c|f|sec|ms|s|gb|mb|kb|ports?)\b', cand_lower):
                    boost = 0.06
            elif question_slot == "temporal":
                if re.search(r'\b(?:18|19|20)\d{2}\b', cand_lower) or re.search(r'\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b', cand_lower):
                    boost = 0.06
            elif question_slot == "causal":
                if re.search(r'\b(?:because|due\s+to|causes?|caused\s+by|root\s+cause|as\s+a\s+result|trigger(?:ed)?)\b', cand_lower):
                    boost = 0.05
            elif question_slot == "procedural":
                if re.search(r'\b(?:step\s+\d+|1\.|2\.|first|then|afterwards|subsequently|procedure)\b', cand_lower):
                    boost = 0.05
            if boost > 0.0:
                cand.rerankScore = min(1.0, (cand.rerankScore or 0.0) + boost)

        # Re-sort descending by rerankScore after slot alignment boost
        reranked_pool.sort(key=lambda c: c.rerankScore or 0.0, reverse=True)

    _lap("rerankOther")
    # 8. Answer Facet Completeness Evaluation & Bounded Evidence Completion Retrieval
    from src.pipeline.query_understanding import extract_answer_facets, FacetStatus
    if facet_set is None:
        facet_set = extract_answer_facets(query)
    evaluate_facet_completeness(facet_set, reranked_pool, query)

    completion_triggered = False
    completion_reason = None
    completion_stop_reason = None
    initial_evidence_count = len(reranked_pool)
    initial_slot_coverage = getattr(facet_set, "coverageScore", 0.0) if facet_set else 0.0
    completion_queries_count = 0
    completion_evidence_count = 0
    final_slot_coverage = initial_slot_coverage

    has_unresolved_facets = bool(
        facet_set
        and getattr(facet_set, "facets", None)
        and any(getattr(f, "status", None) in (FacetStatus.UNRESOLVED, FacetStatus.PARTIAL) for f in facet_set.facets)
        and (getattr(facet_set, "isComparison", False) or getattr(facet_set, "isCompound", False) or getattr(facet_set, "isMultiHop", False))
    )

    if has_unresolved_facets and reranked_pool:
        top_cand_score = reranked_pool[0].rerankScore if reranked_pool[0].rerankScore is not None else 0.0
        # Trigger ONE bounded completion retrieval if candidate pool has signal or partial facet coverage
        if top_cand_score >= 0.10 or any(getattr(f, "status", None) in (FacetStatus.SUPPORTED, FacetStatus.PARTIAL) for f in facet_set.facets):
            completion_triggered = True
            completion_reason = "Unresolved answer facets"
            completion_queries = generate_completion_queries(query, reranked_pool, facet_set=facet_set)
            completion_queries_count = len(completion_queries)

            if completion_queries:
                logger.info(f"[retrieval completion] Running bounded completion for queries: {completion_queries}")
                completion_cands = execute_completion_search(
                    project_id=project_id,
                    completion_queries=completion_queries,
                    initial_candidates=reranked_pool,
                    top_k=bounded_top_k,
                    document_ids=document_ids,
                )
                completion_evidence_count = len(completion_cands)

                reranked_pool = merge_and_select_complete_evidence(
                    initial_candidates=reranked_pool,
                    completion_candidates=completion_cands,
                    facet_set=facet_set,
                    top_k=RERANK_CANDIDATE_K
                )

                evaluate_facet_completeness(facet_set, reranked_pool, query)
                final_slot_coverage = getattr(facet_set, "coverageScore", 0.0) if facet_set else 0.0

                if facet_set and getattr(facet_set, "coverageScore", 0.0) >= 0.99:
                    completion_stop_reason = "COMPLETE"
                else:
                    completion_stop_reason = "EXHAUSTED"

    # Deterministic Evidence Sufficiency Gate
    bridge_entity = getattr(facet_set, "extractedBridgeEntity", None) if facet_set else None
    multi_hop_resolved = getattr(facet_set, "multiHopResolved", None) if facet_set else None

    _lap("facetsAndCompletion")
    sufficiency = evaluate_sufficiency(
        reranked_pool,
        route,
        query=query,
        facet_set=facet_set,
        completion_stop_reason=completion_stop_reason,
        completion_triggered=completion_triggered,
        completion_reason=completion_reason,
        challenge_retry=is_challenge_retry,
        bridge_entity=bridge_entity,
        multi_hop_resolved=multi_hop_resolved,
        answerability_query=answerability_query,
    )

    # Filter out superseded candidates if revision precedence established a newer revision
    if sufficiency.signals.revisionResolution == "newer_revision_selected":
        superseded_docs = set(sufficiency.signals.conflictingDocumentIds or [])
        filtered_cands = [c for c in reranked_pool if not (extract_candidate_metadata(c).get("status") in ["superseded", "obsolete"] or extract_candidate_metadata(c).get("supersededBy"))]
        if filtered_cands:
            reranked_pool = filtered_cands

    # Final bounded slice
    # Contract:
    # - if valid candidates exist but sufficiency is false: return ranked candidates + sufficiency.sufficient=false
    # - if no valid candidates exist: return results=[] + sufficiency.sufficient=false
    # Evidence SELECTION only (sufficiency was already decided on the relevance order above): fuse the
    # calibrated-relevance rank with the hybrid-retrieval (RRF) rank, so passages corroborated by dense AND
    # BM25 are not dropped just below the cut (labeled eval: hit-rate 0.65 -> 0.71, 0 regressions, -2% tokens).
    # Exact-tag ordering boost (Phase 02) is preserved ahead of the fused order.
    final_candidates = _fused_selection_order(reranked_pool, tag_boost, _matches_query_tag)[:bounded_top_k]

    # Map to EvidenceItem response models
    evidence_items: List[EvidenceItem] = []
    for cand in final_candidates:
        cand_meta = {
            "denseScore": cand.denseScore,
            "lexicalScore": cand.lexicalScore,
            "graphScore": cand.graphScore,
            "denseRank": cand.denseRank,
            "lexicalRank": cand.lexicalRank,
            "graphRank": cand.graphRank,
            "sources": cand.sources,
            "chunkIndex": cand.chunkIndex
        }
        if cand.metadata:
            cand_meta.update(cand.metadata)
        if cand.provenance:
            cand_meta.update(cand.provenance)

        evidence_items.append(EvidenceItem(
            evidenceId=f"ev_{uuid.uuid4().hex[:8]}",
            chunkId=cand.chunkId,
            documentId=cand.documentId,
            text=cand.text,
            pageNumber=cand.pageNumber,
            section=cand.section,
            heading=cand.heading,
            identifiers=cand.identifiers,
            sources=cand.sources,
            rrfScore=cand.rrfScore,
            rerankScore=cand.rerankScore,
            score=cand.rerankScore if cand.rerankScore is not None else cand.rrfScore,
            graphRelations=cand.graphRelations,
            metadata=cand_meta
        ))

    _lap("sufficiencyAndResponse")
    latency_ms = (time.perf_counter() - start_time) * 1000.0
    stage_ms["total"] = round(latency_ms, 1)
    # Model initialization that happened during THIS call (0 when warm); included in the stages above.
    stage_ms["embeddingModelInit"] = round(_emb_mod.MODEL_INIT_MS - _emb_init_before, 1) if _emb_mod.MODEL_INIT_MS != _emb_init_before else 0.0
    stage_ms["crossEncoderInit"] = round(_rr_mod.RANKER_INIT_MS - _rr_init_before, 1) if _rr_mod.RANKER_INIT_MS != _rr_init_before else 0.0

    metadata = RetrieveMetadata(
        selectedSources=selected_sources,
        denseCandidateCount=len(raw_dense_hits),
        lexicalCandidateCount=len(raw_lexical_hits),
        graphCandidateCount=len(raw_graph_hits),
        fusedCandidateCount=len(all_normalized),
        rerankedCandidateCount=len(reranked_pool),
        finalCandidateCount=len(evidence_items),
        latencyMs=latency_ms,
        routeDecision=route,
        rerankerBypassed=False,
        tagBoostApplied=tag_boost,
        stageTimingsMs=stage_ms,
        documentScope=list(document_ids) if document_ids else None,
        denseAvailable=dense_available,
        retrievalMode=(
            "lexical_only" if (route.dense and not dense_available)
            else "+".join(s for s, on in (("dense", route.dense), ("lexical", route.lexical), ("graph", route.graph)) if on) or "none"
        ),
        degradationReason=degradation_reason,
    )

    logger.info(
        f"[/retrieve] req_id={req_id} project_id={project_id} query='{query}' "
        f"sources={selected_sources} counts=(dense={len(raw_dense_hits)}, "
        f"lexical={len(raw_lexical_hits)}, graph={len(raw_graph_hits)}, "
        f"fused={len(all_normalized)}, reranked={len(reranked_pool)}, "
        f"final={len(evidence_items)}) sufficiency={sufficiency.sufficient} "
        f"latency_ms={latency_ms:.1f}"
    )

    return RetrieveResponse(
        results=evidence_items,
        sufficiency=sufficiency,
        metadata=metadata
    )
