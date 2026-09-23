import re
from typing import List, Dict, Any, Tuple
from pydantic import BaseModel

# Regular expression patterns for industrial tags, line codes, and standards
EQUIPMENT_TAG_REGEX = re.compile(r'\b[A-Z]{1,3}-\d{2,4}[A-Z]?\b')
LINE_NUMBER_REGEX = re.compile(r'\b\d{2,4}-[A-Z]{2,4}-\d{2,4}\b')
STANDARD_CODE_REGEX = re.compile(r'\b(API|ASME|ISO|ANSI)\s+\d{3,5}[A-Z]?\b', re.IGNORECASE)

class Identifier(BaseModel):
    value: str        # Original detected string: e.g. "p-101a" or "P-101A"
    normalized: str   # Normalized standard token: e.g. "P-101A"
    type: str         # "equipment_tag" | "line_id" | "standard_code"

def extract_identifiers(text: str) -> List[Identifier]:
    """
    Extracts and normalizes technical codes, equipment tags, line IDs, and standards.
    Preserves original token while returning a deterministic normalized form.
    """
    if not text:
        return []

    identifiers: List[Identifier] = []
    seen = set()

    # 1. Equipment Tags (e.g., P-101A, V-204, TK-500, E-102B)
    for match in EQUIPMENT_TAG_REGEX.finditer(text):
        token = match.group(0)
        norm = token.upper()
        if norm not in seen:
            seen.add(norm)
            identifiers.append(Identifier(value=token, normalized=norm, type="equipment_tag"))

    # 2. Piping Line IDs (e.g., 100-CW-024, 50-ST-001)
    for match in LINE_NUMBER_REGEX.finditer(text):
        token = match.group(0)
        norm = token.upper()
        if norm not in seen:
            seen.add(norm)
            identifiers.append(Identifier(value=token, normalized=norm, type="line_id"))

    # 3. Standards and Codes (e.g., API 610, ASME B16.5)
    for match in STANDARD_CODE_REGEX.finditer(text):
        token = match.group(0)
        parts = token.upper().split()
        norm = " ".join(parts)
        if norm not in seen:
            seen.add(norm)
            identifiers.append(Identifier(value=token, normalized=norm, type="standard_code"))

    return identifiers

def get_identifier_keys(identifiers: List[Identifier]) -> List[str]:
    """
    Returns flattened list of normalized identifier strings for indexing.
    Example: ["P-101A", "V-204"]
    """
    return [i.normalized for i in identifiers]
