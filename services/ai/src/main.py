import os
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
import sys
import re
import uuid
import time
import logging
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), ".env"), override=True)

# Ensure services/ai directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List, Optional, Dict, Any, AsyncIterator, Tuple
import json
from fastapi import FastAPI, Header, Request, Response, File, UploadFile, Form, Query, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from src.pipeline.parser import parse_pdf
from src.pipeline.chunker import chunk_pages
from src.pipeline.embedder import generate_embeddings
from src.pipeline.db import validate_ready_documents, get_project_knowledge_summary, get_ready_documents_meta
from src.pipeline.intent_classifier import (
    classify_intent,
    generate_conversational_response,
    generate_product_help_response,
    generate_unsupported_query_response,
)
from src.pipeline.conversational import (
    generate_social_response,
    generate_product_help_response as generate_product_help_llm,
    FALLBACK_ABSTENTION,
    generate_clarification_response as generate_clarification_llm,
)
from src.pipeline.query_understanding import (
    understand_query,
    QueryPlan,
    build_telemetry,
    _make_fallback_plan,
    detect_user_challenge,
)
from src.pipeline.qdrant_store import qdrant_store
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.graph_store import graph_store
from src.pipeline.retrieval import (
    retrieve_evidence,
    RetrieveResponse,
    EvidenceItem,
    EvidenceSufficiency,
    RetrieveMetadata,
    EvidenceDisposition,
    FailureStage,
)
from src.pipeline.context import context_builder
from src.pipeline.prompts import build_grounded_user_prompt
from src.pipeline.llm import llm_runtime, LLMUnavailableError
from src.pipeline.claim_extractor import extract_and_validate_claims, ProvenanceValidationError

# Backwards compatibility alias
RetrieveResult = RetrieveResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("m2-ai-service")

app = FastAPI(title="GroundGuard M2 AI Service", version="0.3.0")

# Retrieval models (sentence-transformer embedder + FlashRank cross-encoder) are loaded once per worker
# in the background at startup. Previously they loaded lazily inside the first user request (~23 s
# embedder init measured on Windows/CPU). Requests arriving mid-warm-up wait on the same single load.
_model_warmup: Dict[str, Any] = {"state": "not_started", "error": None, "ms": None}


def _warm_retrieval_models() -> None:
    import time as _t
    started = _t.perf_counter()
    _model_warmup["state"] = "loading"
    try:
        from src.pipeline.embedder import get_model
        from src.pipeline.reranker import get_ranker
        get_model()
        get_ranker()
        _model_warmup["state"] = "ready"
    except Exception as e:  # readiness reports the failure; requests still fail closed on use
        _model_warmup["state"] = "failed"
        _model_warmup["error"] = str(e)
        logger.error(f"[startup] Retrieval model warm-up failed: {e}")
    _model_warmup["ms"] = int((_t.perf_counter() - started) * 1000)
    logger.info(f"[startup] Retrieval model warm-up {_model_warmup['state']} in {_model_warmup['ms']} ms")


@app.on_event("startup")
async def _start_model_warmup() -> None:
    if os.getenv("MODEL_WARMUP", "true").lower() != "true":
        _model_warmup["state"] = "disabled"
        return
    import threading as _threading
    _threading.Thread(target=_warm_retrieval_models, name="model-warmup", daemon=True).start()

# Models for contracts
class IndexStatus(BaseModel):
    qdrant: bool = False
    tantivy: bool = False
    networkx: bool = False
    graphEdgesCount: int = 0

class IngestResponse(BaseModel):
    documentId: str
    status: str = "completed"
    chunksCreated: int = 0
    errorMessage: Optional[str] = None
    indexStatus: Optional[IndexStatus] = None
    chunks: Optional[List[Dict[str, Any]]] = None

def _require_non_blank(v: str) -> str:
    if not isinstance(v, str) or not v.strip():
        raise ValueError("query must be a non-empty string")
    return v


class RetrieveRequest(BaseModel):
    projectId: str
    query: str
    topK: Optional[int] = Field(5, ge=1, le=50)

    _query_non_blank = field_validator("query")(classmethod(lambda cls, v: _require_non_blank(v)))

class DeleteDocumentResult(BaseModel):
    success: bool
    documentId: str
    projectId: str
    error: Optional[str] = None

class GenerateRequest(BaseModel):
    requestId: Optional[str] = None
    generationId: Optional[str] = None
    projectId: str
    query: str
    conversationId: Optional[str] = None
    options: Optional[Dict[str, Any]] = None
    conversationContext: Optional[List[Dict[str, Any]]] = None

    _query_non_blank = field_validator("query")(classmethod(lambda cls, v: _require_non_blank(v)))

class ClaimItem(BaseModel):
    claimId: str
    text: str
    status: str = "pending"
    ordinal: Optional[int] = 0
    sourceText: Optional[str] = None
    verification: Optional[Dict[str, Any]] = None
    evidence: List[EvidenceItem] = []

class GenerateResult(BaseModel):
    requestId: str
    generationId: str
    status: str = "completed"
    answer: str
    evidence: List[EvidenceItem] = []
    sufficiency: Optional[EvidenceSufficiency] = None
    modelVersion: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    claims: List[ClaimItem] = []
    error: Optional[Dict[str, Any]] = None

class RecoverRequest(BaseModel):
    requestId: Optional[str] = None
    projectId: str
    claimId: str
    claim: str
    failureReason: str
    existingEvidence: List[Dict[str, Any]] = []
    attempt: int = 1
    useLangGraph: Optional[bool] = True
    # Remaining M3 recovery budget (ms). Bounds this request's provider HTTP wait; unset = default timeouts.
    deadlineMs: Optional[int] = Field(None, ge=1, le=120000)

class RecoverResponse(BaseModel):
    requestId: str
    claimId: str
    action: str  # "keep" | "revise" | "abstain"
    candidateClaim: Optional[str] = None
    recoveryEvidence: List[EvidenceItem] = []
    modelVersion: str
    reason: Optional[str] = None
    # Additive: terminal failure category so callers do not retry a provider outage as missing evidence.
    failureType: Optional[str] = None

def classify_premise_outcome(answer: str, is_proposition: bool, is_abstained: bool) -> str:
    """
    Classifies proposition evaluation outcome against project evidence:
    SUPPORTED | CONTRADICTED | PARTIALLY_SUPPORTED | INSUFFICIENT | NOT_APPLICABLE
    """
    if not is_proposition:
        return "NOT_APPLICABLE"
    if is_abstained:
        return EvidenceDisposition.INSUFFICIENT.value
    ans_lower = answer.lower().strip()
    
    # Check for mixed / partial support
    has_confirm = bool(re.search(r'\b(?:yes\b|confirms?\b|supports?\b)', ans_lower))
    has_correct = bool(re.search(r'\b(?:no\b|not [a-zA-Z0-9_\-]+|instead of|rather than|but specifies that|but states that)\b', ans_lower))
    
    if (has_confirm and has_correct) or "partially" in ans_lower or ("confirms that" in ans_lower and "specifies that" in ans_lower):
        return EvidenceDisposition.PARTIALLY_SUPPORTED.value
    if ans_lower.startswith("no") or ("the project documentation states that" in ans_lower and ("not " in ans_lower or "instead" in ans_lower)):
        return EvidenceDisposition.CONTRADICTED.value
    if ans_lower.startswith("yes") or "confirms that" in ans_lower or "the project documentation states that" in ans_lower:
        return EvidenceDisposition.SUPPORTED.value
    if "does not specify" in ans_lower or "not mentioned" in ans_lower or "insufficient" in ans_lower:
        return EvidenceDisposition.INSUFFICIENT.value
    return EvidenceDisposition.SUPPORTED.value if has_confirm else (EvidenceDisposition.CONTRADICTED.value if has_correct else EvidenceDisposition.SUPPORTED.value)

def determine_evidence_disposition(
    answer: str,
    is_abstention: bool,
    is_conflict: bool,
    sufficiency: Optional[EvidenceSufficiency] = None,
    is_proposition: bool = False
) -> str:
    """
    Unified Answerability Decision Contract (Section 1, 2):
    Maps final generation output and sufficiency state to the canonical 5-state disposition:
    SUPPORTED | PARTIAL | CONTRADICTED | CONFLICT | INSUFFICIENT
    """
    if is_conflict:
        return EvidenceDisposition.CONFLICT.value
    if is_abstention:
        return EvidenceDisposition.INSUFFICIENT.value
    if is_proposition:
        premise_disp = classify_premise_outcome(answer, is_proposition=True, is_abstained=False)
        if premise_disp in (EvidenceDisposition.CONTRADICTED.value, EvidenceDisposition.PARTIALLY_SUPPORTED.value):
            return premise_disp

    ans_lower = answer.lower()
    # Check for qualified partial support (e.g., states X but does not establish Y)
    partial_indicators = [
        "does not explain", "does not establish", "does not specify",
        "does not provide", "not mentioned", "partially", "only explains",
        "only identifies", "only specifies", "does not contain",
        "does not state", "not specified", "not state", "not named"
    ]
    if any(p in ans_lower for p in partial_indicators) and (
        "[" in answer or any(kw in ans_lower for kw in ("identifies", "states", "specifies", "confirms", "indicates", "instructs", "shows", "are", "is", "include", "includes", "stating"))
    ):
        return EvidenceDisposition.PARTIAL.value

    if sufficiency and getattr(sufficiency, "disposition", None):
        return sufficiency.disposition

    return EvidenceDisposition.SUPPORTED.value


def format_display_title(filename_or_title: str) -> str:
    """
    Derives a clean, readable display title from a raw filename or title for user-facing citations.
    e.g. 'campus_monitor__an_ai_driven_real_time_smart_campus_environment_monitoring_system_IEEE (3) (1).pdf' -> 'Campus Monitor'
    e.g. 'pump_p101a_specs.pdf' -> 'Pump P-101A Specs'
    e.g. 'dht11_datasheet.pdf' -> 'DHT11 Datasheet'
    """
    if not filename_or_title:
        return "Document"
    name = str(filename_or_title).strip()
    name = re.sub(r'\.[a-zA-Z0-9]+$', '', name)
    name = re.sub(r'\s*\(\d+\)\s*', ' ', name)
    name = re.sub(r'[\-_]+copy\b', '', name, flags=re.I)
    if '__' in name:
        name = name.split('__')[0]
    
    # Protect equipment tags like P-101A, V-204
    name = re.sub(r'([A-Za-z])-([0-9])', r'\1_HYP_\2', name)
    name = re.sub(r'[\-_]+', ' ', name)
    name = name.replace('_HYP_', '-')
    name = name.strip()
    
    words = name.split()
    capitalized = []
    for w in words:
        if w.isupper() or any(c.isdigit() for c in w):
            capitalized.append(w)
        else:
            capitalized.append(w.capitalize())
    clean_name = " ".join(capitalized)
    if len(clean_name) > 35:
        clean_name = clean_name[:32].strip() + "..."
    return clean_name or "Document"


def is_meta_turn(content: str) -> bool:
    if not content:
        return True
    s = content.strip().lower()
    meta_patterns = [
        r'^(?:(?:please\s+)?(?:answer|respond|reply|tell\s+me)|hello\??|hey\??|hi\??|come\s+on\??|bro+|dude|waiting\.*)\b',
        r'^(?:answer\s+bro+|hello\?+|respond|come\s+on|pls\s+answer|plz\s+answer|just\s+answer)$',
    ]
    if len(s) < 30 and any(re.search(pat, s) for pat in meta_patterns):
        return True
    return False

def sanitize_user_facing_answer(
    raw_answer: str,
    evidence: Optional[List[EvidenceItem]] = None
) -> str:
    """
    Cleans user-facing answer text:
    1. Removes raw internal identifiers (doc_..., chunk_..., UUIDs) and replaces with clean human document names.
    2. Formats user-facing citations with clean display titles (e.g. [Campus Monitor, p. 5] instead of raw long filenames).
    3. Strips metadata dumps (Document Name:, Document ID:, Chunk ID:, etc.).
    4. Removes conversational boilerplate and repetitive preambles ('Based on the project documentation...').
    5. Deduplicates consecutive citation tags.
    """
    if not raw_answer or not raw_answer.strip():
        return ""

    text = raw_answer.strip()

    # Build lookup map from evidence for known document IDs to human names
    doc_id_to_name: Dict[str, str] = {}
    if evidence:
        for item in evidence:
            doc_id = getattr(item, "documentId", None) or getattr(item, "document_id", None)
            meta = getattr(item, "metadata", {}) or {}
            fname = meta.get("filename") or meta.get("title") or getattr(item, "document_name", None)
            if doc_id:
                if fname:
                    doc_id_to_name[doc_id] = format_display_title(fname)
                elif doc_id.startswith("doc_"):
                    clean_s = doc_id[4:].replace("_", " ").strip()
                    if not re.fullmatch(r"[0-9a-fA-F-]+", clean_s):
                        doc_id_to_name[doc_id] = clean_s.title()

    # Replace known doc_ids in text with human names
    for did, hname in doc_id_to_name.items():
        if did in text:
            text = text.replace(did, hname)

    # General pattern for any remaining doc_ slugs, e.g. [doc_auv_spec, p. 4] -> [AUV Spec, p. 4]
    def _clean_doc_match(m):
        raw_slug = m.group(1)
        if re.fullmatch(r"[0-9a-fA-F-]+", raw_slug):
            return "Project Document"
        clean = raw_slug.replace("_", " ").strip().title()
        return format_display_title(clean)

    text = re.sub(r'\bdoc_([a-zA-Z0-9_\-]+)\b', _clean_doc_match, text)

    # Remove chunk_ identifiers
    text = re.sub(r'\bchunk_[a-zA-Z0-9_\-]+\b', '', text)

    # Remove metadata dump lines (e.g. Document ID: ..., Chunk ID: ...)
    lines = text.split("\n")
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        if re.match(r'^(?:Document\s*ID|Chunk\s*ID|Supporting\s*Excerpt|Internal\s*ID)\s*:\s*', stripped, re.IGNORECASE):
            continue
        cleaned_lines.append(line)
    text = "\n".join(cleaned_lines)

    # Strip robotic boilerplate prefixes at start of answer (Section 7)
    text = re.sub(
        r'^(?:Based on the (?:provided |retrieved |available |current )?(?:project )?(?:documentation|evidence),\s*(?:the answer (?:to your question )?is that\s*)?|According to the (?:provided |retrieved |available |current )?(?:project )?(?:documentation|evidence),\s*|(?:The (?:provided |available |retrieved |current )?(?:project )?(?:documentation|evidence) states that\s*))',
        '',
        text,
        flags=re.IGNORECASE
    )
    if text and text[0].islower():
        text = text[0].upper() + text[1:]

    # Strip trailing conversational filler
    text = re.sub(
        r'\s*(?:Please let me know if you (?:have any other questions|need anything else|would like to explore).*|I hope this (?:helps|information is helpful)\.?)$',
        '',
        text,
        flags=re.IGNORECASE
    ).strip()

    # Format user-facing citations into clean display labels (Section 6)
    def _clean_citation(m):
        content = m.group(1).strip()
        p_match = re.search(r',\s*pp?\.?\s*(\d+)(?:\s*([-–—])\s*(\d+))?\s*$', content, re.I)
        if p_match:
            start, dash, end = p_match.group(1), p_match.group(2), p_match.group(3)
            if end and end != start:
                page_suffix = f", pp. {start}{'–' if dash in ('–', '—') else '-'}{end}"
            else:
                page_suffix = f", p. {start}"  # single page is always 'p.'
            raw_doc_part = content[:p_match.start()].strip()
        else:
            page_suffix, raw_doc_part = "", content
        # Keep the document name exactly as cited (it is the evidence filename/title); only internal ids
        # were rewritten above. Non-source brackets (e.g. [1]) are left untouched.
        return f"[{raw_doc_part}{page_suffix}]"

    text = re.sub(r'\[([^\]]+)\]', _clean_citation, text)

    # Deduplicate consecutive identical citations: [Doc, p. 4] [Doc, p. 4]
    text = re.sub(r'(\[[^\]]+\])(?:\s*\1)+', r'\1', text)

    # Safety guard: if raw answer contained substantial prose (>40 chars) but sanitization lost >80% of content,
    # preserve raw answer to prevent destructive truncation (Section 9).
    if len(raw_answer.strip()) > 40 and len(text) < len(raw_answer.strip()) * 0.2:
        logger.warning(
            f"[sanitize_user_facing_answer] Prevented destructive content loss: "
            f"raw_len={len(raw_answer.strip())} sanitized_len={len(text)}"
        )
        return raw_answer.strip()

    return text


def filter_relevant_evidence(
    included_items: List[EvidenceItem],
    claims: List[ClaimItem],
    is_abstention: bool = False
) -> List[EvidenceItem]:
    """Filters evidence items to only those that materially support the answer."""
    if is_abstention:
        return []
    if not claims:
        return included_items
    
    referenced_cids = set()
    for c in claims:
        for ev in getattr(c, "evidence", []):
            cid = getattr(ev, "chunkId", None) or getattr(ev, "chunk_id", None)
            if cid:
                referenced_cids.add(cid)
    
    if referenced_cids:
        filtered = [item for item in included_items if item.chunkId in referenced_cids]
        return filtered if filtered else included_items
    return included_items

def _fetch_successor_chunk(project_id: str, document_id: str, chunk_index: int) -> Optional[Dict[str, Any]]:
    try:
        from qdrant_client.http.models import Filter, FieldCondition, MatchValue
        res = qdrant_store.client.scroll(
            collection_name="groundguard_chunks",
            scroll_filter=Filter(
                must=[
                    FieldCondition(key="projectId", match=MatchValue(value=project_id)),
                    FieldCondition(key="documentId", match=MatchValue(value=document_id)),
                    FieldCondition(key="chunkIndex", match=MatchValue(value=chunk_index)),
                ]
            ),
            limit=1
        )
        if res and res[0]:
            return res[0][0].payload
    except Exception as e:
        logger.warning("[/generate successor error] %s", e)
    return None

def _apply_bounded_context_expansion_and_ordering(retrieval_res: Any, project_id: str, plan: Any) -> None:
    """
    Bounded Local Context Expansion & Procedural Reading-Order Preservation (Sections 12, 13).
    Expands high-confidence procedure, setup, section, or list chunks with their immediate successor chunk.
    Preserves bounded token context (max 2 successor chunks).
    """
    if not retrieval_res or not retrieval_res.results:
        return

    target_norm = (plan.target or "").strip().lower()
    is_proc_or_section = plan.retrieval_strategy in ("section", "procedural") or plan.operation in ("procedure", "explain")
    expanded_count = 0
    cands_snapshot = list(retrieval_res.results[:3])
    for matched_ev in cands_snapshot:
        if expanded_count >= 2:
            break
        doc_id = matched_ev.documentId
        c_idx = matched_ev.metadata.get("chunkIndex") if matched_ev.metadata else None
        if not doc_id or c_idx is None:
            continue

        is_high_conf = bool((matched_ev.score and matched_ev.score >= 0.35) or (matched_ev.rerankScore and matched_ev.rerankScore >= 0.35))
        is_target_hit = bool(target_norm and len(target_norm) >= 3 and (target_norm in (matched_ev.heading or "").lower() or target_norm in (matched_ev.text or "").lower()))

        if is_high_conf or is_proc_or_section or is_target_hit:
            succ_payload = _fetch_successor_chunk(project_id, doc_id, c_idx + 1)
            if succ_payload:
                succ_chunk_id = succ_payload.get("chunkId")
                if not any(e.chunkId == succ_chunk_id for e in retrieval_res.results):
                    succ_ev = EvidenceItem(
                        evidenceId=f"ev_{uuid.uuid4().hex[:8]}",
                        chunkId=succ_chunk_id,
                        documentId=doc_id,
                        text=succ_payload.get("text", ""),
                        pageNumber=succ_payload.get("pageNumber", matched_ev.pageNumber),
                        section=succ_payload.get("section", matched_ev.section),
                        heading=succ_payload.get("heading"),
                        identifiers=succ_payload.get("identifierKeys", []),
                        sources=["context_neighborhood"],
                        rrfScore=matched_ev.rrfScore,
                        rerankScore=matched_ev.rerankScore,
                        score=matched_ev.score,
                        metadata={
                            "chunkIndex": succ_payload.get("chunkIndex", c_idx + 1),
                            **(succ_payload.get("metadata") or {})
                        }
                    )
                    idx = retrieval_res.results.index(matched_ev)
                    retrieval_res.results.insert(idx + 1, succ_ev)
                    expanded_count += 1
                    logger.info("[context expansion] Added successor chunkIndex=%d for doc=%s", c_idx + 1, doc_id)

    # Section heading sufficiency confirmation
    if retrieval_res.results and target_norm and (plan.retrieval_strategy == "section" or plan.target):
        heading_matched = any(target_norm in (ev.heading or "").lower() or (len(target_norm) >= 4 and target_norm in ev.text.lower()) for ev in retrieval_res.results)
        if (heading_matched and retrieval_res.sufficiency and not retrieval_res.sufficiency.sufficient
                and not _answerability_rejected(retrieval_res.sufficiency)):
            retrieval_res.sufficiency.sufficient = True
            retrieval_res.sufficiency.reason = f"Section topic '{plan.target}' matched in document evidence"
            retrieval_res.sufficiency.score = max(retrieval_res.sufficiency.score or 0.0, 0.85)

    # Procedural Reading-Order Preservation
    if plan.retrieval_strategy in ("procedural", "section") or plan.operation == "procedure":
        retrieval_res.results.sort(
            key=lambda ev: (
                ev.documentId or "",
                ev.pageNumber or 1,
                (ev.metadata.get("chunkIndex", 0) if ev.metadata else 0)
            )
        )


# ---------------------------------------------------------------------------
# Shared retrieval / outcome helpers (used identically by /generate and /generate/stream so both
# endpoints always reach the same trust state for the same question).
# ---------------------------------------------------------------------------

COVERAGE_MAX_CHUNKS = int(os.getenv("COVERAGE_MAX_CHUNKS", "10"))
COVERAGE_SCROLL_LIMIT = int(os.getenv("COVERAGE_SCROLL_LIMIT", "5000"))
_ANAPHORIC_START = re.compile(r"^\s*(?:it|its|this|these|those|they|their|he|she|his|her|such|the\s+latter|the\s+former|the\s+(?:unit|device|sensor|pump|system|controller|meter|module|valve|equipment|component|machine|motor))\b", re.I)


SOURCE_PREVIEW_MAX = 5
SOURCE_PREVIEW_CHARS = 220


def _source_previews(items: List[Any], project_id: str) -> List[Dict[str, Any]]:
    """
    Bounded early preview of the passages ALREADY retrieved for this request (no extra retrieval/LLM call).
    Re-validated against PostgreSQL: only READY documents of THIS project are exposed. These are retrieval
    candidates, not verified citations (status="retrieved_candidate").
    """
    items = [i for i in (items or []) if getattr(i, "chunkId", None) and getattr(i, "documentId", None)]
    if not items:
        return []
    try:
        ready_ids, names = get_ready_documents_meta(project_id, list({i.documentId for i in items}))
    except Exception as e:
        logger.warning(f"[source preview] skipped (lifecycle check failed): {e}")
        return []
    out: List[Dict[str, Any]] = []
    for i in items:
        if i.documentId not in ready_ids:
            continue
        fn = names.get(i.documentId) or (i.metadata or {}).get("filename")
        if not fn:
            continue
        text = " ".join((i.text or "").split())
        out.append({
            "chunkId": i.chunkId,
            "documentId": i.documentId,
            "documentName": format_display_title(fn),
            "filename": fn,
            "pageNumber": i.pageNumber,
            "excerpt": text[:SOURCE_PREVIEW_CHARS] + ("…" if len(text) > SOURCE_PREVIEW_CHARS else ""),
            "status": "retrieved_candidate",
        })
        if len(out) >= SOURCE_PREVIEW_MAX:
            break
    return out


def _explicit_document_scope(plan: Any) -> Optional[List[str]]:
    """Hard document filter only when the user explicitly named the document (never on fuzzy matches)."""
    if getattr(plan, "document_scope_explicit", False) and getattr(plan, "resolved_document_id", None):
        return [plan.resolved_document_id]
    return None


def _build_document_coverage(project_id: str, doc_id: str) -> Optional[Tuple[List[EvidenceItem], EvidenceSufficiency, Dict[str, Any]]]:
    """
    Representative, reading-ordered evidence for a whole-document overview.
    Small documents are passed in full. Large documents (e.g. 562 chunks) are represented by structural
    chunks (table of contents / headings near the start) plus an evenly stratified sample across the whole
    document -- and are explicitly reported as a SAMPLE (coverageComplete=False, disposition PARTIAL),
    never as complete evidence. Payload-only scroll (no vectors); bounded LLM context.
    """
    from qdrant_client.http.models import Filter, FieldCondition, MatchValue
    from src.pipeline.retrieval import EvidenceSufficiency, EvidenceSufficiencySignals
    from src.pipeline.chunker import is_distractor_content

    scroll_filter = Filter(must=[
        FieldCondition(key="projectId", match=MatchValue(value=project_id)),
        FieldCondition(key="documentId", match=MatchValue(value=doc_id)),
    ])
    points, offset = [], None
    while len(points) < COVERAGE_SCROLL_LIMIT:
        batch, offset = qdrant_store.client.scroll(
            collection_name="groundguard_chunks", scroll_filter=scroll_filter,
            limit=500, offset=offset, with_payload=True, with_vectors=False,
        )
        points.extend(batch)
        if offset is None:
            break
    if not points:
        return None
    points.sort(key=lambda p: ((p.payload or {}).get("chunkIndex", 0), (p.payload or {}).get("pageNumber", 1)))
    total = len(points)

    if total <= COVERAGE_MAX_CHUNKS:
        selected = list(range(total))
        method = "complete"
    else:
        head_zone = max(3, total // 10)
        structural = [i for i in range(head_zone) if is_distractor_content((points[i].payload or {}).get("text", ""))][:2]
        remaining = COVERAGE_MAX_CHUNKS - len(structural)
        stride = (total - 1) / max(1, remaining - 1)
        stratified = [int(round(k * stride)) for k in range(remaining)]
        selected = sorted(set(structural + stratified))
        method = "structural+stratified_sample"

    items: List[EvidenceItem] = []
    for i in selected:
        pd = points[i].payload or {}
        items.append(EvidenceItem(
            evidenceId=f"ev_{uuid.uuid4().hex[:8]}",
            chunkId=pd.get("chunkId", ""),
            documentId=pd.get("documentId"),
            text=pd.get("text", ""),
            pageNumber=pd.get("pageNumber", 1),
            section=pd.get("section"),
            heading=pd.get("heading"),
            identifiers=pd.get("identifierKeys", []),
            sources=["document_coverage"],
            rrfScore=None,
            rerankScore=None,
            score=None,
            metadata={"chunkIndex": pd.get("chunkIndex", 0), **(pd.get("metadata") or {})},
        ))
    complete = len(selected) >= total
    coverage_meta = {
        "documentId": doc_id,
        "documentChunkCount": total,
        "sampledChunkCount": len(selected),
        "coverageComplete": complete,
        "coverageMethod": method,
    }
    disposition = EvidenceDisposition.SUPPORTED.value if complete else EvidenceDisposition.PARTIAL.value
    reason = (
        "Document coverage: all chunks of the document included"
        if complete else
        f"Document coverage: representative sample of {len(selected)} of {total} chunks (not exhaustive)"
    )
    suff = EvidenceSufficiency(
        sufficient=True,
        reason=reason,
        score=1.0 if complete else round(len(selected) / total, 4),
        disposition=disposition,
        failureStage=FailureStage.NONE.value,
        signals=EvidenceSufficiencySignals(
            resultCount=len(items), topRerankScore=0.0, identifierMatched=False,
            sourceCoverage=[doc_id], disposition=disposition, eligibleEvidenceCount=len(items),
        ),
    )
    return items, suff, coverage_meta


def _coverage_scope_note(coverage_meta: Optional[Dict[str, Any]], filename: Optional[str]) -> Optional[str]:
    if not coverage_meta or coverage_meta.get("coverageComplete"):
        return None
    return (
        f"The evidence below is a representative sample of {coverage_meta['sampledChunkCount']} of "
        f"{coverage_meta['documentChunkCount']} sections of {filename or 'the document'} (table of contents / "
        f"structural sections plus sections spread evenly across the document). Describe the document's topics "
        f"from these excerpts, say that the overview is based on sampled sections, and do not claim it is exhaustive."
    )


def _execute_plan_retrieval(
    payload: Any, plan: Any, proj_context: Any, effective_query: str, top_k: int,
    req_id: str, is_challenge_retry: bool,
) -> Tuple[Any, Optional[Dict[str, Any]]]:
    """Strategies A (coverage), B (broad multi-query), C (focused) and F (parameter grounding)."""
    search_queries = plan.search_queries if plan.search_queries else [plan.standalone_query or payload.query]
    retrieval_mode = plan.retrieval_mode
    doc_scope = _explicit_document_scope(plan)
    retrieval_res = None
    coverage_meta = None

    # Strategy A: Document Coverage (overview / contents / summary)
    if plan.retrieval_strategy == "coverage":
        target_doc_id = plan.resolved_document_id
        if not target_doc_id and proj_context:
            ready_docs_list = proj_context.get("readyDocs") or []
            if len(ready_docs_list) == 1:
                target_doc_id = ready_docs_list[0].get("id")
            elif plan.resolved_document_name:
                for d in ready_docs_list:
                    if d.get("filename", "").lower() == plan.resolved_document_name.lower():
                        target_doc_id = d.get("id")
                        break
        if target_doc_id:
            try:
                # The coverage document must be READY in THIS project (fail-closed isolation check).
                ready_ids, _ = get_ready_documents_meta(payload.projectId, [target_doc_id])
                if target_doc_id in ready_ids:
                    cov = _build_document_coverage(payload.projectId, target_doc_id)
                    if cov:
                        items, cov_suff, coverage_meta = cov
                        retrieval_res = type("_CoverageResult", (), {"results": items, "sufficiency": cov_suff})()
                        logger.info("[/generate coverage] doc=%s %s", target_doc_id, coverage_meta)
            except Exception as cov_err:
                logger.warning("[/generate coverage error] %s -- falling back to standard retrieval", cov_err)

    # Strategy B: Broad / Comparative / Cross-Document Multi-Query
    if retrieval_res is None and retrieval_mode in ("broad", "comparative", "cross_document") and len(search_queries) > 1:
        all_results = []
        last_sufficiency = None
        for sq in search_queries:
            try:
                sq_res = retrieve_evidence(
                    project_id=payload.projectId, query=sq, top_k=top_k,
                    search_queries=plan.search_queries, lexical_anchors=plan.lexical_anchors,
                    question_slot=plan.question_slot, request_id=req_id, document_ids=doc_scope,
                    answerability_query=effective_query,
                )
                all_results.append(sq_res.results)
                last_sufficiency = sq_res.sufficiency
            except Exception as sq_err:
                logger.warning("[/generate broad sq error] sq='%s': %s", sq[:60], sq_err)

        seen, merged_items = set(), []
        for items in all_results:
            for ev in items:
                if ev.chunkId not in seen:
                    seen.add(ev.chunkId)
                    merged_items.append(ev)
        from src.pipeline.retrieval import EvidenceSufficiency, EvidenceSufficiencySignals, SUFFICIENCY_THRESHOLD
        if merged_items:
            top_score = max((ev.rerankScore or ev.score or 0.0) for ev in merged_items)
            broad_sufficient = top_score >= SUFFICIENCY_THRESHOLD
            broad_suf = EvidenceSufficiency(
                sufficient=broad_sufficient,
                reason="Broad multi-query evidence sufficient" if broad_sufficient else "Broad multi-query evidence insufficient",
                score=top_score,
                signals=EvidenceSufficiencySignals(
                    resultCount=len(merged_items), topRerankScore=top_score, identifierMatched=False,
                    sourceCoverage=list({ev.documentId for ev in merged_items if ev.documentId}),
                ),
            )
            retrieval_res = type("_BroadResult", (), {"results": merged_items, "sufficiency": broad_suf})()
        elif last_sufficiency:
            retrieval_res = type("_BroadResult", (), {"results": [], "sufficiency": last_sufficiency})()
        else:
            retrieval_res = type("_BroadResult", (), {"results": [], "sufficiency": EvidenceSufficiency(
                sufficient=False, reason="No evidence retrieved", score=0.0,
                signals=EvidenceSufficiencySignals(resultCount=0, topRerankScore=0.0, identifierMatched=False, sourceCoverage=[]),
            )})()

    # Strategy C: Focused / Section Retrieval
    if retrieval_res is None:
        focused_q = plan.standalone_query or effective_query or (plan.search_queries[0] if plan.search_queries else "")
        retrieval_res = retrieve_evidence(
            project_id=payload.projectId, query=focused_q, top_k=top_k, request_id=req_id,
            search_queries=plan.search_queries, lexical_anchors=plan.lexical_anchors,
            question_slot=plan.question_slot, facet_set=getattr(plan, "facets", None),
            is_challenge_retry=is_challenge_retry, document_ids=doc_scope,
            answerability_query=effective_query,
        )

    # Bounded Local Context Expansion & Procedural Order Preservation (not for sampled coverage)
    if coverage_meta is None:
        _apply_bounded_context_expansion_and_ordering(retrieval_res, payload.projectId, plan)

    # Strategy F: Technical Parameter Grounding (Section 29, 30) -- may rescue a relevance rejection,
    # but NEVER overrides an answerability rejection (requested attribute absent from the evidence).
    if retrieval_res and retrieval_res.results and plan.operation in ("lookup", "extract") and coverage_meta is None:
        top_ev = retrieval_res.results[0]
        suff = retrieval_res.sufficiency
        if suff and not suff.sufficient and not _answerability_rejected(suff):
            target_norm = (plan.target or "").strip().lower()
            if target_norm and len(target_norm) >= 3 and target_norm in top_ev.text.lower():
                if top_ev.rerankScore and top_ev.rerankScore >= 0.15:
                    suff.sufficient = True
                    suff.reason = f"Technical parameter '{plan.target}' matched in eligible document evidence"
                    suff.score = max(suff.score or 0.0, 0.75)
                    suff.disposition = EvidenceDisposition.SUPPORTED.value
                    suff.failureStage = FailureStage.NONE.value
                    logger.info("[/generate lookup] Technical parameter match validated (score=0.75)")

    return retrieval_res, coverage_meta


def _answerability_rejected(suff: Any) -> bool:
    if not suff:
        return False
    if getattr(suff, "failureStage", None) == FailureStage.ANSWERABILITY_GATE_REJECTION.value:
        return True
    sig = getattr(suff, "signals", None)
    return bool(sig is not None and getattr(sig, "attributeCovered", None) is False)


def _attach_source_context(items: List[EvidenceItem], project_id: str) -> None:
    """
    Legitimate source context for NLI verification of subject-less chunks: the document title and
    heading are always available as metadata; when a chunk OPENS with an anaphoric subject ("It operates
    at...", "The sensor's range..."), the immediately preceding sentence of the SAME document is attached
    as `precedingText`. Nothing is invented: only stored document text/metadata is used.
    """
    lookups = 0
    for item in items:
        meta = item.metadata if item.metadata is not None else {}
        item.metadata = meta
        if item.heading and not meta.get("heading"):
            meta["heading"] = item.heading
        if lookups >= 8 or not _ANAPHORIC_START.search(item.text or ""):
            continue
        c_idx = meta.get("chunkIndex")
        if not item.documentId or c_idx is None or int(c_idx) <= 0:
            continue
        lookups += 1
        prev = _fetch_successor_chunk(project_id, item.documentId, int(c_idx) - 1)
        if prev and prev.get("text"):
            sents = [s for s in re.split(r"(?<=[.!?])\s+", " ".join(prev["text"].split())) if s.strip()]
            if sents:
                meta["precedingText"] = sents[-1][:400]


async def _finalize_grounded_answer(
    raw_answer: str,
    included_items: List[EvidenceItem],
    retrieval_res: Any,
    plan: Any,
    is_conflict: bool,
    coverage_meta: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Maps the generator's STRUCTURED outcome (+ claim extraction result) to the final trust state.
      INSUFFICIENT -> abstention: INSUFFICIENT, no citations, no evidence, no claims.
      claim extraction failed / no verifiable claims -> UNVERIFIED (never SUPPORTED with zero claims).
      PARTIAL outcome or sampled document coverage -> PARTIAL.
    """
    from src.pipeline.answerability import parse_generation_outcome, strip_citations, OUTCOME_INSUFFICIENT, OUTCOME_PARTIAL

    answer_text, outcome, outcome_source = parse_generation_outcome(raw_answer)
    premise_classification = classify_premise_outcome(answer_text, plan.is_proposition, outcome == OUTCOME_INSUFFICIENT)

    if outcome == OUTCOME_INSUFFICIENT:
        cleaned = sanitize_user_facing_answer(strip_citations(answer_text), [])
        return {
            "answer": cleaned,
            "claims": [],
            "evidence": [],
            "abstention": True,
            "disposition": EvidenceDisposition.INSUFFICIENT.value,
            "failureStage": FailureStage.GENERATION_ABSTENTION.value,
            "generationOutcome": outcome,
            "generationOutcomeSource": outcome_source,
            "verificationStatus": "abstained",
            "claimExtraction": {"status": "skipped", "reason": "generation_abstained"},
            "premiseClassification": premise_classification,
            "extractionLatencyMs": 0,
        }

    claims: List[ClaimItem] = []
    extraction_started = time.perf_counter()
    try:
        extraction_stats: Dict[str, Any] = {}
        raw_claims = await extract_and_validate_claims(answer=answer_text, evidence=included_items, stats=extraction_stats)
        claims = [ClaimItem(**c) for c in raw_claims]
        claim_meta: Dict[str, Any] = {"status": "completed", "claimCount": len(claims),
                                      "method": extraction_stats.get("method", "llm")}
    except Exception as claim_err:
        logger.error(f"[claim extraction error] {claim_err}")
        claim_meta = {"status": "failed", "error": str(claim_err)}

    cleaned = sanitize_user_facing_answer(answer_text, included_items)
    supporting = filter_relevant_evidence(included_items, claims, is_abstention=False)

    if claim_meta["status"] == "failed":
        disposition, verification_status = EvidenceDisposition.UNVERIFIED.value, "claim_extraction_failed"
    elif not claims:
        disposition, verification_status = EvidenceDisposition.UNVERIFIED.value, "no_verifiable_claims"
    else:
        verification_status = "claims_pending_verification"
        suff = retrieval_res.sufficiency
        if is_conflict:
            disposition = EvidenceDisposition.CONFLICT.value
        elif plan.is_proposition and premise_classification in (
            EvidenceDisposition.CONTRADICTED.value, EvidenceDisposition.PARTIALLY_SUPPORTED.value
        ):
            disposition = premise_classification
        elif outcome == OUTCOME_PARTIAL or (coverage_meta and not coverage_meta.get("coverageComplete")):
            disposition = EvidenceDisposition.PARTIAL.value
        elif suff and getattr(suff, "disposition", None) in (EvidenceDisposition.SUPPORTED.value, EvidenceDisposition.PARTIAL.value):
            disposition = suff.disposition
        else:
            disposition = EvidenceDisposition.SUPPORTED.value

    return {
        "answer": cleaned,
        "claims": claims,
        "evidence": supporting,
        "abstention": False,
        "disposition": disposition,
        "failureStage": FailureStage.NONE.value,
        "generationOutcome": outcome,
        "generationOutcomeSource": outcome_source,
        "verificationStatus": verification_status,
        "claimExtraction": claim_meta,
        "premiseClassification": premise_classification,
        "extractionLatencyMs": int((time.perf_counter() - extraction_started) * 1000),
    }


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", f"req_{uuid.uuid4().hex[:12]}")
    request.state.request_id = request_id
    response: Response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response

def _retrieval_health() -> Dict[str, Any]:
    dense = qdrant_store.status()
    lexical = {"backend": "tantivy", "path": tantivy_store.base_path, "available": True}
    dense_ok = bool(dense.get("available")) and bool(dense.get("authoritative"))
    if dense_ok:
        mode, reason = "hybrid", None
    elif dense.get("available"):
        mode, reason = "hybrid_fallback_store", f"Dense backend '{dense.get('backend')}' is a non-authoritative fallback store"
    else:
        mode, reason = "lexical_only", f"Dense backend unavailable: {dense.get('error')}"
    return {"dense": dense, "lexical": lexical, "retrievalMode": mode, "degradationReason": reason, "denseOk": dense_ok}


@app.get("/health")
async def health():
    """
    Liveness + retrieval capability. Always HTTP 200 while the process is up;
    status is "degraded" (not "ok") whenever dense retrieval is unavailable or on a fallback store.
    """
    rh = _retrieval_health()
    return {
        "service": "ai",
        "status": "ok" if rh["denseOk"] else "degraded",
        "retrievalMode": rh["retrievalMode"],
        "degradationReason": rh["degradationReason"],
        "dense": rh["dense"],
        "lexical": rh["lexical"],
    }


@app.get("/ready")
async def ready(response: Response):
    """
    Readiness: HTTP 503 unless dense retrieval is available on the authoritative store AND it holds
    vectors for every canonical READY chunk in PostgreSQL (detects an empty/wrong vector store).
    """
    rh = _retrieval_health()
    coverage: Dict[str, Any] = {}
    try:
        from qdrant_client.http.models import Filter, FieldCondition, MatchAny
        from src.pipeline.db import get_connection
        conn = get_connection()
        if conn is None:
            raise RuntimeError("PostgreSQL unavailable")
        with conn.cursor() as cur:
            cur.execute(
                "SELECT d.id, COUNT(c.id) FROM documents d LEFT JOIN chunks c ON c.document_id = d.id "
                "WHERE d.status = 'ready' GROUP BY d.id"
            )
            rows = cur.fetchall()
        conn.close()
        ready_ids = [r[0] for r in rows]
        pg_chunks = sum(int(r[1]) for r in rows)
        coverage = {"readyDocuments": len(ready_ids), "readyChunksPostgres": pg_chunks}
        if rh["dense"].get("available") and ready_ids:
            res = qdrant_store.client.count(
                collection_name="groundguard_chunks",
                count_filter=Filter(must=[FieldCondition(key="documentId", match=MatchAny(any=ready_ids))]),
                exact=True,
            )
            coverage["readyChunksQdrant"] = res.count
            coverage["denseCoverage"] = round(res.count / pg_chunks, 4) if pg_chunks else 1.0
    except Exception as e:
        coverage["error"] = str(e)

    models_ready = _model_warmup["state"] in ("ready", "disabled")
    is_ready = (
        rh["denseOk"]
        and models_ready
        and "error" not in coverage
        and coverage.get("readyChunksQdrant", 0) >= coverage.get("readyChunksPostgres", 0)
    )
    response.status_code = 200 if is_ready else 503
    return {
        "retrievalModels": dict(_model_warmup),
        "service": "ai",
        "status": "ready" if is_ready else "degraded",
        "retrievalMode": rh["retrievalMode"],
        "degradationReason": rh["degradationReason"] or (None if is_ready else "Dense vectors missing for READY chunks"),
        "dense": rh["dense"],
        "lexical": rh["lexical"],
        "indexCoverage": coverage,
    }

@app.post("/ingest", response_model=IngestResponse)
async def ingest(
    file: Optional[UploadFile] = File(None),
    documentId: Optional[str] = Form(None),
    projectId: Optional[str] = Form(None),
    x_request_id: Optional[str] = Header(None)
):
    req_id = x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    doc_id = documentId or f"doc_temp"
    proj_id = projectId or f"proj_temp"
    logger.info(f"[/ingest] doc_id={doc_id} project_id={proj_id} req_id={req_id}")

    if not file:
        raise HTTPException(status_code=422, detail="Missing PDF file attachment")
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=422, detail="Uploaded file is empty")
    if not file_bytes[:1024].lstrip().startswith(b"%PDF"):
        raise HTTPException(status_code=422, detail="Uploaded file is not a valid PDF document")
    try:
        pages_data = parse_pdf(file_bytes)
    except Exception as parse_err:
        logger.warning(f"[/ingest] unreadable PDF doc_id={doc_id}: {parse_err}")
        raise HTTPException(status_code=422, detail="Uploaded PDF could not be read (corrupt or unsupported)")

    try:

        if not pages_data:
            return IngestResponse(
                documentId=doc_id,
                status="failed",
                chunksCreated=0,
                errorMessage="Failed to extract readable text from PDF"
            )

        chunks = chunk_pages(pages_data)
        if not chunks:
            return IngestResponse(
                documentId=doc_id,
                status="failed",
                chunksCreated=0,
                errorMessage="No valid chunks generated from PDF text"
            )

        texts = [c["text"] for c in chunks]
        embeddings = generate_embeddings(texts)

        # Multi-Store Indexing with Compensating Cleanup on Partial Failure
        qdrant_written = False
        tantivy_written = False
        networkx_written = False
        edges_count = 0

        try:
            # Stage 2: Qdrant Dense Indexing
            qdrant_store.upsert_chunks(
                project_id=proj_id,
                document_id=doc_id,
                chunks=chunks,
                embeddings=embeddings
            )
            qdrant_written = True

            # Stage 3: Tantivy Lexical BM25 Indexing
            tantivy_store.index_chunks(
                project_id=proj_id,
                document_id=doc_id,
                chunks=chunks
            )
            tantivy_written = True

            # Stage 4: NetworkX Evidence-Grounded Extraction
            edges_count = graph_store.process_and_persist_chunks(
                project_id=proj_id,
                document_id=doc_id,
                chunks=chunks
            )
            networkx_written = True

        except Exception as indexing_err:
            logger.error(f"Ingestion indexing failure at doc_id={doc_id}: {indexing_err}. Initiating compensating cleanup...")
            cleanup_errors = []

            # Compensating cleanup: Purge derived stores already written
            if networkx_written:
                try:
                    graph_store.delete_document(proj_id, doc_id)
                except Exception as ce:
                    cleanup_errors.append(f"NetworkX purge error: {ce}")
            if tantivy_written:
                try:
                    tantivy_store.delete_document(proj_id, doc_id)
                except Exception as ce:
                    cleanup_errors.append(f"Tantivy purge error: {ce}")
            if qdrant_written:
                try:
                    qdrant_store.delete_document(proj_id, doc_id)
                except Exception as ce:
                    cleanup_errors.append(f"Qdrant purge error: {ce}")

            if cleanup_errors:
                logger.critical(f"Compensating cleanup failed for doc_id={doc_id}: {cleanup_errors}")

            return IngestResponse(
                documentId=doc_id,
                status="failed",
                chunksCreated=0,
                errorMessage=f"Indexing failure: {indexing_err}. Compensating cleanup: {'clean' if not cleanup_errors else '; '.join(cleanup_errors)}"
            )

        return IngestResponse(
            documentId=doc_id,
            status="completed",
            chunksCreated=len(chunks),
            indexStatus=IndexStatus(
                qdrant=True,
                tantivy=True,
                networkx=True,
                graphEdgesCount=edges_count
            ),
            chunks=chunks
        )

    except Exception as e:
        logger.error(f"[/ingest error] doc_id={doc_id}: {e}")
        return IngestResponse(
            documentId=doc_id,
            status="failed",
            chunksCreated=0,
            errorMessage="Internal error during PDF parsing/embedding"
        )

@app.delete("/documents/{document_id}", response_model=DeleteDocumentResult)
async def delete_document(
    document_id: str,
    projectId: str = Query(..., description="Project ID owning the document"),
    x_request_id: Optional[str] = Header(None)
):
    """
    Purges derived indexes (Qdrant, Tantivy, NetworkX) for document_id within projectId.
    Must succeed before M3 deletes the canonical record from PostgreSQL.
    """
    logger.info(f"[/documents/delete] document_id={document_id} project_id={projectId} req_id={x_request_id}")
    try:
        # 1. Purge Qdrant
        qdrant_store.delete_document(projectId, document_id)
        # 2. Purge Tantivy
        tantivy_store.delete_document(projectId, document_id)
        # 3. Purge NetworkX
        graph_store.delete_document(projectId, document_id)

        return DeleteDocumentResult(
            success=True,
            documentId=document_id,
            projectId=projectId
        )
    except Exception as e:
        logger.error(f"Failed to purge derived indexes for document_id={document_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Derived index purge failed: {e}"
        )

@app.post("/retrieve", response_model=RetrieveResponse)
async def retrieve(payload: RetrieveRequest, x_request_id: Optional[str] = Header(None)):
    """
    Canonical Phase 4 Multi-Source Retrieval Pipeline:
    Deterministic Routing -> Qdrant Dense + Tantivy BM25 + NetworkX Graph ->
    Candidate Normalization -> RRF Fusion -> FlashRank Cross-Encoder ->
    PostgreSQL READY Validation -> Deterministic Evidence Sufficiency Gate.
    """
    req_id = x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    logger.info(f"[/retrieve] project_id={payload.projectId} query='{payload.query}' req_id={req_id}")
    try:
        return retrieve_evidence(
            project_id=payload.projectId,
            query=payload.query,
            top_k=payload.topK or 5,
            request_id=req_id
        )
    except Exception as e:
        logger.error(f"[/retrieve error] project_id={payload.projectId}: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Retrieval infrastructure failure: {e}"
        )

@app.get("/sanity/search")
async def sanity_search(projectId: str, query: str = Query(..., min_length=1), topK: int = Query(5, ge=1, le=50)):
    """
    Sanity check endpoint for test verification of Qdrant, Tantivy, and NetworkX.
    """
    if not query.strip():
        raise HTTPException(status_code=422, detail="query must be a non-empty string")
    query_vector = generate_embeddings([query])[0] if query else []
    qdrant_res = qdrant_store.search_dense(projectId, query_vector, topK)
    tantivy_res = tantivy_store.search_project(projectId, query, topK)
    relations_res = graph_store.query_relations(projectId, query)

    return {
        "projectId": projectId,
        "query": query,
        "qdrantHits": qdrant_res,
        "tantivyHits": tantivy_res,
        "graphRelations": relations_res
    }

def _is_genuine_naked_referent(q_str: str, ctx: Optional[List[Dict[str, Any]]]) -> bool:
    """
    Clarification Decision Rule:
    Clarification happens ONLY when ambiguity materially prevents safe retrieval or disambiguation.
    An upfront naked referent query is one that specifically refers to an unspecified document/file/pronoun
    without substantive searchable entities/anchors or prior conversation context.
    """
    clean = (q_str or "").strip().lower()
    if not clean:
        return True
    if ctx and len(ctx) > 0:
        return False
    # Substantive anchors: hyphenated codes, model tags, units, numbers, acronyms
    if bool(re.search(r'\b[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)+\b|\b(?!(?:PDF|DOC|URL)\b)[A-Z]{2,}\d*\b|\b\d+(?:\.\d+)?\s*(?:kg|bar|kpa|mpa|v|volts?|hz|mhz|ghz|m3/h|Â°c|c|f|sec|ms|s|gb|mb|kb|ports?|kw|hours?|mins?|minutes?)\b', q_str)):
        return False
    # Meaningful domain words
    domain_words = [w for w in re.findall(r'[a-zA-Z]{4,}', clean) if w not in {
        "what", "which", "where", "when", "that", "this", "these", "those", "does", "have", "with", "from",
        "document", "documents", "file", "files", "pdf", "pdfs", "notes", "manual", "guide", "paper",
        "contain", "contents", "explain", "state", "mean", "refer", "mention", "about", "there", "uploaded"
    }]
    if len(domain_words) >= 2:
        return False
    doc_referent_patterns = [
        r'\b(?:this|the|that)?\s*(?:uploaded\s+)?(?:document|pdf|file|notes|doc|guide|manual|paper|specification|spec)\b',
        r'\b(?:its|the)\s+contents\b',
        r'\bwhat(?:\'?s|\s+is)\s+in\s+it\b',
        r'\bwhat\s+does\s+(?:(?:this|the|that|the\s+uploaded)\s+)?(?:document|file|pdf|doc|it)?\s*(?:contain|say|explain)\b',
        r'\bsummarize\s+(?:it|this|the\s+document|the\s+file|this\s+file|this\s+document)\b',
        r'\bwhat\s+(?:port|voltage|status|color)\s+does\s+it\s+(?:use|have)\b',
    ]
    return any(re.search(p, clean) for p in doc_referent_patterns)


@app.post("/generate", response_model=GenerateResult)
async def generate(payload: GenerateRequest, x_request_id: Optional[str] = Header(None)):
    """
    Canonical Phase 5 Grounded Generation Pipeline with Query Intelligence:
    0a. Conversational/product-help fast path (no retrieval)
    0b. Semantic QueryPlan via understand_query (1 Gemini call max; safe fallback on failure)
    1.  QueryPlan-guided retrieval:
        - focused: single retrieve_evidence call on standalone_query
        - broad/comparative: multi-query retrieve_evidence, merge, deduplicate by chunkId
    2.  Sufficiency gate (threshold=0.35, unchanged)
    3.  On insufficient + plausibly-project-related: ONE semantic fallback expansion
    4.  If clarification needed: return clarification question
    5.  If still insufficient: abstain
    6.  LLM grounded generation with claim extraction
    M2 never calls M1. Planner failure MUST NOT cause 500.
    """
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    gen_id = payload.generationId or f"gen_{uuid.uuid4().hex[:12]}"
    top_k = (payload.options or {}).get("topK", 5)
    request_started = time.perf_counter()

    logger.info(
        "[/generate start] project_id=%s req_id=%s gen_id=%s query='%s'",
        payload.projectId, req_id, gen_id, payload.query
    )

    # Sanitize conversation context to prevent meta-message contamination (e.g. 'answer brooo', 'hello?')
    clean_conv_ctx = None
    if payload.conversationContext:
        clean_conv_ctx = [turn for turn in payload.conversationContext if not is_meta_turn(turn.get("content", ""))]
        if not clean_conv_ctx:
            clean_conv_ctx = None

    # Step 0: Challenge / Correction Turn Detection
    is_challenge = False
    prior_factual_query = None
    is_challenge_retry = False
    effective_query = payload.query

    prior_challenges = 0
    if clean_conv_ctx:
        for turn in clean_conv_ctx:
            if turn.get("role") == "user":
                ch, _ = detect_user_challenge(turn.get("content", ""))
                if ch:
                    prior_challenges += 1

    if prior_challenges < 1:
        is_challenge, prior_factual_query = detect_user_challenge(payload.query, clean_conv_ctx)
        if is_challenge and prior_factual_query:
            effective_query = prior_factual_query
            is_challenge_retry = True
            logger.info(
                f"[/generate challenge retry] Inherited prior factual query: '{effective_query}' "
                f"for challenge turn '{payload.query}'"
            )

    # Step 0a: Legacy conversational/product-help fast path (fast deterministic routing -> natural LLM generation)
    # Challenge retries bypass social/help fast-path to retrieve document evidence
    intent, sub_intent = ("grounded", None) if is_challenge_retry else classify_intent(payload.query)
    logger.info(
        "[/generate intent] project_id=%s req_id=%s intent=%s sub_intent=%s challenge_retry=%s",
        payload.projectId, req_id, intent, sub_intent, is_challenge_retry
    )

    try:
        proj_context = get_project_knowledge_summary(payload.projectId)
    except Exception:
        proj_context = {}
    project_name = proj_context.get("projectName") if isinstance(proj_context, dict) else None

    if intent == "conversational" and not is_challenge_retry:
        logger.info("[/generate responseMode] conversational_llm")
        reply = await generate_social_response(
            user_message=payload.query,
            sub_intent=sub_intent or "greeting",
            project_name=project_name,
            recent_context=clean_conv_ctx,
            llm_runtime=llm_runtime,
        )
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=reply,
            evidence=[],
            sufficiency=None,
            modelVersion="groundguard-conversational",
            metadata={"intent": "conversational", "subIntent": sub_intent, "abstention": False},
            claims=[]
        )

    if intent == "product_help" and not is_challenge_retry:
        logger.info("[/generate responseMode] conversational_llm")
        reply = await generate_product_help_llm(
            user_message=payload.query,
            project_name=project_name,
            recent_context=clean_conv_ctx,
            llm_runtime=llm_runtime,
        )
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=reply,
            evidence=[],
            sufficiency=None,
            modelVersion="groundguard-product-help",
            metadata={"intent": "product_help", "abstention": False},
            claims=[]
        )

    # Step 0b: Semantic Query Understanding (1 Gemini call; safe fallback on any failure)
    planning_started = time.perf_counter()
    try:
        plan = await understand_query(
            query=effective_query,
            conversation_context=clean_conv_ctx,
            project_context=proj_context,
            deterministic_intent=intent,
        )
        planning_latency_ms = int((time.perf_counter() - planning_started) * 1000)
    except Exception as plan_err:
        logger.warning("[/generate planner error] %s — using fallback plan", plan_err)
        plan = _make_fallback_plan(effective_query)
        planning_latency_ms = int((time.perf_counter() - planning_started) * 1000)

    logger.info(
        "[/generate plan] task=%s mode=%s queries=%d standalone='%s'",
        plan.task, plan.retrieval_mode, len(plan.search_queries), plan.standalone_query[:80]
    )

    # If planner signaled clarification, only short-circuit if query is an upfront naked referent
    if plan.needs_clarification:
        if _is_genuine_naked_referent(payload.query, payload.conversationContext):
            logger.info("[/generate responseMode] clarification (genuine naked referent)")
            clarification_msg = await generate_clarification_llm(
                user_query=payload.query,
                structured_clarification=plan.clarification_question,
                llm_runtime=llm_runtime,
            )
            return GenerateResult(
                requestId=req_id,
                generationId=gen_id,
                status="completed",
                answer=clarification_msg,
                evidence=[],
                sufficiency=None,
                modelVersion="groundguard-clarification",
                metadata={"intent": "clarification", "abstention": False, "task": plan.task},
                claims=[]
            )
        else:
            # Query has substantive search anchors: defer to project evidence retrieval
            logger.info("[/generate clarification bypassed] Query has substantive search entities; proceeding to project retrieval")
            plan.needs_clarification = False

    # For social/product_help tasks: verify query is actually a social greeting/farewell
    from src.pipeline.query_understanding import _is_social
    if plan.task == "social" and _is_social(payload.query):
        logger.info("[/generate responseMode] conversational_llm")
        reply = await generate_social_response(
            user_message=payload.query,
            sub_intent="greeting",
            project_name=project_name,
            recent_context=payload.conversationContext,
            llm_runtime=llm_runtime,
        )
        return GenerateResult(
            requestId=req_id, generationId=gen_id, status="completed",
            answer=reply, evidence=[], sufficiency=None,
            modelVersion="groundguard-conversational",
            metadata={"intent": "social", "abstention": False}, claims=[]
        )
    if plan.task == "product_help":
        logger.info("[/generate responseMode] conversational_llm")
        reply = await generate_product_help_llm(
            user_message=payload.query,
            project_name=project_name,
            recent_context=payload.conversationContext,
            llm_runtime=llm_runtime,
        )
        return GenerateResult(
            requestId=req_id, generationId=gen_id, status="completed",
            answer=reply, evidence=[], sufficiency=None,
            modelVersion="groundguard-product-help",
            metadata={"intent": "product_help", "abstention": False}, claims=[]
        )

    # Step 1: 4-Dimensional Information-Need Guided Retrieval Orchestration
    # Strategies:
    # 1. coverage: document overview / contents / summary (representative chunks in reading order)
    # 2. section: exact heading lexical match + bounded successor chunk neighborhood expansion
    # 3. procedural: source-ordered evidence (pageNumber, chunkIndex)
    # 4. comparative / cross_document / broad: multi-query retrieval with document diversity
    # 5. focused: high-precision single-query retrieval with preserved technical tokens
    retrieval_started = time.perf_counter()
    try:
        retrieval_res, coverage_meta = _execute_plan_retrieval(
            payload, plan, proj_context, effective_query, top_k, req_id, is_challenge_retry
        )
        retrieval_latency_ms = int((time.perf_counter() - retrieval_started) * 1000)
    except Exception as ret_err:
        logger.error(
            "[/generate retrieval error] project_id=%s req_id=%s: %s",
            payload.projectId, req_id, ret_err
        )
        raise HTTPException(
            status_code=503,
            detail=f"Retrieval infrastructure failure during generation: {ret_err}"
        )

    # Step 2: Deterministic Evidence Sufficiency Gate (threshold=0.35 unchanged)
    is_conflict = bool(
        retrieval_res.sufficiency
        and retrieval_res.sufficiency.signals
        and retrieval_res.sufficiency.signals.conflictingEvidence
        and retrieval_res.results
    )
    first_pass_sufficient = bool(
        retrieval_res.sufficiency
        and (retrieval_res.sufficiency.sufficient or is_conflict)
        and retrieval_res.results
    )
    fallback_used = False

    # Step 3: ONE bounded semantic fallback if insufficient and query is plausibly project-related
    if not first_pass_sufficient and intent != "unsupported_query" and not _answerability_rejected(retrieval_res.sufficiency):
        first_q = (plan.search_queries[0] if plan.search_queries else None) or plan.standalone_query or payload.query
        candidate_fallbacks = [sq for sq in plan.search_queries[1:] if sq and sq != first_q]
        if plan.standalone_query and plan.standalone_query != first_q and plan.standalone_query not in candidate_fallbacks:
            candidate_fallbacks.append(plan.standalone_query)
        if payload.query != first_q and payload.query not in candidate_fallbacks:
            candidate_fallbacks.append(payload.query)
        fallback_q = candidate_fallbacks[0] if candidate_fallbacks else None

        if fallback_q and fallback_q != first_q:
            logger.info(
                "[/generate fallback] First pass insufficient, trying semantic fallback. fallback_q='%s'",
                fallback_q[:80]
            )
            try:
                fallback_res = retrieve_evidence(
                    project_id=payload.projectId,
                    query=fallback_q,
                    top_k=top_k,
                    request_id=req_id,
                    document_ids=_explicit_document_scope(plan),
                    answerability_query=effective_query,
                )
                fb_is_conflict = bool(
                    fallback_res.sufficiency
                    and fallback_res.sufficiency.signals
                    and fallback_res.sufficiency.signals.conflictingEvidence
                    and fallback_res.results
                )
                if (
                    fallback_res.sufficiency
                    and (fallback_res.sufficiency.sufficient or fb_is_conflict)
                    and fallback_res.results
                ):
                    retrieval_res = fallback_res
                    fallback_used = True
                    is_conflict = fb_is_conflict
                    logger.info("[/generate fallback] Fallback succeeded")
            except Exception as fb_err:
                logger.warning("[/generate fallback error] %s", fb_err)

    retrieval_latency_ms = int((time.perf_counter() - retrieval_started) * 1000)
    if not is_conflict and (not retrieval_res.sufficiency or not retrieval_res.sufficiency.sufficient or not retrieval_res.results):
        reason = retrieval_res.sufficiency.reason if retrieval_res.sufficiency else "No evidence retrieved"
        logger.info(
            "[/generate abstained] project_id=%s req_id=%s reason='%s'",
            payload.projectId, req_id, reason
        )
        logger.info("[/generate responseMode] grounded_abstention")
        unsupported_msg = FALLBACK_ABSTENTION
        fail_stage = (
            retrieval_res.sufficiency.failureStage
            if (retrieval_res.sufficiency and getattr(retrieval_res.sufficiency, "failureStage", None))
            else (
                FailureStage.RETRIEVAL_ZERO_CANDIDATES.value
                if not retrieval_res.results
                else FailureStage.SUFFICIENCY_GATE_REJECTION.value
            )
        )
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=unsupported_msg,
            evidence=[],
            sufficiency=retrieval_res.sufficiency,
            modelVersion="groundguard-abstention-gate",
            metadata={
                "abstention": True,
                "reason": reason,
                "disposition": EvidenceDisposition.INSUFFICIENT.value,
                "supportDisposition": EvidenceDisposition.INSUFFICIENT.value,
                "failureStage": fail_stage,
                "sufficiencyScore": retrieval_res.sufficiency.score if retrieval_res.sufficiency else 0.0,
                "topRerankScore": (retrieval_res.sufficiency.signals.topRerankScore if retrieval_res.sufficiency and retrieval_res.sufficiency.signals else 0.0),
                "candidateCount": len(retrieval_res.results),
                "eligibleEvidenceCount": (retrieval_res.sufficiency.signals.eligibleEvidenceCount if retrieval_res.sufficiency and retrieval_res.sufficiency.signals else 0),
                "evidenceCount": 0,
                "intent": "grounded_query_insufficient",
                "task": plan.task,
                "queryStrategy": plan.retrieval_strategy,
                "fallbackUsed": fallback_used,
                "stageTimingsMs": {
                    "planning": planning_latency_ms,
                    "retrieval": retrieval_latency_ms,
                    "firstToken": None,
                    "generation": 0,
                    "extraction": 0,
                    "total": int((time.perf_counter() - request_started) * 1000),
                },
                "conflict": False,
                "premiseClassification": classify_premise_outcome(unsupported_msg, plan.is_proposition, True),
            },
            claims=[]
        )

    # Step 3: Context Building & Prompt Construction
    # Enrich evidence items with canonical document filenames if missing
    try:
        doc_ids = [item.documentId for item in retrieval_res.results if item.documentId]
        if doc_ids:
            _, doc_fnames = get_ready_documents_meta(payload.projectId, doc_ids)
            for item in retrieval_res.results:
                if item.documentId and item.documentId in doc_fnames:
                    if not item.metadata:
                        item.metadata = {}
                    if not item.metadata.get("filename"):
                        item.metadata["filename"] = doc_fnames[item.documentId]
    except Exception:
        pass

    # Preserve BOTH: original instruction (payload.query) and resolved retrieval subject (plan.standalone_query)
    clean_conv_ctx = None
    if payload.conversationContext:
        clean_conv_ctx = [turn for turn in payload.conversationContext if not is_meta_turn(turn.get("content", ""))]
        if not clean_conv_ctx:
            clean_conv_ctx = None

    context_text, included_items, omitted_items = context_builder.build_context(retrieval_res.results)
    _attach_source_context(included_items, payload.projectId)
    conflict_summary = (
        retrieval_res.sufficiency.signals.conflictSummary
        if (is_conflict and retrieval_res.sufficiency and retrieval_res.sufficiency.signals)
        else None
    )
    user_prompt = build_grounded_user_prompt(
        query=effective_query,
        evidence_context=context_text,
        conversation_context=clean_conv_ctx,
        standalone_query=plan.standalone_query,
        operation=plan.operation,
        is_proposition=plan.is_proposition,
        conflict_summary=conflict_summary,
        scope_note=_coverage_scope_note(coverage_meta, plan.resolved_document_name),
    )

    # Step 4: Real LLM Inference
    try:
        logger.info("[/generate responseMode] grounded_generation")
        generation_started = time.perf_counter()
        llm_res = await llm_runtime.generate_answer(user_prompt)
        generation_latency_ms = int((time.perf_counter() - generation_started) * 1000)
        logger.info(
            f"[/generate completed] project_id={payload.projectId} req_id={req_id} "
            f"model={llm_res.modelVersion} latency={llm_res.latencyMs}ms"
        )
        # Step 5: structured outcome -> claims -> trust state (shared with /generate/stream)
        fin = await _finalize_grounded_answer(
            llm_res.answer, included_items, retrieval_res, plan, is_conflict, coverage_meta
        )
        final_disp = fin["disposition"]

        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=fin["answer"],
            evidence=fin["evidence"],
            sufficiency=retrieval_res.sufficiency,
            modelVersion=llm_res.modelVersion,
            metadata={
                "abstention": fin["abstention"],
                "disposition": final_disp,
                "supportDisposition": final_disp,
                "failureStage": fin["failureStage"],
                "generationOutcome": fin["generationOutcome"],
                "generationOutcomeSource": fin["generationOutcomeSource"],
                "verificationStatus": fin["verificationStatus"],
                "sufficiencyScore": retrieval_res.sufficiency.score if retrieval_res.sufficiency else 1.0,
                "topRerankScore": (retrieval_res.sufficiency.signals.topRerankScore if retrieval_res.sufficiency and retrieval_res.sufficiency.signals else 1.0),
                "candidateCount": len(retrieval_res.results),
                "eligibleEvidenceCount": (retrieval_res.sufficiency.signals.eligibleEvidenceCount if retrieval_res.sufficiency and retrieval_res.sufficiency.signals else len(included_items)),
                "conflict": is_conflict,
                "conflictType": (retrieval_res.sufficiency.signals.conflictType if (retrieval_res.sufficiency and retrieval_res.sufficiency.signals) else None) if is_conflict else None,
                "conflictSummary": conflict_summary,
                "premiseClassification": fin["premiseClassification"],
                "evidenceCount": 0 if fin["abstention"] else len(included_items),
                "omittedCount": len(omitted_items),
                "llmLatencyMs": llm_res.latencyMs,
                "provider": llm_res.provider,
                "claimExtraction": fin["claimExtraction"],
                "documentCoverage": coverage_meta,
                "documentScope": _explicit_document_scope(plan),
                "task": plan.task,
                "queryStrategy": plan.retrieval_strategy,
                "retrievalMode": plan.retrieval_mode,
                "retrievalStrategy": plan.retrieval_strategy,
                "operation": plan.operation,
                "sourceScope": plan.source_scope,
                "target": plan.target,
                "resolvedDocumentId": plan.resolved_document_id,
                "resolvedDocumentName": plan.resolved_document_name,
                "fallbackUsed": fallback_used,
                "stageTimingsMs": {
                    "planning": planning_latency_ms,
                    "retrieval": retrieval_latency_ms,
                    "firstToken": None,
                    "generation": generation_latency_ms,
                    "extraction": fin["extractionLatencyMs"],
                    "total": int((time.perf_counter() - request_started) * 1000),
                },
            },
            claims=fin["claims"]
        )
    except LLMUnavailableError as unavail_err:
        logger.error(f"[/generate LLM unavailable] project_id={payload.projectId} req_id={req_id}: {unavail_err}")
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="failed",
            answer="",
            evidence=retrieval_res.results,
            sufficiency=retrieval_res.sufficiency,
            modelVersion=llm_runtime.get_model_version(),
            error={
                "code": "LLM_UNAVAILABLE",
                "message": str(unavail_err)
            },
            claims=[]
        )
    except Exception as llm_err:
        logger.error(f"[/generate LLM failure] project_id={payload.projectId} req_id={req_id}: {llm_err}")
        return GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="failed",
            answer="",
            evidence=retrieval_res.results,
            sufficiency=retrieval_res.sufficiency,
            modelVersion=llm_runtime.get_model_version(),
            error={
                "code": "LLM_ERROR",
                "message": f"LLM generation failed: {llm_err}"
            },
            claims=[]
        )

@app.post("/generate/stream")
async def generate_stream(payload: GenerateRequest, x_request_id: Optional[str] = Header(None)):
    """
    Internal streaming generation endpoint consumed by M3:
    1. Executes pre-generation stages (intent classification, query planning, retrieval, sufficiency gate).
    2. Immediately upon sufficiency, emits `answer.started`.
    3. Streams REAL model tokens as `answer.delta` SSE events as soon as Gemini begins producing them.
    4. Upon completion of LLM stream, emits `answer.completed`.
    5. Runs claim extraction on the completed answer text and emits `claims.completed`.
    6. Emits final `generation.completed` with all evidence, claims, and metadata.
    """
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    gen_id = payload.generationId or f"gen_{uuid.uuid4().hex[:12]}"
    top_k = (payload.options or {}).get("topK", 5)

    async def event_generator():
        seq = 1
        request_started = time.perf_counter()

        def _format_sse(evt_type: str, data: dict) -> str:
            return f"event: {evt_type}\ndata: {json.dumps(data)}\n\n"

        yield _format_sse("generation.started", {"generationId": gen_id, "requestId": req_id})

        # Sanitize conversation context to prevent meta-message contamination (e.g. 'answer brooo', 'hello?')
        clean_conv_ctx = None
        if payload.conversationContext:
            clean_conv_ctx = [turn for turn in payload.conversationContext if not is_meta_turn(turn.get("content", ""))]
            if not clean_conv_ctx:
                clean_conv_ctx = None

        # Step 0: Challenge / Correction Turn Detection
        is_challenge = False
        prior_factual_query = None
        is_challenge_retry = False
        effective_query = payload.query

        prior_challenges = 0
        if clean_conv_ctx:
            for turn in clean_conv_ctx:
                if turn.get("role") == "user":
                    ch, _ = detect_user_challenge(turn.get("content", ""))
                    if ch:
                        prior_challenges += 1

        if prior_challenges < 1:
            is_challenge, prior_factual_query = detect_user_challenge(payload.query, clean_conv_ctx)
            if is_challenge and prior_factual_query:
                effective_query = prior_factual_query
                is_challenge_retry = True
                logger.info(
                    f"[/generate/stream challenge retry] Inherited prior factual query: '{effective_query}' "
                    f"for challenge turn '{payload.query}'"
                )

        # Step 0a: Intent classification
        intent, sub_intent = ("grounded", None) if is_challenge_retry else classify_intent(payload.query)
        try:
            proj_context = get_project_knowledge_summary(payload.projectId)
        except Exception:
            proj_context = {}
        project_name = proj_context.get("projectName") if isinstance(proj_context, dict) else None

        if intent == "conversational" and not is_challenge_retry:
            reply = await generate_social_response(
                user_message=payload.query,
                sub_intent=sub_intent or "greeting",
                project_name=project_name,
                recent_context=clean_conv_ctx,
                llm_runtime=llm_runtime,
            )
            yield _format_sse("answer.started", {"generationId": gen_id})
            yield _format_sse("answer.delta", {"generationId": gen_id, "delta": reply, "sequence": seq})
            seq += 1
            yield _format_sse("answer.completed", {"generationId": gen_id, "answer": reply})
            yield _format_sse("claims.completed", {"generationId": gen_id, "claims": []})
            final_res = GenerateResult(
                requestId=req_id,
                generationId=gen_id,
                status="completed",
                answer=reply,
                evidence=[],
                sufficiency=None,
                modelVersion="groundguard-conversational",
                metadata={"intent": "conversational", "subIntent": sub_intent, "abstention": False},
                claims=[]
            )
            yield _format_sse("generation.completed", final_res.model_dump())
            return

        if intent == "product_help" and not is_challenge_retry:
            reply = await generate_product_help_llm(
                user_message=payload.query,
                project_name=project_name,
                recent_context=clean_conv_ctx,
                llm_runtime=llm_runtime,
            )
            yield _format_sse("answer.started", {"generationId": gen_id})
            yield _format_sse("answer.delta", {"generationId": gen_id, "delta": reply, "sequence": seq})
            seq += 1
            yield _format_sse("answer.completed", {"generationId": gen_id, "answer": reply})
            yield _format_sse("claims.completed", {"generationId": gen_id, "claims": []})
            final_res = GenerateResult(
                requestId=req_id,
                generationId=gen_id,
                status="completed",
                answer=reply,
                evidence=[],
                sufficiency=None,
                modelVersion="groundguard-product-help",
                metadata={"intent": "product_help", "abstention": False},
                claims=[]
            )
            yield _format_sse("generation.completed", final_res.model_dump())
            return

        # Step 0b: Semantic Query Understanding
        yield _format_sse("planning.started", {"generationId": gen_id})
        planning_started = time.perf_counter()
        try:
            plan = await understand_query(
                query=effective_query,
                conversation_context=clean_conv_ctx,
                project_context=proj_context,
                deterministic_intent=intent,
            )
            planning_latency_ms = int((time.perf_counter() - planning_started) * 1000)
        except Exception as plan_err:
            logger.warning("[/generate/stream planner error] %s — using fallback plan", plan_err)
            plan = _make_fallback_plan(effective_query)
            planning_latency_ms = int((time.perf_counter() - planning_started) * 1000)
        yield _format_sse("planning.completed", {
            "generationId": gen_id,
            # "llm" | "deterministic_fast_path" | "fallback" -- reported truthfully from the plan
            "plannerSource": getattr(plan, "planner_source", "llm"),
            "latencyMs": planning_latency_ms,
        })

        if plan.needs_clarification:
            if _is_genuine_naked_referent(payload.query, clean_conv_ctx):
                clarification_msg = await generate_clarification_llm(
                    user_query=payload.query,
                    structured_clarification=plan.clarification_question,
                    llm_runtime=llm_runtime,
                )
                yield _format_sse("answer.started", {"generationId": gen_id})
                yield _format_sse("answer.delta", {"generationId": gen_id, "delta": clarification_msg, "sequence": seq})
                seq += 1
                yield _format_sse("answer.completed", {"generationId": gen_id, "answer": clarification_msg})
                yield _format_sse("claims.completed", {"generationId": gen_id, "claims": []})
                final_res = GenerateResult(
                    requestId=req_id,
                    generationId=gen_id,
                    status="completed",
                    answer=clarification_msg,
                    evidence=[],
                    sufficiency=None,
                    modelVersion="groundguard-clarification",
                    metadata={"intent": "clarification", "abstention": False, "task": plan.task},
                    claims=[]
                )
                yield _format_sse("generation.completed", final_res.model_dump())
                return
            else:
                plan.needs_clarification = False

        from src.pipeline.query_understanding import _is_social
        if plan.task == "social" and _is_social(payload.query):
            reply = await generate_social_response(
                user_message=payload.query,
                sub_intent="greeting",
                project_name=project_name,
                recent_context=payload.conversationContext,
                llm_runtime=llm_runtime,
            )
            yield _format_sse("answer.started", {"generationId": gen_id})
            yield _format_sse("answer.delta", {"generationId": gen_id, "delta": reply, "sequence": seq})
            seq += 1
            yield _format_sse("answer.completed", {"generationId": gen_id, "answer": reply})
            yield _format_sse("claims.completed", {"generationId": gen_id, "claims": []})
            final_res = GenerateResult(
                requestId=req_id, generationId=gen_id, status="completed",
                answer=reply, evidence=[], sufficiency=None,
                modelVersion="groundguard-conversational",
                metadata={"intent": "social", "abstention": False}, claims=[]
            )
            yield _format_sse("generation.completed", final_res.model_dump())
            return

        if plan.task == "product_help":
            reply = await generate_product_help_llm(
                user_message=payload.query,
                project_name=project_name,
                recent_context=payload.conversationContext,
                llm_runtime=llm_runtime,
            )
            yield _format_sse("answer.started", {"generationId": gen_id})
            yield _format_sse("answer.delta", {"generationId": gen_id, "delta": reply, "sequence": seq})
            seq += 1
            yield _format_sse("answer.completed", {"generationId": gen_id, "answer": reply})
            yield _format_sse("claims.completed", {"generationId": gen_id, "claims": []})
            final_res = GenerateResult(
                requestId=req_id, generationId=gen_id, status="completed",
                answer=reply, evidence=[], sufficiency=None,
                modelVersion="groundguard-product-help",
                metadata={"intent": "product_help", "abstention": False}, claims=[]
            )
            yield _format_sse("generation.completed", final_res.model_dump())
            return

        # Step 1: Retrieval (shared strategies with /generate: coverage, broad, focused, parameter grounding)
        focused_q = plan.standalone_query or effective_query or (plan.search_queries[0] if plan.search_queries else "")
        retrieval_started = time.perf_counter()
        try:
            retrieval_res, coverage_meta = _execute_plan_retrieval(
                payload, plan, proj_context, effective_query, top_k, req_id, is_challenge_retry
            )
            retrieval_latency_ms = int((time.perf_counter() - retrieval_started) * 1000)
        except Exception as ret_err:
            logger.error("[/generate/stream retrieval error] %s", ret_err)
            yield _format_sse("generation.failed", {"code": "RETRIEVAL_ERROR", "message": str(ret_err)})
            return

        yield _format_sse("retrieval.completed", {
            "generationId": gen_id,
            "evidenceCount": len(retrieval_res.results),
            "sources": _source_previews(retrieval_res.results, payload.projectId),  # optional, additive
        })

        # Sufficiency check
        is_conflict = bool(
            retrieval_res.sufficiency
            and retrieval_res.sufficiency.signals
            and retrieval_res.sufficiency.signals.conflictingEvidence
            and retrieval_res.results
        )
        first_pass_sufficient = bool(
            retrieval_res.sufficiency
            and (retrieval_res.sufficiency.sufficient or is_conflict)
            and retrieval_res.results
        )
        fallback_used = False
        if not first_pass_sufficient and intent != "unsupported_query" and not _answerability_rejected(retrieval_res.sufficiency):
            candidate_fallbacks = [sq for sq in plan.search_queries[1:] if sq and sq != focused_q]
            if plan.standalone_query and plan.standalone_query != focused_q and plan.standalone_query not in candidate_fallbacks:
                candidate_fallbacks.append(plan.standalone_query)
            if payload.query != focused_q and payload.query not in candidate_fallbacks:
                candidate_fallbacks.append(payload.query)
            fallback_q = candidate_fallbacks[0] if candidate_fallbacks else None
            if fallback_q:
                try:
                    fallback_res = retrieve_evidence(
                        project_id=payload.projectId,
                        query=fallback_q,
                        top_k=top_k,
                        request_id=req_id,
                        document_ids=_explicit_document_scope(plan),
                        answerability_query=effective_query,
                    )
                    fb_is_conflict = bool(
                        fallback_res.sufficiency
                        and fallback_res.sufficiency.signals
                        and fallback_res.sufficiency.signals.conflictingEvidence
                        and fallback_res.results
                    )
                    if (
                        fallback_res.sufficiency
                        and (fallback_res.sufficiency.sufficient or fb_is_conflict)
                        and fallback_res.results
                    ):
                        retrieval_res = fallback_res
                        fallback_used = True
                        is_conflict = fb_is_conflict
                except Exception:
                    pass

            retrieval_latency_ms = int((time.perf_counter() - retrieval_started) * 1000)
        if not is_conflict and (not retrieval_res.sufficiency or not retrieval_res.sufficiency.sufficient or not retrieval_res.results):
            reason = retrieval_res.sufficiency.reason if retrieval_res.sufficiency else "No evidence retrieved"
            unsupported_msg = FALLBACK_ABSTENTION
            yield _format_sse("answer.started", {"generationId": gen_id})
            yield _format_sse("answer.delta", {"generationId": gen_id, "delta": unsupported_msg, "sequence": seq})
            seq += 1
            yield _format_sse("answer.completed", {"generationId": gen_id, "answer": unsupported_msg})
            yield _format_sse("claims.completed", {"generationId": gen_id, "claims": []})
            fail_stage = (
                retrieval_res.sufficiency.failureStage
                if (retrieval_res.sufficiency and getattr(retrieval_res.sufficiency, "failureStage", None))
                else (
                    FailureStage.RETRIEVAL_ZERO_CANDIDATES.value
                    if not retrieval_res.results
                    else FailureStage.SUFFICIENCY_GATE_REJECTION.value
                )
            )
            final_res = GenerateResult(
                requestId=req_id,
                generationId=gen_id,
                status="completed",
                answer=unsupported_msg,
                evidence=[],
                sufficiency=retrieval_res.sufficiency,
                modelVersion="groundguard-abstention-gate",
                metadata={
                    "abstention": True,
                    "reason": reason,
                    "disposition": EvidenceDisposition.INSUFFICIENT.value,
                    "supportDisposition": EvidenceDisposition.INSUFFICIENT.value,
                    "failureStage": fail_stage,
                    "sufficiencyScore": retrieval_res.sufficiency.score if retrieval_res.sufficiency else 0.0,
                    "topRerankScore": (retrieval_res.sufficiency.signals.topRerankScore if retrieval_res.sufficiency and retrieval_res.sufficiency.signals else 0.0),
                    "candidateCount": len(retrieval_res.results),
                    "eligibleEvidenceCount": (retrieval_res.sufficiency.signals.eligibleEvidenceCount if retrieval_res.sufficiency and retrieval_res.sufficiency.signals else 0),
                    "evidenceCount": 0,
                    "intent": "grounded_query_insufficient",
                    "task": plan.task,
                    "queryStrategy": plan.retrieval_strategy,
                    "fallbackUsed": fallback_used,
                    "stageTimingsMs": {
                        "planning": planning_latency_ms,
                        "retrieval": retrieval_latency_ms,
                        "firstToken": None,
                        "generation": 0,
                        "extraction": 0,
                        "total": int((time.perf_counter() - request_started) * 1000),
                    },
                    "conflict": False,
                    "premiseClassification": classify_premise_outcome(unsupported_msg, plan.is_proposition, True),
                },
                claims=[]
            )
            yield _format_sse("generation.completed", final_res.model_dump())
            return

        # Context & prompt
        # Enrich evidence items with canonical document filenames if missing
        try:
            doc_ids = [item.documentId for item in retrieval_res.results if item.documentId]
            if doc_ids:
                _, doc_fnames = get_ready_documents_meta(payload.projectId, doc_ids)
                for item in retrieval_res.results:
                    if item.documentId and item.documentId in doc_fnames:
                        if not item.metadata:
                            item.metadata = {}
                        if not item.metadata.get("filename"):
                            item.metadata["filename"] = doc_fnames[item.documentId]
        except Exception:
            pass

        context_text, included_items, omitted_items = context_builder.build_context(retrieval_res.results)
        _attach_source_context(included_items, payload.projectId)
        conflict_summary = (
            retrieval_res.sufficiency.signals.conflictSummary
            if (is_conflict and retrieval_res.sufficiency and retrieval_res.sufficiency.signals)
            else None
        )
        user_prompt = build_grounded_user_prompt(
            query=effective_query,
            evidence_context=context_text,
            conversation_context=clean_conv_ctx,
            standalone_query=plan.standalone_query,
            operation=plan.operation,
            is_proposition=plan.is_proposition,
            conflict_summary=conflict_summary,
            scope_note=_coverage_scope_note(coverage_meta, plan.resolved_document_name),
        )

        # Real LLM Streaming (the trailing machine-read outcome tag is held back and never streamed)
        from src.pipeline.answerability import OutcomeTagStreamFilter
        tag_filter = OutcomeTagStreamFilter()
        full_answer_chunks: List[str] = []
        yield _format_sse("answer.started", {"generationId": gen_id})

        t_llm_start = time.perf_counter()
        first_token_latency_ms = None
        try:
            async for chunk in llm_runtime.stream_answer(user_prompt):
                if chunk:
                    if first_token_latency_ms is None:
                        first_token_latency_ms = int((time.perf_counter() - request_started) * 1000)
                    full_answer_chunks.append(chunk)
                    visible = tag_filter.feed(chunk)
                    if visible:
                        yield _format_sse("answer.delta", {"generationId": gen_id, "delta": visible, "sequence": seq})
                        seq += 1
            tail = tag_filter.flush()
            if tail:
                yield _format_sse("answer.delta", {"generationId": gen_id, "delta": tail, "sequence": seq})
                seq += 1
        except Exception as stream_err:
            logger.error("[/generate/stream LLM failure] %s", stream_err)
            yield _format_sse("generation.failed", {"code": "LLM_ERROR", "message": f"LLM stream failed: {stream_err}"})
            return

        llm_latency_ms = int((time.perf_counter() - t_llm_start) * 1000)
        full_answer = "".join(full_answer_chunks).strip()

        # Structured outcome -> claims -> trust state (shared with /generate)
        fin = await _finalize_grounded_answer(
            full_answer, included_items, retrieval_res, plan, is_conflict, coverage_meta
        )
        claims: List[ClaimItem] = fin["claims"]
        final_disp = fin["disposition"]
        yield _format_sse("answer.completed", {"generationId": gen_id, "answer": fin["answer"]})
        yield _format_sse("claims.completed", {"generationId": gen_id, "claims": [c.model_dump() for c in claims]})

        final_res = GenerateResult(
            requestId=req_id,
            generationId=gen_id,
            status="completed",
            answer=fin["answer"],
            evidence=fin["evidence"],
            sufficiency=retrieval_res.sufficiency,
            modelVersion=llm_runtime.get_model_version(),
            metadata={
                "abstention": fin["abstention"],
                "disposition": final_disp,
                "supportDisposition": final_disp,
                "failureStage": fin["failureStage"],
                "generationOutcome": fin["generationOutcome"],
                "generationOutcomeSource": fin["generationOutcomeSource"],
                "verificationStatus": fin["verificationStatus"],
                "sufficiencyScore": retrieval_res.sufficiency.score if retrieval_res.sufficiency else 1.0,
                "topRerankScore": (retrieval_res.sufficiency.signals.topRerankScore if retrieval_res.sufficiency and retrieval_res.sufficiency.signals else 1.0),
                "candidateCount": len(retrieval_res.results),
                "eligibleEvidenceCount": (retrieval_res.sufficiency.signals.eligibleEvidenceCount if retrieval_res.sufficiency and retrieval_res.sufficiency.signals else len(included_items)),
                "conflict": is_conflict,
                "conflictType": (retrieval_res.sufficiency.signals.conflictType if (retrieval_res.sufficiency and retrieval_res.sufficiency.signals) else None) if is_conflict else None,
                "conflictSummary": conflict_summary,
                "premiseClassification": fin["premiseClassification"],
                "evidenceCount": 0 if fin["abstention"] else len(included_items),
                "omittedCount": len(omitted_items),
                "llmLatencyMs": llm_latency_ms,
                "provider": llm_runtime.provider,
                "claimExtraction": fin["claimExtraction"],
                "documentCoverage": coverage_meta,
                "documentScope": _explicit_document_scope(plan),
                "task": plan.task,
                "queryStrategy": plan.retrieval_strategy,
                "retrievalMode": plan.retrieval_mode,
                "retrievalStrategy": plan.retrieval_strategy,
                "operation": plan.operation,
                "sourceScope": plan.source_scope,
                "target": plan.target,
                "resolvedDocumentId": plan.resolved_document_id,
                "resolvedDocumentName": plan.resolved_document_name,
                "fallbackUsed": fallback_used,
                "stageTimingsMs": {
                    "planning": planning_latency_ms,
                    "retrieval": retrieval_latency_ms,
                    "firstToken": first_token_latency_ms,
                    "generation": llm_latency_ms,
                    "extraction": fin["extractionLatencyMs"],
                    "total": int((time.perf_counter() - request_started) * 1000),
                },
            },
            claims=claims
        )
        yield _format_sse("generation.completed", final_res.model_dump())

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

@app.post("/recover", response_model=RecoverResponse)
async def recover(payload: RecoverRequest, x_request_id: Optional[str] = Header(None)):
    req_id = payload.requestId or x_request_id or f"req_{uuid.uuid4().hex[:12]}"
    logger.info(
        f"[/recover] claim_id={payload.claimId} req_id={req_id} "
        f"attempt={payload.attempt} reason={payload.failureReason} "
        f"useLangGraph={payload.useLangGraph}"
    )
    from src.pipeline.llm import llm_request_deadline
    deadline_token = llm_request_deadline.set(
        time.monotonic() + payload.deadlineMs / 1000.0 if payload.deadlineMs else None
    )
    try:
        result = await _run_recovery(payload, req_id)
    finally:
        llm_request_deadline.reset(deadline_token)

    return RecoverResponse(
        requestId=req_id,
        claimId=payload.claimId,
        action=result.action,
        candidateClaim=result.candidateClaim,
        recoveryEvidence=result.recoveryEvidence,
        modelVersion=result.modelVersion,
        reason=result.reason,
        failureType=getattr(result, "failureType", None),
    )


async def _run_recovery(payload: "RecoverRequest", req_id: str):
    if payload.useLangGraph:
        from src.pipeline.recovery_graph import run_langgraph_recovery
        # M3 owns the attempt loop (it calls /recover once per attempt), so the graph runs exactly one
        # attempt per request. Previously the graph also looped internally, so attempt 1 ran 2 LLM
        # revisions and each failed claim cost 3 provider calls instead of the configured 2.
        result = await run_langgraph_recovery(
            project_id=payload.projectId,
            claim_id=payload.claimId,
            claim=payload.claim,
            failure_reason=payload.failureReason,
            attempt=payload.attempt,
            request_id=req_id,
            single_attempt=True,
        )
    else:
        from src.pipeline.recovery import execute_recovery
        result = await execute_recovery(
            project_id=payload.projectId,
            claim_id=payload.claimId,
            claim=payload.claim,
            failure_reason=payload.failureReason,
            attempt=payload.attempt,
            request_id=req_id
        )
    return result


# ---------------------------------------------------------------------------
# Index Lifecycle Verification & Legacy Reconciliation (Infrastructure Correctness)
# ---------------------------------------------------------------------------

class VerifyIndexResponse(BaseModel):
    consistent: bool
    documentId: str
    projectId: str
    qdrantCount: int
    tantivyCount: int
    expectedCount: Optional[int] = None
    status: Optional[str] = None  # "consistent" | "inconsistent" | "missing" | "unverifiable"

class RepairIndexResponse(BaseModel):
    repaired: bool
    documentId: str
    projectId: str

class ReconcileRequest(BaseModel):
    dryRun: Optional[bool] = True  # safety: writes only when explicitly dryRun=false
    maxDocuments: Optional[int] = None
    targetProjectId: Optional[str] = None

@app.get("/documents/{document_id}/verify-index", response_model=VerifyIndexResponse)
async def verify_document_index(
    document_id: str,
    projectId: str = Query(..., description="Project ID owning the document"),
    expectedCount: Optional[int] = Query(None, description="Expected chunk count from PostgreSQL"),
    x_request_id: Optional[str] = Header(None)
):
    """
    Verifies that Qdrant and Tantivy have the exact expected chunk count for (projectId, documentId).
    Enforces 3-way lifecycle consistency before setting READY status.
    """
    from src.pipeline.index_verifier import verify_document_index_parity
    res = verify_document_index_parity(projectId, document_id, expectedCount)
    return VerifyIndexResponse(**res)

@app.post("/documents/{document_id}/repair-index", response_model=RepairIndexResponse)
async def repair_document_index_endpoint(
    document_id: str,
    projectId: str = Query(..., description="Project ID owning the document"),
    x_request_id: Optional[str] = Header(None)
):
    """
    Reconstructs Qdrant and Tantivy indexes from canonical PostgreSQL chunks.
    """
    from src.pipeline.index_verifier import repair_document_index
    success = repair_document_index(projectId, document_id)
    return RepairIndexResponse(
        repaired=success,
        documentId=document_id,
        projectId=projectId
    )

@app.post("/admin/reconcile-indexes")
async def reconcile_indexes_endpoint(payload: Optional[ReconcileRequest] = None):
    """
    Automated reconciliation tooling (Section 4).
    Reconciles all documents marked READY in PostgreSQL with downstream Qdrant and Tantivy indexes.
    """
    from src.pipeline.index_verifier import reconcile_legacy_indexes
    dry_run = True if (payload is None or payload.dryRun is None) else bool(payload.dryRun)
    max_docs = payload.maxDocuments if payload else None
    target_proj = payload.targetProjectId if payload else None
    try:
        res = reconcile_legacy_indexes(dry_run=dry_run, max_documents=max_docs, target_project_id=target_proj)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return res


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_SERVICE_PORT", os.getenv("AI_PORT", 8000)))
    uvicorn.run(app, host="0.0.0.0", port=port)
