import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.pipeline.qdrant_store import qdrant_store
from qdrant_client.http.models import Filter, FieldCondition, MatchValue

res = qdrant_store.client.scroll(
    collection_name='groundguard_chunks',
    scroll_filter=Filter(must=[
        FieldCondition(key='projectId', match=MatchValue(value='proj_c1467d4e-20b6-442f-88d8-8e7c8ee30d40'))
    ]),
    limit=100
)
for p in sorted(res[0], key=lambda x: (x.payload.get('pageNumber', 1), x.payload.get('chunkIndex', 0))):
    pg = p.payload.get("pageNumber")
    ci = p.payload.get("chunkIndex")
    cid = p.payload.get("chunkId")
    txt = p.payload.get("text", "")
    print(f"Page {pg} Chunk {ci} ({cid}):\n{txt}\n{'='*50}")
