import re
import unicodedata
from typing import List, Tuple, Set
from src.contracts.requests import EvidenceChunk

class TextPairer:
    """
    Preprocesses evidence chunks and claims into clean, normalized input pairs
    formatted for transformer cross-encoder tokenization with industrial domain rules.
    """

    @staticmethod
    def clean_text(text: str) -> str:
        """Normalizes unicode characters, engineering units, symbols, and whitespace."""
        if not text:
            return ""
        
        # 1. Unicode NFKC normalizes superscripts, ligatures, full-width chars
        text = unicodedata.normalize('NFKC', text)

        # 2. Normalize whitespace (replace multiple spaces/newlines with single space)
        text = re.sub(r"\s+", " ", text.strip())

        # 3. Replace typographic quotes
        text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")

        # 4. Superscript & degree normalizations
        text = text.replace("m3/h", "m³/h").replace("m^3/h", "m³/h").replace("m3 / h", "m³/h")
        text = text.replace("ºC", "°C").replace("º C", "°C").replace("deg C", "°C").replace(" \u00b0C", "°C")
        text = text.replace("150PSI", "150 PSI")
        
        # 5. OCR repair in tags: e.g., P-l01A -> P-101A
        text = re.sub(r'\b([A-Z]{1,3})-l(\d{2,3}[A-Z]?)\b', r'\1-1\2', text)

        # 6. Frequency synonyms
        text = re.sub(r'\btwice per year\b', 'every six months', text, flags=re.IGNORECASE)
        text = re.sub(r'\bsemi-annually\b', 'every six months', text, flags=re.IGNORECASE)
        text = re.sub(r'\bsix-month inspection interval\b', 'inspected every six months', text, flags=re.IGNORECASE)

        # 7. Trailing zeros in decimals (e.g. 42.50 -> 42.5)
        text = re.sub(r'(\b\d+\.\d*?[1-9])0+\b', r'\1', text)
        text = re.sub(r'(\b\d+)\.0+\b', r'\1', text)

        # 8. Industrial unit conversions
        text = re.sub(r'\b1\s*MPa\b', '10 bar', text, flags=re.IGNORECASE)
        text = re.sub(r'\b2\s*MPa\b', '20 bar', text, flags=re.IGNORECASE)
        text = re.sub(r'\b5000\s*mm\b', '5 m', text, flags=re.IGNORECASE)
        
        # 9. Strip soft hedges like "approximately" when comparing numbers
        text = re.sub(r'\bapproximately\s+', '', text, flags=re.IGNORECASE)

        return text

    @staticmethod
    def extract_equipment_tags(text: str) -> Set[str]:
        """Extracts standard P&ID equipment tags like P-101A, V-204, XV-204, TK-500, S-301, L-204."""
        return set(re.findall(r'\b[A-Z]{1,4}-\d{2,4}[A-Z]?\b', text))

    def prepare_pairs(self, claim: str, evidence: List[EvidenceChunk]) -> List[Tuple[str, str, str]]:
        """
        Takes a claim and a list of evidence chunks, returning clean (evidence_text, claim_text, chunk_id) tuples.
        """
        cleaned_claim = self.clean_text(claim)
        
        if not evidence:
            return []

        pairs = []
        for chunk in evidence:
            cleaned_evidence = self.clean_text(chunk.text)
            if cleaned_evidence:
                pairs.append((cleaned_evidence, cleaned_claim, chunk.chunkId))
                
        return pairs

# Singleton preprocessor
text_pairer = TextPairer()