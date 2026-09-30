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

QDRANT_URL = os.getenv("QDRANT_URL", "")
QDRANT_PATH = os.getenv("QDRANT_PATH", "")  # Only valid when QDRANT_URL is not set.
COLLECTION_NAME = "groundguard_chunks"
VECTOR_DIM = EMBEDDING_DIM


class QdrantStore:
    """
    Manages Qdrant dense vector indexing and retrieval for GroundGuard.

    Initialization modes — determined at startup, never switched at runtime:
      1. Remote server (QDRANT_URL set)       → production / docker mode.
      2. Disk-embedded (QDRANT_PATH set, QDRANT_URL empty) → local offline dev only.
      3. In-memory (:memory: explicit)         → unit tests only.

    Invariants:
    - No silent fallback from remote to embedded/memory at runtime.
    - No ALLOW_IN_MEMORY_FALLBACK escape hatch.
    - projectId filter is mandatory on every search.
    - wait=True on all lifecycle-critical writes and deletes.
    - 384-dim Cosine only.
    """

    def __init__(self, url: str = QDRANT_URL, path: str = QDRANT_PATH):
        self.url = url.strip()
        self.path = path.strip()
        self._env = os.getenv("ENVIRONMENT", "development").lower()
        self.client = self._init_client()
        self._ensure_collection()

    def _init_client(self) -> QdrantClient:
        """
        Determines Qdrant mode at startup based on configuration.
        Fails fast on any misconfiguration — no silent runtime fallback.
        """
        # Mode 1: Remote server (Docker / production).
        if self.url and self.url != ":memory:":
            logger.info(f"Connecting to Qdrant server at {self.url}...")
            try:
                client = QdrantClient(url=self.url, timeout=5.0)
                client.get_collections()
                logger.info(f"Connected to Qdrant server at {self.url}.")
                return client
            except Exception as e:
                # Hard-fail — no fallback to disk or memory.
                raise RuntimeError(
                    f"FATAL: Cannot connect to Qdrant server at {self.url}: {e}. "
                    f"Ensure Qdrant is running. "
                    f"Do not set QDRANT_PATH as a fallback — fix the server connection."
                ) from e

        # Mode 2: Explicit in-memory (unit tests only, via QDRANT_URL=:memory:).
        if self.url == ":memory:":
            if self._env == "production":
                raise RuntimeError(
                    "FATAL: QDRANT_URL=:memory: is not permitted in production."
                )
            logger.info("Using explicit in-memory QdrantClient (test mode).")
            return QdrantClient(":memory:")

        # Mode 3: Disk-embedded (only when QDRANT_URL is not set at all).
        if self.path:
            if self._env == "production":
                raise RuntimeError(
                    f"FATAL: QDRANT_PATH ({self.path}) disk-embedded mode is not permitted in production. "
                    f"Set QDRANT_URL to an external Qdrant server."
                )
            try:
                os.makedirs(self.path, exist_ok=True)
                client = QdrantClient(path=self.path)
                logger.info(f"Using disk-embedded Qdrant at {self.path} (offline dev only).")
                return client
            except Exception as e:
                raise RuntimeError(
                    f"FATAL: Failed to initialize disk-embedded Qdrant at {self.path}: {e}"
                ) from e

        # Neither URL nor PATH configured.
        raise RuntimeError(
            "FATAL: Qdrant is not configured. "
            "Set QDRANT_URL=http://... for Docker/production, "
            "QDRANT_URL=:memory: for unit tests, "
            "or QDRANT_PATH=/path for offline disk-embedded dev."
        )

    def _ensure_collection(self) -> None:
        """
        Ensures the groundguard_chunks collection exists with correct schema.
        Raises on failure — a broken collection means the store is unusable.
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

            # Create payload indexes for fast filtered ANN search.
            for field in ["projectId", "documentId", "identifierKeys"]:
                try:
                    self.client.create_payload_index(
                        collection_name=COLLECTION_NAME,
                        field_name=field,
                        field_schema=PayloadSchemaType.KEYWORD,
                    )
                except Exception as idx_err:
                    # Indexes may already exist — log but don't fail.
                    logger.warning(
                        f"Could not create Qdrant payload index for field '{field}': {idx_err}. "
                        f"Search will still work but may be slower (full scan)."
                    )
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
                "text": chunk.get("text", ""),
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
        Performs ANN vector search with mandatory projectId filtering.
        projectId filter is applied during candidate generation, not post-search.

        Raises RuntimeError if query_vector is empty or malformed.
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
                # Defensive guard: should never happen with filter, but log if it does.
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
            })
        return results

    def count_document_points(self, project_id: str, document_id: str) -> int:
        """Returns number of points for a document in Qdrant."""
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


# Singleton store — initialized once at service startup.
qdrant_store = QdrantStore()
