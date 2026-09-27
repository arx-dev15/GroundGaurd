import json
import sys
from pathlib import Path
from collections import defaultdict

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure service root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.contracts.requests import EvidenceChunk
from src.inference.predictor import neural_predictor

BENCHMARK_PATH = Path("evaluation/industrial_benchmark_110.json")

def run_production_evaluation():
    with open(BENCHMARK_PATH, "r", encoding="utf-8") as f:
        cases = json.load(f)

    correct = 0
    false_entails = 0
    non_entail_total = 0
    class_stats = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0, "total": 0})
    failures = []

    print(f"Evaluating {len(cases)} industrial cases directly through production DebertaGroundingPredictor...")

    for c in cases:
        expected = c["expectedLabel"].lower()
        if expected != "entailment":
            non_entail_total += 1
            
        chunks = [EvidenceChunk(chunkId=e["chunkId"], text=e["text"]) for e in c["evidence"]]
        pred, scores, g = neural_predictor.verify_single(c["claim"], chunks, claim_id=c["caseId"])
        
        is_correct = (pred == expected)
        class_stats[expected]["total"] += 1
        
        if is_correct:
            correct += 1
            class_stats[expected]["tp"] += 1
        else:
            class_stats[expected]["fn"] += 1
            class_stats[pred]["fp"] += 1
            if expected != "entailment" and pred == "entailment":
                false_entails += 1
            failures.append((c["caseId"], c["category"], expected, pred, c["claim"]))

    acc = correct / len(cases)
    fe_rate = false_entails / non_entail_total if non_entail_total else 0.0

    print("=" * 65)
    print("PRODUCTION DebertaGroundingPredictor: 110-CASE BENCHMARK")
    print("=" * 65)
    print(f"Overall Accuracy:      {acc*100:.2f}% ({correct}/{len(cases)})")
    print(f"False Entailment Rate: {fe_rate*100:.2f}% ({false_entails} errors)")
    print(f"Contradiction Recall:  {class_stats['contradiction']['tp'] / class_stats['contradiction']['total'] * 100:.2f}%")
    print("-----------------------------------------------------------------")
    
    for cls in ["entailment", "contradiction", "neutral"]:
        tp = class_stats[cls]["tp"]
        fp = class_stats[cls]["fp"]
        fn = class_stats[cls]["fn"]
        p = tp / (tp + fp) if (tp + fp) > 0 else 0
        r = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = (2*p*r)/(p+r) if (p+r)>0 else 0
        print(f"  {cls.upper():13} | Precision: {p*100:5.1f}% | Recall: {r*100:5.1f}% | F1: {f1*100:5.1f}%")
    print("=" * 65)

    if failures:
        print(f"\nRemaining Failures ({len(failures)}):")
        for cid, cat, exp, pred, claim in failures:
            print(f"  [{cid}] ({cat}) Exp: {exp} -> Pred: {pred} | Claim: '{claim}'")
    else:
        print("\nPERFECT VERIFICATION SCORE: 100.00% (110/110) ON INDUSTRIAL BENCHMARK!")

    assert acc >= 0.95, f"Accuracy {acc*100:.2f}% is below 95% target!"

if __name__ == "__main__":
    run_production_evaluation()
