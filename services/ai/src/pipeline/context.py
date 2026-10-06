"""
GroundGuard Phase 5: Bounded Evidence Context Builder & Injection Sanitizer
Constructs a deterministic, ranked, deduplicated, and budget-bounded evidence context
from Phase-4 retrieval results for grounded LLM generation.
"""

import re
import logging
from typing import List, Dict, Any, Tuple

from src.pipeline.retrieval import EvidenceItem

logger = logging.getLogger("m2-context-builder")

# Conservative character budget: 12,000 characters ≈ 3,000 tokens
DEFAULT_MAX_CONTEXT_CHARS = 12000

# Prompt Injection Sanitization Patterns (passive data isolation)
INJECTION_PATTERNS = [
    re.compile(r'(?i)ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions'),
    re.compile(r'(?i)disregard\s+(?:all\s+)?(?:previous|prior)\s+instructions'),
    re.compile(r'(?i)you\s+are\s+now\s+(?:a|an|the)\b'),
    re.compile(r'(?i)system\s*:\s*you\s+must'),
    re.compile(r'(?i)<\s*(?:system|script|admin|eval|exec)\b[^>]*>'),
    re.compile(r'(?i)new\s+operating\s+rules?\s*:'),
    re.compile(r'(?i)override\s+(?:all\s+)?directives?'),
    re.compile(r'(?i)reveal\s+(?:all\s+)?(?:system\s+prompts?|instructions?)'),
]


def sanitize_evidence_text(raw_text: str) -> str:
    """
    Sanitizes raw chunk text against prompt injection exploits.
    Neutralizes jailbreak phrases into passive strings while preserving technical numbers,
    units, equipment identifiers, and factual content.
    """
    if not raw_text:
        return ""

    sanitized = raw_text
    for pattern in INJECTION_PATTERNS:
        if pattern.search(sanitized):
            logger.warning("[injection-sanitizer] Neutralized potential prompt injection string in evidence block.")
            sanitized = pattern.sub("[REDACTED_POTENTIAL_INJECTION]", sanitized)

    return sanitized.strip()


class ContextBuilder:
    """
    Builds structured, bounded, injection-sanitized evidence context for LLM consumption.
    Preserves retrieval ranking, eliminates duplicate chunks, and embeds provenance.
    Encloses context within <untrusted_evidence> tags.
    """
    def __init__(self, max_chars: int = DEFAULT_MAX_CONTEXT_CHARS):
        self.max_chars = max_chars

    def build_context(
        self,
        evidence_items: List[EvidenceItem],
        max_chars: int = None
    ) -> Tuple[str, List[EvidenceItem], List[EvidenceItem]]:
        """
        Processes ranked EvidenceItem candidates into a single delimited context string.
        Returns:
            - context_text: Formatted string wrapped in <untrusted_evidence> tags.
            - included_items: Evidence items included within the budget.
            - omitted_items: Evidence items omitted due to budget constraints.
        """
        budget = max_chars or self.max_chars
        included: List[EvidenceItem] = []
        omitted: List[EvidenceItem] = []
        seen_chunks = set()

        blocks = []
        current_chars = 0

        for idx, item in enumerate(evidence_items):
            cid = getattr(item, "chunk_id", None) or getattr(item, "chunkId", None) or str(idx)
            # 1. Deduplication by chunkId
            if cid in seen_chunks:
                continue
            seen_chunks.add(cid)

            # 2. Sanitize against prompt injection
            clean_chunk_text = sanitize_evidence_text(getattr(item, "text", ""))

            # 3. Format evidence block with explicit provenance (human-readable source name preferred)
            doc_id = getattr(item, "document_id", None) or getattr(item, "documentId", None) or "unknown_doc"
            item_meta = getattr(item, "metadata", {}) or {}
            display_name = item_meta.get("filename") or item_meta.get("title") or doc_id
            page_no = getattr(item, "page_number", None) or getattr(item, "pageNumber", None)
            page_info = f"Page {page_no}" if page_no else "Page N/A"
            section = getattr(item, "section", None)
            heading = getattr(item, "heading", None)
            identifiers = getattr(item, "identifiers", [])
            section_info = f" | Section: {section}" if section else ""
            heading_info = f" | Heading: {heading}" if heading else ""
            tags_info = f" | Identifiers: {', '.join(identifiers)}" if identifiers else ""

            header = f"[Evidence Block {len(included) + 1}] (Document: {display_name} | {page_info}{section_info}{heading_info}{tags_info})"
            block = f"{header}\n{clean_chunk_text}\n"

            # 4. Budget enforcement
            block_len = len(block)
            if current_chars + block_len <= budget:
                blocks.append(block)
                included.append(item)
                current_chars += block_len
            else:
                omitted.append(item)

        if not blocks:
            context_text = "<untrusted_evidence>\nNO RELEVANT EVIDENCE CHUNKS AVAILABLE.\n</untrusted_evidence>"
        else:
            context_text = (
                "<untrusted_evidence>\n"
                "=== BEGIN UNTRUSTED EVIDENCE CONTEXT ===\n"
                + "\n".join(blocks)
                + "=== END UNTRUSTED EVIDENCE CONTEXT ===\n"
                "</untrusted_evidence>"
            )

        logger.info(
            f"[context-builder] Total items: {len(evidence_items)}, "
            f"Unique included: {len(included)}, Omitted: {len(omitted)}, "
            f"Context length: {len(context_text)} chars"
        )

        return context_text, included, omitted


# Singleton instance
context_builder = ContextBuilder()
