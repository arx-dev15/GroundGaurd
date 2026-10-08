"""M1_TORCH_THREADS configuration (no model load)."""
import importlib, os, sys
from unittest.mock import patch
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import src.config as config


def _threads(value):
    env = {} if value is None else {"M1_TORCH_THREADS": value}
    with patch.dict(os.environ, env, clear=False):
        if value is None:
            os.environ.pop("M1_TORCH_THREADS", None)
        return config._m1_torch_threads()


def test_default_is_four_threads():
    assert _threads(None) == min(4, os.cpu_count() or 1)


def test_explicit_values_and_clamping():
    assert _threads("1") == 1
    assert _threads("0") == 1
    assert _threads("10000") == (os.cpu_count() or 1)
    assert _threads("not-a-number") == min(4, os.cpu_count() or 1)


def test_predictor_applies_setting_on_cpu_load():
    from src.inference import predictor as pred
    p = pred.DebertaGroundingPredictor("dummy")
    with patch.object(pred, "M1_TORCH_THREADS", 3), patch.object(pred.torch, "set_num_threads") as set_threads, \
         patch.object(pred.AutoTokenizer, "from_pretrained"), patch.object(pred.AutoModelForSequenceClassification, "from_pretrained") as m:
        m.return_value.config.id2label = {0: "contradiction", 1: "entailment", 2: "neutral"}
        p.device = pred.torch.device("cpu")
        p.load_model()
    set_threads.assert_called_once_with(3)
