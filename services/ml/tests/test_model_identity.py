import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from src.main import app, get_active_engine
from src.contracts.requests import EvidenceChunk

def test_real_neural_mode_identity():
    """Requirement D: Real neural mode reports truthful identity."""
    with TestClient(app) as client:
        health_resp = client.get("/health")
        assert health_resp.status_code == 200
        health_data = health_resp.json()
        assert health_data["status"] == "ok"
        assert health_data["modelLoaded"] is True
        assert health_data["modelVersion"] == "groundguard-deberta-v1-finetuned"

        info_resp = client.get("/model/info")
        assert info_resp.status_code == 200
        info_data = info_resp.json()
        assert info_data["modelVersion"] == "groundguard-deberta-v1-finetuned"
        assert info_data["engineType"] == "deberta-cross-encoder"
        assert info_data["status"] == "ready"

def test_missing_checkpoint_fails_loud_and_blocks_silent_fallback():
    """Requirement A: Required neural mode + missing checkpoint does not silently serve mock."""
    from src.inference.predictor import neural_predictor
    import src.main as main_module

    # Simulate neural model failing to load / missing
    with patch.object(neural_predictor, "is_loaded", False):
        with patch.object(main_module, "USE_NEURAL_ENGINE", True):
            # Attempting to obtain active engine must raise 503 HTTP exception, NOT return mock
            with pytest.raises(Exception) as exc_info:
                get_active_engine()
            assert "503" in str(exc_info.value) or "Neural model required" in str(exc_info.value)

def test_unloaded_health_reports_unavailable():
    """Requirement B: /health and /model/info accurately report model unavailable when neural model is not loaded."""
    from src.inference.predictor import neural_predictor
    import src.main as main_module

    with patch.object(neural_predictor, "is_loaded", False):
        with patch.object(main_module, "USE_NEURAL_ENGINE", True):
            client = TestClient(app, raise_server_exceptions=False)
            
            health_resp = client.get("/health")
            assert health_resp.status_code == 503
            health_data = health_resp.json()
            assert health_data["status"] == "degraded"
            assert health_data["modelLoaded"] is False
            assert health_data["modelVersion"] == "unloaded"

            info_resp = client.get("/model/info")
            assert info_resp.status_code == 503
            info_data = info_resp.json()
            assert info_data["status"] == "not_ready"
            assert info_data["engineType"] == "none"

            verify_resp = client.post("/verify", json={
                "claim": "Test claim",
                "evidence": [{"chunkId": "c1", "text": "Test evidence"}]
            })
            assert verify_resp.status_code == 503

def test_explicit_mock_mode_behavior():
    """Requirement C: Explicit mock mode works intentionally and identifies itself truthfully."""
    from src.inference.predictor import neural_predictor
    import src.main as main_module

    with patch.object(main_module, "USE_NEURAL_ENGINE", False):
        client = TestClient(app)
        
        health_resp = client.get("/health")
        assert health_resp.status_code == 200
        health_data = health_resp.json()
        assert health_data["status"] == "ok"
        assert health_data["modelLoaded"] is False  # Must not pretend neural is loaded
        assert health_data["modelVersion"] == "mock-engine-v1"  # Must not claim fine-tuned

        info_resp = client.get("/model/info")
        assert info_resp.status_code == 200
        info_data = info_resp.json()
        assert info_data["engineType"] == "mock-heuristic"
        assert info_data["modelVersion"] == "mock-engine-v1"

        verify_resp = client.post("/verify", json={
            "requestId": "mock_req_1",
            "claimId": "mock_claim",
            "claim": "Revenue was 80 Cr in 2024.",
            "evidence": [{"chunkId": "c1", "text": "Revenue was 50 Cr in 2024."}]
        })
        assert verify_resp.status_code == 200
        verify_data = verify_resp.json()
        assert verify_data["modelVersion"] == "mock-engine-v1"
        assert verify_data["label"] == "contradiction"
