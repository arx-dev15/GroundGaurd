import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.pipeline.query_understanding import understand_query
from src.pipeline.retrieval import retrieve_evidence, evaluate_sufficiency, evaluate_scope, compute_evidence_coverage
from src.pipeline.db import get_project_knowledge_summary
import asyncio

async def test():
    proj_id = "proj_c1467d4e-20b6-442f-88d8-8e7c8ee30d40"
    query = "explain the connectivity setup"
    proj_context = get_project_knowledge_summary(proj_id)
    plan = await understand_query(query=query, project_context=proj_context)
    print("PLAN:")
    print("  standalone_query:", repr(plan.standalone_query))
    print("  search_queries:", plan.search_queries)
    print("  strategy:", plan.retrieval_strategy)
    print("  operation:", plan.operation)
    print("  target:", plan.target)

    res = retrieve_evidence(
        project_id=proj_id,
        query=plan.standalone_query or query,
        top_k=5,
        search_queries=plan.search_queries,
        lexical_anchors=plan.lexical_anchors,
        question_slot=plan.question_slot,
        request_id="test_conn"
    )
    print("\nRETRIEVAL RESULTS:")
    for idx, r in enumerate(res.results):
        print(f"  [{idx}] {r.chunkId} score={r.score:.4f} rerank={r.rerankScore} text[:70]={repr(r.text[:70])}")

    print("\nSUFFICIENCY:")
    print("  score:", res.sufficiency.score)
    print("  sufficient:", res.sufficiency.sufficient)
    print("  reason:", res.sufficiency.reason)

asyncio.run(test())
