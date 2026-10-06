import os
import re
import uuid
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
import tantivy

logger = logging.getLogger("m2-tantivy-store")

def _resolve_canonical_path(path_str: str) -> str:
    cleaned = (path_str or "uploads/indexes/tantivy").strip()
    if cleaned.lower() == ":memory:":
        return ":memory:"
    if os.path.isabs(cleaned):
        return cleaned
    repo_root = Path(__file__).resolve().parents[4]
    return str((repo_root / cleaned).resolve())

TANTIVY_PATH = _resolve_canonical_path(os.getenv("TANTIVY_PATH", "uploads/indexes/tantivy"))
_MEMORY_MODE = TANTIVY_PATH.lower() == ":memory:"
_ENV = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()

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
    - Isolated schema & indexes: queries never touch indexes of other projects.
    - Safe default fallback to canonical "uploads/indexes/tantivy".
    - Explicit in-memory mode supported via TANTIVY_PATH=:memory: for unit tests.
    """

    def __init__(self, base_path: str = TANTIVY_PATH):
        self.base_path = _resolve_canonical_path(base_path)
        self.schema = _build_schema()
        self._indexes: Dict[str, tantivy.Index] = {}

    def _get_index(self, project_id: str) -> tantivy.Index:
        """
        Retrieves or initializes the Tantivy index for a given project_id.
        """
        if project_id in self._indexes:
            return self._indexes[project_id]

        if self.base_path.lower() == ":memory:":
            logger.info(f"Using in-memory Tantivy index for project_id={project_id}")
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
        writer = idx.writer(heap_size=15_000_000, num_threads=1)
        try:
            writer.delete_documents_by_term("document_id", document_id)

            for chunk in chunks:
                ident_list = chunk.get("identifierKeys", [])
                ident_str = " ".join(ident_list) if isinstance(ident_list, list) else str(ident_list)
                chunk_id = chunk.get("id") or chunk.get("chunkId") or chunk.get("chunk_id") or str(uuid.uuid4().hex[:12])
                doc = tantivy.Document(
                    chunk_id=[str(chunk_id)],
                    document_id=[str(document_id)],
                    project_id=[str(project_id)],
                    text=[str(chunk.get("text", ""))],
                    identifiers=[ident_str],
                    page_number=int(chunk.get("page_number", chunk.get("pageNumber", 1))),
                )
                writer.add_document(doc)

            writer.commit()
            idx.reload()
            logger.info(f"Indexed {len(chunks)} chunks into Tantivy for document_id={document_id} project_id={project_id}.")
            return len(chunks)
        except Exception as e:
            try:
                writer.rollback()
            except Exception:
                pass
            logger.error(f"Tantivy index_chunks failed for document_id={document_id}: {e}")
            raise RuntimeError(
                f"Tantivy indexing failure for document_id={document_id}: {e}"
            ) from e
        finally:
            del writer
            import gc
            gc.collect()

    def delete_document(self, project_id: str, document_id: str) -> None:
        """
        Deletes all chunks for documentId in the per-project index.
        Uses both project_id (index isolation) and document_id (record filter) for safety.
        Raises on failure.
        """
        idx = self._get_index(project_id)
        writer = idx.writer()
        try:
            writer.delete_documents_by_term("document_id", document_id)
            writer.commit()
            idx.reload()
            logger.info(f"Purged Tantivy records for document_id={document_id} in project_id={project_id}.")
        except Exception as e:
            try:
                writer.rollback()
            except Exception:
                pass
            logger.error(f"Tantivy delete_document failed for document_id={document_id}: {e}")
            raise RuntimeError(
                f"Tantivy deletion failure for document_id={document_id}: {e}"
            ) from e
        finally:
            del writer

    def search_project(
        self,
        project_id: str,
        query: str,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Executes BM25 search scoped to project_id.
        Project isolation is enforced inside the Tantivy query itself
        and by the per-project directory boundary.
        """
        if not query or not query.strip():
            return []

        idx = self._get_index(project_id)
        searcher = idx.searcher()

        # Sanitize query for Tantivy syntax safety while preserving all terms, identifiers, and tokens
        sanitized_query = re.sub(r'[`~"^\[\]{}():\\/+|!*?]', ' ', query)
        sanitized_query = re.sub(r'\s+', ' ', sanitized_query).strip()
        if not sanitized_query:
            return []

        scoped_query_str = f'project_id:"{project_id}" AND ({sanitized_query})'

        try:
            parsed_query = idx.parse_query(scoped_query_str, ["text", "identifiers"])
            search_res = searcher.search(parsed_query, top_k)
        except Exception as e:
            logger.warning(f"Tantivy query parse failed ({e}), attempting alphanumeric fallback...")
            safe_fallback = re.sub(r'[^a-zA-Z0-9_\s-]', ' ', query).strip()
            if safe_fallback:
                fallback_str = f'project_id:"{project_id}" AND ({safe_fallback})'
                try:
                    parsed_query = idx.parse_query(fallback_str, ["text", "identifiers"])
                    search_res = searcher.search(parsed_query, top_k)
                except Exception as fe:
                    logger.warning(f"Tantivy fallback query failed for project_id={project_id}: {fe}")
                    return []
            else:
                return []

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


# Singleton store — initialized at service startup
tantivy_store = TantivyStore()
