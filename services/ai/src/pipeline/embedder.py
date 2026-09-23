import os
import logging
from typing import List

logger = logging.getLogger("m2-ai-service")

MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "384"))
_model = None

def get_model():
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            logger.info(f"Loading SentenceTransformer model '{MODEL_NAME}'...")
            _model = SentenceTransformer(MODEL_NAME)
        except Exception as e:
            env = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()
            if env == "production":
                logger.error(f"FATAL: Production embedding model '{MODEL_NAME}' failed to load: {e}")
                raise RuntimeError(f"FATAL: Production embedding model '{MODEL_NAME}' failed to load: {e}")
            logger.warning(f"Could not load SentenceTransformer ({e}). Using deterministic mock embedder for development/testing.")
            _model = "MOCK"
    return _model

def generate_embeddings(texts: List[str]) -> List[List[float]]:
    if not texts:
        return []

    model = get_model()
    if model != "MOCK" and hasattr(model, "encode"):
        embeddings = model.encode(texts, convert_to_numpy=True)
        result = [emb.tolist() for emb in embeddings]
        if result and len(result[0]) != EMBEDDING_DIM:
            raise ValueError(
                f"Embedding dimension mismatch: model '{MODEL_NAME}' produced {len(result[0])} dimensions, expected {EMBEDDING_DIM}"
            )
        return result

    # Deterministic mock fallback strictly for tests / offline dev environments
    mock_vectors = []
    for text in texts:
        vector = [0.0] * EMBEDDING_DIM
        val = (sum(ord(c) for c in text) % 1000) / 1000.0
        for i in range(EMBEDDING_DIM):
            vector[i] = (val + i * 0.001) % 1.0
        mock_vectors.append(vector)
    return mock_vectors
