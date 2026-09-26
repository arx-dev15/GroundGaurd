import sys
import time
import json
import torch
import numpy as np
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import onnx
import onnxruntime as ort

# Ensure UTF-8 output even in Windows cmd/PowerShell cp1252
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure service root (services/ml) is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import FINETUNED_PATH

OUTPUT_ONNX_PATH = Path(__file__).resolve().parent / "groundguard-deberta-v1.onnx"
LATENCY_REPORT_PATH = Path(__file__).resolve().parent.parent / "evaluation" / "reports" / "onnx_latency_benchmark.json"

def export_and_benchmark():
    print("=" * 60)
    print("[PHASE 6] GROUNDGUARD: ONNX EXPORT & LATENCY ACCELERATION")
    print("=" * 60)

    # 1. Load fine-tuned PyTorch Model
    model_path = FINETUNED_PATH if FINETUNED_PATH.exists() else "cross-encoder/nli-deberta-v3-small"
    print(f"Loading weights from: {model_path}...")
    tokenizer = AutoTokenizer.from_pretrained(str(model_path))
    model = AutoModelForSequenceClassification.from_pretrained(str(model_path))
    model.eval()

    # 2. Create Dummy Input
    dummy_evidence = "In 2024, Apex Cloud Corp reported annual recurring revenue of INR 120 Cr."
    dummy_claim = "Apex Cloud Corp recorded INR 120 Cr in revenue in 2024."
    
    dummy_inputs = tokenizer(
        dummy_evidence,
        dummy_claim,
        padding="max_length",
        truncation=True,
        max_length=128,
        return_tensors="pt"
    )

    # 3. Export to ONNX with Dynamic Axes
    print(f"Exporting PyTorch computation graph to ONNX: {OUTPUT_ONNX_PATH}...")
    torch.onnx.export(
        model,
        (dummy_inputs["input_ids"], dummy_inputs["attention_mask"]),
        f=str(OUTPUT_ONNX_PATH),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size"}
        },
        opset_version=14,
        do_constant_folding=True,
        dynamo=False
    )

    # Verify ONNX model integrity
    onnx_model = onnx.load(str(OUTPUT_ONNX_PATH))
    onnx.checker.check_model(onnx_model)
    file_size_mb = OUTPUT_ONNX_PATH.stat().st_size / (1024 * 1024)
    print(f"[OK] ONNX model exported and verified! File size: {file_size_mb:.1f} MB")

    # 4. Latency Benchmark: PyTorch vs ONNX Runtime
    print("\n[*] Running Side-by-Side Latency Benchmark (50 iterations)...")

    # Initialize ONNX Runtime Session
    sess_options = ort.SessionOptions()
    sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess_options.intra_op_num_threads = 4
    ort_session = ort.InferenceSession(str(OUTPUT_ONNX_PATH), sess_options, providers=["CPUExecutionProvider"])

    ort_inputs = {
        "input_ids": dummy_inputs["input_ids"].numpy(),
        "attention_mask": dummy_inputs["attention_mask"].numpy()
    }

    # Warmup
    for _ in range(5):
        with torch.no_grad():
            _ = model(**dummy_inputs)
        _ = ort_session.run(None, ort_inputs)

    # Benchmark PyTorch
    pytorch_times = []
    for _ in range(50):
        t0 = time.perf_counter()
        with torch.no_grad():
            pt_out = model(**dummy_inputs)
        pytorch_times.append((time.perf_counter() - t0) * 1000)

    # Benchmark ONNX Runtime
    onnx_times = []
    for _ in range(50):
        t0 = time.perf_counter()
        ort_out = ort_session.run(None, ort_inputs)
        onnx_times.append((time.perf_counter() - t0) * 1000)

    # Verify numerical parity between PyTorch and ONNX logits
    pt_logits = pt_out.logits.numpy()
    ort_logits = ort_out[0]
    max_abs_diff = np.max(np.abs(pt_logits - ort_logits))
    parity_str = "PASSED [OK]" if max_abs_diff < 1e-3 else "FAILED [FAIL]"
    print(f"Numerical Parity Check: Max absolute diff = {max_abs_diff:.6f} (< 1e-3 target: {parity_str})")

    # Latency Stats
    pt_mean = float(np.mean(pytorch_times))
    pt_p50 = float(np.median(pytorch_times))
    pt_p95 = float(np.percentile(pytorch_times, 95))

    ort_mean = float(np.mean(onnx_times))
    ort_p50 = float(np.median(onnx_times))
    ort_p95 = float(np.percentile(onnx_times, 95))

    speedup = pt_mean / ort_mean if ort_mean > 0 else 1.0

    print("\n" + "=" * 60)
    print("LATENCY BENCHMARK RESULTS (CPU - Single Claim)")
    print("=" * 60)
    print(f"Framework        | Mean Latency | p50 Latency | p95 Latency")
    print(f"-----------------+--------------+-------------+-------------")
    print(f"PyTorch (Eager)  | {pt_mean:6.2f} ms   | {pt_p50:5.2f} ms   | {pt_p95:5.2f} ms")
    print(f"ONNX Runtime     | {ort_mean:6.2f} ms   | {ort_p50:5.2f} ms   | {ort_p95:5.2f} ms")
    print(f"-----------------+--------------+-------------+-------------")
    print(f"[ACCELERATION] Speedup: {speedup:.2f}x Faster with ONNX Runtime!")
    print("=" * 60)

    # Save latency report
    LATENCY_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "frameworks_compared": ["PyTorch Eager", "ONNX Runtime C++"],
        "hardware": "CPU",
        "iterations": 50,
        "numerical_parity_max_diff": float(max_abs_diff),
        "pytorch": {"mean_ms": round(pt_mean, 2), "p50_ms": round(pt_p50, 2), "p95_ms": round(pt_p95, 2)},
        "onnxruntime": {"mean_ms": round(ort_mean, 2), "p50_ms": round(ort_p50, 2), "p95_ms": round(ort_p95, 2)},
        "speedup_factor": round(speedup, 2)
    }
    with open(LATENCY_REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"Report saved to: {LATENCY_REPORT_PATH}")

if __name__ == "__main__":
    export_and_benchmark()
