"""
GroundGuard Phase 3 Runtime Validation
Tests M2 pipeline stages (parse, chunk, embed) using a real PDF with extractable text.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.pipeline.parser import parse_pdf
from src.pipeline.chunker import chunk_pages
from src.pipeline.embedder import generate_embeddings

# Load real PDF (created by create_test_pdf.py)
with open("test_gg.pdf", "rb") as f:
    SAMPLE_PDF = f.read()

print("=== M2 Pipeline Stage Validation ===")
print(f"PDF bytes loaded: {len(SAMPLE_PDF)}")

# Stage 1: Parse
pages = parse_pdf(SAMPLE_PDF)
print(f"[PARSE] Pages extracted: {len(pages)}")
if pages:
    print(f"[PARSE] Page 1 text preview: {pages[0].get('text', '')[:80]!r}")
    print(f"[PARSE] Page 1 page_number: {pages[0].get('page_number')}")

# Stage 2: Chunk
chunks = chunk_pages(pages)
print(f"[CHUNK] Chunks generated: {len(chunks)}")
if chunks:
    print(f"[CHUNK] Chunk 0 text: {chunks[0].get('text', '')[:80]!r}")
    print(f"[CHUNK] Chunk 0 id prefix: {chunks[0].get('id', '')[:8]}")
    print(f"[CHUNK] Chunk 0 chunk_index: {chunks[0].get('chunk_index')}")

# Stage 3: Embed
texts = [c["text"] for c in chunks]
embeddings = generate_embeddings(texts)
print(f"[EMBED] Embeddings generated: {len(embeddings)}")
if embeddings:
    print(f"[EMBED] Embedding 0 dimension: {len(embeddings[0])}")
    print(f"[EMBED] Embedding 0 first 3 values: {embeddings[0][:3]}")

print("\n=== RESULT ===")
if len(pages) > 0 and len(chunks) > 0 and len(embeddings) > 0 and len(embeddings[0]) == 384:
    print("PASS: parse -> chunk -> embed pipeline produces 384-dimensional vectors")
else:
    print("FAIL: pipeline incomplete")
    sys.exit(1)
