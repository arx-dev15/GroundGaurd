import sys
import json
import logging
from pathlib import Path
from collections import defaultdict
from typing import List, Dict

# Ensure service root (services/ml) is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.contracts.requests import EvidenceChunk
from src.inference.predictor import neural_predictor
from src.config import MODEL_VERSION

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("groundguard-benchmark")

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
TEST_DATASET_PATH = REPO_ROOT / "datasets" / "evaluation" / "test.jsonl"
REPORTS_DIR = Path(__file__).resolve().parent / "reports"


def run_benchmark(dataset_path: Path = TEST_DATASET_PATH, model_name: str = MODEL_VERSION) -> Dict:
    """Evaluates the active neural predictor on the golden test benchmark."""
    logger.info(f"Loading test benchmark from: {dataset_path}")
    
    with open(dataset_path, "r", encoding="utf-8") as f:
        samples = [json.loads(line) for line in f if line.strip()]

    logger.info(f"Total test samples to evaluate: {len(samples)}")
    
    # Pre-warm model
    neural_predictor.load_model()

    results = []
    category_stats = defaultdict(lambda: {"total": 0, "correct": 0})
    class_stats = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0, "total_ground_truth": 0})

    correct_total = 0

    for idx, sample in enumerate(samples):
        claim = sample["claim"]
        evidence_text = sample["evidence"]
        ground_truth = sample["label"].lower()
        category = sample["category"]

        # Format as EvidenceChunk
        evidence = [EvidenceChunk(chunkId=f"chunk_{idx}", text=evidence_text)]

        # Predict
        predicted_label, scores, grounding_score = neural_predictor.verify_single(
            claim=claim,
            evidence=evidence,
            claim_id=sample["id"]
        )

        is_correct = (predicted_label == ground_truth)
        if is_correct:
            correct_total += 1
            category_stats[category]["correct"] += 1
        category_stats[category]["total"] += 1

        # Class-level confusion tracking
        class_stats[ground_truth]["total_ground_truth"] += 1
        if is_correct:
            class_stats[ground_truth]["tp"] += 1
        else:
            class_stats[ground_truth]["fn"] += 1
            class_stats[predicted_label]["fp"] += 1

        results.append({
            "id": sample["id"],
            "category": category,
            "difficulty": sample["difficulty"],
            "ground_truth": ground_truth,
            "predicted": predicted_label,
            "is_correct": is_correct,
            "scores": scores.model_dump(),
            "groundingScore": grounding_score
        })

    # Calculate Macro Metrics
    accuracy = correct_total / len(samples) if samples else 0.0

    class_metrics = {}
    for cls in ["entailment", "contradiction", "neutral"]:
        tp = class_stats[cls]["tp"]
        fp = class_stats[cls]["fp"]
        fn = class_stats[cls]["fn"]
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        class_metrics[cls] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "support": class_stats[cls]["total_ground_truth"]
        }

    category_accuracy = {
        cat: f"{stats['correct']}/{stats['total']} ({round(stats['correct'] / stats['total'] * 100, 1)}%)"
        for cat, stats in category_stats.items()
    }

    report = {
        "model_evaluated": model_name,
        "total_samples": len(samples),
        "overall_accuracy": round(accuracy, 4),
        "class_metrics": class_metrics,
        "category_accuracy": category_accuracy,
        "sample_evaluations": results
    }

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_file = REPORTS_DIR / f"{model_name}_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    logger.info("=" * 60)
    logger.info(f"BENCHMARK COMPLETED: {model_name}")
    logger.info(f"Overall Accuracy: {round(accuracy * 100, 2)}% ({correct_total}/{len(samples)})")
    logger.info(f"Contradiction Recall: {round(class_metrics['contradiction']['recall'] * 100, 2)}%")
    logger.info(f"Entailment Recall:    {round(class_metrics['entailment']['recall'] * 100, 2)}%")
    logger.info(f"Neutral Recall:       {round(class_metrics['neutral']['recall'] * 100, 2)}%")
    logger.info("=" * 60)
    logger.info(f"Full report saved to: {report_file}")

    return report


if __name__ == "__main__":
    run_benchmark()