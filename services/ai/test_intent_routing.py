import pytest
from src.pipeline.intent_classifier import (
    classify_intent,
    generate_conversational_response,
    generate_product_help_response,
    generate_unsupported_query_response,
)

def test_conversational_greetings():
    for q in ["hello", "hey", "hi", "heyy", "Good morning", "Hello there", "what's up", "howdy", "yo", "sup", "hiya", "yo bro", "sup mate"]:
        intent, sub = classify_intent(q)
        assert intent == "conversational", f"Failed for {q}"
        assert sub == "greeting"
        resp = generate_conversational_response(sub)
        assert ("what would you like to look into" in resp.lower() or "what would you like to explore" in resp.lower())

def test_conversational_thanks():
    for q in ["thanks", "thank you", "thx", "many thanks", "thank you so much", "thanks bro", "thx mate", "thank you bro"]:
        intent, sub = classify_intent(q)
        assert intent == "conversational", f"Failed for {q}"
        assert sub == "thanks"
        resp = generate_conversational_response(sub)
        assert "welcome" in resp.lower()

def test_conversational_ack():
    for q in ["ok", "okay", "cool", "alright", "alright bro", "sure", "got it"]:
        intent, sub = classify_intent(q)
        assert intent == "conversational", f"Failed for {q}"
        assert sub == "ack"
        resp = generate_conversational_response(sub)
        assert ("sure" in resp.lower() or "what would you like to check next" in resp.lower())

def test_product_help():
    help_queries = [
        "what can I ask?",
        "what to ask",
        "how do I use this?",
        "what documents do I have?",
        "explain GroundGuard",
        "help",
        "what can u do",
        "what can you do",
        "what can u do bro",
        "what u can do bro?",
        "what can this do",
        "what can this thing do",
        "What can GroundGuard do?",
        "how do I verify a claim?",
        "what is this?",
    ]
    for q in help_queries:
        intent, sub = classify_intent(q)
        assert intent == "product_help", f"Failed for {q}"

    resp = generate_product_help_response("Demo")
    assert "uploaded evidence" in resp
    assert "inspect the evidence behind individual claims" in resp
    assert "Demo" in resp
    # Invariant: No chunk counts, model names, or RAG terminology in ordinary help copy
    assert "chunk" not in resp.lower()
    assert "rag" not in resp.lower()
    assert "deberta" not in resp.lower()

def test_grounded_queries():
    for q in ["What does the DHT11 sensor measure?", "What is the operating voltage of P-101A?", "List the alarm limits for tank V-204"]:
        intent, sub = classify_intent(q)
        assert intent == "grounded_query", f"Failed for {q}"

def test_off_topic_queries():
    for q in ["Who won yesterday's football match?", "What is Virat Kohli's age?", "Who is the president of France?"]:
        intent, sub = classify_intent(q)
        assert intent == "unsupported_query", f"Failed for {q}"
        resp = generate_unsupported_query_response(q, {"readyCount": 2})
        assert "couldn't answer that from this project's sources" in resp

def test_real_user_queries_not_unsupported():
    """
    Regression tests for Section 11: Real observed queries MUST NOT be classified
    into a path that skips retrieval solely as unsupported.
    """
    real_queries = [
        "Which pump and vessel were inspected during routine maintenance?",
        "what does campus monitor do",
        "What sensors are used?",
        "Why was it inspected?",
        "Compare the two systems",
        "Which one uses more power?",
    ]
    for q in real_queries:
        intent, sub = classify_intent(q)
        assert intent == "grounded_query", f"Query '{q}' should route to grounded_query, got {intent}"
