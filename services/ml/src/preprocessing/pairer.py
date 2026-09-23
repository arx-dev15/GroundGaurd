import re
from typing import List, Tuple
from src.contracts.requests import EvidenceChunk

class TextPairer:
    """
    Preprocesses evidence chunks and claims into clean input pairs
    formatted for transformer cross-encoder tokenization.
    """

    @staticmethod
    def clean_text(text: str) -> str:
        """Normalizes unicode characters, whitespace, and formatting."""
        if not text:
            return ""
        # Normalize whitespace (replace multiple spaces/newlines with single space)
        text = re.sub(r"\s+", " ", text.strip())
        # Replace fancy typographic quotes with standard ascii quotes
        text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
        return text

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