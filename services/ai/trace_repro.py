import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.pipeline.query_understanding import understand_query, _make_fallback_plan
from src.pipeline.retrieval import retrieve_evidence, SUFFICIENCY_THRESHOLD
from src.pipeline.db import get_project_knowledge_summary

async def trace_query(proj_id: str, query: str):
    print("=" * 60)
    print(f"QUERY: {query}")
    print(f"PROJECT: {proj_id}")
    
    # 1. Project Context
    proj_context = get_project_knowledge_summary(proj_id)
    print(f"Project context readyDocs count: {len(proj_context.get('readyDocs', []))}")
    for d in proj_context.get('readyDocs', []):
        print(f"  - {d.get('filename')} ({d.get('id')})")
    
    # 2. Query Understanding
    try:
        plan = await understand_query(query=query, conversation_context=None, project_context=proj_context)
    except Exception as e:
        print(f"Planner error: {e}")
        plan = _make_fallback_plan(query)
        
    print(f"PLAN: task={plan.task}, mode={plan.retrieval_mode}, strategy={plan.retrieval_strategy}, target={plan.target}")
    print(f"  standalone='{plan.standalone_query}'")
    print(f"  search_queries={plan.search_queries}")
    print(f"  lexical_anchors={plan.lexical_anchors}")
    print(f"  question_slot={plan.question_slot}")
    print(f"  needs_clarification={plan.needs_clarification}")
    
    # 3. Retrieval
    search_q = plan.standalone_query or query or (plan.search_queries[0] if plan.search_queries else "")
    res = retrieve_evidence(
        project_id=proj_id,
        query=search_q,
        top_k=5,
        search_queries=plan.search_queries,
        lexical_anchors=plan.lexical_anchors,
        question_slot=plan.question_slot,
        request_id="test_req"
    )
    
    print(f"RETRIEVAL: {len(res.results)} results")
    for idx, ev in enumerate(res.results):
        print(f"  [{idx}] chunk={ev.chunkId} score={ev.score:.4f} rerank={ev.rerankScore} text[:100]={repr(ev.text[:100])}")
        
    if res.sufficiency:
        print(f"SUFFICIENCY: sufficient={res.sufficiency.sufficient}, score={res.sufficiency.score:.4f}, reason='{res.sufficiency.reason}'")
        if res.sufficiency.signals:
            print(f"  signals: topRerank={res.sufficiency.signals.topRerankScore}, count={res.sufficiency.signals.resultCount}")
    else:
        print("SUFFICIENCY: None")

async def main():
    proj_id = "proj_c1467d4e-20b6-442f-88d8-8e7c8ee30d40"
    repros = [
        "what is troubleshooting frm thw source",
        "Why troubleshooting",
        "what does gnd do?",
        "what does gnd do in pin configuration",
        "explain the connectivity setup",
    ]
    for q in repros:
        await trace_query(proj_id, q)

if __name__ == '__main__':
    asyncio.run(main())
