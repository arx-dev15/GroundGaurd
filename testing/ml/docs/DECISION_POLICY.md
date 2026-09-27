# GroundGuard ML Subsystem: Grounding Score & Decision Policy

**Author**: Dhiveej (Member 1 — ML Research Engineer)  
**Status**: Calibrated & Production Active  
**Model Version**: `groundguard-deberta-v1-finetuned`  

---

## 1. Mathematical Definition of `groundingScore`

In GroundGuard, `groundingScore` is **not** a raw entailment probability. Raw neural network outputs are often overconfident and fail to penalize ambiguity in multi-chunk evidence.

The GroundGuard **Grounding Score** is defined as:

$$\text{groundingScore} = P(\text{Entailment}) \times \Big( 1.0 - P(\text{Contradiction}) \Big)$$

### Mathematical Properties:
- **Range**: Bound strictly to $[0.0, 1.0]$.
- **Safety Monotonicity**: Even if $P(\text{Entailment})$ is high (e.g. $0.70$), if evidence ambiguity produces $P(\text{Contradiction}) = 0.30$, the score drops to $0.70 \times 0.70 = \mathbf{0.49}$ (below approval threshold).
- **Asymmetric Penalty**: Hallucinations and contradictions are penalized quadratically relative to entailment support.

---

## 2. Probability Calibration via Temperature Scaling

Deep neural networks trained with Cross-Entropy loss suffer from overconfidence. We apply **Temperature Scaling** (Guo et al., 2017) to the raw logits $\mathbf{z}$ prior to Softmax:

$$P_i = \frac{e^{z_i / T}}{\sum_{j=1}^K e^{z_j / T}}$$

- **Optimal Calibrated Temperature**: $T = 1.25$ (fitted on the validation split).
- **Effect**: Softens overconfident spikes while preserving exact rank-order classification.

---

## 3. The 3-Tier Operating Decision Boundaries

To eliminate arbitrary hardcoded rules (`if score > 0.5`), operational thresholds were empirically selected on validation benchmarks to maximize **Contradiction Recall** while maintaining high Entailment Precision:

| Class Label | Decision Condition | Operational Justification |
|---|---|---|
| **`CONTRADICTION`** | $P(\text{Contradiction}) \ge 0.35$ | **Zero-Tolerance Safety Boundary**: Flag potential factual conflicts early for agentic recovery. |
| **`ENTAILMENT`** | $\text{groundingScore} \ge 0.65$ **AND** $P(\text{Entailment}) \ge 0.55$ | **Verified Support Boundary**: High factual alignment with low contradiction risk. |
| **`NEUTRAL`** | *All other cases* | **Insufficient Evidence Boundary**: Neither refutes nor verifies; triggers retrieval expansion. |

---

## 4. Multi-Evidence Asymmetric Aggregation

When Member 2 (RAG) supplies multiple chunks $\{E_1, E_2, \dots, E_K\}$ for a single claim $C$, we avoid context-window truncation by evaluating each chunk independently, then aggregating using the **Asymmetric Truth Principle**:

1. **Max Contradiction Pooling**:
   $$P(\text{Contradiction}) = \max_{i} P_i(\text{Contradiction})$$
2. **Discounted Entailment Pooling**:
   $$P(\text{Entailment}) = \big(1.0 - P(\text{Contradiction})\big) \times \max_{i} P_i(\text{Entailment})$$
3. **Neutral Remainder**:
   $$P(\text{Neutral}) = \max\Big(0.0, 1.0 - \big(P(\text{Contradiction}) + P(\text{Entailment})\big)\Big)$$
