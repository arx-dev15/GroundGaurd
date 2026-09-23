import pytest
from fastapi.testclient import TestClient
from src.main import app

@pytest.fixture(scope="session")
def client():
    """Context manager ensures FastAPI lifespan runs, pre-warming the neural model."""
    with TestClient(app) as c:
        yield c

def test_health_endpoint(client):
    """Verify that /health responds with 200 and matches Member 3's expectations."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "ml"
    assert data["status"] == "ok"
    assert data["modelLoaded"] is True
    assert "modelVersion" in data

def test_model_info_endpoint(client):
    """Verify that /model/info returns model metadata."""
    response = client.get("/model/info")
    assert response.status_code == 200
    data = response.json()
    assert "modelVersion" in data
    assert set(data["labels"]) == {"entailment", "contradiction", "neutral"}
    assert data["status"] == "ready"

def test_verify_numerical_contradiction(client):
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

def test_verify_entailment(client):
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

def test_verify_semantic_paraphrase(client):
    """Verify neural reasoning across complex paraphrase with zero direct keyword overlap."""
    payload = {
        "requestId": "test_req_03",
        "claimId": "paraphrase_claim",
        "claim": "A Japanese robotics firm was purchased for around $40M late in the year.",
        "evidence": [
            {
                "chunkId": "chunk_01",
                "text": "The executive committee authorized the acquisition of the Tokyo-based robotics startup for roughly forty million dollars near the conclusion of the fourth quarter."
            }
        ]
    }
    response = client.post("/verify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["label"] == "entailment"
    assert data["scores"]["entailment"] > 0.85
    assert data["groundingScore"] > 0.85

def test_verify_negation_contradiction(client):
    """Verify neural detection of subtle negation traps."""
    payload = {
        "requestId": "test_req_04",
        "claimId": "negation_claim",
        "claim": "Drug X caused respiratory distress during clinical trials.",
        "evidence": [
            {
                "chunkId": "chunk_01",
                "text": "The clinical trials proved that Drug X effectively reduced arterial plaque without causing respiratory distress."
            }
        ]
    }
    response = client.post("/verify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["label"] == "contradiction"
    assert data["scores"]["contradiction"] > 0.90
    assert data["groundingScore"] < 0.10

def test_verify_batch(client):
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