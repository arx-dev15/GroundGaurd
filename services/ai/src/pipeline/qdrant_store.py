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

from src.pipeline.embedder import EMBEDDING_DIM

logger = logging.getLogger("m2-qdrant-store")

QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333").strip()
QDRANT_PATH = os.getenv("QDRANT_PATH", "").strip()
COLLECTION_NAME = "groundguard_chunks"
VECTOR_DIM = EMBEDDING_DIM


class QdrantStore:
    """
    Manages Qdrant dense vector indexing and retrieval for GroundGuard.

    Initialization modes:
      1. Remote server (QDRANT_URL set to http://...) -> production / docker mode.
      2. In-memory (QDRANT_URL == ':memory:')          -> explicit unit test mode.
      3. Disk-embedded (QDRANT_PATH set)               -> local offline dev mode.
    """

    def __init__(self, url: str = QDRANT_URL, path: str = QDRANT_PATH):
        self.url = (url or "").strip()
        self.path = (path or "").strip()
        self._env = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()
        self.client = self._init_client()
        self._ensure_collection()

    def _init_client(self) -> QdrantClient:
        """
        Determines Qdrant mode at startup based on configuration.
        Fails fast in production on any misconfiguration.
        """
        # Mode 1: Remote server (Docker / production)
        if self.url and self.url != ":memory:":
            logger.info(f"Connecting to Qdrant server at {self.url}...")
            try:
                client = QdrantClient(url=self.url, timeout=3.0)
                client.get_collections()
                logger.info(f"Connected to authoritative Qdrant server at {self.url}")
                return client
            except Exception as e:
                if self._env == "production":
                    logger.critical(
                        f"FATAL: Authoritative external Qdrant connection to {self.url} failed in production: {e}. "
                        "Fallback to embedded or in-memory storage is strictly prohibited in production."
                    )
                    raise RuntimeError(
                        f"FATAL: Cannot connect to authoritative Qdrant server at {self.url}: {e}. "
                        "Service failing closed: production requires a healthy external Qdrant cluster."
                    ) from e

                if self.path:
                    path_to_try = self.path
                    if not os.path.isabs(path_to_try):
                        from pathlib import Path
                        repo_root = Path(__file__).resolve().parent.parent.parent.parent
                        path_to_try = str((repo_root / path_to_try).resolve())
                    logger.warning(
                        f"Could not connect to Qdrant server at {self.url} ({e}). "
                        f"Falling back to embedded disk Qdrant at {path_to_try} (development mode only)."
                    )
                    try:
                        os.makedirs(path_to_try, exist_ok=True)
                        return QdrantClient(path=path_to_try)
                    except Exception as path_err:
                        logger.warning(f"Embedded disk Qdrant fallback failed: {path_err}")

                allow_fallback = os.getenv("ALLOW_IN_MEMORY_FALLBACK", "false").lower() == "true"
                if allow_fallback:
                    logger.warning(
                        f"Could not connect to Qdrant server at {self.url} ({e}). "
                        f"Falling back to embedded in-memory Qdrant (ALLOW_IN_MEMORY_FALLBACK=true, development mode only)."
                    )
                    return QdrantClient(":memory:")

                logger.error(f"FATAL: External Qdrant connection to {self.url} failed: {e}")
                raise RuntimeError(
                    f"FATAL: Cannot connect to Qdrant server at {self.url}: {e}. "
                    f"Ensure Qdrant is running."
                ) from e

        # Mode 2: Explicit in-memory (unit tests only)
        if self.url == ":memory:":
            if self._env == "production":
                raise RuntimeError("FATAL: QDRANT_URL=:memory: is not permitted in production.")
            logger.info("Using explicit in-memory QdrantClient (test mode).")
            return QdrantClient(":memory:")

        # Mode 3: Disk-embedded (when QDRANT_PATH is explicitly set)
        if self.path:
            if self._env == "production":
                raise RuntimeError(
                    f"FATAL: QDRANT_PATH ({self.path}) disk-embedded mode is not permitted in production."
                )
            try:
                os.makedirs(self.path, exist_ok=True)
                client = QdrantClient(path=self.path)
                logger.info(f"Using disk-backed embedded Qdrant at path={self.path}")
                return client
            except Exception as e:
                raise RuntimeError(f"FATAL: Failed to initialize disk-embedded Qdrant at {self.path}: {e}") from e

        # Fallback if neither URL nor path provided
        raise RuntimeError(
            "FATAL: Qdrant is not configured. Set QDRANT_URL for Docker/production, "
            "or QDRANT_PATH for offline embedded dev."
        )

    def _ensure_collection(self) -> None:
        """
        Ensures the groundguard_chunks collection exists with correct schema.
        """
        try:
            collections = self.client.get_collections().collections
            exists = any(c.name == COLLECTION_NAME for c in collections)
            if not exists:
                logger.info(f"Creating Qdrant collection '{COLLECTION_NAME}' (dim={VECTOR_DIM}, Cosine)...")
                self.client.create_collection(
                    collection_name=COLLECTION_NAME,
                    vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
                )
                logger.info(f"Collection '{COLLECTION_NAME}' created.")

            # Create required payload keyword indexes for fast, isolated filtering
            for field in ["projectId", "documentId", "identifierKeys"]:
                try:
                    self.client.create_payload_index(
                        collection_name=COLLECTION_NAME,
                        field_name=field,
                        field_schema=PayloadSchemaType.KEYWORD,
                    )
                except Exception as idx_err:
                    logger.debug(f"Payload index on '{field}' notice: {idx_err}")
        except Exception as e:
            raise RuntimeError(
                f"FATAL: Failed to ensure Qdrant collection '{COLLECTION_NAME}': {e}. "
                f"Service cannot operate without a valid collection."
            ) from e

    def upsert_chunks(
        self,
        project_id: str,
        document_id: str,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]],
    ) -> int:
        """
        Upserts dense points with deterministic UUIDv5 pointId and full provenance payload.
        Uses wait=True for lifecycle-critical consistency.
        """
        if not chunks or not embeddings:
            return 0

        points = []
        for chunk, vector in zip(chunks, embeddings):
            seed = f"{document_id}:{chunk.get('chunk_index', 0)}"
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, seed))

            chunk_id = chunk.get("id") or chunk.get("chunkId") or chunk.get("chunk_id") or str(uuid.uuid4().hex[:12])
            payload = {
                "projectId": project_id,
                "documentId": document_id,
                "chunkId": chunk_id,
                "chunkIndex": chunk.get("chunk_index", 0),
                "pageNumber": chunk.get("page_number", chunk.get("pageNumber", 1)),
                "section": chunk.get("section"),
                "heading": chunk.get("heading"),
                "source": chunk.get("source"),
                "revision": chunk.get("revision"),
                "identifierKeys": chunk.get("identifierKeys", []),
                "text": chunk.get("text", ""),
                "metadata": chunk.get("metadata", {}),
            }
            points.append(PointStruct(id=point_id, vector=vector, payload=payload))

        self.client.upsert(
            collection_name=COLLECTION_NAME,
            points=points,
            wait=True,
        )
        logger.info(f"Upserted {len(points)} points to Qdrant for document_id={document_id}.")
        return len(points)

    def delete_document(self, project_id: str, document_id: str) -> None:
        """
        Purges all points belonging to documentId within projectId.
        Both filters are mandatory — projectId ensures cross-project isolation.
        Uses wait=True for lifecycle-critical consistency.
        """
        self.client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=Filter(
                must=[
                    FieldCondition(key="documentId", match=MatchValue(value=document_id)),
                    FieldCondition(key="projectId", match=MatchValue(value=project_id)),
                ]
            ),
            wait=True,
        )
        logger.info(f"Purged Qdrant points for document_id={document_id} in project_id={project_id}.")

    def search_dense(
        self,
        project_id: str,
        query_vector: List[float],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Performs ANN vector search with mandatory projectId filtering during candidate generation.
        Defensively validates returned candidates against project_id.
        """
        if not query_vector:
            raise RuntimeError(
                "search_dense called with empty query_vector. "
                "Embedding model may have failed to produce a vector."
            )

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
                limit=top_k,
            )
            hits = response.points
        else:
            hits = self.client.search(
                collection_name=COLLECTION_NAME,
                query_vector=query_vector,
                query_filter=search_filter,
                limit=top_k,
            )

        results = []
        for hit in hits:
            payload = hit.payload or {}
            candidate_project = payload.get("projectId", "")
            if candidate_project != project_id:
                logger.warning(
                    f"Qdrant returned point with projectId={candidate_project!r}, "
                    f"expected {project_id!r}. Point id={hit.id}. Skipping."
                )
                continue

            results.append({
                "chunkId": payload.get("chunkId"),
                "documentId": payload.get("documentId"),
                "projectId": candidate_project,
                "chunkIndex": payload.get("chunkIndex"),
                "pageNumber": payload.get("pageNumber"),
                "section": payload.get("section"),
                "heading": payload.get("heading"),
                "identifierKeys": payload.get("identifierKeys", []),
                "text": payload.get("text", ""),
                "score": hit.score,
                "metadata": payload.get("metadata", {}),
            })
        return results

    def count_document_points(self, project_id: str, document_id: str) -> int:
        """
        Returns number of points for a document in Qdrant within projectId.
        """
        res = self.client.count(
            collection_name=COLLECTION_NAME,
            count_filter=Filter(
                must=[
                    FieldCondition(key="documentId", match=MatchValue(value=document_id)),
                    FieldCondition(key="projectId", match=MatchValue(value=project_id)),
                ]
            ),
        )
        return res.count


# Singleton store — initialized at service startup
qdrant_store = QdrantStore()
