import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.pipeline.retrieval import compute_evidence_coverage, evaluate_scope, evaluate_sufficiency, Candidate, RouteDecision

# Sample candidate from DHT11 document
cand = Candidate(
    chunkId="chk_6bc35b5870e9",
    documentId="doc_1",
    projectId="proj_1",
    text='Physical connection – Please follow either the diagram shared or just - Connect the GND pin on the right side ( check the “–“ Mark) - The Middle PIN will connect to Digital PIN 5 - The Left most pin is VIN ( Connect 5 V)',
    denseScore=0.85,
    lexicalScore=12.5,
    denseRank=1,
    lexicalRank=1,
    sources=["qdrant_dense", "tantivy_lexical"],
    rrfScore=0.032,
    rerankScore=0.0659
)

test_queries = [
    "what does gnd do?",
    "what does gnd do in pin configuration",
    "explain the connectivity setup",
    "what is the warranty period?", # Unsupported
    "who is the CEO of the company?", # Unsupported
    "what is the capital of Australia?" # Out of scope
]

for q in test_queries:
    route = RouteDecision(
        dense=True, lexical=True, graph=False,
        identifierQuery=False, extractedIdentifiers=[],
        relationshipIntent=False, rawQuery=q
    )
    cov, bdown = compute_evidence_coverage(q, [cand], route)
    scope = evaluate_scope(q, [cand], route)
    print(f"QUERY: '{q}'")
    print(f"  Coverage: {cov:.3f} (content={bdown['content']}, lexical={bdown['lexical']}, agree={bdown['agreement']})")
    print(f"  Scope: {scope.decision.value} ({scope.reason})")
