import os
import re
import uuid
from typing import List, Dict, Any, Optional, Tuple
from src.pipeline.extractor import extract_identifiers, get_identifier_keys

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))

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
        # Check if heading has section prefix like "Section 2" or "2.1"
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
    and normalized identifiers. Validates chunk parameters against infinite iteration.
    """
    chunks = []
    chunk_index = 0

    # Guard against invalid or pathological chunk_overlap configurations
    if chunk_overlap >= chunk_size:
        chunk_overlap = max(0, chunk_size // 10)
    step = max(1, chunk_size - chunk_overlap)

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
