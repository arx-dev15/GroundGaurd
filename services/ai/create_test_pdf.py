"""
Creates a minimal but valid PDF with extractable text using only the PDF spec directly.
No external dependencies required.
"""

def create_test_pdf(filename: str, text: str) -> None:
    # Build a proper cross-reference PDF with actual text content stream
    content_stream = f"""BT
/F1 12 Tf
72 720 Td
({text}) Tj
ET"""
    content_bytes = content_stream.encode('latin-1')
    content_length = len(content_bytes)

    objects = []

    # Obj 1: Catalog
    objects.append(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    # Obj 2: Pages
    objects.append(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
    # Obj 3: Page with font and content ref
    objects.append(
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
    )
    # Obj 4: Content stream
    content_obj = (
        f"4 0 obj\n<< /Length {content_length} >>\nstream\n".encode('latin-1')
        + content_bytes
        + b"\nendstream\nendobj\n"
    )
    objects.append(content_obj)
    # Obj 5: Font
    objects.append(
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    )

    # Build file body
    header = b"%PDF-1.4\n"
    body = b""
    offsets = []
    pos = len(header)
    for obj in objects:
        offsets.append(pos)
        body += obj
        pos += len(obj)

    # Cross-reference table
    xref_offset = len(header) + len(body)
    xref = f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    for off in offsets:
        xref += f"{off:010d} 00000 n \n"

    trailer = (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n"
    )

    with open(filename, 'wb') as f:
        f.write(header + body + xref.encode('latin-1') + trailer.encode('latin-1'))

    print(f"PDF written to {filename}")


if __name__ == "__main__":
    create_test_pdf(
        "test_gg.pdf",
        "GroundGuard Phase 3 Real Runtime Validation Test Document. "
        "This text will be parsed by pypdf chunked by the deterministic chunker "
        "and embedded by all-MiniLM-L6-v2 sentence-transformers model."
    )

    # Immediately verify extraction with pypdf
    import pypdf, io
    with open("test_gg.pdf", "rb") as f:
        pdf = pypdf.PdfReader(f)
        text = pdf.pages[0].extract_text()
        print(f"pypdf extracted ({len(pdf.pages)} page(s)): {repr(text)}")
