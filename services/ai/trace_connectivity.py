import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.pipeline.query_understanding import understand_query, _make_fallback_plan
from src.pipeline.retrieval import retrieve_evidence, SUFFICIENCY_THRESHOLD
from src.pipeline.db import get_project_knowledge_summary
from src.pipeline.qdrant_store import qdrant_store
from src.pipeline.tantivy_store import tantivy_store
from src.pipeline.reranker import rerank
import asyncio

async def test_trace():
    proj_id = "proj_c1467d4e-20b6-442f-88d8-8e7c8ee30d40"
    query = "explain the connectivity setup"
    proj_context = get_project_knowledge_summary(proj_id)
    plan = await understand_query(query=query, conversation_context=None, project_context=proj_context)
    print("PLAN:")
    print("  task:", plan.task)
    print("  retrieval_mode:", plan.retrieval_mode)
    print("  retrieval_strategy:", plan.retrieval_strategy)
    print("  operation:", plan.operation)
    print("  target:", plan.target)
    print("  search_queries:", plan.search_queries)
    print("  lexical_anchors:", plan.lexical_anchors)
    print("  standalone_query:", plan.standalone_query)

    # Let's inspect Tantivy directly
    t_hits = tantivy_store.search_project(proj_id, query, top_k=10)
    print("\nTANTIVY for query:", [h.get("chunk_id") for h in t_hits])
    t_hits2 = tantivy_store.search_project(proj_id, "connectivity setup", top_k=10)
    print("TANTIVY for 'connectivity setup':", [h.get("chunk_id") for h in t_hits2])
    t_hits3 = tantivy_store.search_project(proj_id, "connection wiring pins", top_k=10)
    print("TANTIVY for 'connection wiring pins':", [h.get("chunk_id") for h in t_hits3])

    # Let's inspect retrieve_evidence
    res = retrieve_evidence(
        project_id=proj_id,
        query=plan.standalone_query or query,
        top_k=5,
        search_queries=plan.search_queries,
        lexical_anchors=plan.lexical_anchors,
        question_slot=plan.question_slot,
        request_id="debug_trace"
    )
    print("\nRETRIEVAL RESULTS:")
    for i, r in enumerate(res.results):
        print(f"  [{i}] {r.chunkId} score={r.score:.4f} rerank={r.rerankScore} text[:80]={repr(r.text[:80])}")

    print("\nSUFFICIENCY:")
    print("  score:", res.sufficiency.score)
    print("  sufficient:", res.sufficiency.sufficient)
    print("  reason:", res.sufficiency.reason)

asyncio.run(test_trace())
