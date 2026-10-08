"""
GroundGuard Phase 6: Claim Extraction & Evidence Provenance Engine
Decomposes generated answers into atomic factual claims and validates candidate evidence provenance.
Strictly non-verifying: claims start as 'pending' with verification=None.
"""

import re
import json
import logging
from typing import List, Dict, Any, Optional

from src.pipeline.prompts import build_claim_extraction_prompt
from src.pipeline.llm import llm_runtime
from src.pipeline.answerability import is_absence_statement

logger = logging.getLogger("m2-claim-extractor")

class ProvenanceValidationError(Exception):
    """Raised when the LLM extractor references an evidence ID outside the allowed candidate set."""
    pass


class ClaimItemModel:
    """Internal helper representing an extracted claim prior to response assembly."""
    def __init__(
        self,
        claim_id: str,
        text: str,
        ordinal: int,
        status: str = "pending",
        source_text: Optional[str] = None,
        evidence: Optional[List[Any]] = None,
        verification: Optional[Dict[str, Any]] = None
    ):
        self.claim_id = claim_id
        self.text = text
        self.ordinal = ordinal
        self.status = status
        self.source_text = source_text
        self.evidence = evidence or []
        self.verification = verification


def _clean_json_text(text: str) -> str:
    """Strips markdown code fences and extracts raw JSON string."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return text


# A backslash that is not a valid JSON escape (e.g. LaTeX "\(", "\alpha", "\sqrt"), or a valid-looking
# escape that is really a LaTeX command ("\frac" -> form-feed + "rac", "\times" -> tab + "imes",
# "\nabla", "\beta", "\right", "\underline"), must be a literal backslash.
_LATEX_SAFE_ESCAPE_RE = re.compile(r'\\(?:(?=[bfnrt][a-z])|(?=u(?![0-9a-fA-F]{4}))|(?!["\\/bfnrtu]))')


def _repair_json_backslashes(text: str) -> str:
    out, i, in_str = [], 0, False
    while i < len(text):
        ch = text[i]
        if ch == '"':  # escaped quotes inside strings are consumed as pairs below, so this is a delimiter
            in_str = not in_str
            out.append(ch)
            i += 1
            continue
        if in_str and ch == "\\":
            nxt = text[i + 1] if i + 1 < len(text) else ""
            if nxt == "\\" or nxt == '"' or nxt == "/":
                out.append(text[i:i + 2])
                i += 2
                continue
            if _LATEX_SAFE_ESCAPE_RE.match(text, i):
                out.append("\\\\")
                i += 1
                continue
        out.append(ch)
        i += 1
    return "".join(out)


def parse_claims_json(raw_response: str) -> Any:
    """
    Parses extractor output, repairing LaTeX backslashes that break JSON (invalid escapes) or that
    JSON would silently corrupt into control characters. Raises ValueError if still unparseable.
    """
    cleaned = _clean_json_text(raw_response or "")
    repaired = _repair_json_backslashes(cleaned)
    try:
        return json.loads(repaired)
    except json.JSONDecodeError as err:
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            raise ValueError(f"Malformed claim extraction JSON: {err}") from err


_CITE = re.compile(r"\s*\[([^\[\]]{1,160})\]")
# Anything suggesting more than one proposition, a contrast/negated premise, a list, or a dependent subject
# disqualifies the deterministic path (the LLM extractor handles those).
_NOT_ATOMIC = re.compile(
    r"[,;:\n•]|\s-\s|\b(?:and|or|but|while|whereas|which|who|whom|whose|that|also|as well as|both|either|neither|"
    r"not|no|never|without|except|unless|although|however|because|if|then|instead|rather|respectively)\b", re.I)
_PRONOUN_START = re.compile(r"^\s*(?:it|its|they|their|this|that|these|those|he|she|his|her|yes|no|partly)\b", re.I)


def _norm_doc(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\.[a-z0-9]{2,4}$", "", (name or "").strip().lower()))


def deterministic_single_claim(answer: str, evidence: List[Any]) -> Optional[List[Dict[str, Any]]]:
    """
    Provider-free extraction for the narrowest safe case: the whole answer is ONE short declarative sentence
    stating one fact, with citation(s) that resolve to supplied evidence. Then the atomic claim IS that
    sentence (verbatim, citations removed -- numbers, units, tags and modality untouched), mapped to the
    cited evidence. Returns None (=> use the LLM extractor) for anything else. M1 still verifies the claim.
    """
    raw = (answer or "").strip()
    cites = _CITE.findall(raw)
    text = _CITE.sub("", raw).strip()
    text = re.sub(r"\s+([.!?])", r"\1", text)
    if not cites or not text or len(text.split()) > 28 or not text.endswith("."):
        return None
    if re.search(r"[.!?](?=\s+\S)", text[:-1]) or text.count(".") > 1 + len(re.findall(r"\d\.\d", text)):
        return None  # more than one sentence
    if _NOT_ATOMIC.search(text) or _PRONOUN_START.search(text) or is_absence_statement(text):
        return None
    if not re.search(r"\b(?:is|are|was|were|has|have|had|uses|use|operates|runs|measures|connects|carries|"
                     r"requires|provides|supports|contains|includes|rated|located|attached|mounted)\b", text, re.I):
        return None  # no clear single predicate
    mapped, seen = [], set()
    for c in cites:
        doc_part = re.split(r",\s*pp?\.?\s*\d", c, maxsplit=1)[0].strip()
        page_m = re.search(r"pp?\.?\s*(\d+)", c)
        page = int(page_m.group(1)) if page_m else None
        hits = []
        for ev in evidence:
            meta = getattr(ev, "metadata", None) or {}
            names = [meta.get("filename"), meta.get("title"), getattr(ev, "documentId", None)]
            if any(n and _norm_doc(n) == _norm_doc(doc_part) for n in names):
                hits.append(ev)
        if page is not None:
            on_page = [ev for ev in hits if getattr(ev, "pageNumber", None) == page]
            hits = on_page or hits
        if not hits:
            return None  # citation does not resolve to supplied evidence -> let the LLM extractor decide
        for ev in hits:
            cid = getattr(ev, "chunkId", None)
            if cid not in seen:
                seen.add(cid)
                mapped.append(ev)
    return [{
        "claimId": "claim_0",
        "text": text,
        "status": "pending",
        "ordinal": 0,
        "sourceText": raw,
        "verification": None,
        "evidence": mapped,
    }]


async def extract_and_validate_claims(
    answer: str,
    evidence: List[Any],
    stats: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Executes atomic claim extraction and strict candidate provenance validation on the generated answer.

    Invariants:
    1. Only extracts from the provided generated answer (never the query or external facts).
    2. Decomposes facts into atomic propositions; preserves exact identifiers, numbers, signs, units.
    3. Maps claims strictly to supplied candidate evidence blocks via symbolic IDs (EVIDENCE_1, ...).
    4. Fails closed on any invented/unknown evidence reference.
    5. Preserves claims with zero matching evidence (evidenceRefs = []).
    6. Does NOT verify entailment; status is always 'pending' and verification=None.
    """
    if not answer or not answer.strip():
        logger.info("[claim-extractor] Empty answer; skipping extraction")
        return []

    # Check for known refusal / abstention answer
    if "does not contain sufficient evidence" in answer.lower():
        logger.info("[claim-extractor] Abstention answer detected; skipping claim extraction")
        return []

    # Provider-free path for a single, cited, atomic factual sentence (saves one LLM call).
    fast = deterministic_single_claim(answer, evidence)
    if fast is not None:
        if stats is not None:
            stats["method"] = "deterministic_single_fact"
        logger.info("[claim-extractor] Deterministic single-fact extraction (no LLM call)")
        return fast
    if stats is not None:
        stats["method"] = "llm"

    # 1. Establish strict symbolic evidence mappings (EVIDENCE_1, EVIDENCE_2, ...)
    allowed_refs: Dict[str, Any] = {}
    evidence_blocks: list = []

    for idx, item in enumerate(evidence):
        ref_id = f"EVIDENCE_{idx + 1}"
        allowed_refs[ref_id] = item
        chunk_text = getattr(item, "text", "") or (item.get("text", "") if isinstance(item, dict) else str(item))
        evidence_blocks.append((ref_id, chunk_text))

    # 2. Build extraction prompt
    user_prompt = build_claim_extraction_prompt(answer, evidence_blocks)

    # 3. Call RealLLMRuntime with greedy temperature=0.0 and JSON response mode
    raw_response = await llm_runtime.extract_claims(user_prompt)

    # 4. Parse JSON defensively (LaTeX-safe); one bounded retry with an explicit escaping reminder.
    try:
        parsed_data = parse_claims_json(raw_response)
    except ValueError as err:
        logger.warning(f"[claim-extractor] Malformed JSON from LLM ({err}); retrying once | Raw: {raw_response[:300]}")
        retry_prompt = user_prompt + (
            "\n\nYour previous output was not valid JSON. Output ONLY the JSON object. "
            "Escape every backslash inside strings as \\\\ (e.g. \"\\\\frac{a}{b}\")."
        )
        raw_response = await llm_runtime.extract_claims(retry_prompt)
        try:
            parsed_data = parse_claims_json(raw_response)
        except ValueError as err2:
            logger.error(f"[claim-extractor] Malformed JSON after retry: {err2} | Raw: {raw_response[:300]}")
            raise

    if isinstance(parsed_data, list):
        raw_claims = parsed_data
    elif isinstance(parsed_data, dict):
        raw_claims = parsed_data.get("claims", [])
    else:
        raise ValueError("Malformed claim extraction output: expected JSON object or list")

    if not isinstance(raw_claims, list):
        raise ValueError("Malformed claim extraction output: 'claims' field must be an array")

    # 5. Normalize, deduplicate, and validate provenance
    extracted_claims: List[Dict[str, Any]] = []
    seen_normalized_texts = set()
    ordinal_counter = 0

    for raw in raw_claims:
        if not isinstance(raw, dict):
            continue

        claim_text = str(raw.get("claim") or raw.get("text") or "").strip()
        if not claim_text:
            continue
        if is_absence_statement(claim_text):
            # "The documentation does not specify X" is not a factual claim about the subject.
            logger.info(f"[claim-extractor] Dropping absence statement (not a factual claim): '{claim_text}'")
            continue

        # Normalized deduplication (preserves first occurrence, preserves answer order)
        norm_key = " ".join(claim_text.lower().split())
        if norm_key in seen_normalized_texts:
            logger.info(f"[claim-extractor] Skipping duplicate claim: '{claim_text}'")
            continue
        seen_normalized_texts.add(norm_key)

        source_text = str(raw.get("sourceText") or raw.get("answerText") or "").strip() or None

        # Provenance mapping & validation
        raw_refs = raw.get("evidenceRefs")
        if raw_refs is None:
            raw_refs = raw.get("evidence") or []
        if isinstance(raw_refs, str):
            raw_refs = [raw_refs]
        elif not isinstance(raw_refs, list):
            raw_refs = []

        mapped_evidence: List[Any] = []
        seen_chunk_ids = set()

        for ref in raw_refs:
            ref_str = str(ref).strip().upper()
            if not ref_str:
                continue

            if ref_str in allowed_refs:
                ev_item = allowed_refs[ref_str]
                cid = getattr(ev_item, "chunkId", "") or (ev_item.get("chunkId", "") if isinstance(ev_item, dict) else str(ev_item))
                if cid not in seen_chunk_ids:
                    mapped_evidence.append(ev_item)
                    seen_chunk_ids.add(cid)
            else:
                # Section 17 & 41: Fail closed on invented or unknown evidence reference
                logger.error(
                    f"[claim-extractor] FAIL CLOSED: Invalid evidence reference '{ref_str}' "
                    f"for claim '{claim_text}'. Allowed: {list(allowed_refs.keys())}"
                )
                raise ProvenanceValidationError(
                    f"Extraction returned invalid/fabricated evidence reference '{ref_str}'. "
                    f"Allowed references are {list(allowed_refs.keys())}"
                )

        extracted_claims.append({
            "claimId": f"claim_{ordinal_counter}",
            "text": claim_text,
            "status": "pending",
            "ordinal": ordinal_counter,
            "sourceText": source_text,
            "verification": None,
            "evidence": mapped_evidence
        })
        ordinal_counter += 1

    logger.info(
        f"[claim-extractor] Successfully extracted {len(extracted_claims)} atomic claims "
        f"from answer with {len(evidence)} evidence candidates."
    )
    return extracted_claims
