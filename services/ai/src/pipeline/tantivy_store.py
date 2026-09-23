import os
import logging
from typing import List, Dict, Any, Optional
import tantivy

logger = logging.getLogger("m2-tantivy-store")

TANTIVY_PATH = os.getenv("TANTIVY_PATH", "uploads/indexes/tantivy")

class TantivyStore:
    def __init__(self, path: Optional[str] = TANTIVY_PATH):
        self.path = path
        self.schema = self._build_schema()
        self.index = self._init_index()

    def _build_schema(self) -> tantivy.Schema:
        builder = tantivy.SchemaBuilder()
        builder.add_text_field("chunk_id", stored=True, tokenizer_name="raw")
        builder.add_text_field("document_id", stored=True, tokenizer_name="raw")
        builder.add_text_field("project_id", stored=True, tokenizer_name="raw")
        builder.add_text_field("text", stored=True, tokenizer_name="default")
        builder.add_text_field("identifiers", stored=True, tokenizer_name="default")
        builder.add_integer_field("page_number", stored=True)
        return builder.build()

    def _init_index(self) -> tantivy.Index:
        """
        Initializes disk-backed or in-memory Tantivy index.
        """
        if self.path:
            try:
                os.makedirs(self.path, exist_ok=True)
                # Try opening existing index
                if os.path.exists(os.path.join(self.path, "meta.json")):
                    logger.info(f"Opening existing Tantivy index from {self.path}")
                    return tantivy.Index.open(self.path)
                logger.info(f"Creating new Tantivy index at {self.path}")
                return tantivy.Index(self.schema, path=self.path)
            except Exception as e:
                env = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()
                if env == "production":
                    logger.error(f"FATAL: Production Tantivy disk index failed at {self.path}: {e}")
                    raise RuntimeError(f"Tantivy disk index initialization failed in production: {e}")
                logger.warning(f"Failed to initialize disk Tantivy index at {self.path} ({e}). Falling back to in-memory.")

        return tantivy.Index(self.schema)

    def index_chunks(
        self,
        project_id: str,
        document_id: str,
        chunks: List[Dict[str, Any]]
    ) -> int:
        """
        Indexes chunks into Tantivy.
        Executes writer.commit() and index.reload() to establish visibility boundary.
        """
        if not chunks:
            return 0

        writer = self.index.writer()
        try:
            # Delete previous chunks for this document if re-ingesting
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
                    page_number=int(chunk.get("page_number", 1))
                )
                writer.add_document(doc)

            writer.commit()
            self.index.reload()
            logger.info(f"Indexed {len(chunks)} chunks into Tantivy for document_id={document_id}")
            return len(chunks)
        except Exception as e:
            writer.rollback()
            logger.error(f"Error indexing chunks in Tantivy for document_id={document_id}: {e}")
            raise e

    def delete_document(self, project_id: str, document_id: str) -> None:
        """
        Deletes all chunks belonging to documentId.
        Executes writer.commit() and index.reload().
        """
        writer = self.index.writer()
        try:
            writer.delete_documents_by_term("document_id", document_id)
            writer.commit()
            self.index.reload()
            logger.info(f"Purged Tantivy documents for document_id={document_id}")
        except Exception as e:
            writer.rollback()
            logger.error(f"Error deleting Tantivy documents for document_id={document_id}: {e}")
            raise e

    def search_project(
        self,
        project_id: str,
        query: str,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Executes BM25 search with project isolation enforced during candidate generation.
        Candidate generation requires project_id match.
        """
        if not query or not query.strip():
            return []

        searcher = self.index.searcher()
        # Sanitize query for Lucene syntax
        clean_query = query.replace('"', '\\"').strip()
        scoped_query_str = f'project_id:"{project_id}" AND ({clean_query})'

        try:
            parsed_query = self.index.parse_query(scoped_query_str, ["text", "identifiers"])
            search_res = searcher.search(parsed_query, top_k)
        except Exception as e:
            logger.warning(f"Tantivy query parse failed for '{scoped_query_str}' ({e}), falling back to terms")
            try:
                # Fallback to pure term search
                term_q = f'project_id:"{project_id}"'
                parsed_query = self.index.parse_query(term_q, ["text"])
                search_res = searcher.search(parsed_query, top_k)
            except Exception:
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
                "score": float(score)
            })

        return results

    def count_document_records(self, project_id: str, document_id: str) -> int:
        """
        Returns number of records for documentId in projectId.
        """
        searcher = self.index.searcher()
        q_str = f'project_id:"{project_id}" AND document_id:"{document_id}"'
        try:
            q = self.index.parse_query(q_str, ["text"])
            res = searcher.search(q, 1000)
            return len(res.hits)
        except Exception:
            return 0

# Singleton store
tantivy_store = TantivyStore()
