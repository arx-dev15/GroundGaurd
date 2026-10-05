import re
import logging
from typing import Literal, Tuple, Optional, Dict, Any, List

logger = logging.getLogger("m2-intent-classifier")

IntentType = Literal["conversational", "product_help", "grounded_query", "unsupported_query"]

# 1. Conversational Patterns (Greetings, Thanks, Farewells, Acknowledgments)
GREETING_PATTERNS = [
    re.compile(r'^\s*(?:hi|hey|hello|heyy+|hiya|howdy|greetings|good\s+(?:morning|afternoon|evening|day)|what\'?s\s+up|sup|yo)(?:\s+(?:there|evidex|evidex\s+ai|groundguard|bot|assistant|bro|dude|man|mate|pal))?[\s!.,?]*$', re.IGNORECASE),
]

THANKS_PATTERNS = [
    re.compile(r'^\s*(?:thanks|thank\s+you|thx|ty|many\s+thanks|much\s+appreciated|thanks\s+a\s+lot|thank\s+you\s+so\s+much)(?:\s+(?:bro|dude|man|mate|pal|there|evidex|evidex\s+ai|groundguard|bot))?[\s!.,?]*$', re.IGNORECASE),
]

FAREWELL_PATTERNS = [
    re.compile(r'^\s*(?:bye|goodbye|see\s+ya|cya|farewell|have\s+a\s+good\s+one|catch\s+you\s+later)(?:\s+(?:bro|dude|man|mate|pal))?[\s!.,?]*$', re.IGNORECASE),
]

ACK_PATTERNS = [
    re.compile(r'^\s*(?:ok|okay|cool|great|awesome|understood|got\s+it|nice|perfect|sure|fine|alright)(?:\s+(?:bro|dude|man|mate|pal|then))?[\s!.,?]*$', re.IGNORECASE),
]

# 2. Product / Help Patterns
HELP_PATTERNS = [
    re.compile(r'^\s*(?:what\s+(?:can|should|to)\s+(?:i|we)\s+ask(?:\s+you)?|what\s+to\s+ask|how\s+(?:do\s+i\s+use\s+this|to\s+use\s+this|does\s+(?:this|evidex|evidex\s+ai|groundguard)\s+work)|how\s+(?:do\s+i|to)\s+verify\s+(?:a\s+)?claim[s]?|what\s+can\s+(?:you|evidex|evidex\s+ai|groundguard|this)\s+do|what\s+you\s+can\s+do|what\s+(?:is\s+this|is\s+evidex|is\s+evidex\s+ai|is\s+groundguard)|what\s+are\s+your\s+capabilities|how\s+can\s+you\s+help|what\s+documents\s+do\s+i\s+have|help|help\s+me|explain\s+(?:evidex|evidex\s+ai|groundguard))(?:\s+(?:bro|dude|man|mate|pal))?[\s!.,?]*$', re.IGNORECASE),
    re.compile(r'^(?:how\s+to\s+use|features|instructions|usage)[\s!.,?]*$', re.IGNORECASE),
]

# 3. Off-Topic / Unsupported Query Patterns (Sports, Celebrities, Politics, General Trivia)
OFF_TOPIC_PATTERNS = [
    re.compile(r'\b(?:football|cricket|sports|match|virat|kohli|messi|ronaldo|president\s+of\s+france|prime\s+minister\s+of|weather\s+in|recipe|movie|actor|actress|celebrity)\b', re.IGNORECASE),
]

def normalize_intent_query(query: str) -> str:
    """
    Normalizes closed-class colloquial abbreviations (e.g. 'u' -> 'you', 'ur' -> 'your')
    and colloquial filler like 'this thing' -> 'this' ONLY for intent classification.
    """
    q = (query or "").strip()
    q = re.sub(r'\bu\b', 'you', q, flags=re.IGNORECASE)
    q = re.sub(r'\bur\b', 'your', q, flags=re.IGNORECASE)
    q = re.sub(r'\bthis\s+thing\b', 'this', q, flags=re.IGNORECASE)
    return q.strip()

def classify_intent(query: str) -> Tuple[IntentType, Optional[str]]:
    """
    Early routes ONLY:
    - conversational (greetings, thanks, goodbyes, acknowledgments)
    - product_help (how to use, capabilities, document inventory)
    - unsupported_query (obvious off-topic world trivia / sports / celebrities)
    All other substantive queries enter the grounded retrieval pipeline.
    """
    raw = (query or "").strip()
    if not raw:
        return ("conversational", "greeting")

    clean = normalize_intent_query(raw)

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

    for pat in OFF_TOPIC_PATTERNS:
        if pat.search(clean):
            return ("unsupported_query", "off_topic")

    return ("grounded_query", None)

def generate_conversational_response(sub_intent: Optional[str], project_name: Optional[str] = None) -> str:
    """
    Returns concise, useful conversational responses for closed-class interactions (Section 11).
    """
    target = project_name or "this project"
    if sub_intent == "thanks":
        return "You're welcome."
    elif sub_intent == "farewell":
        return "Goodbye! Whenever you need to investigate technical claims or documentation, I'll be here."
    elif sub_intent == "ack":
        return "Sure — what would you like to check next?"
    else:
        return f"Hey — what would you like to look into in {target}?"

def generate_product_help_response(project_info: Optional[Any] = None) -> str:
    """
    Returns helpful GroundGuard guidance explaining actual capabilities (Section 10).
    """
    target = "this project"
    if isinstance(project_info, str) and project_info.strip():
        target = project_info.strip()
    elif isinstance(project_info, dict):
        target = project_info.get("projectName") or "this project"

    return (
        "I can help you work with this project's uploaded evidence. You can ask "
        "questions, compare information across sources, inspect the evidence behind "
        "individual claims, and review claims EvideX AI verified, flagged, or recovered.\n\n"
        f"What would you like to check in {target}?"
    )

def generate_unsupported_query_response(query: str, doc_summary: Optional[Dict[str, Any]] = None) -> str:
    """
    Returns polite refusal indicating that GroundGuard is scoped to project evidence.
    """
    return (
        "I couldn't answer that from this project's sources.\n\n"
        "EvideX AI keeps project answers grounded in uploaded evidence."
    )
