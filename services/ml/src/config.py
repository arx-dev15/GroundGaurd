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