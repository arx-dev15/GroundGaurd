import os
import logging
from typing import List

logger = logging.getLogger("m2-embedder")

MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "384"))

# Explicit test-only flag — must be set to exactly "true" to activate mock embeddings.
# Never activated silently. Fails in production regardless of this flag.
_ALLOW_MOCK = os.getenv("ALLOW_MOCK_EMBEDDER", "false").lower() == "true"

_model = None


def get_model():
    """
    Returns the singleton SentenceTransformer model instance.

    Invariants:
    - Model is loaded once per process.
    - Embedding dimension is validated at load time against EMBEDDING_DIM.
    - If model load fails: raise RuntimeError (always — regardless of environment).
    - Mock mode: ONLY when ALLOW_MOCK_EMBEDDER=true AND ENVIRONMENT != production.
    """
    global _model
    if _model is not None:
        return _model

    env = os.getenv("ENVIRONMENT", "development").lower()

    # Production hard-block: mock embeddings must never reach production.
    if _ALLOW_MOCK and env == "production":
        raise RuntimeError(
            "FATAL: ALLOW_MOCK_EMBEDDER=true is not permitted in production. "
            "Mock embeddings must never be written to a production Qdrant instance."
        )

    try:
        from sentence_transformers import SentenceTransformer
        logger.info(f"Loading SentenceTransformer model '{MODEL_NAME}'...")
        loaded = SentenceTransformer(MODEL_NAME)

        # Validate embedding dimension at load time — fail fast before any request.
        test_embedding = loaded.encode(["dimension validation probe"], convert_to_numpy=True)
        actual_dim = len(test_embedding[0])
        if actual_dim != EMBEDDING_DIM:
            raise RuntimeError(
                f"FATAL: Embedding dimension mismatch. "
                f"Model '{MODEL_NAME}' produces {actual_dim}-dim vectors, "
                f"but EMBEDDING_DIM={EMBEDDING_DIM}. "
                f"Correct EMBEDDING_DIM or use the right model."
            )

        logger.info(f"Model '{MODEL_NAME}' loaded and validated (dim={actual_dim}).")
        _model = loaded
        return _model

    except RuntimeError:
        raise  # Re-raise our own dimension/production errors directly.
    except Exception as e:
        if _ALLOW_MOCK:
            logger.warning(
                f"SentenceTransformer load failed ({e}). "
                f"Using deterministic mock embedder (ALLOW_MOCK_EMBEDDER=true). "
                f"This is only valid for unit tests or offline development."
            )
            _model = "MOCK"
            return _model
        raise RuntimeError(
            f"FATAL: Embedding model '{MODEL_NAME}' failed to load: {e}. "
            f"Ensure the model is available, or set ALLOW_MOCK_EMBEDDER=true for offline dev/testing."
        ) from e


def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Generates embeddings for a list of texts.

    Raises RuntimeError if model is unavailable and ALLOW_MOCK_EMBEDDER is not set.
    Never returns fake embeddings silently.
    """
    if not texts:
        return []

    model = get_model()

    if model != "MOCK":
        embeddings = model.encode(texts, convert_to_numpy=True)
        result = [emb.tolist() for emb in embeddings]
        # Secondary guard: validate dim on every call batch (catches runtime model changes).
        if result and len(result[0]) != EMBEDDING_DIM:
            raise RuntimeError(
                f"FATAL: Embedding dimension mismatch at inference time. "
                f"Model produced {len(result[0])} dims, expected {EMBEDDING_DIM}."
            )
        return result

    # Deterministic mock — only reachable when ALLOW_MOCK_EMBEDDER=true.
    logger.debug(f"[mock-embedder] Generating {len(texts)} mock {EMBEDDING_DIM}-dim vectors.")
    mock_vectors = []
    for text in texts:
        vector = [0.0] * EMBEDDING_DIM
        val = (sum(ord(c) for c in text) % 1000) / 1000.0
        for i in range(EMBEDDING_DIM):
            vector[i] = (val + i * 0.001) % 1.0
        mock_vectors.append(vector)
    return mock_vectors
