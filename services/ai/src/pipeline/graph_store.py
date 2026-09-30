import os
import re
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
import networkx as nx
from networkx.readwrite import json_graph

from src.pipeline.extractor import extract_identifiers, Identifier

logger = logging.getLogger("m2-graph-store")

GRAPHS_PATH = os.getenv("GRAPHS_PATH", "uploads/graphs").strip()

# Explicit directional predicate patterns connecting two identifiers
# Example: "Valve V-204 is upstream of pump P-101A"
OPTIONAL_NOUNS = r'(?:(?:the|pump|valve|tank|vessel|unit|line|compressor|pipe)\s+)?'

RELATIONAL_PATTERNS = [
    (re.compile(r'(\b[A-Z]{1,3}-\d{2,4}[A-Z]?\b)\s+(?:is\s+)?upstream\s+of\s+' + OPTIONAL_NOUNS + r'(\b[A-Z]{1,3}-\d{2,4}[A-Z]?\b)', re.IGNORECASE), "upstream_of"),
    (re.compile(r'(\b[A-Z]{1,3}-\d{2,4}[A-Z]?\b)\s+(?:is\s+)?downstream\s+of\s+' + OPTIONAL_NOUNS + r'(\b[A-Z]{1,3}-\d{2,4}[A-Z]?\b)', re.IGNORECASE), "downstream_of"),
    (re.compile(r'(\b[A-Z]{1,3}-\d{2,4}[A-Z]?\b)\s+(?:is\s+)?connected\s+to\s+' + OPTIONAL_NOUNS + r'(\b[A-Z]{1,3}-\d{2,4}[A-Z]?\b)', re.IGNORECASE), "connected_to"),
    (re.compile(r'(\b[A-Z]{1,3}-\d{2,4}[A-Z]?\b)\s+(?:discharges|feeds)\s+(?:in)?to\s+' + OPTIONAL_NOUNS + r'(\b[A-Z]{1,3}-\d{2,4}[A-Z]?\b)', re.IGNORECASE), "discharges_to"),
    (re.compile(r'(\b[A-Z]{1,3}-\d{2,4}[A-Z]?\b)\s+(?:is\s+)?isolated\s+by\s+' + OPTIONAL_NOUNS + r'(\b[A-Z]{1,3}-\d{2,4}[A-Z]?\b)', re.IGNORECASE), "isolated_by")
]


class GraphStore:
    def __init__(self, base_path: str = GRAPHS_PATH):
        self.base_path = (base_path or "uploads/graphs").strip()
        os.makedirs(self.base_path, exist_ok=True)

    def _get_project_graph_path(self, project_id: str) -> str:
        proj_dir = os.path.join(self.base_path, project_id)
        os.makedirs(proj_dir, exist_ok=True)
        return os.path.join(proj_dir, "topology.json")

    def load_graph(self, project_id: str) -> nx.DiGraph:
        """
        Loads the project-scoped directed graph.
        If file exists but is corrupted, raises RuntimeError (does NOT silently wipe out prior graph).
        If file does not exist, returns an empty DiGraph.
        """
        path = self._get_project_graph_path(project_id)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return json_graph.node_link_graph(data, directed=True, multigraph=False)
            except Exception as e:
                logger.error(f"FATAL: Failed to read project topology graph at {path}: {e}")
                raise RuntimeError(
                    f"Corrupted or unreadable topology graph at {path}: {e}. "
                    f"Failing to prevent silent data loss or destructive overwrite."
                ) from e
        return nx.DiGraph()

    def save_graph(self, project_id: str, graph: nx.DiGraph) -> None:
        """
        Persists the project-scoped directed graph to disk using atomic temp file replacement.
        """
        path = self._get_project_graph_path(project_id)
        temp_path = f"{path}.tmp_{os.getpid()}"
        try:
            data = json_graph.node_link_data(graph)
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(temp_path, path)
            logger.info(f"Saved project graph ({graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges) to {path}")
        except Exception as e:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
            logger.error(f"Failed to save graph for project_id={project_id}: {e}")
            raise e

    def extract_relations_from_text(
        self,
        text: str,
        chunk_id: str,
        document_id: str,
        project_id: str,
        page_number: int
    ) -> List[Dict[str, Any]]:
        """
        Extracts evidence-grounded relationships from text.
        Invariant: entity detected != relationship supported.
        Only explicit directional syntax generates an edge.
        """
        if not text:
            return []

        extracted = []
        # Split text into sentences to bound relations to a single sentence scope
        sentences = re.split(r'[.!?\n]', text)
        for sentence in sentences:
            s_clean = sentence.strip()
            if not s_clean:
                continue

            for pattern, relation_type in RELATIONAL_PATTERNS:
                for match in pattern.finditer(s_clean):
                    src_token = match.group(1).upper()
                    dst_token = match.group(2).upper()

                    if src_token != dst_token:
                        extracted.append({
                            "source": src_token,
                            "target": dst_token,
                            "relation": relation_type,
                            "projectId": project_id,
                            "documentId": document_id,
                            "chunkId": chunk_id,
                            "pageNumber": page_number,
                            "sourceText": s_clean
                        })

        return extracted

    def process_and_persist_chunks(
        self,
        project_id: str,
        document_id: str,
        chunks: List[Dict[str, Any]]
    ) -> int:
        """
        Processes chunks, extracts valid relationships, updates project graph, and persists.
        Semantics:
        - 0 valid edges found -> valid execution -> returns 0.
        - valid edges found -> saved with provenance -> returns count.
        - crash/error -> raises exception (ingestion failure).
        """
        try:
            graph = self.load_graph(project_id)

            # Purge prior edges for this document if re-ingesting
            self._purge_document_elements(graph, document_id)

            edges_added = 0
            for chunk in chunks:
                chunk_text = chunk.get("text", "")
                page_no = chunk.get("page_number", 1)
                chunk_id = chunk.get("id", "")

                relations = self.extract_relations_from_text(
                    text=chunk_text,
                    chunk_id=chunk_id,
                    document_id=document_id,
                    project_id=project_id,
                    page_number=page_no
                )

                for rel in relations:
                    src = rel["source"]
                    dst = rel["target"]
                    graph.add_node(src, entity=src)
                    graph.add_node(dst, entity=dst)
                    graph.add_edge(
                        src,
                        dst,
                        relation=rel["relation"],
                        projectId=project_id,
                        documentId=document_id,
                        chunkId=chunk_id,
                        pageNumber=page_no,
                        sourceText=rel["sourceText"]
                    )
                    edges_added += 1

            self.save_graph(project_id, graph)
            logger.info(f"Processed graph for document_id={document_id}: {edges_added} relationships recorded")
            return edges_added
        except Exception as e:
            logger.error(f"Graph extraction/persistence failed for document_id={document_id}: {e}")
            raise e

    def _purge_document_elements(self, graph: nx.DiGraph, document_id: str) -> None:
        """
        Removes all edges originating from document_id and cleans isolated nodes.
        """
        edges_to_remove = []
        for u, v, data in graph.edges(data=True):
            if data.get("documentId") == document_id:
                edges_to_remove.append((u, v))

        for u, v in edges_to_remove:
            graph.remove_edge(u, v)

        # Remove isolated nodes that have no remaining edges
        nodes_to_remove = [n for n in graph.nodes if graph.degree(n) == 0]
        for n in nodes_to_remove:
            graph.remove_node(n)

    def delete_document(self, project_id: str, document_id: str) -> None:
        """
        Deletes all graph elements originating from documentId in project_id.
        """
        try:
            graph = self.load_graph(project_id)
            self._purge_document_elements(graph, document_id)
            self.save_graph(project_id, graph)
            logger.info(f"Purged graph elements for document_id={document_id} in project_id={project_id}")
        except Exception as e:
            logger.error(f"Error purging graph elements for document_id={document_id}: {e}")
            raise e

    def query_relations(self, project_id: str, entity_name: str) -> List[Dict[str, Any]]:
        """
        Returns all relationships involving entity_name within project_id.
        """
        graph = self.load_graph(project_id)
        token = entity_name.upper()
        if not graph.has_node(token):
            return []

        results = []
        # Outgoing edges
        for _, neighbor, data in graph.out_edges(token, data=True):
            if data.get("projectId") == project_id:
                results.append({
                    "source": token,
                    "target": neighbor,
                    "relation": data.get("relation"),
                    "provenance": data
                })
        # Incoming edges
        for predecessor, _, data in graph.in_edges(token, data=True):
            if data.get("projectId") == project_id:
                results.append({
                    "source": predecessor,
                    "target": token,
                    "relation": data.get("relation"),
                    "provenance": data
                })

        return results


# Singleton store
graph_store = GraphStore()
