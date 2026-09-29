import re
import logging
from typing import Literal, Tuple, Optional, Dict, Any, List

logger = logging.getLogger("m2-intent-classifier")

IntentType = Literal["conversational", "product_help", "grounded_query"]

# 1. Conversational Patterns (Greetings, Thanks, Farewells, Acknowledgments)
GREETING_PATTERNS = [
    re.compile(r'^\s*(?:hi|hey|hello|heyy+|howdy|greetings|good\s+(?:morning|afternoon|evening|day)|what\'?s\s+up|sup|yo)(?:\s+(?:there|groundguard|bot|assistant))?[\s!.,?]*$', re.IGNORECASE),
]

THANKS_PATTERNS = [
    re.compile(r'^\s*(?:thanks|thank\s+you|thx|ty|many\s+thanks|much\s+appreciated|thanks\s+a\s+lot|thank\s+you\s+so\s+much)[\s!.,?]*$', re.IGNORECASE),
]

FAREWELL_PATTERNS = [
    re.compile(r'^\s*(?:bye|goodbye|see\s+ya|cya|farewell|have\s+a\s+good\s+one|catch\s+you\s+later)[\s!.,?]*$', re.IGNORECASE),
]

ACK_PATTERNS = [
    re.compile(r'^\s*(?:ok|okay|cool|great|awesome|understood|got\s+it|nice|perfect|sure|fine)[\s!.,?]*$', re.IGNORECASE),
]

# 2. Product / Help Patterns
HELP_PATTERNS = [
    re.compile(r'^\s*(?:what\s+(?:can|should|to)\s+(?:i|we)\s+ask(?:\s+you)?|what\s+to\s+ask|how\s+(?:do\s+i\s+use\s+this|does\s+(?:this|groundguard)\s+work)|what\s+can\s+you\s+do|what\s+are\s+your\s+capabilities|how\s+can\s+you\s+help|what\s+documents\s+do\s+i\s+have|what\s+is\s+groundguard|help|help\s+me|explain\s+groundguard)[\s!.,?]*$', re.IGNORECASE),
    re.compile(r'^(?:how\s+to\s+use|features|instructions|usage)[\s!.,?]*$', re.IGNORECASE),
]

def classify_intent(query: str) -> Tuple[IntentType, Optional[str]]:
    """
    Early routes ONLY:
    - conversational (greetings, thanks, goodbyes, acknowledgments)
    - product_help (how to use, capabilities, document inventory)
    All other substantive queries enter the grounded retrieval pipeline.
    """
    clean = (query or "").strip()
    if not clean:
        return ("conversational", "greeting")

    for pat in GREETING_PATTERNS:
        if pat.match(clean):
            return ("conversational", "greeting")

    for pat in THANKS_PATTERNS:
        if pat.match(clean):
            return ("conversational", "thanks")

    for pat in FAREWELL_PATTERNS:
        if pat.match(clean):
            return ("conversational", "farewell")

    for pat in ACK_PATTERNS:
        if pat.match(clean):
            return ("conversational", "ack")

    for pat in HELP_PATTERNS:
        if pat.match(clean):
            return ("product_help", "help")

    return ("grounded_query", None)

def generate_conversational_response(sub_intent: Optional[str]) -> str:
    """
    Returns friendly conversational response for casual interactions.
    """
    if sub_intent == "thanks":
        return "You're welcome! Let me know if you need any more evidence-backed answers from your project knowledge."
    elif sub_intent == "farewell":
        return "Goodbye! Whenever you need to investigate technical claims or documentation, I'll be here."
    elif sub_intent == "ack":
        return "Sounds good! Whenever you're ready, ask a question about your project documents."
    else:
        return "Hey! What would you like to explore in this project? I can answer questions from your uploaded knowledge, compare sources, or help you find evidence for a claim."

def generate_product_help_response(doc_summary: Dict[str, Any]) -> str:
    """
    Returns helpful GroundGuard guidance using real project document metadata.
    """
    ready_count = doc_summary.get("readyCount", 0)
    filenames: List[str] = doc_summary.get("filenames", [])

    if ready_count > 0:
        doc_label = "document" if ready_count == 1 else "documents"
        file_preview = f" ({', '.join(filenames[:3])})" if filenames else ""
        return (
            f"You currently have {ready_count} ready {doc_label}{file_preview}.\n\n"
            f"You can ask me to:\n"
            f"• explain something from your documents\n"
            f"• compare information across sources\n"
            f"• find evidence supporting a claim\n"
            f"• summarize a topic in this project"
        )
    else:
        return (
            "You currently have no ready documents in this project.\n\n"
            "Upload technical manuals, datasheets, or PDFs in the Knowledge tab to start asking grounded questions."
        )

def generate_unsupported_query_response(query: str, doc_summary: Optional[Dict[str, Any]] = None) -> str:
    """
    Returns polite refusal indicating that GroundGuard is scoped to project evidence.
    """
    ready_count = (doc_summary or {}).get("readyCount", 0)
    if ready_count > 0:
        return (
            "I am scoped strictly to your project's uploaded documents and evidence. "
            "The current project knowledge does not contain information to answer this question. "
            "You can ask me questions about your uploaded documentation (such as component specifications, wiring, or operating parameters)."
        )
    else:
        return (
            "GroundGuard is scoped strictly to project evidence, but there are currently no ready documents in this project. "
            "Upload your technical documents in the Knowledge tab to ask grounded questions."
        )
