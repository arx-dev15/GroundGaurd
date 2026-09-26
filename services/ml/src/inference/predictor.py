import logging
from typing import List, Tuple, Optional
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModelForSequenceClassification

from src.contracts.requests import EvidenceChunk, VerifyItem
from src.contracts.responses import Scores, VerifyResultItem
from src.preprocessing.pairer import text_pairer
from src.inference.calibrator import calibrator
from src.config import MODEL_VERSION, MODEL_NAME

logger = logging.getLogger("groundguard-predictor")

DEFAULT_MODEL_NAME = MODEL_NAME

class DebertaGroundingPredictor:
    """
    Production transformer cross-encoder inference engine.
    Performs chunk-wise NLI verification with asymmetric multi-evidence aggregation.
    """
    def __init__(self, model_name_or_path: str = DEFAULT_MODEL_NAME):
        self.model_name = model_name_or_path
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = None
        self.model = None
        self.id2label = {}
        self.is_loaded = False

    def load_model(self):
        """Loads tokenizer and neural network weights into memory."""
        if self.is_loaded:
            return

        logger.info(f"Loading transformer model '{self.model_name}' on device '{self.device}'...")
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
            self.model.to(self.device)
            self.model.eval()  # Set to inference mode (disables dropout)

            # Extract label mapping from model config
            raw_id2label = self.model.config.id2label
            self.id2label = {idx: label.lower() for idx, label in raw_id2label.items()}
            logger.info(f"Model loaded successfully! Label mapping: {self.id2label}")
            self.is_loaded = True
        except Exception as e:
            logger.error(f"Failed to load model '{self.model_name}': {e}", exc_info=True)
            raise e

    def _infer_pair(self, evidence_text: str, claim_text: str) -> dict:
        """
        Runs a single [Evidence, Claim] pair through the Cross-Encoder.
        Returns: { 'contradiction': float, 'entailment': float, 'neutral': float }
        """
        # Tokenize pair: [CLS] Evidence [SEP] Claim [SEP]
        inputs = self.tokenizer(
            evidence_text,
            claim_text,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt"
        ).to(self.device)

        # Forward pass without gradients (faster & uses less RAM)
        with torch.no_grad():
            outputs = self.model(**inputs)
            logits = outputs.logits  # Shape: [1, 3]
            prob_dict = calibrator.calibrate_logits(logits, self.id2label)

        return prob_dict

    def verify_single(self, claim: str, evidence: List[EvidenceChunk], claim_id: str = "claim_1") -> Tuple[str, Scores, float]:
        """
        Verifies a claim against multiple evidence chunks using Asymmetric Truth Aggregation.
        Returns: (label, Scores, groundingScore)
        """
        if not self.is_loaded:
            self.load_model()

        # Step 1: Preprocess and clean pairs
        pairs = text_pairer.prepare_pairs(claim, evidence)

        # Rule 1: No evidence chunks provided -> Neutral (insufficient evidence)
        if not pairs:
            return (
                "neutral",
                Scores(entailment=0.05, contradiction=0.05, neutral=0.90),
                0.10
            )

        # Step 2: Infer across each chunk independently
        chunk_results = []
        for evidence_text, claim_text, chunk_id in pairs:
            chunk_probs = self._infer_pair(evidence_text, claim_text)
            chunk_results.append(chunk_probs)

        # Step 3: Asymmetric Truth Aggregation
        # 1. Contradiction takes precedence (max risk across all chunks)
        max_contradiction = max(res["contradiction"] for res in chunk_results)
        
        # 2. Entailment needs at least one strong anchor (discounted by contradiction risk)
        max_entailment_raw = max(res["entailment"] for res in chunk_results)
        final_entailment = (1.0 - max_contradiction) * max_entailment_raw

        # 3. Neutral is the remainder
        final_neutral = max(0.0, 1.0 - (max_contradiction + final_entailment))

        # Normalize to ensure sum is exactly 1.0
        total = max_contradiction + final_entailment + final_neutral
        p_contra = round(max_contradiction / total, 4)
        p_entail = round(final_entailment / total, 4)
        p_neutral = round(final_neutral / total, 4)

        # Calculate calibrated Grounding Score via Calibrator
        grounding_score = calibrator.compute_grounding_score(p_entail, p_contra)

        # Decision Boundary via Calibrator Policy
        label = calibrator.apply_decision_policy(p_contra, p_entail, grounding_score)

        scores = Scores(
            entailment=p_entail,
            contradiction=p_contra,
            neutral=p_neutral
        )

        return label, scores, grounding_score

    def verify_batch(self, items: List[VerifyItem]) -> List[VerifyResultItem]:
        """Verifies multiple claims in a batch."""
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

# Singleton neural predictor instance
neural_predictor = DebertaGroundingPredictor()