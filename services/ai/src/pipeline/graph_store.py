import os
import re
import json
import time
import logging
from typing import List, Dict, Any, Optional, Tuple
import networkx as nx
from networkx.readwrite import json_graph

logger = logging.getLogger("m2-graph-store")

GRAPHS_PATH = os.getenv("GRAPHS_PATH", "")
_ENV = os.getenv("ENVIRONMENT", "development").lower()

if not GRAPHS_PATH.strip():
    raise RuntimeError(
        "FATAL: GRAPHS_PATH is not configured. "
        "Set GRAPHS_PATH to a valid directory path for project topology graphs."
    )

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


class ProjectGraphLock:
    """Inter-process cooperative lock to prevent race conditions during concurrent worker graph writes."""
    def __init__(self, lock_path: str, timeout_sec: float = 10.0):
        self.lock_path = lock_path
        self.timeout_sec = timeout_sec
        self.lock_file = None

    def __enter__(self):
        start_time = time.time()
        while True:
            try:
                # Open with O_CREAT | O_EXCL for atomic file creation
                self.lock_file = os.open(self.lock_path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
                return self
            except FileExistsError:
                if time.time() - start_time > self.timeout_sec:
                    # Stale lock recovery: if lockfile older than timeout, force release
                    try:
                        lock_age = time.time() - os.path.getmtime(self.lock_path)
                        if lock_age > self.timeout_sec:
                            os.remove(self.lock_path)
                            continue
                    except Exception:
                        pass
                    raise TimeoutError(f"Could not acquire graph lock at {self.lock_path} within {self.timeout_sec}s")
                time.sleep(0.05)

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.lock_file is not None:
            try:
                os.close(self.lock_file)
            except Exception:
                pass
            try:
                if os.path.exists(self.lock_path):
                    os.remove(self.lock_path)
            except Exception:
                pass


class GraphStore:
    def __init__(self, base_path: str = GRAPHS_PATH):
        self.base_path = base_path
        os.makedirs(self.base_path, exist_ok=True)
        # In-memory thread-safe cache: project_id -> (mtime, DiGraph)
        self._cache: Dict[str, Tuple[float, nx.DiGraph]] = {}

    def _get_project_graph_path(self, project_id: str) -> str:
        proj_dir = os.path.join(self.base_path, project_id)
        os.makedirs(proj_dir, exist_ok=True)
        return os.path.join(proj_dir, "topology.json")

    def _get_lock_path(self, project_id: str) -> str:
        return f"{self._get_project_graph_path(project_id)}.lock"

    def load_graph(self, project_id: str) -> nx.DiGraph:
        """
        Loads the project-scoped directed graph with mtime caching.
        Returns cached graph if disk mtime has not changed (sub-millisecond reads).
        """
        path = self._get_project_graph_path(project_id)
        if os.path.exists(path):
            mtime = os.path.getmtime(path)
            if project_id in self._cache:
                cached_mtime, cached_graph = self._cache[project_id]
                if cached_mtime == mtime:
                    return cached_graph.copy()

            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    graph = json_graph.node_link_graph(data, directed=True, multigraph=False)
                    self._cache[project_id] = (mtime, graph)
                    return graph.copy()
            except Exception as e:
                logger.error(f"FATAL: Failed to read project topology graph at {path}: {e}")
                raise RuntimeError(
                    f"Corrupted or unreadable topology graph at {path}: {e}. "
                    f"Failing to prevent silent data loss or destructive overwrite."
                ) from e
        return nx.DiGraph()

    def save_graph(self, project_id: str, graph: nx.DiGraph) -> None:
        """
        Persists the project-scoped directed graph using atomic temp replacement
        and updates the in-memory cache.
        """
        path = self._get_project_graph_path(project_id)
        temp_path = f"{path}.tmp_{os.getpid()}_{int(time.time() * 1000)}"
        try:
            data = json_graph.node_link_data(graph)
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(temp_path, path)
            mtime = os.path.getmtime(path)
            self._cache[project_id] = (mtime, graph.copy())
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
        Processes chunks, extracts valid relationships, updates project graph, and persists
        with cooperative process locking to prevent concurrency races.
        """
        try:
            with ProjectGraphLock(self._get_lock_path(project_id)):
                graph = self.load_graph(project_id)
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

        nodes_to_remove = [n for n in graph.nodes if graph.degree(n) == 0]
        for n in nodes_to_remove:
            graph.remove_node(n)

    def delete_document(self, project_id: str, document_id: str) -> None:
        """
        Deletes all graph elements originating from documentId in project_id with locking.
        """
        try:
            with ProjectGraphLock(self._get_lock_path(project_id)):
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
        Enforces strict projectId boundary check on all returned edges.
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
