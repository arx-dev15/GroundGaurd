import os

PORT = int(os.getenv("PORT", 8001))
HOST = os.getenv("HOST", "0.0.0.0")
SERVICE_NAME = "ml"

# Phase 2 Neural Engine Configuration
USE_NEURAL_ENGINE = os.getenv("USE_NEURAL_ENGINE", "true").lower() == "true"
MODEL_NAME = os.getenv("MODEL_NAME", "cross-encoder/nli-deberta-v3-small")
MODEL_VERSION = os.getenv("MODEL_VERSION", "groundguard-deberta-v3-small-v1")

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")