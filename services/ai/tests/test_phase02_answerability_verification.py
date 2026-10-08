"""
Regression suite: Stabilization Phase 02 -- retrieval quality & verification (audit 2026-10-08).

F2  tag match boosts ranking but never establishes sufficiency; relevance (calibrated) is separate
    from answerability (requested attribute must be stated in evidence).
F3  explicit generator abstentions -> INSUFFICIENT, no citations, no evidence, no claims.
F6  LaTeX-safe claim JSON; extraction failure / zero claims never reported as SUPPORTED.
F7  explicit document scoping through retrieval; large-document coverage reported as a sample.
Endpoint parity: /generate and /generate/stream reach the same trust state.
No network: Gemini, Qdrant and PostgreSQL are stubbed; real code paths everywhere else.
"""

import asyncio
import json
import os
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.pipeline.answerability import (
    OUTCOME_ANSWERED, OUTCOME_INSUFFICIENT, OUTCOME_PARTIAL, OutcomeTagStreamFilter,
    assess_requested_attribute, calibrate_relevance, parse_generation_outcome,
)
from src.pipeline.claim_extractor import extract_and_validate_claims, parse_claims_json
from src.pipeline.query_understanding import _DOCUMENT_OVERVIEW_PATTERNS, is_explicit_document_mention
from src.pipeline.retrieval import (
    Candidate, EvidenceDisposition, EvidenceItem, FailureStage, evaluate_sufficiency,
    retrieve_evidence, route_query,
)

PUMP = ("Centrifugal pump P-101A is designed for hydrocarbon liquid transfer with a rated flow rate of 450 gpm "
        "and a discharge pressure of 120 psig. Normal operating temperature is 65 degrees Celsius.")
FM = ("The FM-900 digital flow meter operates with a maximum operating pressure of 24.5 bar and an ambient "
      "temperature range of -20 C to 65 C. Sensor calibration unit SC-12 is attached directly to the upstream "
      "transmitter port.")
DHT = ("The DHT11 sensor operating voltage is 3.5V to 5.5V DC. Humidity measurement range is 20 to 90 percent RH "
       "with 5 percent accuracy.")


# ---------------------------------------------------------------------------
# F2: answerability (requested attribute) -- positives, paraphrases, hard negatives
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("text,query", [
    (PUMP, "What is the rated flow rate of pump P-101A?"),
    (PUMP, "How hot does P-101A normally run?"),                         # paraphrase
    (PUMP, "At what pressure does P-101A discharge?"),                    # paraphrase
    (FM, "What is the highest pressure the FM-900 can withstand?"),       # paraphrase: highest/withstand ~ maximum
    (DHT, "What supply voltage does the DHT11 need?"),
    (DHT, "How accurately does the DHT11 measure humidity?"),
    ("Centrifugal pump P-101A operates at 180C.", "What is the operating temperature of pump P-101A?"),
])
def test_answerable_attribute_is_covered(text, query):
    r = assess_requested_attribute(query, [{"chunkId": "c1", "text": text}])
    assert r.applicable and r.covered, r


@pytest.mark.parametrize("text,query,label", [
    (PUMP, "What is the design temperature of pump P-101A?", "design temperature"),  # 'designed for' elsewhere
    (PUMP, "What is the NPSH required for pump P-101A?", "NPSH"),
    (PUMP, "What material is the impeller of P-101A made of?", "material"),
    (PUMP, "What is the maximum discharge pressure of P-101A?", "maximum discharge pressure"),
    (FM, "What is the measurement accuracy of the FM-900?", "accuracy"),
    (FM, "What supply voltage does the FM-900 require?", "supply voltage"),
    (DHT, "What is the sampling rate of the DHT11?", "sampling rate"),
])
def test_hard_negative_entity_present_fact_absent(text, query, label):
    r = assess_requested_attribute(query, [{"chunkId": "c1", "text": text}])
    assert r.applicable and r.covered is False and r.label == label, r


def test_narrative_and_location_questions_not_attribute_gated():
    for q in ["Why did Holmes believe the word RACHE was meant to mislead the police?",
              "Where is SC-12 mounted?", "Explain how the pump works."]:
        assert not assess_requested_attribute(q, [{"chunkId": "c", "text": "x"}]).applicable


def test_tag_match_with_high_score_never_establishes_sufficiency():
    """Candidate names P-101A and scores 0.99, but does not state the requested attribute."""
    cand = Candidate(chunkId="c1", documentId="d1", projectId="p1", text=PUMP, identifiers=["P-101A"],
                     rerankScore=0.99, sources=["qdrant_dense", "tantivy_lexical"])
    q = "What is the design temperature of pump P-101A?"
    res = evaluate_sufficiency([cand], route_query(q), query=q)
    assert res.sufficient is False
    assert res.failureStage == FailureStage.ANSWERABILITY_GATE_REJECTION.value
    assert res.disposition == EvidenceDisposition.INSUFFICIENT.value
    assert res.signals.attributeCovered is False and res.signals.requestedAttribute == "design temperature"


def test_answerability_judged_on_original_question_not_rewrite():
    cand = Candidate(chunkId="c1", documentId="d1", projectId="p1", text=PUMP, identifiers=["P-101A"],
                     rerankScore=0.99, sources=["qdrant_dense"])
    rewrite = "P-101A temperature"  # planner rewrite dropping the 'design' qualifier
    res = evaluate_sufficiency([cand], route_query(rewrite), query=rewrite,
                               answerability_query="What is the design temperature of pump P-101A?")
    assert res.sufficient is False and res.signals.attributeCovered is False


def test_relevance_failure_reported_before_answerability():
    cand = Candidate(chunkId="c1", documentId="d1", projectId="p1", text="P-101A was mentioned in passing.",
                     identifiers=["P-101A"], rerankScore=0.05, sources=["qdrant_dense"])
    q = "What is the design temperature of P-101A?"
    res = evaluate_sufficiency([cand], route_query(q), query=q)
    assert res.sufficient is False and "below sufficiency threshold" in res.reason


def _vec(i, dim=384):
    v = [0.0] * dim
    v[i % dim] = 1.0
    return v


@patch("src.pipeline.retrieval.get_ready_documents_meta", return_value=({"doc_p"}, {"doc_p": "pump_p101a_specs.pdf"}))
@patch("src.pipeline.retrieval.tantivy_store.search_project", return_value=[])
@patch("src.pipeline.retrieval.qdrant_store.search_dense")
@patch("src.pipeline.retrieval.rerank")
@patch("src.pipeline.retrieval.generate_embeddings")
def test_tag_match_is_ordering_boost_not_a_forced_score(mock_emb, mock_rerank, mock_dense, *_):
    # query vector orthogonal to passages -> cosine 0; cross-encoder 0.02 -> calibrated relevance stays low.
    # Content-based (not positional): the query vector may be reused from dense search, not re-embedded.
    _q = "What is the NPSH of P-101A?"
    mock_emb.side_effect = lambda texts: [_vec(0) if t == _q else _vec(1 + (sum(map(ord, t)) % 300)) for t in texts]
    mock_dense.return_value = [
        {"chunkId": "c_tag", "documentId": "doc_p", "projectId": "p1", "text": "Pump P-101A spare parts list.",
         "score": 0.3, "chunkIndex": 0, "identifierKeys": ["P-101A"]},
        {"chunkId": "c_other", "documentId": "doc_p", "projectId": "p1", "text": "General plant safety notes.",
         "score": 0.4, "chunkIndex": 1, "identifierKeys": []},
    ]
    mock_rerank.side_effect = lambda query, passages, top_n=None: [
        {"chunkId": p["chunkId"], "candidate": p["candidate"], "rerankScore": 0.02 if p["chunkId"] == "c_tag" else 0.03}
        for p in passages
    ]
    res = retrieve_evidence(project_id="p1", query="What is the NPSH of P-101A?", top_k=5)
    assert res.metadata.rerankerBypassed is False and res.metadata.tagBoostApplied is True
    assert res.results[0].chunkId == "c_tag"                       # boosted in ordering...
    assert res.results[0].rerankScore < 0.35                         # ...but no forced 0.50 relevance
    assert res.results[0].metadata["crossEncoderScore"] == pytest.approx(0.02)
    assert res.sufficiency.sufficient is False


@pytest.mark.parametrize("ce,cos,expect_relevant", [
    # Query-level values measured on the labeled calibration set (TinyBERT CE, MiniLM cosine)
    (0.0058, 0.572, True),   # "Where was the army doctor injured while serving overseas?" (stud.pdf)
    (0.0007, 0.601, True),   # "What foreign word did the killer scrawl in blood ...?"
    (0.0002, 0.413, True),   # "What gave away that the messenger had served in the navy?"
    (0.9996, 0.810, True),   # "Which network port carries Zephyr-X9 telemetry?"
    (0.0000, 0.213, False),  # "How do I configure a Kubernetes ingress controller?" vs stud.pdf
    (0.0000, 0.190, False),  # "What is the torque rating of the gearbox motor?" vs stud.pdf
    (0.0000, -0.071, False), # "Explain photosynthesis in plants." vs FM-900 manual
])
def test_relevance_calibration_on_recorded_pairs(ce, cos, expect_relevant):
    assert (calibrate_relevance(ce, cos) >= 0.35) is expect_relevant


# ---------------------------------------------------------------------------
# F3: structured generation outcome
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw,outcome", [
    ("The flow rate is 450 gpm [Pump, p. 1].\n<<OUTCOME:ANSWERED>>", OUTCOME_ANSWERED),
    ("Rated flow is 450 gpm [Pump, p. 1]. The documentation does not specify NPSH.\n<<OUTCOME:PARTIAL>>", OUTCOME_PARTIAL),
    ("The available project evidence doesn't specify the design temperature.\n<<OUTCOME:INSUFFICIENT>>", OUTCOME_INSUFFICIENT),
    # declared ANSWERED but consists only of absence statements -> still an abstention
    ("The documentation does not specify who Sherlock Holmes is [Stud].\n<<OUTCOME:ANSWERED>>", OUTCOME_INSUFFICIENT),
    # untagged fallbacks (sentence-level, not substring-anywhere)
    ("The available project evidence does not specify who Sherlock Holmes is [Stud].", OUTCOME_INSUFFICIENT),
    ("No. The source states that the controller uses port 7421, not 8080 [Zephyr, p. 1].", OUTCOME_ANSWERED),
])
def test_generation_outcome(raw, outcome):
    text, got, _ = parse_generation_outcome(raw)
    assert got == outcome and "<<OUTCOME" not in text


def test_outcome_tag_never_streamed_across_chunk_boundaries():
    full = "Pump P-101A is rated at 450 gpm [Pump, p. 1].\n<<OUTCOME:ANSWERED>>"
    for size in (1, 2, 3, 5, 7, 11):
        f = OutcomeTagStreamFilter()
        out = "".join(f.feed(full[i:i + size]) for i in range(0, len(full), size)) + f.flush()
        assert "<<" not in out and "OUTCOME" not in out
        assert out.strip() == "Pump P-101A is rated at 450 gpm [Pump, p. 1]."


def _ev(cid="chk_1"):
    return EvidenceItem(evidenceId="ev_1", chunkId=cid, documentId="doc_p", text=PUMP, pageNumber=1,
                        sources=["qdrant_dense"], metadata={"filename": "pump_p101a_specs.pdf", "chunkIndex": 0})


def _plan(**kw):
    base = dict(is_proposition=False)
    base.update(kw)
    return SimpleNamespace(**base)


def _retrieval(disposition="SUPPORTED"):
    return SimpleNamespace(sufficiency=SimpleNamespace(disposition=disposition))


def _finalize(raw, claims=None, raises=None, coverage=None):
    from src import main
    mock = AsyncMock(side_effect=raises) if raises else AsyncMock(return_value=claims or [])
    with patch.object(main, "extract_and_validate_claims", mock):
        out = asyncio.run(main._finalize_grounded_answer(raw, [_ev()], _retrieval(), _plan(), False, coverage))
    return out, mock


def test_abstention_becomes_insufficient_without_citations_claims_or_evidence():
    out, mock = _finalize("The available project evidence doesn't specify the design temperature of P-101A "
                          "[pump_p101a_specs.pdf, p. 1].\n<<OUTCOME:INSUFFICIENT>>")
    assert out["disposition"] == "INSUFFICIENT" and out["abstention"] is True
    assert out["claims"] == [] and out["evidence"] == []
    assert "[" not in out["answer"] and "<<" not in out["answer"]
    assert out["failureStage"] == FailureStage.GENERATION_ABSTENTION.value
    mock.assert_not_called()


_CLAIM = {"claimId": "claim_0", "text": "P-101A has a rated flow rate of 450 gpm.", "status": "pending",
          "ordinal": 0, "sourceText": None, "verification": None, "evidence": []}


def test_claim_extraction_failure_is_unverified_not_supported():
    out, _ = _finalize("P-101A has a rated flow rate of 450 gpm [Pump, p. 1].\n<<OUTCOME:ANSWERED>>",
                       raises=ValueError("Malformed claim extraction JSON"))
    assert out["disposition"] == EvidenceDisposition.UNVERIFIED.value
    assert out["verificationStatus"] == "claim_extraction_failed"
    assert out["claimExtraction"]["status"] == "failed"


def test_zero_claims_for_factual_answer_is_unverified():
    out, _ = _finalize("P-101A has a rated flow rate of 450 gpm [Pump, p. 1].\n<<OUTCOME:ANSWERED>>", claims=[])
    assert out["disposition"] == EvidenceDisposition.UNVERIFIED.value
    assert out["verificationStatus"] == "no_verifiable_claims"


def test_partial_outcome_and_sampled_coverage_are_partial():
    out, _ = _finalize("Rated flow is 450 gpm. NPSH is not specified.\n<<OUTCOME:PARTIAL>>", claims=[dict(_CLAIM)])
    assert out["disposition"] == "PARTIAL"
    out, _ = _finalize("The book covers X and Y.\n<<OUTCOME:ANSWERED>>", claims=[dict(_CLAIM)],
                       coverage={"coverageComplete": False, "sampledChunkCount": 10, "documentChunkCount": 562})
    assert out["disposition"] == "PARTIAL"
    out, _ = _finalize("P-101A has a rated flow rate of 450 gpm.\n<<OUTCOME:ANSWERED>>", claims=[dict(_CLAIM)])
    assert out["disposition"] == "SUPPORTED" and out["verificationStatus"] == "claims_pending_verification"


# ---------------------------------------------------------------------------
# F6: LaTeX-safe claim extraction
# ---------------------------------------------------------------------------

def test_latex_invalid_escapes_parse_and_preserve_math():
    raw = r'{"claims":[{"claim":"The efficiency is \(\eta = \frac{P_{out}}{P_{in}}\).","evidenceRefs":["EVIDENCE_1"]}]}'
    with pytest.raises(json.JSONDecodeError):
        json.loads(raw)  # the pre-fix parser failed here (G3)
    assert parse_claims_json(raw)["claims"][0]["claim"] == r"The efficiency is \(\eta = \frac{P_{out}}{P_{in}}\)."


def test_latex_commands_not_corrupted_into_control_characters():
    raw = r'{"claims":[{"claim":"F = m \times a and \beta = \frac12","evidenceRefs":[]}]}'
    claim = parse_claims_json(raw)["claims"][0]["claim"]
    assert claim == r"F = m \times a and \beta = \frac12"
    assert "\t" not in claim and "\x08" not in claim and "\x0c" not in claim


def test_extraction_retries_once_then_reports_failure_and_drops_absence_claims():
    good = json.dumps({"claims": [
        {"claim": "The area is \\pi r^2.", "evidenceRefs": ["EVIDENCE_1"]},
        {"claim": "The documentation does not specify the radius.", "evidenceRefs": []},
    ]})
    with patch("src.pipeline.claim_extractor.llm_runtime.extract_claims", AsyncMock(side_effect=["{not json", good])) as m:
        claims = asyncio.run(extract_and_validate_claims("The area is \\pi r^2.", [_ev()]))
    assert m.await_count == 2
    assert [c["text"] for c in claims] == ["The area is \\pi r^2."]
    with patch("src.pipeline.claim_extractor.llm_runtime.extract_claims", AsyncMock(return_value="{bad")):
        with pytest.raises(ValueError):
            asyncio.run(extract_and_validate_claims("The area is \\pi r^2.", [_ev()]))


# ---------------------------------------------------------------------------
# F7: document scoping & large-document coverage
# ---------------------------------------------------------------------------

def test_explicit_document_mention_and_overview_detection():
    assert is_explicit_document_mention("What topics does stud.pdf cover?", "stud.pdf")
    assert not is_explicit_document_mention("A Study in Scarlet summary", "stud.pdf")
    assert any(p.search("What topics does stud.pdf cover?") for p in _DOCUMENT_OVERVIEW_PATTERNS)
    assert not any(p.search("Who killed Drebber in stud.pdf?") for p in _DOCUMENT_OVERVIEW_PATTERNS)


@patch("src.pipeline.retrieval.rerank", side_effect=lambda query, passages, top_n=None: [
    {"chunkId": p["chunkId"], "candidate": p["candidate"], "rerankScore": 0.9} for p in passages])
@patch("src.pipeline.retrieval.generate_embeddings", side_effect=lambda texts: [_vec(1) for _ in texts])
@patch("src.pipeline.retrieval.get_ready_documents_meta",
       return_value=({"doc_stud", "doc_campus"}, {"doc_stud": "stud.pdf", "doc_campus": "campus.pdf"}))
@patch("src.pipeline.retrieval.tantivy_store.search_project")
@patch("src.pipeline.retrieval.qdrant_store.search_dense")
def test_document_scope_is_passed_to_every_retriever_and_enforced(mock_dense, mock_lex, *_):
    mock_dense.return_value = [{"chunkId": "s1", "documentId": "doc_stud", "projectId": "p1", "text": "Holmes and Watson.",
                                "score": 0.8, "chunkIndex": 0, "identifierKeys": []}]
    mock_lex.return_value = [{"chunkId": "x1", "documentId": "doc_campus", "projectId": "p1", "text": "Campus sensors.",
                              "score": 3.0, "pageNumber": 1}]  # store returned an out-of-scope hit: must be dropped
    res = retrieve_evidence(project_id="p1", query="Who is Watson in stud.pdf?", top_k=5, document_ids=["doc_stud"])
    assert mock_dense.call_args.kwargs["document_ids"] == ["doc_stud"]
    assert mock_lex.call_args.kwargs["document_ids"] == ["doc_stud"]
    assert {r.documentId for r in res.results} == {"doc_stud"}
    assert res.metadata.documentScope == ["doc_stud"]


def _fake_points(n):
    return [SimpleNamespace(payload={"chunkId": f"c{i}", "documentId": "doc_stud", "chunkIndex": i, "pageNumber": 1 + i // 10,
                                     "text": ("Table of contents . . . . . . 12" if i == 2 else f"chunk {i} text")})
            for i in range(n)]


@pytest.mark.parametrize("n,complete", [(562, False), (6, True)])
def test_coverage_reports_sample_not_complete_evidence(n, complete):
    from src import main
    pts = _fake_points(n)
    pages = [pts[i:i + 500] for i in range(0, n, 500)]
    calls = iter([(p, (None if k == len(pages) - 1 else f"off{k}")) for k, p in enumerate(pages)])
    fake_client = MagicMock()
    fake_client.scroll.side_effect = lambda **kw: next(calls)
    with patch.object(type(main.qdrant_store), "client", new=property(lambda self: fake_client)):
        items, suff, meta = main._build_document_coverage("p1", "doc_stud")
    assert meta["documentChunkCount"] == n and meta["coverageComplete"] is complete
    assert len(items) == min(n, main.COVERAGE_MAX_CHUNKS)
    assert [i.metadata["chunkIndex"] for i in items] == sorted(i.metadata["chunkIndex"] for i in items)
    assert suff.disposition == ("SUPPORTED" if complete else "PARTIAL")
    if not complete:
        idx = [i.metadata["chunkIndex"] for i in items]
        assert 2 in idx                    # structural (table of contents) chunk included
        assert max(idx) >= n - 1           # sample spans the whole document, not the first 100 points
        assert "not exhaustive" in suff.reason


# ---------------------------------------------------------------------------
# Endpoint parity: /generate and /generate/stream reach the same trust state
# ---------------------------------------------------------------------------

def _parity_run(llm_text, claims):
    from fastapi.testclient import TestClient
    from src import main
    from src.pipeline.query_understanding import QueryPlan
    from src.pipeline.retrieval import EvidenceSufficiency, EvidenceSufficiencySignals

    plan = QueryPlan(standalone_query="What is the rated flow of P-101A?", search_queries=["rated flow P-101A"])
    suff = EvidenceSufficiency(sufficient=True, reason="ok", score=0.9, disposition="SUPPORTED",
                               signals=EvidenceSufficiencySignals(resultCount=1, topRerankScore=0.9,
                                                                  identifierMatched=True, sourceCoverage=["d"]))
    retr = SimpleNamespace(results=[_ev()], sufficiency=suff)

    async def _stream(_prompt):
        for i in range(0, len(llm_text), 4):
            yield llm_text[i:i + 4]

    with patch.object(main, "classify_intent", return_value=("grounded", None)), \
         patch.object(main, "get_project_knowledge_summary", return_value={}), \
         patch.object(main, "understand_query", AsyncMock(return_value=plan)), \
         patch.object(main, "_execute_plan_retrieval", side_effect=lambda *a, **k: (retr, None)), \
         patch.object(main, "_attach_source_context"), \
         patch.object(main.llm_runtime, "generate_answer", AsyncMock(return_value=SimpleNamespace(
             answer=llm_text, modelVersion="test", latencyMs=1, provider="test"))), \
         patch.object(main.llm_runtime, "stream_answer", _stream), \
         patch.object(main, "extract_and_validate_claims", AsyncMock(return_value=claims)):
        client = TestClient(main.app)
        body = {"projectId": "p1", "query": "What is the rated flow of P-101A?"}
        g = client.post("/generate", json=body).json()
        events = client.post("/generate/stream", json=body).text
    final = None
    deltas = ""
    for block in events.split("\n\n"):
        if block.startswith("event: generation.completed"):
            final = json.loads(block.split("data: ", 1)[1])
        if block.startswith("event: answer.delta"):
            deltas += json.loads(block.split("data: ", 1)[1])["delta"]
    return g, final, deltas


@pytest.mark.parametrize("llm_text,claims,expected", [
    ("P-101A has a rated flow of 450 gpm [pump_p101a_specs.pdf, p. 1].\n<<OUTCOME:ANSWERED>>", [dict(_CLAIM)], "SUPPORTED"),
    ("The available project evidence doesn't specify the rated flow [pump_p101a_specs.pdf, p. 1].\n<<OUTCOME:INSUFFICIENT>>", [], "INSUFFICIENT"),
    ("P-101A has a rated flow of 450 gpm.\n<<OUTCOME:ANSWERED>>", [], "UNVERIFIED"),
])
def test_generate_and_stream_reach_same_trust_state(llm_text, claims, expected):
    g, s, deltas = _parity_run(llm_text, claims)
    for res in (g, s):
        assert res["metadata"]["disposition"] == expected
        assert "<<OUTCOME" not in res["answer"]
    assert g["metadata"]["disposition"] == s["metadata"]["disposition"]
    assert g["metadata"]["abstention"] == s["metadata"]["abstention"]
    assert len(g["claims"]) == len(s["claims"]) and len(g["evidence"]) == len(s["evidence"])
    assert g["answer"] == s["answer"]
    assert "<<" not in deltas
    if expected == "INSUFFICIENT":
        assert g["evidence"] == [] and g["claims"] == [] and "[" not in g["answer"]


def test_fallback_plan_for_connection_question_is_valid():
    """Planner unavailable + 'how is X connected to Y' must yield a valid multi-hop plan, not a 500."""
    from src.pipeline.query_understanding import _make_fallback_plan
    plan = _make_fallback_plan("How is Lucy Ferrier connected to Enoch Drebber?")
    assert plan.task == "multi_hop" and plan.search_queries
