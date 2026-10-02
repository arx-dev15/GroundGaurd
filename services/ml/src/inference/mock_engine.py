import re
from typing import List
from src.contracts.requests import EvidenceChunk, VerifyItem
from src.contracts.responses import Scores, VerifyResultItem
from src.config import MODEL_VERSION

class MockInferenceEngine:
    """
    Deterministic mock verification engine for Phase 1.
    Provides realistic classification based on numerical and lexical heuristics.
    """
    def __init__(self, model_version: str = "mock-engine-v1"):
        self.model_version = model_version

    def verify_single(self, claim: str, evidence: List[EvidenceChunk], claim_id: str = "claim_1") -> tuple:
        """
        Verifies a single claim against evidence chunks.
        Returns: (label, Scores, groundingScore)
        """
        # Rule 1: No evidence provided -> Neutral
        if not evidence or all(not chunk.text.strip() for chunk in evidence):
            return (
                "neutral",
                Scores(entailment=0.05, contradiction=0.05, neutral=0.90),
                0.10
            )

        combined_evidence = " ".join(chunk.text for chunk in evidence)
        claim_lower = claim.lower()
        evidence_lower = combined_evidence.lower()

        # Rule 2: Explicit keyword override for integration testing
        if "contradict" in claim_lower:
            return (
                "contradiction",
                Scores(entailment=0.01, contradiction=0.96, neutral=0.03),
                0.01
            )
        if "entail" in claim_lower:
            return (
                "entailment",
                Scores(entailment=0.96, contradiction=0.02, neutral=0.02),
                0.96
            )

        # Rule 3: Numerical Contradiction Check
        # Extracts numbers from claim and evidence
        claim_numbers = set(re.findall(r"\b\d+(?:\.\d+)?\b", claim))
        evidence_numbers = set(re.findall(r"\b\d+(?:\.\d+)?\b", combined_evidence))

        if claim_numbers and not claim_numbers.issubset(evidence_numbers):
            # Claim contains numbers not present in the evidence
            return (
                "contradiction",
                Scores(entailment=0.02, contradiction=0.94, neutral=0.04),
                0.02
            )

        # Rule 4: Lexical Overlap (Entailment)
        claim_words = set(re.findall(r"\w+", claim_lower))
        evidence_words = set(re.findall(r"\w+", evidence_lower))
        
        # Stopwords filter
        stopwords = {"the", "a", "an", "is", "was", "were", "in", "on", "at", "of", "and", "to", "for", "company"}
        meaningful_claim_words = claim_words - stopwords

        if meaningful_claim_words:
            overlap = len(meaningful_claim_words.intersection(evidence_words)) / len(meaningful_claim_words)
            if overlap >= 0.60:
                # 60%+ of the key words are supported
                return (
                    "entailment",
                    Scores(entailment=0.94, contradiction=0.02, neutral=0.04),
                    0.94
                )

        # Rule 5: Fallback to Neutral (Insufficient evidence)
        return (
            "neutral",
            Scores(entailment=0.20, contradiction=0.10, neutral=0.70),
            0.35
        )

    def verify_batch(self, items: List[VerifyItem]) -> List[VerifyResultItem]:
        """
        Batch verification of multiple claims.
        """
        results = []
        for item in items:
            label, scores, grounding_score = self.verify_single(
                claim=item.claim,
                evidence=item.evidence,
                claim_id=item.claimId
            )
            results.append(
                VerifyResultItem(
                    claimId=item.claimId,
                    label=label,
                    scores=scores,
                    groundingScore=grounding_score
                )
            )
        return results

# Singleton instance
mock_engine = MockInferenceEngine()