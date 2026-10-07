import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.pipeline.reranker import rerank
from src.pipeline.qdrant_store import qdrant_store
from qdrant_client.http.models import Filter, FieldCondition, MatchValue

res = qdrant_store.client.scroll(
    collection_name='groundguard_chunks',
    scroll_filter=Filter(must=[
        FieldCondition(key='projectId', match=MatchValue(value='proj_c1467d4e-20b6-442f-88d8-8e7c8ee30d40'))
    ]),
    limit=100
)
chunks = sorted(res[0], key=lambda x: (x.payload.get('pageNumber', 1), x.payload.get('chunkIndex', 0)))
passages = [{"id": p.payload.get("chunkId"), "text": p.payload.get("text", "")} for p in chunks]

test_queries = [
    "explain the connectivity setup in DHT11 Notes for the Students.pdf",
    "explain the connectivity setup",
    "connectivity setup",
    "what does gnd do?",
    "what does gnd do in DHT11 Notes for the Students.pdf",
    "gnd pin ground connection",
    "what is troubleshooting frm thw source",
    "troubleshooting"
]

for q in test_queries:
    rr = rerank(q, passages)
    print(f"\nQUERY: '{q}'")
    for r in rr[:3]:
        sc = r.get('rerankScore', r.get('score', 0.0))
        print(f"  {r.get('chunkId', r.get('id'))} (score={sc:.4f}): {repr(r['text'][:90])}")
