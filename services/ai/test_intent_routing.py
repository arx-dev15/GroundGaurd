import pytest
from src.pipeline.intent_classifier import (
    classify_intent,
    generate_conversational_response,
    generate_product_help_response,
    generate_unsupported_query_response,
)

def test_conversational_greetings():
    for q in ["hello", "hey", "hi", "heyy", "Good morning", "Hello there", "what's up", "howdy"]:
        intent, sub = classify_intent(q)
        assert intent == "conversational", f"Failed for {q}"
        assert sub == "greeting"
        resp = generate_conversational_response(sub)
        assert "What would you like to explore" in resp

def test_conversational_thanks():
    for q in ["thanks", "thank you", "thx", "many thanks", "thank you so much"]:
        intent, sub = classify_intent(q)
        assert intent == "conversational", f"Failed for {q}"
        assert sub == "thanks"
        resp = generate_conversational_response(sub)
        assert "welcome" in resp.lower()

def test_product_help():
    for q in ["what can I ask?", "what to ask", "how do I use this?", "what documents do I have?", "explain GroundGuard", "help"]:
        intent, sub = classify_intent(q)
        assert intent == "product_help", f"Failed for {q}"

    summary_with_docs = {"readyCount": 2, "filenames": ["dht11_manual.pdf", "specs.pdf"]}
    resp = generate_product_help_response(summary_with_docs)
    assert "2 ready documents" in resp
    assert "dht11_manual.pdf" in resp

    summary_empty = {"readyCount": 0, "filenames": []}
    resp_empty = generate_product_help_response(summary_empty)
    assert "no ready documents" in resp_empty

def test_grounded_queries():
    for q in ["What does the DHT11 sensor measure?", "What is the operating voltage of P-101A?", "List the alarm limits for tank V-204"]:
        intent, sub = classify_intent(q)
        assert intent == "grounded_query", f"Failed for {q}"

def test_off_topic_queries():
    for q in ["Who won yesterday's football match?", "What is Virat Kohli's age?", "Who is the president of France?"]:
        intent, sub = classify_intent(q)
        assert intent == "unsupported_query", f"Failed for {q}"
        resp = generate_unsupported_query_response(q, {"readyCount": 2})
        assert "scoped strictly to your project's uploaded documents" in resp
