import os
import re
import uuid
from typing import List, Dict, Any, Optional, Tuple
from src.pipeline.extractor import extract_identifiers, get_identifier_keys

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))

# Spec: CHUNK_OVERLAP must be < CHUNK_SIZE and must fail explicitly.
# Validate at import time so misconfiguration is caught at service startup.
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
    and normalized identifiers.

    Parameters validated at module import time (see top-of-file guards).
    Additional runtime guard in case called with explicit overrides.
    """
    # Runtime parameter guard (covers direct calls with overridden values).
    if chunk_size <= 0:
        raise ValueError(f"chunk_size must be positive, got {chunk_size}")
    if chunk_overlap < 0:
        raise ValueError(f"chunk_overlap must be >= 0, got {chunk_overlap}")
    if chunk_overlap >= chunk_size:
        raise ValueError(
            f"chunk_overlap ({chunk_overlap}) must be strictly less than "
            f"chunk_size ({chunk_size})"
        )

    chunks = []
    chunk_index = 0
    step = chunk_size - chunk_overlap  # Always >= 1 due to above guards.

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
