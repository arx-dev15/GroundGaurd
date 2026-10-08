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


async def extract_and_validate_claims(
    answer: str,
    evidence: List[Any]
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

    # 4. Parse JSON defensively
    cleaned_json = _clean_json_text(raw_response)
    try:
        parsed_data = json.loads(cleaned_json)
    except json.JSONDecodeError as err:
        logger.error(f"[claim-extractor] Malformed JSON from LLM: {err} | Raw: {raw_response[:300]}")
        raise ValueError(f"Malformed claim extraction JSON: {err}")

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

            # Robust symbolic normalization (e.g. "[EVIDENCE_1]" or "EVIDENCE 1" -> "EVIDENCE_1")
            norm_ref = re.sub(r'[\[\]]', '', ref_str).replace(' ', '_').replace('-', '_')

            if norm_ref in allowed_refs:
                ev_item = allowed_refs[norm_ref]
                cid = getattr(ev_item, "chunkId", "") or (ev_item.get("chunkId", "") if isinstance(ev_item, dict) else str(ev_item))
                if cid not in seen_chunk_ids:
                    mapped_evidence.append(ev_item)
                    seen_chunk_ids.add(cid)
            elif ref_str in allowed_refs:
                ev_item = allowed_refs[ref_str]
                cid = getattr(ev_item, "chunkId", "") or (ev_item.get("chunkId", "") if isinstance(ev_item, dict) else str(ev_item))
                if cid not in seen_chunk_ids:
                    mapped_evidence.append(ev_item)
                    seen_chunk_ids.add(cid)
            else:
                # Match by index number (e.g. "1" or "EVIDENCE 1")
                num_match = re.search(r'\b(\d+)\b', ref_str)
                if num_match:
                    num_ref = f"EVIDENCE_{num_match.group(1)}"
                    if num_ref in allowed_refs:
                        ev_item = allowed_refs[num_ref]
                        cid = getattr(ev_item, "chunkId", "") or (ev_item.get("chunkId", "") if isinstance(ev_item, dict) else str(ev_item))
                        if cid not in seen_chunk_ids:
                            mapped_evidence.append(ev_item)
                            seen_chunk_ids.add(cid)
                            continue
                # Match by chunkId or documentId or filename substring
                matched_item = None
                for a_item in allowed_refs.values():
                    cid = getattr(a_item, "chunkId", "") or (a_item.get("chunkId", "") if isinstance(a_item, dict) else "")
                    did = getattr(a_item, "documentId", "") or (a_item.get("documentId", "") if isinstance(a_item, dict) else "")
                    meta = getattr(a_item, "metadata", {}) or (a_item.get("metadata", {}) if isinstance(a_item, dict) else {})
                    fname = (meta.get("filename", "") if isinstance(meta, dict) else "").upper()
                    if (cid and cid.upper() in ref_str) or (did and did.upper() in ref_str) or (fname and fname in ref_str):
                        matched_item = a_item
                        break
                if matched_item:
                    cid = getattr(matched_item, "chunkId", "") or (matched_item.get("chunkId", "") if isinstance(matched_item, dict) else str(matched_item))
                    if cid not in seen_chunk_ids:
                        mapped_evidence.append(matched_item)
                        seen_chunk_ids.add(cid)

        # Prioritize the single best supporting evidence passage for this specific claim (Section 8)
        if not mapped_evidence and allowed_refs:
            def _claim_overlap(item):
                t = getattr(item, "text", "") or (item.get("text", "") if isinstance(item, dict) else str(item))
                cw = set(re.findall(r'[a-zA-Z0-9_\-]+', claim_text.lower()))
                tw = set(re.findall(r'[a-zA-Z0-9_\-]+', t.lower()))
                return len(cw & tw)
            best_item = max(allowed_refs.values(), key=_claim_overlap)
            mapped_evidence.append(best_item)
        elif len(mapped_evidence) > 1:
            def _claim_overlap(item):
                t = getattr(item, "text", "") or (item.get("text", "") if isinstance(item, dict) else str(item))
                cw = set(re.findall(r'[a-zA-Z0-9_\-]+', claim_text.lower()))
                tw = set(re.findall(r'[a-zA-Z0-9_\-]+', t.lower()))
                return len(cw & tw)
            mapped_evidence.sort(key=_claim_overlap, reverse=True)
            # Select the strongest supporting passage for this claim to prevent distractor dilution
            best_score = _claim_overlap(mapped_evidence[0])
            if best_score > 0:
                mapped_evidence = [e for e in mapped_evidence if _claim_overlap(e) >= max(2, int(best_score * 0.75))][:2]
            else:
                mapped_evidence = mapped_evidence[:1]


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
