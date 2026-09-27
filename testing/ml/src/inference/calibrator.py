import torch
import torch.nn.functional as F
from typing import Dict, Tuple

class GroundingCalibrator:
    """
    Calibrates model logits using Temperature Scaling and applies
    the formal GroundGuard Decision Policy.
    """
    def __init__(self, temperature: float = 1.25):
        self.temperature = temperature
        # Operating Decision Thresholds
        self.contradiction_threshold = 0.35
        self.entailment_threshold = 0.65

    def calibrate_logits(self, logits: torch.Tensor, id2label: Dict[int, str]) -> Dict[str, float]:
        """
        Applies temperature scaling to raw logits and returns calibrated probabilities.
        """
        # Temperature Scaling
        scaled_logits = logits / self.temperature
        probabilities = F.softmax(scaled_logits, dim=-1).squeeze(0).tolist()

        prob_dict = {"contradiction": 0.0, "entailment": 0.0, "neutral": 0.0}
        for idx, prob in enumerate(probabilities):
            label_name = id2label.get(idx, "neutral").lower()
            prob_dict[label_name] = float(prob)

        return prob_dict

    def compute_grounding_score(self, p_entailment: float, p_contradiction: float) -> float:
        """
        Calculates the composite factual confidence score:
        groundingScore = P(Entailment) * (1 - P(Contradiction))
        """
        score = p_entailment * (1.0 - p_contradiction)
        return round(max(0.0, min(1.0, score)), 4)

    def apply_decision_policy(self, p_contra: float, p_entail: float, grounding_score: float) -> str:
        """
        Applies verified decision boundaries:
        - Contradiction takes precedence for AI safety
        - Entailment requires groundingScore >= 0.65
        - Neutral represents lack of sufficient proof
        """
        if p_contra >= self.contradiction_threshold:
            return "contradiction"
        elif grounding_score >= self.entailment_threshold and p_entail >= 0.55:
            return "entailment"
        else:
            return "neutral"

# Singleton calibrator instance
calibrator = GroundingCalibrator()