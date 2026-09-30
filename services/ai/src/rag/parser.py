"""
GroundGuard Ingestion Parser (src/rag/parser.py)
Extracts raw text from PDF files while preserving numbers, currencies ($500, $5,000), and technical tags.
"""

import io
import re
import logging
from typing import List, Dict, Any
from pypdf import PdfReader

logger = logging.getLogger("rag-parser")


def clean_pdf_text(text: str) -> str:
    """
    Cleans raw PDF text while strictly preserving:
    - Currencies ($500, $5,000.00, €100, £50)
    - Decimals and technical tags (15.2 bar, P-101A, API 610)
    - Punctuation critical for sentence boundary detection
    """
    if not text:
        return ""
    # Remove null bytes and non-printable control characters
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
    # Normalize excessive linebreaks and whitespace without collapsing sentence boundaries
    cleaned = re.sub(r'[ \t]+', ' ', cleaned)
    cleaned = re.sub(r'\n\s*\n+', '\n\n', cleaned)
    return cleaned.strip()


def parse_pdf_document(file_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Parses PDF bytes into structured per-page text dictionaries.
    Fails explicitly if document is corrupt or contains 0 selectable text.
    """
    if not file_bytes:
        raise ValueError("PDF document content is empty (0 bytes)")

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception as e:
        raise ValueError(f"Failed to parse PDF document structure: {e}") from e

    pages_data = []
    unextractable = 0

    for idx, page in enumerate(reader.pages):
        try:
            raw = page.extract_text() or ""
            cleaned = clean_pdf_text(raw)
            if cleaned:
                pages_data.append({
                    "page_number": idx + 1,
                    "text": cleaned
                })
            else:
                unextractable += 1
        except Exception as err:
            logger.warning(f"Failed to extract page {idx + 1}: {err}")
            unextractable += 1

    if len(reader.pages) > 0 and len(pages_data) == 0:
        raise ValueError(
            f"PDF contains {len(reader.pages)} page(s) but zero selectable text could be extracted. "
            f"Scanned image-only PDFs or encrypted documents cannot be indexed without OCR."
        )

    return pages_data
