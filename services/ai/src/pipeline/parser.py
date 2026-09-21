import io
import re
from typing import List, Dict, Any
from pypdf import PdfReader

def clean_text(text: str) -> str:
    if not text:
        return ""
    # Remove null bytes and non-printable control characters
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
    # Normalize excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def parse_pdf(file_bytes: bytes) -> List[Dict[str, Any]]:
    if not file_bytes:
        raise ValueError("PDF content is empty")

    reader = PdfReader(io.BytesIO(file_bytes))
    pages_data = []

    for index, page in enumerate(reader.pages):
        raw_text = page.extract_text() or ""
        cleaned = clean_text(raw_text)
        if cleaned:
            pages_data.append({
                "page_number": index + 1,
                "text": cleaned
            })

    return pages_data
