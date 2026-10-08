import os
from pathlib import Path

PORT = int(os.getenv("PORT", 8001))
HOST = os.getenv("HOST", "0.0.0.0")
SERVICE_NAME = "ml"

# Phase 4 Fine-Tuned Model Checkpoint Path
FINETUNED_PATH = Path(__file__).resolve().parent.parent / "models" / "groundguard-deberta-v1"
HAS_FINETUNED = (FINETUNED_PATH / "model.safetensors").exists()

DEFAULT_MODEL = str(FINETUNED_PATH)
DEFAULT_VERSION = "groundguard-deberta-v1-finetuned"

USE_NEURAL_ENGINE = os.getenv("USE_NEURAL_ENGINE", "true").lower() == "true"
MODEL_NAME = os.getenv("MODEL_NAME", DEFAULT_MODEL)
MODEL_VERSION = os.getenv("MODEL_VERSION", DEFAULT_VERSION)

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# PyTorch intra-op CPU threads for M1 NLI inference (labels/scores are identical at any setting). The process-wide
# OMP/MKL/OPENBLAS=1 pins in main.py still keep other native libraries single-threaded. Measured on 8 physical
# cores: 1->4 threads ~25% faster with ~+20 ms on concurrent M2 retrieval; 8 threads ~50% faster but +~65 ms.
def _m1_torch_threads() -> int:
    try:
        n = int(os.getenv("M1_TORCH_THREADS", "4"))
    except ValueError:
        n = 4
    return max(1, min(n, os.cpu_count() or 1))

M1_TORCH_THREADS = _m1_torch_threads()
