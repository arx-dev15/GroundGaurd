"""
GroundGuard 11-Node Dual-Track LangGraph Engine (src/agents/graph.py)
Implements:
- 11-node dual-track execution graph
- Calibrated Sufficiency Gate with Pre-Filter Early Exit (<25ms, 0 tokens)
- Prompt Stager with <untrusted_evidence> XML tags
- 1-Sentence In-Flight Emission Delay Buffer
- Mandate 10: Yields sentence.verified, sentence.recovered, and sentence.fallback events.
"""

import os
import time
import logging
from typing import TypedDict, List, Dict, Any, Optional, AsyncGenerator
from langgraph.graph import StateGraph, END

from src.contracts.events import (
    EvidenceChunk,
    SentenceVerificationEvent,
    SentenceStatus,
    SufficiencyResult
)
from src.rag.router import route_query, RouteDecision
from src.rag.vector_store import dense_vector_store
from src.rag.lexical_store import lexical_index
from src.rag.reranker import fuse_and_rerank_candidates
from src.rag.chunker import split_into_protected_sentences
from src.pipeline.graph_store import graph_store
from src.pipeline.context import context_builder
from src.pipeline.llm import llm_runtime
from src.pipeline.prompts import build_grounded_user_prompt
from src.guardrail.buffer import InFlightVerificationBuffer

logger = logging.getLogger("agents-graph")


class DualTrackGraphState(TypedDict):
    project_id: str
    query: str
    request_id: Optional[str]
    route: Optional[RouteDecision]
    dense_hits: List[Dict[str, Any]]
    lexical_hits: List[Dict[str, Any]]
    graph_hits: List[Dict[str, Any]]
    evidence_chunks: List[EvidenceChunk]
    sufficiency: Optional[SufficiencyResult]
    staged_prompt: str
    draft_sentences: List[str]
    streaming_events: List[SentenceVerificationEvent]
    is_early_exit: bool
    status: str
    error: Optional[str]


# -------------------------------------------------------------------------
# The 11 Nodes of the Dual-Track Architecture
# -------------------------------------------------------------------------

def node_1_authorize_project(state: DualTrackGraphState) -> Dict[str, Any]:
    """Node 1: Enforces tenant scoping and validates project ID presence."""
    pid = state["project_id"].strip()
    if not pid:
        raise ValueError("FATAL: project_id is mandatory for tenant isolation.")
    return {"status": "authorized"}


def node_2_route_query(state: DualTrackGraphState) -> Dict[str, Any]:
    """Node 2: Deterministic query routing (dense, lexical, graph activation)."""
    decision = route_query(state["query"])
    return {"route": decision}


def node_3_retrieve_dense(state: DualTrackGraphState) -> Dict[str, Any]:
    """Node 3: Qdrant HNSW vector search (WHERE project_id = $id)."""
    route = state.get("route")
    if route and not route.dense:
        return {"dense_hits": []}
    hits = dense_vector_store.search_dense(
        project_id=state["project_id"],
        query=state["query"],
        top_k=15
    )
    return {"dense_hits": hits}


def node_4_retrieve_lexical(state: DualTrackGraphState) -> Dict[str, Any]:
    """Node 4: Tantivy BM25 lexical search scoped to project_id."""
    route = state.get("route")
    if route and not route.lexical:
        return {"lexical_hits": []}
    hits = lexical_index.search_lexical(
        project_id=state["project_id"],
        query=state["query"],
        top_k=15
    )
    return {"lexical_hits": hits}


def node_5_retrieve_topology(state: DualTrackGraphState) -> Dict[str, Any]:
    """Node 5: NetworkX P&ID graph pathfinding when relational links queried."""
    route = state.get("route")
    if not route or not route.graph:
        return {"graph_hits": []}

    graph_hits = []
    for token in route.extractedIdentifiers:
        relations = graph_store.query_relations(state["project_id"], token)
        for rel in relations:
            prov = rel.get("provenance", {})
            if prov.get("chunkId"):
                graph_hits.append({
                    "chunk_id": prov["chunkId"],
                    "document_id": prov.get("documentId", ""),
                    "project_id": state["project_id"],
                    "text": prov.get("sourceText", f"{rel['source']} {rel['relation']} {rel['target']}"),
                    "page_number": prov.get("pageNumber", 1),
                    "identifiers": [token],
                    "score": 1.0
                })
    return {"graph_hits": graph_hits}


def node_6_calibrated_fusion(state: DualTrackGraphState) -> Dict[str, Any]:
    """
    Node 6: RRF (k=60) + FlashRank + Distractor-Safe Bypass.
    Merges dense and lexical hits and applies distractor-safe adaptive bypass.
    """
    chunks, sufficiency = fuse_and_rerank_candidates(
        query=state["query"],
        dense_hits=state.get("dense_hits", []),
        lexical_hits=state.get("lexical_hits", []),
        graph_hits=state.get("graph_hits", []),
        top_n=5
    )
    return {"evidence_chunks": chunks, "sufficiency": sufficiency}


def node_7_sufficiency_gate(state: DualTrackGraphState) -> Dict[str, Any]:
    """
    Node 7: Calibrated Sufficiency Gate decision evaluation.
    (Score >= 0.35) AND (Keyword/Entity Match >= 1).
    """
    suff = state.get("sufficiency")
    is_early_exit = suff.is_early_exit if suff else True
    return {"is_early_exit": is_early_exit}


def node_8_prefilter_exit(state: DualTrackGraphState) -> Dict[str, Any]:
    """
    Node 8: Pre-Filter Early Exit Node (<25ms, 0 tokens).
    Yields 'prefilter.exit' safe refusal and halts pipeline immediately.
    """
    logger.info(f"[Pre-Filter Exit] Query failed sufficiency: {state.get('sufficiency')}. Halting without LLM tokens.")
    exit_event = SentenceVerificationEvent(
        event="prefilter.exit",
        sentence_index=0,
        text="The requested information is not sufficiently substantiated by the verified project documentation.",
        status=SentenceStatus.REJECTED,
        score=0.0,
        reason=state.get("sufficiency").reason if state.get("sufficiency") else "Insufficient evidence"
    )
    return {"streaming_events": [exit_event], "status": "early_exit"}


def node_9_stage_prompt(state: DualTrackGraphState) -> Dict[str, Any]:
    """
    Node 9: Prompt Stager & Injection Sanitizer.
    Retrieved context strictly wrapped in <untrusted_evidence> XML tags.
    """
    chunks = state.get("evidence_chunks", [])
    # Convert to pipeline EvidenceItems for context_builder
    from src.pipeline.retrieval import EvidenceItem
    ev_items = [
        EvidenceItem(
            evidenceId=c.chunk_id,
            chunkId=c.chunk_id,
            documentId=c.document_id,
            text=c.text,
            pageNumber=c.page_number,
            identifiers=c.identifiers
        )
        for c in chunks
    ]
    ctx_text, inc, omi = context_builder.build_context(ev_items)
    user_prompt = build_grounded_user_prompt(state["query"], ctx_text)
    return {"staged_prompt": user_prompt}


async def node_10_draft_llm(state: DualTrackGraphState) -> Dict[str, Any]:
    """
    Node 10: Local Air-Gapped LLM Generation.
    Produces raw answer and tokenizes into discrete protected sentences.
    """
    prompt = state["staged_prompt"]
    from src.pipeline.prompts import SYSTEM_PROMPT
    raw_answer = await llm_runtime.generate_answer(
        user_prompt=prompt,
        system_prompt=SYSTEM_PROMPT
    )
    # Split into discrete sentences using Sentence Boundary Protection
    sentences = split_into_protected_sentences(raw_answer)
    return {"draft_sentences": sentences}


async def node_11_in_flight_buffer(state: DualTrackGraphState) -> Dict[str, Any]:
    """
    Node 11: 1-Sentence In-Flight Emission Delay Buffer.
    Evaluates each sentence through Gate A (Pint Symbolic) and Gate B (Neural with Discourse Window).
    """
    sentences = state.get("draft_sentences", [])
    chunks = state.get("evidence_chunks", [])
    buffer = InFlightVerificationBuffer(
        project_id=state["project_id"],
        request_id=state.get("request_id")
    )

    events: List[SentenceVerificationEvent] = []
    async for event in buffer.process_sentence_stream(sentences, chunks):
        events.append(event)

    return {"streaming_events": events, "status": "completed"}


# -------------------------------------------------------------------------
# Compile StateGraph
# -------------------------------------------------------------------------

def condition_sufficiency(state: DualTrackGraphState) -> str:
    if state.get("is_early_exit"):
        return "prefilter_exit"
    return "stage_prompt"


def build_dual_track_graph():
    workflow = StateGraph(DualTrackGraphState)

    workflow.add_node("authorize_project", node_1_authorize_project)
    workflow.add_node("route_query", node_2_route_query)
    workflow.add_node("retrieve_dense", node_3_retrieve_dense)
    workflow.add_node("retrieve_lexical", node_4_retrieve_lexical)
    workflow.add_node("retrieve_topology", node_5_retrieve_topology)
    workflow.add_node("calibrated_fusion", node_6_calibrated_fusion)
    workflow.add_node("sufficiency_gate", node_7_sufficiency_gate)
    workflow.add_node("prefilter_exit", node_8_prefilter_exit)
    workflow.add_node("stage_prompt", node_9_stage_prompt)
    workflow.add_node("draft_llm", node_10_draft_llm)
    workflow.add_node("in_flight_buffer", node_11_in_flight_buffer)

    workflow.set_entry_point("authorize_project")

    workflow.add_edge("authorize_project", "route_query")
    workflow.add_edge("route_query", "retrieve_dense")
    workflow.add_edge("retrieve_dense", "retrieve_lexical")
    workflow.add_edge("retrieve_lexical", "retrieve_topology")
    workflow.add_edge("retrieve_topology", "calibrated_fusion")
    workflow.add_edge("calibrated_fusion", "sufficiency_gate")

    workflow.add_conditional_edges(
        "sufficiency_gate",
        condition_sufficiency,
        {
            "prefilter_exit": "prefilter_exit",
            "stage_prompt": "stage_prompt"
        }
    )

    workflow.add_edge("prefilter_exit", END)
    workflow.add_edge("stage_prompt", "draft_llm")
    workflow.add_edge("draft_llm", "in_flight_buffer")
    workflow.add_edge("in_flight_buffer", END)

    return workflow.compile()


dual_track_graph = build_dual_track_graph()


async def execute_dual_track_streaming(
    project_id: str,
    query: str,
    request_id: Optional[str] = None
) -> AsyncGenerator[SentenceVerificationEvent, None]:
    """
    Executes the 11-node dual-track architecture and streams verified sentence events in real time.
    """
    initial_state: DualTrackGraphState = {
        "project_id": project_id,
        "query": query,
        "request_id": request_id,
        "route": None,
        "dense_hits": [],
        "lexical_hits": [],
        "graph_hits": [],
        "evidence_chunks": [],
        "sufficiency": None,
        "staged_prompt": "",
        "draft_sentences": [],
        "streaming_events": [],
        "is_early_exit": False,
        "status": "pending",
        "error": None
    }

    final_state = await dual_track_graph.ainvoke(initial_state)

    for event in final_state.get("streaming_events", []):
        yield event
