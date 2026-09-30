"""
GroundGuard Dense Vector Store (src/rag/vector_store.py)
Implements Mandate 2: Strict Tenant Project Isolation (WHERE project_id = $id).
"""

import os
import uuid
import logging
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    PayloadSchemaType,
)

from src.contracts.events import EvidenceChunk
from src.pipeline.embedder import generate_embeddings, EMBEDDING_DIM

logger = logging.getLogger("rag-vector-store")

QDRANT_URL = os.getenv("QDRANT_URL", "")
QDRANT_PATH = os.getenv("QDRANT_PATH", "")
COLLECTION_NAME = "groundguard_chunks"
VECTOR_DIM = EMBEDDING_DIM


class DenseVectorStore:
    """
    Qdrant HNSW vector index strictly partitioned by tenant (WHERE project_id = $id).
    Enforces project isolation at query time.
    """
    def __init__(self, url: str = QDRANT_URL, path: str = QDRANT_PATH):
        self.url = url.strip()
        self.path = path.strip()
        self._env = os.getenv("ENVIRONMENT", "development").lower()
        self.client = self._init_client()
        self._ensure_collection()

    def _init_client(self) -> QdrantClient:
        if self.url and self.url != ":memory:":
            try:
                client = QdrantClient(url=self.url, timeout=5.0)
                client.get_collections()
                return client
            except Exception as e:
                raise RuntimeError(
                    f"FATAL: External Qdrant connection to {self.url} failed: {e}. "
                    "Failing fast to preserve tenant vector isolation."
                ) from e

        if self.url == ":memory:":
            if self._env == "production":
                raise RuntimeError("FATAL: QDRANT_URL=:memory: is forbidden in production.")
            return QdrantClient(":memory:")

        if self.path:
            if self._env == "production":
                raise RuntimeError("FATAL: Disk-embedded Qdrant is forbidden in production.")
            os.makedirs(self.path, exist_ok=True)
            return QdrantClient(path=self.path)

        raise RuntimeError("FATAL: Neither QDRANT_URL nor QDRANT_PATH configured.")

    def _ensure_collection(self) -> None:
        try:
            collections = self.client.get_collections().collections
            exists = any(c.name == COLLECTION_NAME for c in collections)
            if not exists:
                self.client.create_collection(
                    collection_name=COLLECTION_NAME,
                    vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
                )
            for field in ["projectId", "documentId", "isDistractor"]:
                try:
                    self.client.create_payload_index(
                        collection_name=COLLECTION_NAME,
                        field_name=field,
                        field_schema=PayloadSchemaType.KEYWORD,
                    )
                except Exception:
                    pass
        except Exception as e:
            raise RuntimeError(f"FATAL: Qdrant collection initialization failed: {e}") from e

    def upsert_chunks(self, chunks: List[EvidenceChunk]) -> int:
        if not chunks:
            return 0

        texts = [c.text for c in chunks]
        embeddings = generate_embeddings(texts)

        points = []
        for chunk, vec in zip(chunks, embeddings):
            seed = f"{chunk.document_id}:{chunk.chunk_id}"
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, seed))

            payload = {
                "chunkId": chunk.chunk_id,
                "documentId": chunk.document_id,
                "projectId": chunk.project_id,
                "pageNumber": chunk.page_number,
                "text": chunk.text,
                "identifiers": chunk.identifiers,
                "isDistractor": chunk.is_distractor,
                "metadata": chunk.metadata,
            }
            points.append(PointStruct(id=point_id, vector=vec, payload=payload))

        self.client.upsert(collection_name=COLLECTION_NAME, points=points, wait=True)
        return len(points)

    def search_dense(
        self,
        project_id: str,
        query: str,
        top_k: int = 15
    ) -> List[Dict[str, Any]]:
        """
        Executes dense vector search with MANDATORY WHERE project_id = $id filter.
        Zero data leak across projects.
        """
        if not query or not query.strip():
            return []

        vectors = generate_embeddings([query])
        if not vectors or not vectors[0]:
            return []
        query_vector = vectors[0]

        tenant_filter = Filter(
            must=[
                FieldCondition(key="projectId", match=MatchValue(value=project_id))
            ]
        )

        if hasattr(self.client, "query_points"):
            response = self.client.query_points(
                collection_name=COLLECTION_NAME,
                query=query_vector,
                query_filter=tenant_filter,
                limit=top_k
            )
            hits = response.points
        else:
            hits = self.client.search(
                collection_name=COLLECTION_NAME,
                query_vector=query_vector,
                query_filter=tenant_filter,
                limit=top_k
            )

        results = []
        for hit in hits:
            payload = hit.payload or {}
            if payload.get("projectId") != project_id:
                # Security boundary check
                logger.error(f"[SECURITY] Leaked vector detected! Point {hit.id} rejected.")
                continue

            results.append({
                "chunk_id": payload.get("chunkId"),
                "document_id": payload.get("documentId"),
                "project_id": payload.get("projectId"),
                "text": payload.get("text", ""),
                "page_number": payload.get("pageNumber", 1),
                "identifiers": payload.get("identifiers", []),
                "is_distractor": payload.get("isDistractor", False),
                "score": float(hit.score),
            })
        return results


dense_vector_store = DenseVectorStore()
