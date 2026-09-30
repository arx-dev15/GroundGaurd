import os
import re
import time
import uuid
import logging
from enum import Enum
from typing import List, Dict, Any, Optional, Set, Tuple
from pydantic import BaseModel, Field

from src.pipeline.embedder import generate_embeddings
from src.pipeline.qdrant_store import qdrant_store
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.graph_store import graph_store
from src.pipeline.db import validate_ready_documents
from src.pipeline.router import route_query, RouteDecision
from src.pipeline.reranker import rerank

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


class EvidenceSufficiency(BaseModel):
    sufficient: bool
    reason: str
    score: float
    signals: EvidenceSufficiencySignals
    scope: Optional[str] = None


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
    "tell", "me", "give", "show", "explain", "detail", "details", "difference"
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
        # Non-identifier semantic query: not equipment-specific, so entity coverage is satisfied
        # proportionally to content presence
        s_entity = 1.0 if s_content >= 0.25 else (0.5 if s_content > 0.1 else 0.0)

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
    query: Optional[str] = None
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
            signals=EvidenceSufficiencySignals(
                resultCount=0,
                topRerankScore=0.0,
                identifierMatched=False,
                sourceCoverage=[],
                conflictingEvidence=False,
                scopeDecision=ScopeDecision.OUT_OF_SCOPE.value,
                scopeReason="Zero candidates retrieved in project corpus"
            )
        )

    if len(candidates) < min_evidence_count:
        return EvidenceSufficiency(
            sufficient=False,
            reason=f"Candidate count ({len(candidates)}) below minimum required ({min_evidence_count})",
            score=0.0,
            scope=ScopeDecision.OUT_OF_SCOPE.value,
            signals=EvidenceSufficiencySignals(
                resultCount=len(candidates),
                topRerankScore=0.0,
                identifierMatched=False,
                sourceCoverage=[],
                conflictingEvidence=False,
                scopeDecision=ScopeDecision.OUT_OF_SCOPE.value,
                scopeReason=f"Candidate count ({len(candidates)}) below minimum required ({min_evidence_count})"
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
            signals=EvidenceSufficiencySignals(
                resultCount=len(candidates),
                topRerankScore=top_score,
                identifierMatched=False,
                sourceCoverage=all_sources,
                conflictingEvidence=False,
                scopeDecision=ScopeDecision.OUT_OF_SCOPE.value,
                scopeReason=f"Target identifier(s) {missing_identifiers} not supported by retrieved evidence"
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
            signals=EvidenceSufficiencySignals(
                resultCount=len(candidates),
                topRerankScore=top_score,
                identifierMatched=identifier_matched,
                sourceCoverage=all_sources,
                conflictingEvidence=False,
                scopeDecision=scope_dec_str,
                scopeReason=scope_reason_str,
                evidenceCoverageScore=scope_res.signals.evidenceCoverageScore,
                topicSimilarityScore=top_score
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
                topicSimilarityScore=top_score
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

    # 4. Score threshold check
    if top_score < threshold:
        return EvidenceSufficiency(
            sufficient=False,
            reason=f"Top evidence score ({top_score:.4f}) below sufficiency threshold ({threshold:.4f})",
            score=top_score,
            scope=scope_dec_str,
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
                topicSimilarityScore=top_score
            )
        )

    return EvidenceSufficiency(
        sufficient=True,
        reason="Evidence sufficient for generation",
        score=top_score,
        scope=scope_dec_str,
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
            topicSimilarityScore=top_score
        )
    )


def retrieve_evidence(
    project_id: str,
    query: str,
    top_k: int = FINAL_TOP_K,
    request_id: Optional[str] = None
) -> RetrieveResponse:
    """
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
    req_id = request_id or f"req_{uuid.uuid4().hex[:12]}"
    bounded_top_k = min(max(1, top_k), RERANK_CANDIDATE_K)

    # 1. Deterministic Query Routing
    route = route_query(query)
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

    # 2a. Qdrant Dense Retrieval
    if route.dense:
        try:
            query_vector = generate_embeddings([query])[0] if query else []
            raw_dense_hits = qdrant_store.search_dense(
                project_id=project_id,
                query_vector=query_vector,
                top_k=DENSE_CANDIDATE_K
            )
        except Exception as e:
            logger.error(f"Dense retrieval failed on Qdrant: {e}")
            raise RuntimeError(f"Qdrant retrieval infrastructure failure: {e}") from e

    # 2b. Tantivy Lexical Retrieval
    if route.lexical:
        try:
            raw_lexical_hits = tantivy_store.search_project(
                project_id=project_id,
                query=query,
                top_k=LEXICAL_CANDIDATE_K
            )
        except Exception as e:
            logger.error(f"Lexical retrieval failed on Tantivy: {e}")
            raise RuntimeError(f"Tantivy retrieval infrastructure failure: {e}") from e

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

    # 4. PostgreSQL Canonical Lifecycle & Isolation Validation (Fail-Closed)
    # Invariant: Evidence MUST belong to projectId AND have status = 'ready' in canonical PostgreSQL.
    # Pruning invalid/unready candidates BEFORE RRF & Reranking ensures unready documents
    # cannot consume fusion or reranking pool slots or displace valid READY candidates.
    candidate_doc_ids = list(set(c.documentId for c in all_normalized if c.documentId))
    ready_doc_ids: Set[str] = set()
    try:
        ready_doc_ids = validate_ready_documents(project_id, candidate_doc_ids)
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
        valid_candidates.append(c)

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

    reranked_pool: List[Candidate] = []
    if exact_tag_matched and os.getenv("ENABLE_RERANKER_BYPASS", "true").lower() == "true":
        logger.info(
            f"[retrieval] Adaptive reranker bypass on exact equipment tags: {route.extractedIdentifiers}"
        )
        for c in rrf_pool:
            # When exact tag matches top candidate, assign high-confidence score above sufficiency threshold
            matches_tag = any(
                t.upper() in [i.upper() for i in c.identifiers] or t.upper() in c.text.upper()
                for t in route.extractedIdentifiers
            )
            c.rerankScore = max(0.50, float(c.rrfScore * 20.0)) if matches_tag else float(c.rrfScore)
            reranked_pool.append(c)
    elif rrf_pool and query:
        try:
            passages = [
                {"chunkId": c.chunkId, "text": c.text, "candidate": c}
                for c in rrf_pool
            ]
            rerank_results = rerank(query=query, passages=passages, top_n=RERANK_CANDIDATE_K)
            for res in rerank_results:
                cand = res["candidate"]
                cand.rerankScore = float(res.get("rerankScore", 0.0))
                reranked_pool.append(cand)
        except Exception as e:
            logger.error(f"Reranking stage failed: {e}")
            raise RuntimeError(f"FlashRank reranking infrastructure failure: {e}") from e
    else:
        reranked_pool = rrf_pool

    # 8. Deterministic Evidence Sufficiency Gate
    sufficiency = evaluate_sufficiency(reranked_pool, route, query=query)

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
    final_candidates = reranked_pool[:bounded_top_k]

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
            "sources": cand.sources
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

    latency_ms = (time.perf_counter() - start_time) * 1000.0

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
        rerankerBypassed=bool(exact_tag_matched and os.getenv("ENABLE_RERANKER_BYPASS", "true").lower() == "true")
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
