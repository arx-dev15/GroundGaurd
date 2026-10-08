"""Evidence-first SSE contract: bounded, project-isolated source previews + planning events (no live calls)."""
import json, os, sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src import main
from src.pipeline.retrieval import EvidenceItem
from src.pipeline.llm import LLMUnavailableError


def ev(cid, doc, text="x" * 600, page=3, fn=None):
    return EvidenceItem(evidenceId=f"e{cid}", chunkId=cid, documentId=doc, text=text, pageNumber=page,
                        sources=["qdrant_dense"], metadata={"filename": fn} if fn else {})


def test_previews_are_bounded_isolated_and_marked_candidates():
    items = [ev(f"c{i}", "doc_a") for i in range(8)] + [ev("x1", "doc_other_project")]
    with patch.object(main, "get_ready_documents_meta", return_value=({"doc_a"}, {"doc_a": "pump_p101a_specs.pdf"})) as meta:
        out = main._source_previews(items, "p1")
    meta.assert_called_once()
    assert meta.call_args.args[0] == "p1"                       # lifecycle check scoped to the caller's project
    assert len(out) == main.SOURCE_PREVIEW_MAX == 5
    assert all(o["documentId"] == "doc_a" for o in out)         # non-READY / other-project doc never exposed
    assert all(len(o["excerpt"]) <= main.SOURCE_PREVIEW_CHARS + 1 for o in out)
    assert all(o["status"] == "retrieved_candidate" and o["pageNumber"] == 3 for o in out)
    assert out[0]["chunkId"] == "c0" and out[0]["documentName"]


def test_previews_fail_closed_when_lifecycle_check_fails():
    with patch.object(main, "get_ready_documents_meta", side_effect=RuntimeError("pg down")):
        assert main._source_previews([ev("c1", "doc_a")], "p1") == []


def _stream(llm_stream):
    from fastapi.testclient import TestClient
    from src.pipeline.query_understanding import QueryPlan
    from src.pipeline.retrieval import EvidenceSufficiency, EvidenceSufficiencySignals
    plan = QueryPlan(standalone_query="What is the rated flow of P-101A?", search_queries=["rated flow P-101A"])
    plan.planner_source = "deterministic_fast_path"
    suff = EvidenceSufficiency(sufficient=True, reason="ok", score=0.9, disposition="SUPPORTED",
                               signals=EvidenceSufficiencySignals(resultCount=1, topRerankScore=0.9, identifierMatched=True, sourceCoverage=["d"]))
    retr = SimpleNamespace(results=[ev("c1", "doc_a", "Pump P-101A has a rated flow rate of 450 gpm.", 1, "pump_p101a_specs.pdf")], sufficiency=suff)
    with patch.object(main, "classify_intent", return_value=("grounded", None)), \
         patch.object(main, "get_project_knowledge_summary", return_value={}), \
         patch.object(main, "understand_query", AsyncMock(return_value=plan)), \
         patch.object(main, "_execute_plan_retrieval", side_effect=lambda *a, **k: (retr, None)), \
         patch.object(main, "_attach_source_context"), \
         patch.object(main, "get_ready_documents_meta", return_value=({"doc_a"}, {"doc_a": "pump_p101a_specs.pdf"})), \
         patch.object(main.llm_runtime, "stream_answer", llm_stream), \
         patch.object(main, "extract_and_validate_claims", AsyncMock(return_value=[])):
        text = TestClient(main.app).post("/generate/stream", json={"projectId": "p1", "query": "What is the rated flow of P-101A?"}).text
    events = []
    for block in text.split("\n\n"):
        if block.startswith("event: "):
            name = block.split("\n", 1)[0][7:]
            events.append((name, json.loads(block.split("data: ", 1)[1])))
    return events


def test_stream_emits_planning_then_sources_before_answer():
    async def ok(_p):
        yield "Pump P-101A has a rated flow rate of 450 gpm [pump_p101a_specs.pdf, p. 1].\n<<OUTCOME:ANSWERED>>"
    events = _stream(ok)
    names = [e for e, _ in events]
    assert names.index("planning.started") < names.index("planning.completed") < names.index("retrieval.completed") < names.index("answer.started")
    plan_done = dict(events)["planning.completed"]
    assert plan_done["plannerSource"] == "deterministic_fast_path" and isinstance(plan_done["latencyMs"], int)
    rc = dict(events)["retrieval.completed"]
    assert rc["evidenceCount"] == 1                              # backward-compatible field preserved
    assert rc["sources"][0]["chunkId"] == "c1" and rc["sources"][0]["status"] == "retrieved_candidate"
    assert names[-1] == "generation.completed"


def test_provider_error_terminates_stream_with_failure():
    async def boom(_p):
        raise LLMUnavailableError("gemini provider unavailable (HTTP 429: rate limited)", status_code=429)
        yield  # pragma: no cover
    events = _stream(boom)
    names = [e for e, _ in events]
    assert "retrieval.completed" in names and names[-1] == "generation.failed"
    assert "generation.completed" not in names
