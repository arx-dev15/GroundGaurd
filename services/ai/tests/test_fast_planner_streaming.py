"""Fast planner path + opt-in Gemini thinking config (mocked provider; no live calls)."""
import asyncio, os, sys
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.pipeline import query_understanding as qu
from src.pipeline import llm as llm_mod
from src.pipeline.llm import llm_runtime

DOCS = ["stud.pdf", "pump_p101a_specs.pdf"]
CTX = {"readyDocs": [{"id": "doc_stud", "filename": "stud.pdf"}, {"id": "doc_pump", "filename": "pump_p101a_specs.pdf"}]}


@pytest.mark.parametrize("q", ["What is the rated flow rate of pump P-101A?", "Where is SC-12 mounted?",
                               "Who introduced Watson to Holmes in stud.pdf?"])
def test_simple_lookups_skip_planner(q):
    assert qu.is_simple_factual_lookup(q, None, DOCS)
    with patch.object(qu, "_call_planner_gemini", AsyncMock(return_value=None)) as planner, \
         patch.object(llm_runtime, "is_configured", return_value=True):
        plan = asyncio.run(qu.understand_query(q, project_context=CTX))
    planner.assert_not_called()
    assert plan.planner_source == "deterministic_fast_path" and plan.standalone_query


def test_document_scoping_preserved_on_fast_path():
    with patch.object(qu, "_call_planner_gemini", AsyncMock(return_value=None)), \
         patch.object(llm_runtime, "is_configured", return_value=True):
        plan = asyncio.run(qu.understand_query("Who introduced Watson to Holmes in stud.pdf?", project_context=CTX))
    assert plan.resolved_document_id == "doc_stud" and plan.document_scope_explicit


@pytest.mark.parametrize("q,conv", [
    ("who is dr watson", None),                                  # no reliable anchor
    ("Where was he wounded?", None),                             # pronoun
    ("What was Watson's reaction to it?", None),                 # anaphora
    ("What is the rated flow of P-101A?", [{"role": "user", "content": "Tell me about P-101A"}]),  # follow-up
    ("Compare P-101A and P-102B flow rates", None),              # comparison
    ("What is the flow rate and discharge pressure of P-101A?", None),  # multi-part
    ("How is Lucy Ferrier connected to Enoch Drebber?", None),   # multi-hop
    ("Does P-101A use 12V?", None),                              # premise check
    ("explain the scenario", None),                              # ambiguous
])
def test_complex_or_ambiguous_queries_keep_llm_planner(q, conv):
    assert not qu.is_simple_factual_lookup(q, conv, DOCS)
    with patch.object(qu, "_call_planner_gemini", AsyncMock(return_value=None)) as planner, \
         patch.object(llm_runtime, "is_configured", return_value=True):
        asyncio.run(qu.understand_query(q, conversation_context=conv, project_context=CTX))
    planner.assert_awaited_once()


def _capture_payload(env):
    resp = MagicMock(status_code=200, text="", headers={})
    resp.json.return_value = {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}
    with patch.dict(os.environ, env, clear=False), \
         patch.object(llm_runtime, "provider", "gemini"), patch.object(llm_runtime, "api_key", "k"), \
         patch.object(llm_mod.requests, "post", return_value=resp) as post:
        llm_runtime._cooldown_until = 0.0
        asyncio.run(llm_runtime.generate_answer("q"))
    return post.call_args.kwargs["json"]["generationConfig"]


def test_thinking_config_absent_by_default_and_opt_in_only():
    os.environ.pop("GEMINI_THINKING_BUDGET", None); os.environ.pop("GEMINI_THINKING_LEVEL", None)
    assert "thinkingConfig" not in _capture_payload({})
    assert _capture_payload({"GEMINI_THINKING_BUDGET": "0"})["thinkingConfig"] == {"thinkingBudget": 0}
    os.environ.pop("GEMINI_THINKING_BUDGET", None)
    assert _capture_payload({"GEMINI_THINKING_LEVEL": "low"})["thinkingConfig"] == {"thinkingLevel": "low"}
    os.environ.pop("GEMINI_THINKING_LEVEL", None)


@pytest.mark.parametrize("q", ["What is Campus Monitor?", "Who was Stamford?"])
def test_definition_questions_keep_planner(q):
    assert not qu.is_simple_factual_lookup(q, None, DOCS)
