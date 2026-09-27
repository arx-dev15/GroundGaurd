"""
GroundGuard Phase 5: Bounded Evidence Context Builder
Constructs a deterministic, ranked, deduplicated, and budget-bounded evidence context
from Phase-4 retrieval results for grounded LLM generation.
"""

from typing import List, Dict, Any, Tuple
import logging

from src.pipeline.retrieval import EvidenceItem

logger = logging.getLogger("m2-context-builder")

# Conservative character budget: 12,000 characters ≈ 3,000 tokens
DEFAULT_MAX_CONTEXT_CHARS = 12000

class ContextBuilder:
    """
    Builds structured, bounded evidence context for LLM consumption.
    Preserves retrieval ranking, eliminates duplicate chunks, and embeds provenance.
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
            - context_text: Formatted string containing bounded evidence blocks.
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
            # 1. Deduplication by chunkId
            if item.chunkId in seen_chunks:
                continue
            seen_chunks.add(item.chunkId)

            # 2. Format evidence block with explicit provenance
            doc_id = item.documentId or "unknown_doc"
            page_info = f"Page {item.pageNumber}" if item.pageNumber else "Page N/A"
            section_info = f" | Section: {item.section}" if item.section else ""
            heading_info = f" | Heading: {item.heading}" if item.heading else ""
            tags_info = f" | Identifiers: {', '.join(item.identifiers)}" if item.identifiers else ""

            header = f"[Evidence Block {len(included) + 1}] (Document: {doc_id} | {page_info}{section_info}{heading_info}{tags_info})"
            chunk_text = item.text.strip()
            block = f"{header}\n{chunk_text}\n"

            # 3. Budget enforcement
            block_len = len(block)
            if current_chars + block_len <= budget:
                blocks.append(block)
                included.append(item)
                current_chars += block_len
            else:
                omitted.append(item)

        if not blocks:
            context_text = "NO RELEVANT EVIDENCE CHUNKS AVAILABLE."
        else:
            context_text = (
                "=== BEGIN UNTRUSTED EVIDENCE CONTEXT ===\n"
                + "\n".join(blocks)
                + "=== END UNTRUSTED EVIDENCE CONTEXT ==="
            )

        logger.info(
            f"[context-builder] Total items: {len(evidence_items)}, "
            f"Unique included: {len(included)}, Omitted: {len(omitted)}, "
            f"Context length: {len(context_text)} chars"
        )

        return context_text, included, omitted

# Singleton instance
context_builder = ContextBuilder()
