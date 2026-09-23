import os 

PORT = int(os.getenv("PORT",8001))

HOST = os.getenv("HOST","0.0.0.0")

SERVICE_NAME = "ml"

MODEL_VERSION = "groundguard-v1-phase1-mock"

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")