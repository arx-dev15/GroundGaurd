import os
import uuid
from typing import List, Dict, Any

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))

def chunk_pages(pages_data: List[Dict[str, Any]], chunk_size: int = CHUNK_SIZE, chunk_overlap: int = CHUNK_OVERLAP) -> List[Dict[str, Any]]:
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
                chunks.append({
                    "id": chunk_id,
                    "chunk_index": chunk_index,
                    "page_number": page_number,
                    "text": chunk_text
                })
                chunk_index += 1

            if end >= text_length:
                break
            start += (chunk_size - chunk_overlap)

    return chunks
