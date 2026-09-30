import os
import re
import uuid
from typing import List, Dict, Any, Optional, Tuple
from src.pipeline.extractor import extract_identifiers, get_identifier_keys

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))

# Validate chunk configuration at module import time
if CHUNK_SIZE <= 0:
    raise ValueError(
        f"FATAL: CHUNK_SIZE must be a positive integer, got {CHUNK_SIZE}. "
        f"Check the CHUNK_SIZE environment variable."
    )
if CHUNK_OVERLAP < 0:
    raise ValueError(
        f"FATAL: CHUNK_OVERLAP must be >= 0, got {CHUNK_OVERLAP}. "
        f"Check the CHUNK_OVERLAP environment variable."
    )
if CHUNK_OVERLAP >= CHUNK_SIZE:
    raise ValueError(
        f"FATAL: CHUNK_OVERLAP ({CHUNK_OVERLAP}) must be strictly less than "
        f"CHUNK_SIZE ({CHUNK_SIZE}). "
        f"Fix CHUNK_OVERLAP or CHUNK_SIZE environment variables."
    )

# Sentinel for protected dots in sentence boundary splitting
DOT_SENTINEL = "\uE000"

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
    Splits text into discrete sentences while protecting currency, numbers, and tags.
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
        restored = s.replace(DOT_SENTINEL, '.').strip()
        if restored:
            clean_sentences.append(restored)

    return clean_sentences


HEADING_REGEX = re.compile(
    r'^(?:(?:Section|Chapter|Article|Appendix|\d+\.|\d+\.\d+)\s+([^\n\r]+)|([A-Z0-9\s-]{4,50}))(?:\n|$)',
    re.MULTILINE
)


def extract_heading_and_section(text: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Extracts heading and section from text only if genuinely present.
    Does not fabricate metadata or overmatch standard sentences.
    """
    match = HEADING_REGEX.search(text)
    if match:
        heading_text = (match.group(1) or match.group(2) or "").strip()
        if not heading_text:
            return None, None
        section_match = re.match(r'^(?:Section\s+)?(\d+(?:\.\d+)*)', heading_text, re.IGNORECASE)
        section = section_match.group(1) if section_match else None
        return section, heading_text[:100]
    return None, None


def chunk_pages(
    pages_data: List[Dict[str, Any]],
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP
) -> List[Dict[str, Any]]:
    """
    Splits pages into overlapping text chunks enriched with structured lineage
    and normalized identifiers. Validates chunk parameters against invalid configs.
    """
    if chunk_size <= 0:
        raise ValueError(f"chunk_size must be positive, got {chunk_size}")
    if chunk_overlap < 0:
        raise ValueError(f"chunk_overlap must be >= 0, got {chunk_overlap}")
    if chunk_overlap >= chunk_size:
        raise ValueError(
            f"chunk_overlap ({chunk_overlap}) must be strictly less than "
            f"chunk_size ({chunk_size})"
        )

    step = chunk_size - chunk_overlap
    chunks = []
    chunk_index = 0

    for page in pages_data:
        page_number = page["page_number"]
        text = page["text"]

        if not text:
            continue

        start = 0
        text_length = len(text)

        while start < text_length:
            end = min(start + chunk_size, text_length)
            chunk_text = text[start:end].strip()

            if chunk_text:
                chunk_id = f"chk_{uuid.uuid4().hex[:12]}"
                section, heading = extract_heading_and_section(chunk_text)
                identifiers = extract_identifiers(chunk_text)
                identifier_keys = get_identifier_keys(identifiers)

                chunks.append({
                    "id": chunk_id,
                    "chunk_index": chunk_index,
                    "page_number": page_number,
                    "text": chunk_text,
                    "section": section,
                    "heading": heading,
                    "identifiers": [i.model_dump() for i in identifiers],
                    "identifierKeys": identifier_keys
                })
                chunk_index += 1

            if end >= text_length:
                break
            start += step

    return chunks
