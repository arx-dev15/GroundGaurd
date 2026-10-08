import os
import time
import uuid
import logging
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http.exceptions import ResponseHandlingException
from qdrant_client.http.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    MatchAny,
    PayloadSchemaType,
)

from pathlib import Path
from src.pipeline.embedder import EMBEDDING_DIM

logger = logging.getLogger("m2-qdrant-store")

def _resolve_canonical_path(path_str: str) -> str:
    cleaned = (path_str or "uploads/indexes/qdrant_embedded").strip()
    if cleaned.lower() == ":memory:":
        return ":memory:"
    if os.path.isabs(cleaned):
        return cleaned
    repo_root = Path(__file__).resolve().parents[4]
    return str((repo_root / cleaned).resolve())

QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333").strip()
QDRANT_PATH = _resolve_canonical_path(os.getenv("QDRANT_PATH", "uploads/indexes/qdrant_embedded"))
COLLECTION_NAME = "groundguard_chunks"
VECTOR_DIM = EMBEDDING_DIM
# Seconds between reconnect attempts while the configured Qdrant server is unreachable.
RECONNECT_INTERVAL_SEC = float(os.getenv("QDRANT_RECONNECT_INTERVAL_SEC", "10"))


class QdrantUnavailableError(RuntimeError):
    """Raised when the configured dense vector backend cannot be reached."""


class QdrantStore:
    """
    Manages Qdrant dense vector indexing and retrieval for GroundGuard.

    Backend selection (explicit, reported via status()):
      1. "server"   — QDRANT_URL set to http://... (default http://127.0.0.1:6333) -> docker / production.
      2. "memory"   — QDRANT_URL == ':memory:'                                      -> explicit unit test mode.
      3. "embedded" — QDRANT_URL empty and QDRANT_PATH set                         -> explicit offline dev mode.

    If the configured server is unreachable the store does NOT silently switch to a different
    store (which would serve a stale/empty vector set while reporting healthy). Instead it stays
    on the configured server in an "unavailable" state, reconnects lazily, and raises
    QdrantUnavailableError on use. Embedded fallback in development requires the explicit
    opt-in QDRANT_ALLOW_EMBEDDED_FALLBACK=true and is reported as backend "embedded_fallback".
    """

    def __init__(self, url: str = QDRANT_URL, path: str = QDRANT_PATH):
        self.url = (url or "").strip()
        self.path = _resolve_canonical_path(path) if (path and path != ":memory:") else (path or "").strip()
        self._env = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()
        self.backend: str = ""
        self.last_error: Optional[str] = None
        self._last_connect_attempt = 0.0
        self._client: Optional[QdrantClient] = self._init_client()
        if self._client is not None:
            self._ensure_collection()

    @property
    def client(self) -> QdrantClient:
        """Active client; raises QdrantUnavailableError if the configured backend is unreachable."""
        if self._client is None:
            self._try_reconnect()
        if self._client is None:
            raise QdrantUnavailableError(
                f"Qdrant dense backend unavailable (backend={self.backend}, url={self.url}): {self.last_error}"
            )
        return self._client

    @property
    def available(self) -> bool:
        return self._client is not None

    def _try_reconnect(self, force: bool = False) -> None:
        if self.backend != "server" or self._client is not None:
            return
        now = time.monotonic()
        if not force and now - self._last_connect_attempt < RECONNECT_INTERVAL_SEC:
            return
        self._last_connect_attempt = now
        try:
            client = QdrantClient(url=self.url, timeout=3.0)
            client.get_collections()
            self._client = client
            self._ensure_collection()
            self.last_error = None
            logger.info(f"Reconnected to Qdrant server at {self.url}; dense retrieval restored.")
        except Exception as e:
            self._client = None
            self.last_error = str(e)
            logger.warning(f"Qdrant server at {self.url} still unreachable: {e}")

    def _init_client(self) -> Optional[QdrantClient]:
        """
        Determines Qdrant mode at startup based on configuration.
        Fails fast in production on any misconfiguration.
        Returns None (backend unavailable, dense retrieval degraded) when the configured
        development server is unreachable and no explicit fallback is enabled.
        """
        # Mode 1: Remote server (Docker / production)
        if self.url and self.url != ":memory:":
            self.backend = "server"
            logger.info(f"Connecting to Qdrant server at {self.url}...")
            self._last_connect_attempt = time.monotonic()
            try:
                client = QdrantClient(url=self.url, timeout=3.0)
                client.get_collections()
                logger.info(f"Connected to authoritative Qdrant server at {self.url}")
                return client
            except Exception as e:
                self.last_error = str(e)
                if self._env == "production":
                    logger.critical(
                        f"FATAL: Authoritative external Qdrant connection to {self.url} failed in production: {e}. "
                        "Fallback to embedded or in-memory storage is strictly prohibited in production."
                    )
                    raise RuntimeError(
                        f"FATAL: Cannot connect to authoritative Qdrant server at {self.url}: {e}. "
                        "Service failing closed: production requires a healthy external Qdrant cluster."
                    ) from e

                if os.getenv("QDRANT_ALLOW_EMBEDDED_FALLBACK", "false").lower() == "true":
                    path_to_try = self.path or _resolve_canonical_path("uploads/indexes/qdrant_embedded")
                    logger.warning(
                        f"Could not connect to Qdrant server at {self.url} ({e}). "
                        f"Falling back to embedded disk Qdrant at {path_to_try} "
                        f"(QDRANT_ALLOW_EMBEDDED_FALLBACK=true, development mode only). "
                        f"Vectors in this store may differ from the server store."
                    )
                    try:
                        os.makedirs(path_to_try, exist_ok=True)
                        client = QdrantClient(path=path_to_try)
                        self.backend = "embedded_fallback"
                        self.path = path_to_try
                        return client
                    except Exception as path_err:
                        logger.warning(f"Embedded disk Qdrant fallback failed: {path_err}")

                if os.getenv("ALLOW_IN_MEMORY_FALLBACK", "false").lower() == "true":
                    logger.warning(
                        f"Could not connect to Qdrant server at {self.url} ({e}). "
                        f"Falling back to embedded in-memory Qdrant (ALLOW_IN_MEMORY_FALLBACK=true, development mode only)."
                    )
                    self.backend = "memory_fallback"
                    return QdrantClient(":memory:")

                logger.error(
                    f"Qdrant server at {self.url} is unreachable: {e}. Dense retrieval is UNAVAILABLE; "
                    f"the service will run lexical-only (reported by /health) and retry the connection. "
                    f"Start Qdrant, or set QDRANT_URL='' with QDRANT_PATH for explicit embedded mode."
                )
                return None

        # Mode 2: Explicit in-memory (unit tests only)
        if self.url == ":memory:":
            if self._env == "production":
                raise RuntimeError("FATAL: QDRANT_URL=:memory: is not permitted in production.")
            logger.info("Using explicit in-memory QdrantClient (test mode).")
            self.backend = "memory"
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
                self.backend = "embedded"
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
        document_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Performs ANN vector search with mandatory projectId filtering during candidate generation,
        optionally restricted to document_ids (explicitly named documents).
        Defensively validates returned candidates against project_id (and document scope).
        """
        if not query_vector:
            raise RuntimeError(
                "search_dense called with empty query_vector. "
                "Embedding model may have failed to produce a vector."
            )

        must = [FieldCondition(key="projectId", match=MatchValue(value=project_id))]
        if document_ids:
            must.append(FieldCondition(key="documentId", match=MatchAny(any=list(document_ids))))
        search_filter = Filter(must=must)

        client = self.client
        try:
            if hasattr(client, "query_points"):
                response = client.query_points(
                    collection_name=COLLECTION_NAME,
                    query=query_vector,
                    query_filter=search_filter,
                    limit=top_k,
                )
                hits = response.points
            else:
                hits = client.search(
                    collection_name=COLLECTION_NAME,
                    query_vector=query_vector,
                    query_filter=search_filter,
                    limit=top_k,
                )
        except ResponseHandlingException as e:
            # Transport-level failure (server down / unreachable): mark unavailable so the
            # next call reconnects lazily, and surface it as an explicit dense outage.
            self.last_error = str(e)
            if self.backend == "server":
                self._client = None
            raise QdrantUnavailableError(f"Qdrant dense search failed at {self.url}: {e}") from e

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
            if document_ids and payload.get("documentId") not in document_ids:
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

    def delete_stale_document_points(self, project_id: str, document_id: str, keep_chunk_ids: List[str]) -> None:
        """
        Removes points of (project_id, document_id) whose chunkId is not in keep_chunk_ids.
        Used after a repair upsert so re-chunked documents do not leave orphan points behind.
        """
        self.client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=Filter(
                must=[
                    FieldCondition(key="documentId", match=MatchValue(value=document_id)),
                    FieldCondition(key="projectId", match=MatchValue(value=project_id)),
                ],
                must_not=[FieldCondition(key="chunkId", match=MatchAny(any=list(keep_chunk_ids)))],
            ),
            wait=True,
        )

    def status(self) -> Dict[str, Any]:
        """
        Live probe of the dense backend for health/readiness reporting.
        Never raises; reports availability, backend kind and collection shape.
        """
        info: Dict[str, Any] = {
            "backend": self.backend,
            "url": self.url if self.backend == "server" else None,
            "path": self.path if self.backend in ("embedded", "embedded_fallback") else None,
            "collection": COLLECTION_NAME,
            "available": False,
            "authoritative": self.backend in ("server", "embedded", "memory"),
        }
        try:
            coll = self.client.get_collection(COLLECTION_NAME)
            vectors = coll.config.params.vectors
            info["available"] = True
            info["pointsCount"] = coll.points_count
            info["vectorSize"] = getattr(vectors, "size", None)
            info["expectedVectorSize"] = VECTOR_DIM
            self.last_error = None
        except QdrantUnavailableError:
            info["error"] = self.last_error
        except Exception as e:
            self.last_error = str(e)
            info["error"] = str(e)
        return info


# Singleton store — initialized at service startup
qdrant_store = QdrantStore()
