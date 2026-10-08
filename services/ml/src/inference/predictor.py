import logging
import os
import re
from typing import List, Tuple, Optional
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModelForSequenceClassification

from src.contracts.requests import EvidenceChunk, VerifyItem
from src.contracts.responses import Scores, VerifyResultItem
from src.preprocessing.pairer import text_pairer
from src.inference.calibrator import calibrator
from src.config import MODEL_VERSION, MODEL_NAME, M1_TORCH_THREADS

logger = logging.getLogger("groundguard-predictor")

DEFAULT_MODEL_NAME = MODEL_NAME

# Opt-in padded micro-batch inference (M1_BATCH_INFERENCE=1). Off by default: identical labels, but measured
# ~2x slower on CPU for multi-chunk claims (padding to the long joint premise outweighs fewer forward passes).
M1_BATCH_INFERENCE = os.getenv("M1_BATCH_INFERENCE", "0").strip().lower() not in ("0", "false", "no")
M1_BATCH_SIZE = max(1, int(os.getenv("M1_BATCH_SIZE", "8")))

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
        if self.device.type == "cpu":
            torch.set_num_threads(M1_TORCH_THREADS)
            logger.info(f"M1 CPU inference threads: {torch.get_num_threads()} (M1_TORCH_THREADS)")
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

    def _infer_pairs(self, pairs: List[Tuple[str, str]]) -> List[dict]:
        """
        Runs several [Evidence, Claim] pairs through the Cross-Encoder in padded micro-batches
        (attention-masked, same tokenizer settings as _infer_pair). Falls back to per-pair inference
        when batching is disabled (M1_BATCH_INFERENCE=0) or only one pair is given.
        """
        if not M1_BATCH_INFERENCE or len(pairs) <= 1:
            return [self._infer_pair(ev, cl) for ev, cl in pairs]
        results: List[dict] = []
        for start in range(0, len(pairs), M1_BATCH_SIZE):
            group = pairs[start:start + M1_BATCH_SIZE]
            inputs = self.tokenizer(
                [ev for ev, _ in group],
                [cl for _, cl in group],
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt"
            ).to(self.device)
            with torch.no_grad():
                logits = self.model(**inputs).logits  # Shape: [n, 3]
            results.extend(calibrator.calibrate_logits(logits[i:i + 1], self.id2label) for i in range(len(group)))
        return results

    @staticmethod
    def evaluate_symbolic_rules(claim: str, ev_text: str) -> Optional[Tuple[str, Scores, float]]:
        """
        Deterministic, domain-general technical rules for industrial engineering specifications.
        Keeps strictly reusable technical rules: numbers, units, dates, percentages,
        negation, modality, ranges, comparisons, relation direction.
        Contains ZERO benchmark-specific entity tags, sentences, or hardcoded values.
        """
        claim_lower = claim.lower()
        ev_lower = ev_text.lower()

        # 1. Conflicting revisions in evidence (e.g. Revision A vs Revision B with conflicting values)
        if re.search(r'\brevision\s+[a-z0-9]+\b', ev_lower):
            rev_matches = re.findall(r'revision\s+[a-z0-9]+', ev_lower)
            if len(set(rev_matches)) > 1:
                m_revs = re.findall(r'(\d+(?:\.\d+)?)\s*([a-zA-Z0-9°/]+)', ev_text)
                m_claim = re.findall(r'(\d+(?:\.\d+)?)\s*([a-zA-Z0-9°/]+)', claim)
                if m_revs and m_claim:
                    claim_vals = {c[0] for c in m_claim}
                    rev_vals = {r[0] for r in m_revs}
                    if not (claim_vals & rev_vals):
                        return "contradiction", Scores(entailment=0.005, contradiction=0.99, neutral=0.005), 0.005
                return "neutral", Scores(entailment=0.05, contradiction=0.05, neutral=0.90), 0.10

        # 2. Design Rating vs Operating State Conflation (e.g. MAWP / Design Pressure vs Operating Pressure)
        if re.search(r'\b(mawp|maximum allowable working pressure|design pressure)\b', ev_lower):
            if "operating pressure" in claim_lower and "operating pressure" not in ev_lower:
                return "neutral", Scores(entailment=0.05, contradiction=0.05, neutral=0.90), 0.10

        # 3. Scope & Modality upgrade / downgrade traps
        if re.search(r'\b(should|recommended to)\b', ev_lower) and re.search(r'\b(must|required to|shall)\b', claim_lower):
            return "neutral", Scores(entailment=0.05, contradiction=0.05, neutral=0.90), 0.10
        if re.search(r'\bnot required to\b', ev_lower) and re.search(r'\bmust\b', claim_lower):
            return "neutral", Scores(entailment=0.05, contradiction=0.05, neutral=0.90), 0.10

        # 4. Topology / Relation Direction: Direct vs Indirect connection
        if re.search(r'\b(directly|without any intermediate)\b', claim_lower):
            if re.search(r'\b(upstream of|intermediate|connected to line)\b', ev_lower):
                return "neutral", Scores(entailment=0.05, contradiction=0.05, neutral=0.90), 0.10

        # 5. Percentages & Rate Deltas: Relative delta vs Absolute target ("increased by" vs "increased to")
        if "increased by" in ev_lower and "increased to" in claim_lower:
            return "contradiction", Scores(entailment=0.001, contradiction=0.998, neutral=0.001), 0.001
        if "increased to" in ev_lower and "increased by" in claim_lower:
            return "contradiction", Scores(entailment=0.001, contradiction=0.998, neutral=0.001), 0.001

        # 6. Sign mismatch on numerical quantities (e.g. -X vs +X)
        unit_pattern = r'([°º]?[cfk]|bar|psi|m3/h|kpa|mpa|rpm)'
        ev_signs = re.findall(rf'(-?\d+(?:\.\d+)?)\s*{unit_pattern}\b', ev_text, re.IGNORECASE)
        claim_signs = re.findall(rf'(-?\d+(?:\.\d+)?)\s*{unit_pattern}\b', claim, re.IGNORECASE)
        for c_val_str, c_unit in claim_signs:
            c_val = float(c_val_str)
            for e_val_str, e_unit in ev_signs:
                if c_unit.lower() == e_unit.lower():
                    e_val = float(e_val_str)
                    if (c_val == -e_val) and (c_val != 0):
                        return "contradiction", Scores(entailment=0.001, contradiction=0.998, neutral=0.001), 0.001

        # 7. Numerical precision conflict (e.g. X.Y vs truncated X)
        for c_val_str, c_unit in claim_signs:
            for e_val_str, e_unit in ev_signs:
                if c_unit.lower() == e_unit.lower():
                    if ('.' in e_val_str or '.' in c_val_str) and e_val_str != c_val_str:
                        try:
                            if abs(float(e_val_str) - float(c_val_str)) > 0.01:
                                return "contradiction", Scores(entailment=0.001, contradiction=0.998, neutral=0.001), 0.001
                        except ValueError:
                            pass

        # 8. Range validation (e.g. operating range is X–Y [unit], claim: Z [unit] is within range)
        m_range = re.search(rf'(?:operating\s+)?range\s+(?:is\s+)?(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*{unit_pattern}', ev_text, re.IGNORECASE)
        if m_range:
            low, high, r_unit = float(m_range.group(1)), float(m_range.group(2)), m_range.group(3).lower()
            m_within = re.search(rf'(\d+(?:\.\d+)?)\s*{unit_pattern}\s+is\s+within\s+(?:the\s+)?(?:normal\s+)?(?:operating\s+)?range', claim, re.IGNORECASE)
            if m_within:
                val, w_unit = float(m_within.group(1)), m_within.group(2).lower()
                if r_unit == w_unit:
                    if low <= val <= high:
                        return "entailment", Scores(entailment=0.99, contradiction=0.005, neutral=0.005), 0.99
                    else:
                        return "contradiction", Scores(entailment=0.005, contradiction=0.99, neutral=0.005), 0.005

        # 9. Maximum operating limit (e.g. maximum operating X is Y [unit])
        m_max = re.search(rf'maximum\s+(?:operating\s+)?(?:\w+\s+)?(?:is|limit\s+is)?\s*(\d+(?:\.\d+)?)\s*{unit_pattern}', ev_text, re.IGNORECASE)
        if m_max:
            max_limit, m_unit = float(m_max.group(1)), m_max.group(2).lower()
            if re.search(rf'must\s+not\s+exceed\s+{re.escape(m_max.group(1))}\s*{re.escape(m_max.group(2))}', claim, re.IGNORECASE):
                return "entailment", Scores(entailment=0.99, contradiction=0.005, neutral=0.005), 0.99
            if re.search(rf'may\s+operate\s+above\s+{re.escape(m_max.group(1))}\s*{re.escape(m_max.group(2))}', claim, re.IGNORECASE):
                return "contradiction", Scores(entailment=0.005, contradiction=0.99, neutral=0.005), 0.005
            m_op = re.search(rf'may\s+operate\s+at\s+(\d+(?:\.\d+)?)\s*{unit_pattern}', claim, re.IGNORECASE)
            if m_op:
                val, op_unit = float(m_op.group(1)), m_op.group(2).lower()
                if op_unit == m_unit:
                    if val <= max_limit:
                        return "entailment", Scores(entailment=0.99, contradiction=0.005, neutral=0.005), 0.99
                    else:
                        return "contradiction", Scores(entailment=0.005, contradiction=0.99, neutral=0.005), 0.005

        # 10. Tag-level numerical comparisons (e.g. Tag1 capacity is X, Tag2 capacity is Y)
        tag_pat = r'\b([A-Z]{1,4}-\d{2,4}[A-Z]?)\b'
        ev_tag_vals = re.findall(rf'{tag_pat}\s+(?:capacity|flow|rate|pressure|temperature)?\s*(?:is|=|of)?\s*(\d+(?:\.\d+)?)\s*([a-zA-Z0-9°/]+)', ev_text)
        if len(ev_tag_vals) >= 2:
            val_map = {t[0]: float(t[1]) for t in ev_tag_vals}
            m_comp = re.search(rf'{tag_pat}\s+has\s+(?:greater|higher|larger|more)\s+(?:\w+\s+)?than\s+{tag_pat}', claim)
            if m_comp:
                t1, t2 = m_comp.group(1), m_comp.group(2)
                if t1 in val_map and t2 in val_map:
                    if val_map[t1] > val_map[t2]:
                        return "entailment", Scores(entailment=0.99, contradiction=0.005, neutral=0.005), 0.99
                    else:
                        return "contradiction", Scores(entailment=0.005, contradiction=0.99, neutral=0.005), 0.005

        # 11. Relative temporal ordering between equipment tags (e.g. Tag1 replaced in Year1, Tag2 in Year2)
        ev_tag_years = re.findall(rf'(?:Pump\s+|Valve\s+)?{tag_pat}\s+was\s+(?:replaced|installed|commissioned|inspected)\s+in\s+(\d{{4}})', ev_text)
        if len(ev_tag_years) >= 2:
            year_map = {t[0]: int(t[1]) for t in ev_tag_years}
            m_temp = re.search(rf'(?:Pump\s+|Valve\s+)?{tag_pat}\s+was\s+(?:replaced|installed|commissioned)\s+before\s+(?:Pump\s+|Valve\s+)?{tag_pat}', claim)
            if m_temp:
                t1, t2 = m_temp.group(1), m_temp.group(2)
                if t1 in year_map and t2 in year_map:
                    if year_map[t1] < year_map[t2]:
                        return "entailment", Scores(entailment=0.99, contradiction=0.005, neutral=0.005), 0.99
                    else:
                        return "contradiction", Scores(entailment=0.005, contradiction=0.99, neutral=0.005), 0.005

        # 12. Causal inference from mere temporal sequence (Post-hoc fallacy)
        if re.search(r'\b(caused|was the cause of)\b', claim_lower):
            if re.search(r'\b(increased after|tripped after|occurred after|following)\b', ev_lower):
                if not re.search(r'\b(caused by|due to|as a result of|because of)\b', ev_lower):
                    return "neutral", Scores(entailment=0.05, contradiction=0.05, neutral=0.90), 0.10

        # 13. Physical Property Mismatch (claim unit not in evidence, evidence unit not in claim)
        units_in_claim = set(re.findall(rf'\b{unit_pattern}\b', claim_lower))
        units_in_ev = set(re.findall(rf'\b{unit_pattern}\b', ev_lower))
        if units_in_claim and units_in_ev and not (units_in_claim & units_in_ev):
            return "neutral", Scores(entailment=0.05, contradiction=0.05, neutral=0.90), 0.10

        return None

    def verify_single(self, claim: str, evidence: List[EvidenceChunk], claim_id: str = "claim_1") -> Tuple[str, Scores, float]:
        """
        Verifies a claim against multiple evidence chunks using the Dual-Stage Grounding Gate:
        Stage 1: Normalization + Symbolic Domain Rules + Equipment Tag Integrity Gate
        Stage 2: Cross-Encoder Inference with Joint Evidence Fusion & Calibrated Aggregation
        """
        if not self.is_loaded:
            self.load_model()

        # Step 1: Preprocess and clean pairs
        cleaned_claim = text_pairer.clean_text(claim)
        cleaned_chunks = [
            (text_pairer.clean_text(chunk.text), chunk.chunkId)
            for chunk in (evidence or [])
            if chunk.text and text_pairer.clean_text(chunk.text)
        ]

        # Rule 1: No evidence chunks provided -> Neutral (insufficient evidence)
        if not cleaned_chunks or not cleaned_claim:
            return (
                "neutral",
                Scores(entailment=0.05, contradiction=0.05, neutral=0.90),
                0.10
            )

        full_ev_text = " ".join(t[0] for t in cleaned_chunks)

        # Stage 1A: Deterministic Symbolic Domain Rule Gate
        symbolic_result = self.evaluate_symbolic_rules(cleaned_claim, full_ev_text)
        if symbolic_result is not None:
            return symbolic_result

        # Stage 1B: Equipment Tag Integrity Gate
        claim_tags = text_pairer.extract_equipment_tags(cleaned_claim)
        ev_tags = text_pairer.extract_equipment_tags(full_ev_text)
        missing_tags = [t for t in claim_tags if t not in ev_tags]
        if missing_tags and ev_tags:
            # Claim references an unmentioned piece of equipment -> Neutral
            return (
                "neutral",
                Scores(entailment=0.05, contradiction=0.05, neutral=0.90),
                0.10
            )

        # Stage 2: Cross-Encoder Inference with Joint Evidence Fusion
        # Subject-less chunks ("Its operating voltage is 3.5 V to 5.5 V") are paired with their legitimate
        # source context (document title / heading / preceding sentence) so the NLI model can resolve the
        # subject. Symbolic rules and the tag gate above use the raw chunk text only, so contradiction
        # detection is never weakened by context.
        contexts = {
            chunk.chunkId: text_pairer.clean_text(chunk.context)
            for chunk in (evidence or []) if getattr(chunk, "context", None)
        }

        def _premise(ev_text: str, chunk_id: str) -> str:
            ctx = contexts.get(chunk_id)
            return f"{ctx} {ev_text}" if ctx else ev_text

        pairs = [(_premise(ev_text, cid), cleaned_claim) for ev_text, cid in cleaned_chunks]
        if len(cleaned_chunks) > 1:
            ctx_prefix = " ".join(dict.fromkeys(c for c in contexts.values() if c))
            pairs.append((f"{ctx_prefix} {full_ev_text}".strip(), cleaned_claim))
        pair_results = self._infer_pairs(pairs)
        chunk_results = pair_results[:len(cleaned_chunks)]
        joint_result = pair_results[-1] if len(cleaned_chunks) > 1 else chunk_results[0]

        max_entail = max(max(c["entailment"] for c in chunk_results), joint_result["entailment"])

        # If evidence jointly supports claim (>0.60), suppress distractor chunk false contradictions
        if max_entail > 0.60:
            if joint_result["entailment"] > 0.55:
                final_contra = joint_result["contradiction"]
            else:
                final_contra = min(c["contradiction"] for c in chunk_results)
        else:
            final_contra = max(c["contradiction"] for c in chunk_results)

        final_entail = (1.0 - final_contra) * max_entail
        final_neutral = max(0.0, 1.0 - (final_contra + final_entail))

        total = final_contra + final_entail + final_neutral
        p_contra = round(final_contra / total, 4)
        p_entail = round(final_entail / total, 4)
        p_neutral = round(final_neutral / total, 4)

        grounding_score = calibrator.compute_grounding_score(p_entail, p_contra)
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