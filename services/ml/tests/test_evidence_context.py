"""
Regression (Stabilization Phase 02, F8): subject-less evidence chunks + legitimate source context.

The chunk "Its operating voltage is 3.5V to 5.5V DC." does not name its subject, so a correct claim about
the DHT11 was classified neutral. Source context (document title / heading / preceding sentence) is used for
the cross-encoder premise only; contradiction detection must not weaken. Uses the real fine-tuned model.
"""
import pytest

from src.contracts.requests import EvidenceChunk
from src.inference.predictor import neural_predictor

DHT_NOSUBJ = "Its operating voltage is 3.5V to 5.5V DC. Pin 1 is VCC, Pin 2 carries its data signal, Pin 3 is NC, and Pin 4 is GND."
PUMP_NOSUBJ = "The pump is designed for hydrocarbon liquid transfer with a rated flow rate of 450 gpm and a discharge pressure of 120 psig."


@pytest.fixture(scope="module")
def predictor():
    try:
        neural_predictor.load_model()
    except Exception as e:  # model weights not available in this environment
        pytest.skip(f"NLI model unavailable: {e}")
    return neural_predictor


def _verify(p, claim, text, context=None):
    return p.verify_single(claim, [EvidenceChunk(chunkId="c1", text=text, context=context)])


@pytest.mark.parametrize("claim,text,context", [
    ("The DHT11 sensor operating voltage is 3.5 V to 5.5 V DC.", DHT_NOSUBJ, "Source document: DHT11 Datasheet."),
    ("Pump P-101A has a rated flow rate of 450 gpm.", PUMP_NOSUBJ, "Source document: Pump P-101A Specs."),
])
def test_subjectless_chunk_entails_with_source_context(predictor, claim, text, context):
    label_without, _, _ = _verify(predictor, claim, text)
    label_with, scores, _ = _verify(predictor, claim, text, context)
    assert label_without != "entailment"          # the reported defect (neutral)
    assert label_with == "entailment", scores


@pytest.mark.parametrize("claim,text,context", [
    ("The DHT11 sensor operating voltage is 12 V DC.", DHT_NOSUBJ, "Source document: DHT11 Datasheet."),
    ("Pump P-101A has a rated flow rate of 900 gpm.", PUMP_NOSUBJ, "Source document: Pump P-101A Specs."),
])
def test_context_never_weakens_contradiction(predictor, claim, text, context):
    assert _verify(predictor, claim, text)[0] == "contradiction"
    assert _verify(predictor, claim, text, context)[0] == "contradiction"


def test_context_does_not_transfer_values_to_another_subject(predictor):
    label, _, _ = _verify(predictor, "The FM-900 flow meter operating voltage is 3.5 V to 5.5 V DC.",
                          DHT_NOSUBJ, "Source document: DHT11 Datasheet.")
    assert label != "entailment"
