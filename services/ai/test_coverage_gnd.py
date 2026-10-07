import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.pipeline.retrieval import compute_evidence_coverage, evaluate_scope, evaluate_sufficiency, Candidate, RouteDecision

cand = Candidate(
    chunkId="chk_6bc35b5870e9",
    documentId="doc_1",
    projectId="proj_1",
    text='nection – Please follow either the diagram shared or just - Connect the GND pin on the right side ( check the “–“ Mark) - The Middle PIN will connect to Digital PIN 5 - The Left most pin is VIN ( Connect 5 V)',
    denseScore=0.85,
    lexicalScore=12.5,
    denseRank=1,
    lexicalRank=1,
    sources=["qdrant_dense", "tantivy_lexical"],
    rrfScore=0.032,
    rerankScore=0.0659
)

route = RouteDecision(
    dense=True, lexical=True, graph=False,
    identifierQuery=False, extractedIdentifiers=[],
    relationshipIntent=False, rawQuery="what does gnd do?"
)

cov, bdown = compute_evidence_coverage("what does gnd do?", [cand], route)
print("Coverage:", cov, bdown)

scope = evaluate_scope("what does gnd do?", [cand], route)
print("Scope:", scope.decision, scope.reason)

suff = evaluate_sufficiency([cand], route, query="what does gnd do?")
print("Sufficiency:", suff.sufficient, suff.score, suff.reason)
