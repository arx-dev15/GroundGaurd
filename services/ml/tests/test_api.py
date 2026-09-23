import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

def test_health_endpoint():
    """Verify that /health responds with 200 and matches Member 3's expectations."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "ml"
    assert data["status"] == "ok"
    assert data["modelLoaded"] is True
    assert "modelVersion" in data

def test_model_info_endpoint():
    """Verify that /model/info returns model metadata."""
    response = client.get("/model/info")
    assert response.status_code == 200
    data = response.json()
    assert "modelVersion" in data
    assert data["labels"] == ["entailment", "contradiction", "neutral"]
    assert data["status"] == "ready"

def test_verify_numerical_contradiction():
    """Verify that a claim with a conflicting number is flagged as contradiction."""
    payload = {
        "requestId": "test_req_01",
        "claimId": "claim_num_err",
        "claim": "The company generated ₹80 Cr in 2024.",
        "evidence": [
            {
                "chunkId": "chunk_01",
                "text": "The company generated revenue of ₹50 Cr in 2024."
            }
        ]
    }
    response = client.post("/verify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["requestId"] == "test_req_01"
    assert data["claimId"] == "claim_num_err"
    assert data["label"] == "contradiction"
    assert data["scores"]["contradiction"] > 0.80
    assert data["groundingScore"] < 0.20

def test_verify_entailment():
    """Verify that a supported claim returns entailment."""
    payload = {
        "requestId": "test_req_02",
        "claimId": "claim_entailed",
        "claim": "The company generated revenue of ₹50 Cr in 2024.",
        "evidence": [
            {
                "chunkId": "chunk_01",
                "text": "The company generated revenue of ₹50 Cr in 2024."
            }
        ]
    }
    response = client.post("/verify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["label"] == "entailment"
    assert data["scores"]["entailment"] > 0.80
    assert data["groundingScore"] > 0.80

def test_verify_batch():
    """Verify batch processing of multiple claims."""
    payload = {
        "requestId": "test_batch_01",
        "items": [
            {
                "claimId": "c1",
                "claim": "Revenue was ₹80 Cr.",
                "evidence": [{"chunkId": "e1", "text": "Revenue was ₹50 Cr."}]
            },
            {
                "claimId": "c2",
                "claim": "Revenue was ₹50 Cr.",
                "evidence": [{"chunkId": "e1", "text": "Revenue was ₹50 Cr."}]
            }
        ]
    }
    response = client.post("/verify/batch", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["requestId"] == "test_batch_01"
    assert len(data["results"]) == 2
    assert data["results"][0]["label"] == "contradiction"
    assert data["results"][1]["label"] == "entailment"