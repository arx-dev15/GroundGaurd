"""
GroundGuard Sentence-Boundary Chunker (src/rag/chunker.py)
Implements Mandate 1: Sentence Boundary Protection with sliding window chunking.
Prevents periods inside currencies ($500, $5,000.00), decimals (15.2), and technical tags
from causing false sentence breaks.
Produces typed EvidenceChunk objects stamped with tenant project_id.
"""

import re
import uuid
from typing import List, Dict, Any, Optional

from src.contracts.events import EvidenceChunk
from src.pipeline.extractor import extract_identifiers

# Sentinel for protected dots
DOT_SENTINEL = "\uE000"

# Common abbreviations whose trailing dots must not break sentences
ABBREVIATIONS = ["e.g", "i.e", "vs", "fig", "dr", "mr", "mrs", "prof", "sec", "ch", "no", "ref", "min", "max", "approx", "dept", "rev", "spec", "tag"]
ABBR_PATTERN = re.compile(rf'\b({"|".join(ABBREVIATIONS)})\.', re.IGNORECASE)

# Distractor & Glossary Detection Patterns
DISTRACTOR_PATTERNS = [
    re.compile(r'(?:\.\s*){4,}|\.{3,}'),   # Dotted leaders: . . . . . or ......
    re.compile(r'(?i)\btable\s+of\s+contents\b'),
    re.compile(r'(?i)\bindex\s+of\s+(?:terms|equipment|symbols)\b'),
    re.compile(r'(?i)\bglossary\s+of\s+terms\b'),
]


def is_distractor_content(text: str) -> bool:
    """
    Detects if text represents a Table of Contents, Index, or Glossary page.
    Prevents TOC entries from hijacking exact matches on high-level equipment tags.
    """
    if not text:
        return False
    for pat in DISTRACTOR_PATTERNS:
        if pat.search(text):
            return True
    return False


def split_into_protected_sentences(text: str) -> List[str]:
    """
    Mandate 1: Splits text into discrete sentences while protecting currency, numbers, and tags.
    Masks non-terminating periods, splits on true boundaries, and restores periods.
    """
    if not text or not text.strip():
        return []

    # Replace single linebreaks inside paragraphs with spaces
    normalized = re.sub(r'(?<!\n)\n(?!\n)', ' ', text).strip()

    # 1. Mask currency decimals: $5,000.00 -> $5,000<DOT>00
    masked = re.sub(r'([$€£¥]\s*\d+(?:,\d{3})*)\.(\d{1,4})', rf'\1{DOT_SENTINEL}\2', normalized)

    # 2. Mask general decimals: 15.2 bar -> 15<DOT>2 bar
    masked = re.sub(r'(\d)\.(\d)', rf'\1{DOT_SENTINEL}\2', masked)

    # 3. Mask technical tags and section identifiers: API 610.1 -> API 610<DOT>1
    masked = re.sub(r'([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)', rf'\1{DOT_SENTINEL}\2', masked)

    # 4. Mask common abbreviations: e.g. -> e.g<DOT>
    masked = ABBR_PATTERN.sub(rf'\1{DOT_SENTINEL}', masked)

    # 5. Split on true sentence terminators followed by whitespace and next sentence start
    raw_sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9"\'$])', masked)

    clean_sentences = []
    for s in raw_sentences:
        # Restore masked periods
        restored = s.replace(DOT_SENTINEL, '.').strip()
        if restored:
            clean_sentences.append(restored)

    return clean_sentences


def chunk_pages_dual_track(
    pages_data: List[Dict[str, Any]],
    project_id: str,
    document_id: str,
    max_sentences: int = 3,
    sentence_overlap: int = 1
) -> List[EvidenceChunk]:
    """
    Sliding window chunking with sentence-boundary protection:
    - Window size: max 3 sentences
    - Overlap: 1 sentence
    - Every chunk is stamped with project_id, document_id, and identifier keys
    - Flags distractor pages (TOC / Glossary) for downstream reranker safety
    """
    if sentence_overlap >= max_sentences:
        raise ValueError(
            f"sentence_overlap ({sentence_overlap}) must be strictly less than max_sentences ({max_sentences})"
        )

    chunks: List[EvidenceChunk] = []
    step = max(1, max_sentences - sentence_overlap)

    for page in pages_data:
        page_num = page.get("page_number", 1)
        page_text = page.get("text", "")

        sentences = split_into_protected_sentences(page_text)
        if not sentences:
            continue

        start = 0
        total_sents = len(sentences)

        while start < total_sents:
            window = sentences[start : start + max_sentences]
            chunk_text = " ".join(window).strip()

            if chunk_text:
                chunk_id = f"chk_{uuid.uuid4().hex[:12]}"
                identifiers = extract_identifiers(chunk_text)
                norm_idents = [i.normalized for i in identifiers]
                distractor = is_distractor_content(chunk_text)

                chunks.append(
                    EvidenceChunk(
                        chunk_id=chunk_id,
                        document_id=document_id,
                        project_id=project_id,
                        text=chunk_text,
                        page_number=page_num,
                        identifiers=norm_idents,
                        is_distractor=distractor,
                        metadata={
                            "sentence_count": len(window),
                            "first_sentence": window[0][:80]
                        }
                    )
                )

            start += step

    return chunks
