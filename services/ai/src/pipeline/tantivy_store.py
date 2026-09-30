import os
import logging
from typing import List, Dict, Any, Optional
import tantivy

logger = logging.getLogger("m2-tantivy-store")

TANTIVY_PATH = os.getenv("TANTIVY_PATH", "")
_MEMORY_MODE = TANTIVY_PATH.strip().lower() == ":memory:"
_ENV = os.getenv("ENVIRONMENT", "development").lower()

# Validate TANTIVY_PATH at import time.
if not TANTIVY_PATH.strip():
    raise RuntimeError(
        "FATAL: TANTIVY_PATH is not configured. "
        "Set TANTIVY_PATH=/absolute/path for disk-backed index, "
        "or TANTIVY_PATH=:memory: for unit tests only."
    )
if _MEMORY_MODE and _ENV == "production":
    raise RuntimeError(
        "FATAL: TANTIVY_PATH=:memory: is not permitted in production. "
        "Set TANTIVY_PATH to a persistent disk path."
    )


def _build_schema() -> tantivy.Schema:
    builder = tantivy.SchemaBuilder()
    builder.add_text_field("chunk_id", stored=True, tokenizer_name="raw")
    builder.add_text_field("document_id", stored=True, tokenizer_name="raw")
    builder.add_text_field("project_id", stored=True, tokenizer_name="raw")
    builder.add_text_field("text", stored=True, tokenizer_name="default")
    builder.add_text_field("identifiers", stored=True, tokenizer_name="default")
    builder.add_integer_field("page_number", stored=True)
    return builder.build()


class TantivyStore:
    """
    Per-project BM25 lexical index using disk-backed Tantivy.

    Invariants:
    - Each project gets its own sub-directory: TANTIVY_PATH/{project_id}/
    - No global single index across all projects.
    - No silent in-memory fallback — always raises on disk failure.
    - Project scope is enforced inside the query, not as a post-filter.
    - Raises RuntimeError on any infrastructure failure (never returns []).
    """

    def __init__(self, base_path: str = TANTIVY_PATH):
        self.base_path = base_path
        self.schema = _build_schema()
        # Per-project index cache: project_id → tantivy.Index
        self._indexes: Dict[str, tantivy.Index] = {}

    def _get_index(self, project_id: str) -> tantivy.Index:
        """
        Returns (creating if necessary) the per-project Tantivy index.
        Raises RuntimeError on any disk failure — no memory fallback.
        """
        if project_id in self._indexes:
            return self._indexes[project_id]

        if _MEMORY_MODE:
            idx = tantivy.Index(self.schema)
            self._indexes[project_id] = idx
            return idx

        project_path = os.path.join(self.base_path, project_id)
        try:
            os.makedirs(project_path, exist_ok=True)
            meta_path = os.path.join(project_path, "meta.json")
            if os.path.exists(meta_path):
                logger.info(f"Opening existing Tantivy index for project_id={project_id} at {project_path}")
                idx = tantivy.Index.open(project_path)
            else:
                logger.info(f"Creating new Tantivy index for project_id={project_id} at {project_path}")
                idx = tantivy.Index(self.schema, path=project_path)
        except Exception as e:
            raise RuntimeError(
                f"FATAL: Failed to initialize Tantivy disk index for project_id={project_id} "
                f"at {project_path}: {e}. "
                f"Check TANTIVY_PATH is a writable directory on a mounted persistent volume."
            ) from e

        self._indexes[project_id] = idx
        return idx

    def index_chunks(
        self,
        project_id: str,
        document_id: str,
        chunks: List[Dict[str, Any]],
    ) -> int:
        """
        Indexes chunks into the per-project Tantivy index.
        Deletes prior entries for this document before inserting (idempotent re-ingest).
        Raises on any failure.
        """
        if not chunks:
            return 0

        idx = self._get_index(project_id)
        writer = idx.writer()
        try:
            writer.delete_documents_by_term("document_id", document_id)

            for chunk in chunks:
                ident_list = chunk.get("identifierKeys", [])
                ident_str = " ".join(ident_list) if isinstance(ident_list, list) else str(ident_list)

                doc = tantivy.Document(
                    chunk_id=[str(chunk["id"])],
                    document_id=[str(document_id)],
                    project_id=[str(project_id)],
                    text=[str(chunk.get("text", ""))],
                    identifiers=[ident_str],
                    page_number=int(chunk.get("page_number", 1)),
                )
                writer.add_document(doc)

            writer.commit()
            idx.reload()
            logger.info(f"Indexed {len(chunks)} chunks into Tantivy for document_id={document_id} project_id={project_id}.")
            return len(chunks)
        except Exception as e:
            writer.rollback()
            logger.error(f"Tantivy index_chunks failed for document_id={document_id}: {e}")
            raise RuntimeError(
                f"Tantivy indexing failure for document_id={document_id}: {e}"
            ) from e

    def delete_document(self, project_id: str, document_id: str) -> None:
        """
        Deletes all chunks for documentId in the per-project index.
        Uses both project_id (index isolation) and document_id (record filter) for safety.
        Raises on failure.
        """
        idx = self._get_index(project_id)
        writer = idx.writer()
        try:
            # Per-project index provides project isolation at the filesystem level.
            # document_id term scopes deletion within this project's index.
            writer.delete_documents_by_term("document_id", document_id)
            writer.commit()
            idx.reload()
            logger.info(f"Purged Tantivy records for document_id={document_id} in project_id={project_id}.")
        except Exception as e:
            writer.rollback()
            logger.error(f"Tantivy delete_document failed for document_id={document_id}: {e}")
            raise RuntimeError(
                f"Tantivy deletion failure for document_id={document_id}: {e}"
            ) from e

    def search_project(
        self,
        project_id: str,
        query: str,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Executes BM25 search scoped to project_id.

        Project isolation is enforced inside the Tantivy query itself
        (not as a post-search filter). Per-project index provides a second
        isolation boundary at the filesystem level.

        Raises RuntimeError on infrastructure failure — never returns [] silently.
        """
        if not query or not query.strip():
            return []

        idx = self._get_index(project_id)
        searcher = idx.searcher()
        clean_query = query.replace('"', '\\"').strip()
        # project_id scoped in the query AND isolated by per-project index — double enforcement.
        scoped_query_str = f'project_id:"{project_id}" AND ({clean_query})'

        try:
            parsed_query = idx.parse_query(scoped_query_str, ["text", "identifiers"])
            search_res = searcher.search(parsed_query, top_k)
        except Exception as e:
            # Do NOT silently drop the user query or return [].
            # Raise so the retrieval orchestrator can handle/log/fail properly.
            raise RuntimeError(
                f"Tantivy query parse/search failed for project_id={project_id}: {e}. "
                f"Query: {scoped_query_str!r}"
            ) from e

        results = []
        for score, doc_address in search_res.hits:
            doc = searcher.doc(doc_address)
            d = doc.to_dict() if hasattr(doc, "to_dict") else {}
            results.append({
                "chunkId": d.get("chunk_id", [None])[0],
                "documentId": d.get("document_id", [None])[0],
                "projectId": d.get("project_id", [None])[0],
                "text": d.get("text", [""])[0],
                "identifiers": d.get("identifiers", [""])[0],
                "pageNumber": d.get("page_number", [1])[0],
                "score": float(score),
            })

        return results

    def count_document_records(self, project_id: str, document_id: str) -> int:
        """Returns number of records for documentId in per-project index."""
        try:
            idx = self._get_index(project_id)
            searcher = idx.searcher()
            q_str = f'project_id:"{project_id}" AND document_id:"{document_id}"'
            q = idx.parse_query(q_str, ["text"])
            res = searcher.search(q, 10000)
            return len(res.hits)
        except Exception as e:
            logger.error(f"Tantivy count_document_records failed: {e}")
            raise RuntimeError(f"Tantivy count failure: {e}") from e


# Singleton store — initialized once at service startup.
tantivy_store = TantivyStore()
