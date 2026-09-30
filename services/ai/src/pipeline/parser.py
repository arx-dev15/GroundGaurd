import io
import re
import logging
from typing import List, Dict, Any
from pypdf import PdfReader

logger = logging.getLogger("m2-parser")


def clean_text(text: str) -> str:
    if not text:
        return ""
    # Remove null bytes and non-printable control characters
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
    # Normalize excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def parse_pdf(file_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Extracts text from PDF bytes page by page.
    
    Invariants:
    - Raises ValueError on empty bytes or corrupt file.
    - Warns on unextractable pages.
    - Raises ValueError if PDF contains pages but zero text was extractable
      (scanned image PDFs without OCR layer).
    """
    if not file_bytes:
        raise ValueError("PDF content is empty (0 bytes received)")

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception as e:
        raise ValueError(f"Failed to parse PDF file structure: {e}") from e

    pages_data = []
    unextractable_count = 0

    for index, page in enumerate(reader.pages):
        try:
            raw_text = page.extract_text() or ""
            cleaned = clean_text(raw_text)
            if cleaned:
                pages_data.append({
                    "page_number": index + 1,
                    "text": cleaned
                })
            else:
                unextractable_count += 1
        except Exception as page_err:
            logger.warning(f"Error extracting text from page {index + 1}: {page_err}")
            unextractable_count += 1

    if unextractable_count > 0:
        logger.info(
            f"PDF parsed: {len(pages_data)} page(s) with text, "
            f"{unextractable_count} page(s) had no selectable text."
        )

    if len(reader.pages) > 0 and len(pages_data) == 0:
        raise ValueError(
            f"PDF contains {len(reader.pages)} page(s) but no readable text could be extracted. "
            f"Scanned image-only PDFs or encrypted documents without selectable text cannot be indexed."
        )

    return pages_data
