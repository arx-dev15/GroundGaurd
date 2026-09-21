import os
import logging
from typing import List

logger = logging.getLogger("m2-ai-service")

MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
_model = None

def get_model():
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            logger.info(f"Loading SentenceTransformer model '{MODEL_NAME}'...")
            _model = SentenceTransformer(MODEL_NAME)
        except Exception as e:
            logger.warning(f"Could not load SentenceTransformer ({e}). Using deterministic mock embedder.")
            _model = "MOCK"
    return _model

def generate_embeddings(texts: List[str]) -> List[List[float]]:
    if not texts:
        return []

    model = get_model()
    if model != "MOCK" and hasattr(model, "encode"):
        embeddings = model.encode(texts, convert_to_numpy=True)
        return [emb.tolist() for emb in embeddings]

    # Deterministic mock fallback for tests / minimal environments (384 dimensions)
    mock_vectors = []
    for text in texts:
        vector = [0.0] * 384
        val = (sum(ord(c) for c in text) % 1000) / 1000.0
        for i in range(384):
            vector[i] = (val + i * 0.001) % 1.0
        mock_vectors.append(vector)
    return mock_vectors
