import os
import uuid
import logging
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest_models
from qdrant_client.http.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    PayloadSchemaType
)

from src.pipeline.embedder import EMBEDDING_DIM
logger = logging.getLogger("m2-qdrant-store")

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_PATH = os.getenv("QDRANT_PATH", "")  # Disk-embedded path (no server required)
COLLECTION_NAME = "groundguard_chunks"
VECTOR_DIM = EMBEDDING_DIM

class QdrantStore:
    def __init__(self, url: str = QDRANT_URL, path: str = QDRANT_PATH):
        self.url = url
        self.path = path
        self.client = self._init_client()
        self._ensure_collection()

    def _init_client(self) -> QdrantClient:
        """
        Initializes Qdrant client with three modes (checked in order):
        1. QDRANT_PATH set → disk-backed embedded client (no server needed, data persists)
        2. QDRANT_URL == ':memory:' → in-memory client (data lost on restart)
        3. QDRANT_URL → connect to remote Qdrant server
           - Falls back to in-memory if ALLOW_IN_MEMORY_FALLBACK=true
           - Otherwise raises RuntimeError
        """
        # Mode 1: Disk-backed embedded Qdrant (preferred for dev without a server)
        if self.path:
            try:
                os.makedirs(self.path, exist_ok=True)
                client = QdrantClient(path=self.path)
                logger.info(f"Using disk-backed embedded Qdrant at path={self.path}")
                return client
            except Exception as e:
                logger.error(f"Failed to initialize disk-backed embedded Qdrant at {self.path}: {e}")
                raise RuntimeError(f"Disk-backed embedded Qdrant failed at {self.path}: {e}")

        # Mode 2: Explicit in-memory
        if self.url == ":memory:":
            logger.info("Using explicit in-memory QdrantClient(':memory:')")
            return QdrantClient(":memory:")

        # Mode 3: Remote server
        try:
            client = QdrantClient(url=self.url, timeout=3.0)
            client.get_collections()
            logger.info(f"Connected to Qdrant server at {self.url}")
            return client
        except Exception as e:
            allow_fallback = os.getenv("ALLOW_IN_MEMORY_FALLBACK", "false").lower() == "true"
            if allow_fallback:
                logger.warning(f"Could not connect to Qdrant server at {self.url} ({e}). Falling back to embedded in-memory Qdrant because ALLOW_IN_MEMORY_FALLBACK=true.")
                return QdrantClient(":memory:")
            logger.error(f"FATAL: External Qdrant connection to {self.url} failed: {e}")
            raise RuntimeError(f"External Qdrant server unavailable at {self.url}: {e}")

    def _ensure_collection(self) -> None:
        """
        Ensures groundguard_chunks collection exists with 384-dim Cosine vector
        and keyword payload indexes on projectId, documentId, and identifierKeys.
        """
        try:
            collections = self.client.get_collections().collections
            exists = any(c.name == COLLECTION_NAME for c in collections)
            if not exists:
                logger.info(f"Creating Qdrant collection '{COLLECTION_NAME}' (dim={VECTOR_DIM}, Cosine)...")
                self.client.create_collection(
                    collection_name=COLLECTION_NAME,
                    vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE)
                )

            # Create required payload keyword indexes for fast, isolated filtering
            for field in ["projectId", "documentId", "identifierKeys"]:
                try:
                    self.client.create_payload_index(
                        collection_name=COLLECTION_NAME,
                        field_name=field,
                        field_schema=PayloadSchemaType.KEYWORD
                    )
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Error ensuring Qdrant collection: {e}")

    def upsert_chunks(
        self,
        project_id: str,
        document_id: str,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]]
    ) -> int:
        """
        Upserts dense points with deterministic UUIDv5 pointId and project/document metadata.
        Executes with wait=True for lifecycle-critical consistency.
        """
        if not chunks or not embeddings:
            return 0

        points = []
        for chunk, vector in zip(chunks, embeddings):
            # Deterministic UUIDv5 ensures exact point-level idempotency
            seed = f"{document_id}:{chunk.get('chunk_index', 0)}"
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, seed))

            payload = {
                "projectId": project_id,
                "documentId": document_id,
                "chunkId": chunk["id"],
                "chunkIndex": chunk.get("chunk_index", 0),
                "pageNumber": chunk.get("page_number", 1),
                "section": chunk.get("section"),
                "heading": chunk.get("heading"),
                "source": chunk.get("source"),
                "revision": chunk.get("revision"),
                "identifierKeys": chunk.get("identifierKeys", []),
                "text": chunk.get("text", "")
            }

            points.append(PointStruct(id=point_id, vector=vector, payload=payload))

        self.client.upsert(
            collection_name=COLLECTION_NAME,
            points=points,
            wait=True
        )
        logger.info(f"Successfully upserted {len(points)} points to Qdrant for document_id={document_id}")
        return len(points)

    def delete_document(self, project_id: str, document_id: str) -> None:
        """
        Purges all points belonging to documentId within projectId.
        Executes with wait=True.
        """
        self.client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=Filter(
                must=[
                    FieldCondition(key="documentId", match=MatchValue(value=document_id)),
                    FieldCondition(key="projectId", match=MatchValue(value=project_id))
                ]
            ),
            wait=True
        )
        logger.info(f"Purged Qdrant points for document_id={document_id} in project_id={project_id}")

    def search_dense(
        self,
        project_id: str,
        query_vector: List[float],
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Performs ANN vector search with mandatory projectId filtering during candidate generation.
        """
        if not query_vector:
            return []

        search_filter = Filter(
            must=[
                FieldCondition(key="projectId", match=MatchValue(value=project_id))
            ]
        )

        if hasattr(self.client, "query_points"):
            response = self.client.query_points(
                collection_name=COLLECTION_NAME,
                query=query_vector,
                query_filter=search_filter,
                limit=top_k
            )
            hits = response.points
        else:
            hits = self.client.search(
                collection_name=COLLECTION_NAME,
                query_vector=query_vector,
                query_filter=search_filter,
                limit=top_k
            )

        results = []
        for hit in hits:
            payload = hit.payload or {}
            results.append({
                "chunkId": payload.get("chunkId"),
                "documentId": payload.get("documentId"),
                "projectId": payload.get("projectId"),
                "chunkIndex": payload.get("chunkIndex"),
                "pageNumber": payload.get("pageNumber"),
                "section": payload.get("section"),
                "heading": payload.get("heading"),
                "identifierKeys": payload.get("identifierKeys", []),
                "text": payload.get("text", ""),
                "score": hit.score
            })
        return results

    def count_document_points(self, project_id: str, document_id: str) -> int:
        """
        Returns number of points for a document in Qdrant.
        """
        res = self.client.count(
            collection_name=COLLECTION_NAME,
            count_filter=Filter(
                must=[
                    FieldCondition(key="documentId", match=MatchValue(value=document_id)),
                    FieldCondition(key="projectId", match=MatchValue(value=project_id))
                ]
            )
        )
        return res.count

# Singleton store
qdrant_store = QdrantStore()
