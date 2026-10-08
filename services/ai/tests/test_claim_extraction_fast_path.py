"""Deterministic single-fact claim extraction (labeled fixtures from recorded answers; LLM mocked)."""
import asyncio, os, sys
from unittest.mock import AsyncMock, patch
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.pipeline.claim_extractor import extract_and_validate_claims, deterministic_single_claim
from src.pipeline.retrieval import EvidenceItem


def ev(cid, fn, page=1, text="..."):
    return EvidenceItem(evidenceId=f"e_{cid}", chunkId=cid, documentId=f"doc_{fn[:4]}", text=text, pageNumber=page,
                        sources=["qdrant_dense"], metadata={"filename": fn})


EVID = [ev("k_pump", "pump_p101a_specs.pdf"), ev("k_dht", "dht11_datasheet.pdf"), ev("k_fm", "industrial_flow_meter_fm900.pdf"),
        ev("k_stud8", "stud.pdf", 8), ev("k_stud9", "stud.pdf", 9)]

FAST = [  # (answer as generated, expected claim text, expected evidence chunk ids)
    ("The rated flow rate of pump P-101A is 450 gpm [Pump p101a Specs, p. 1].", "The rated flow rate of pump P-101A is 450 gpm.", ["k_pump"]),
    ("The maximum discharge pressure of pump P-101A is 15.2 bar [pump_p101a_specs.pdf, p. 1].", "The maximum discharge pressure of pump P-101A is 15.2 bar.", ["k_pump"]),
    ("Pin 4 on the DHT11 sensor is used for GND [dht11_datasheet.pdf, p. 1].", "Pin 4 on the DHT11 sensor is used for GND.", ["k_dht"]),
    ("The FM-900 flow meter has a maximum operating pressure of 24.5 bar [industrial_flow_meter_fm900.pdf, p. 1].",
     "The FM-900 flow meter has a maximum operating pressure of 24.5 bar.", ["k_fm"]),
    ("Sensor calibration unit SC-12 is attached directly to the upstream transmitter port [industrial_flow_meter_fm900.pdf, p. 1].",
     "Sensor calibration unit SC-12 is attached directly to the upstream transmitter port.", ["k_fm"]),
    ("Stamford introduced Watson to Holmes [stud.pdf, p. 8].", "Stamford introduced Watson to Holmes.", None),  # no listed predicate verb
]
FALLBACK = [
    "Pump P-101A has a rated flow rate of 120 m³/h and a normal operating temperature of 65 °C [pump_p101a_specs.pdf, p. 1].",  # 2 facts
    "No. The source states that the controller uses port 7421, not 8080 [zephyr_x9_spec.pdf, p. 1].",                          # premise/negation
    "Pin 2 is used for the data line, and it carries the single-wire digital data signal [dht11_datasheet.pdf, p. 1].",       # compound
    "The DHT11 operating voltage is 3.5 V to 5.5 V DC [dht11_datasheet.pdf, p. 1]. Pin 4 is GND [dht11_datasheet.pdf, p. 1].",  # 2 sentences
    "It is rated at 450 gpm [pump_p101a_specs.pdf, p. 1].",                                                                       # pronoun subject
    "Dr. Watson was an army doctor [stud.pdf, p. 8].",                                                                            # abbreviation -> conservative
    "The rated flow rate of pump P-101A is 450 gpm.",                                                                             # uncited
    "The rated flow rate of pump P-101A is 450 gpm [Other Manual.pdf, p. 3].",                                                   # unresolvable citation
    "The available project evidence does not specify the design temperature of P-101A [pump_p101a_specs.pdf, p. 1].",           # absence
    "P-101A specifications:\n- Rated flow: 450 gpm\n- Discharge pressure: 120 psig [pump_p101a_specs.pdf, p. 1].",              # list
]


@pytest.mark.parametrize("answer,claim,ids", [f for f in FAST if f[2]])
def test_single_fact_answers_extracted_without_llm(answer, claim, ids):
    with patch("src.pipeline.claim_extractor.llm_runtime.extract_claims", AsyncMock(side_effect=AssertionError("LLM"))):
        stats = {}
        out = asyncio.run(extract_and_validate_claims(answer, EVID, stats=stats))
    assert stats["method"] == "deterministic_single_fact"
    assert len(out) == 1 and out[0]["text"] == claim and out[0]["status"] == "pending" and out[0]["verification"] is None
    assert [e.chunkId for e in out[0]["evidence"]] == ids
    assert set(out[0]) == {"claimId", "text", "status", "ordinal", "sourceText", "verification", "evidence"}  # same shape as LLM path


@pytest.mark.parametrize("answer", FALLBACK + [FAST[-1][0]])
def test_everything_else_uses_llm_extractor(answer):
    assert deterministic_single_claim(answer, EVID) is None
    with patch("src.pipeline.claim_extractor.llm_runtime.extract_claims", AsyncMock(return_value='{"claims": []}')) as m:
        stats = {}
        asyncio.run(extract_and_validate_claims(answer, EVID, stats=stats))
    if "does not contain sufficient evidence" not in answer.lower():
        assert m.await_count == 1 and stats["method"] == "llm"


def test_page_specific_citation_maps_to_that_page_only():
    out = deterministic_single_claim("Holmes is a consulting detective [stud.pdf, p. 9].", EVID)
    assert out and [e.chunkId for e in out[0]["evidence"]] == ["k_stud9"]


def test_trust_states_unchanged_for_empty_or_failed_extraction():
    from src import main
    from types import SimpleNamespace
    plan = SimpleNamespace(is_proposition=False)
    retr = SimpleNamespace(sufficiency=SimpleNamespace(disposition="SUPPORTED"))
    multi = "Pump P-101A has a rated flow rate of 450 gpm and 120 psig discharge pressure [pump_p101a_specs.pdf, p. 1].\n<<OUTCOME:ANSWERED>>"
    for llm_out, expected in (('{"claims": []}', "UNVERIFIED"), ("{bad json", "UNVERIFIED")):
        with patch("src.pipeline.claim_extractor.llm_runtime.extract_claims", AsyncMock(return_value=llm_out)):
            fin = asyncio.run(main._finalize_grounded_answer(multi, EVID, retr, plan, False, None))
        assert fin["disposition"] == expected
    single = "The rated flow rate of pump P-101A is 450 gpm [pump_p101a_specs.pdf, p. 1].\n<<OUTCOME:ANSWERED>>"
    with patch("src.pipeline.claim_extractor.llm_runtime.extract_claims", AsyncMock(side_effect=AssertionError("LLM"))):
        fin = asyncio.run(main._finalize_grounded_answer(single, EVID, retr, plan, False, None))
    assert fin["disposition"] == "SUPPORTED" and len(fin["claims"]) == 1  # pending M1; M1 decides verified/flagged
    assert fin["claimExtraction"]["method"] == "deterministic_single_fact"
