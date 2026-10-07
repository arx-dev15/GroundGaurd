"""
GroundGuard Phase 1 MVP: Semantic Query Understanding & Retrieval Planning

This module provides bounded, deterministic query interpretation inside M2.
It is NOT an agent, has NO autonomous loops, uses NO separate NLP service.

Canonical architecture: M4 -> M3 -> M2 (this module is internal to M2 only).
M2 never calls M1.

QueryPlan is produced by a single low-temperature Gemini call.
On any failure, returns a safe fallback plan preserving the original query.
"""

import os
import re
import json
import time
import logging
import asyncio
from enum import Enum
from typing import Optional, List, Dict, Any, Literal, Tuple
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), ".env"), override=True)

logger = logging.getLogger("m2-query-understanding")

# ---------------------------------------------------------------------------
# QueryPlan -- strict bounded output schema
# ---------------------------------------------------------------------------

AllowedTask = Literal[
    "targeted",
    "overview",
    "thematic",
    "comparison",
    "follow_up",
    "multi_part",
    "transform",
    "social",
    "product_help",
]

AllowedRetrievalMode = Literal[
    "focused",
    "broad",
    "comparative",
]

AllowedSourceScope = Literal[
    "project",
    "single_document",
    "multiple_documents",
    "document_section",
    "previous_grounded_scope",
]

AllowedOperation = Literal[
    "lookup",
    "explain",
    "summarize",
    "outline",
    "extract",
    "compare",
    "locate",
    "transform",
    "procedure",
]

AllowedRetrievalStrategy = Literal[
    "focused",
    "coverage",
    "section",
    "procedural",
    "comparative",
    "cross_document",
]


class InformationNeed(str, Enum):
    IDENTITY = "IDENTITY"
    DEFINITION = "DEFINITION"
    FUNCTION = "FUNCTION"
    PURPOSE = "PURPOSE"
    CAUSE = "CAUSE"
    LOCATION = "LOCATION"
    TIME = "TIME"
    PERSON = "PERSON"
    RELATIONSHIP = "RELATIONSHIP"
    NUMERIC = "NUMERIC"
    STATE = "STATE"
    PROCEDURE = "PROCEDURE"
    SEQUENCE = "SEQUENCE"
    SUMMARY = "SUMMARY"
    COMPARISON = "COMPARISON"
    EXPLANATION = "EXPLANATION"


class FacetStatus(str, Enum):
    SUPPORTED = "SUPPORTED"
    PARTIAL = "PARTIAL"
    UNRESOLVED = "UNRESOLVED"
    CONTRADICTED = "CONTRADICTED"
    CONFLICTING = "CONFLICTING"


class AnswerFacet(BaseModel):
    facetId: str
    facetType: str = "general"
    description: str
    informationNeed: InformationNeed = InformationNeed.DEFINITION
    targetEntity: str = ""
    requiredKeywords: List[str] = Field(default_factory=list)
    searchQuery: str = ""
    retrievalCoverage: str = "NOT_FOUND"  # "FOUND" or "NOT_FOUND"
    status: FacetStatus = FacetStatus.UNRESOLVED
    evidenceChunkIds: List[str] = Field(default_factory=list)


class AnswerFacetSet(BaseModel):
    facets: List[AnswerFacet] = Field(default_factory=list)
    overallStatus: FacetStatus = FacetStatus.UNRESOLVED
    coverageScore: float = 0.0
    isComparison: bool = False
    isCompound: bool = False
    isMultiHop: bool = False
    bridgeEntities: List[str] = Field(default_factory=list)
    extractedBridgeEntity: Optional[str] = None
    multiHopResolved: Optional[bool] = None

    @property
    def facet_statuses(self) -> Dict[str, str]:
        res = {}
        for i, f in enumerate(self.facets):
            val = f.status.value if hasattr(f.status, "value") else str(f.status)
            res[f.facetId] = val
            res[f"facet_{i}"] = val
        return res

    @property
    def all_facets_supported(self) -> bool:
        return len(self.facets) > 0 and all(f.status == FacetStatus.SUPPORTED for f in self.facets)


class QueryPlan(BaseModel):
    task: AllowedTask = "targeted"
    standalone_query: str = ""
    retrieval_mode: AllowedRetrievalMode = "focused"
    search_queries: List[str] = Field(default_factory=list)
    comparison_targets: List[str] = Field(default_factory=list)
    needs_clarification: bool = False
    clarification_question: Optional[str] = None
    facets: Optional[AnswerFacetSet] = None

    # Four-dimensional general model (Section 13)
    source_scope: AllowedSourceScope = "project"
    target: str = ""
    operation: AllowedOperation = "lookup"
    retrieval_strategy: AllowedRetrievalStrategy = "focused"
    resolved_document_name: Optional[str] = None
    resolved_document_id: Optional[str] = None

    # Slot awareness & proposition hypothesis verification (Core Hardening)
    question_slot: str = "general"
    lexical_anchors: List[str] = Field(default_factory=list)
    is_proposition: bool = False
    proposition_subject: Optional[str] = None
    proposition_property: Optional[str] = None
    proposition_value: Optional[str] = None

    def model_post_init(self, __context) -> None:
        # Cap list fields at 4 elements
        if len(self.search_queries) > 4:
            self.search_queries = self.search_queries[:4]
        if len(self.comparison_targets) > 4:
            self.comparison_targets = self.comparison_targets[:4]
        # Align retrieval_mode and retrieval_strategy if one was specified
        if self.retrieval_strategy in ("coverage", "cross_document") and self.retrieval_mode == "focused":
            self.retrieval_mode = "broad"
        elif self.retrieval_strategy == "comparative" and self.retrieval_mode == "focused":
            self.retrieval_mode = "comparative"
        elif (self.operation == "compound" or (len(self.search_queries) > 1 and " and " in (self.standalone_query or "").lower())) and self.retrieval_mode == "focused":
            self.retrieval_mode = "broad"


# ---------------------------------------------------------------------------
# Lightweight NLP normalization (deterministic, no external library)
# ---------------------------------------------------------------------------

_ABBREV_PAIRS = [
    (re.compile(r'\bu\b', re.IGNORECASE), 'you'),
    (re.compile(r'\bur\b', re.IGNORECASE), 'your'),
    (re.compile(r'\bthis thing\b', re.IGNORECASE), 'this'),
    (re.compile(r'\brn\b', re.IGNORECASE), 'right now'),
    (re.compile(r'\bbtw\b', re.IGNORECASE), 'by the way'),
    (re.compile(r'\bidk\b', re.IGNORECASE), "I don't know"),
    (re.compile(r'\bwdym\b', re.IGNORECASE), 'what do you mean'),
]

_SOCIAL_PATTERNS = [
    re.compile(r'^\s*(?:hi|hey+|hello|hiya|howdy|greetings|good\s+(?:morning|afternoon|evening))\s*(?:there|bro|mate|dude)?\s*[!.,?]*\s*$', re.IGNORECASE),
    re.compile(r'^\s*(?:yo|sup|what\s*\'?s\s+up)\s*(?:bro|mate|dude)?\s*[!.,?]*\s*$', re.IGNORECASE),
    re.compile(r'^\s*(?:thanks|thx|ty|thank\s+you)\s*(?:bro|mate|dude)?\s*[!.,?]*\s*$', re.IGNORECASE),
    re.compile(r'^\s*(?:ok|okay|cool|great|nice|alright|got\s+it|sure|fine)\s*(?:bro|mate|dude)?\s*[!.,?]*\s*$', re.IGNORECASE),
    re.compile(r'^\s*(?:bye|goodbye|see\s+ya|cya|farewell)\s*(?:bro|mate|dude)?\s*[!.,?]*\s*$', re.IGNORECASE),
]

_HELP_PATTERNS = [
    re.compile(r'^\s*help\s*(?:me)?\s*[!.,?]*\s*$', re.IGNORECASE),
    re.compile(
        r'\b(?:what\s+(?:all\s+)?can\s+(?:you|u|i|this|evidex|evidex\s+ai|groundguard)\s+(?:do|ask|ask\s+(?:you|u)|help(?:\s+me)?(?:\s+with)?|assist(?:\s+with)?)'
        r'|what\s+(?:all\s+)?can\s+i\s+(?:do|ask)'
        r'|how\s+(?:do\s+i\s+use|does\s+(?:this|evidex|evidex\s+ai|groundguard)\s+work|can\s+(?:you|u)\s+help(?:\s+me)?)'
        r'|what\s+(?:is|are)\s+(?:your|its|this\s+app\'?s?|evidex\s*\'?s?|groundguard\s*\'?s?)\s+capabilities'
        r'|what\s+are\s+you\s+capable\s+of'
        r'|explain\s+(?:evidex|evidex\s+ai|groundguard))\b',
        re.IGNORECASE
    ),
]


def _normalize_for_plan(query: str) -> str:
    """Light normalization preserving technical identifiers, units, numbers."""
    q = (query or "").strip()
    for pat, repl in _ABBREV_PAIRS:
        q = pat.sub(repl, q)
    return q.strip()


def _is_social(query: str) -> bool:
    clean = _normalize_for_plan(query)
    return any(p.match(clean) for p in _SOCIAL_PATTERNS)


def _is_product_help(query: str) -> bool:
    clean = _normalize_for_plan(query)
    return any(p.search(clean) for p in _HELP_PATTERNS)


# ---------------------------------------------------------------------------
# Planner prompt
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Planner prompt
# ---------------------------------------------------------------------------

_PLANNER_SYSTEM = (
    "You are EvideX AI's internal query understanding engine.\n\n"
    "YOU ARE NOT ANSWERING THE USER.\n"
    "YOU ARE INTERPRETING WHAT INFORMATION THEY NEED FROM PROJECT DOCUMENTS.\n"
    "DO NOT PRODUCE FACTUAL PROJECT CLAIMS.\n"
    "RETURN RETRIEVAL PLANNING METADATA ONLY.\n\n"
    "Your job: given a user query, optional conversation context, and available ready documents, output a JSON QueryPlan.\n\n"
    "FOUR GENERAL DIMENSIONS:\n"
    "1. source_scope (choose one):\n"
    "   - single_document: Asking about one document ('this document', 'the uploaded file', 'the PDF', or specifically named file, or follow-up within it).\n"
    "   - document_section: Asking about a specific section, heading, or topic within a document ('what does troubleshooting explain there?', 'what does methodology say?').\n"
    "   - multiple_documents: Comparing or referencing multiple documents across the project.\n"
    "   - previous_grounded_scope: Continuation within the immediately preceding grounded document or topic.\n"
    "   - project: General project-wide inquiry or entity definition question.\n\n"
    "2. target: The free-text semantic subject, entity, or section heading (e.g. system name, sensor name, section title, procedure name).\n\n"
    "3. operation (choose one):\n"
    "   - outline: Requesting a structured outline/list of contents/topics/sections ('what does it contain', 'what are its contents', 'list sections').\n"
    "   - summarize: Requesting a narrative summary/overview synthesis of the source ('summarize this document').\n"
    "   - explain: Explaining an entity, concept, or code implementation ('what is X?', 'what does the code do?').\n"
    "   - procedure: Step-by-step instructions or operational sequence ('how do I set it up?', 'what are the steps?', 'what do I do after that?').\n"
    "   - extract: Extracting a concise list of items or technical values ('what libraries are required?', 'what sensors are used?').\n"
    "   - locate: Stating where information appears ('where does it mention X?', 'which page?').\n"
    "   - compare: Comparing two or more entities or documents.\n"
    "   - lookup: Direct fact, pin, voltage, baud, temperature range, unit, or number.\n"
    "   - transform: Rewrite/simplify/reformat a prior assistant answer.\n\n"
    "4. retrieval_strategy (choose one):\n"
    "   - coverage: For document overview, contents outline, or document summary.\n"
    "   - section: For queries targeting a specific section, heading, or topic.\n"
    "   - procedural: For instructions, steps, and sequence questions.\n"
    "   - comparative: For comparing entities or documents.\n"
    "   - cross_document: For queries spanning multiple documents.\n"
    "   - focused: For direct entity/fact lookups.\n\n"
    "DOCUMENT REFERENT RESOLUTION:\n"
    "- When user says 'the document', 'this file', 'the uploaded PDF', 'its contents':\n"
    "  * If exactly 1 ready document is listed: resolve to that document (set resolved_document_name).\n"
    "  * If multiple ready documents exist and query does not specify which one and context does not identify one: set needs_clarification=true and clarification_question='Which document are you referring to? (Available: ...)'. Do not guess.\n"
    "  * If query names a specific document from READY DOCUMENTS, resolve to that document.\n\n"
    "SECTION HEADING, TECHNICAL PARAMETERS & LITERAL PRESERVATION:\n"
    "- For section queries: preserve the literal section heading name in target and search_queries (e.g. ['troubleshooting']). Do NOT invent filler synonyms like 'error resolution common issues'.\n"
    "- For technical parameter and specification queries (e.g. voltage, pinout, baud rate, delay, interval, range): search_queries must include concrete technical literals, units, and electrical/code anchors (e.g. for voltage include ['voltage VIN 5V VCC power']; for read timing include ['delay interval reading seconds milliseconds']).\n"
    "- For transform tasks ('explain simply', 'in bullets'): search_queries must contain ONLY factual subject keywords. NEVER include meta-words like 'simpler', 'simply', 'shorter'.\n\n"
    "REFERENT RESOLUTION & SPECIFICITY:\n"
    "- When user queries use pronouns or demonstratives ('it', 'those', 'they', 'these', 'that'), resolve them to the specific sub-topic, entity, or set referenced in the immediately preceding turn.\n"
    "- Do NOT drift to the generic parent project if a specific sub-topic was asked (e.g. if previous turn discussed 'technologies', 'Why are those useful?' means 'Why are those technologies useful?', NOT generic project benefits).\n"
    "- If resolving 'it' following a question about a system (e.g. 'System X'), 'What technologies does it use?' must resolve to 'What technologies does System X use?'.\n\n"
    "CRITICAL FOR TRANSFORM TASKS ('explain simply', 'in bullets', 'make it shorter'):\n"
    "- search_queries MUST contain ONLY factual subject keywords (e.g. ['System X technologies IoT sensors machine learning usefulness']).\n"
    "- NEVER include transform or meta-instruction words like 'simpler', 'simply', 'in simpler terms', 'shorter', 'bullets' in search_queries, as document chunks do not contain these meta-words.\n\n"
    "LEGACY TASK & RETRIEVAL_MODE MAPPING:\n"
    "- task: 'targeted' | 'overview' | 'thematic' | 'comparison' | 'follow_up' | 'multi_part' | 'transform' | 'social' | 'product_help'\n"
    "- retrieval_mode: 'focused' | 'broad' | 'comparative'\n\n"
    "STANDALONE QUERY:\n"
    "- Resolve anaphora and context into an explicit self-contained information need.\n"
    "- For transform tasks, preserve BOTH the requested operation AND the resolved subject.\n"
    "- If no anaphora, standalone_query = original query.\n\n"
    'OUTPUT FORMAT (strict JSON, no extra text):\n'
    '{\n'
    '  "task": "...",\n'
    '  "standalone_query": "...",\n'
    '  "retrieval_mode": "focused | broad | comparative",\n'
    '  "search_queries": ["...", "..."],\n'
    '  "comparison_targets": [],\n'
    '  "needs_clarification": false,\n'
    '  "clarification_question": null,\n'
    '  "source_scope": "project | single_document | multiple_documents | document_section | previous_grounded_scope",\n'
    '  "target": "...",\n'
    '  "operation": "lookup | explain | summarize | outline | extract | compare | locate | transform | procedure",\n'
    '  "retrieval_strategy": "focused | coverage | section | procedural | comparative | cross_document",\n'
    '  "resolved_document_name": null\n'
    '}'
)


def _build_planner_prompt(
    query: str,
    conversation_context: Optional[List[Dict[str, Any]]],
    project_name: Optional[str],
    ready_doc_titles: Optional[List[str]],
) -> str:
    parts = []

    if project_name:
        parts.append("PROJECT NAME: " + project_name)

    if ready_doc_titles:
        titles_str = ", ".join(ready_doc_titles[:8])
        parts.append(f"READY DOCUMENTS ({len(ready_doc_titles)} ready): " + titles_str)

    if conversation_context:
        valid_turns = []
        for turn in conversation_context[-6:]:
            cnt = (turn.get("content", "") or "").strip().lower()
            if len(cnt) < 30 and re.search(r'^(?:(?:please\s+)?(?:answer|respond|reply|tell\s+me)|hello\??|hey\??|hi\??|come\s+on\??|bro+|dude|waiting\.*)\b', cnt):
                continue
            if re.search(r'^(?:answer\s+bro+|hello\?+|respond|come\s+on|pls\s+answer|plz\s+answer|just\s+answer)$', cnt):
                continue
            valid_turns.append(turn)
        if valid_turns:
            ctx_lines = []
            for turn in valid_turns:
                role = turn.get("role", "user").upper()
                content = (turn.get("content", "") or "")[:400]
                ctx_lines.append(role + ": " + content)
            parts.append("RECENT CONVERSATION:\n" + "\n".join(ctx_lines))

    parts.append("USER QUERY: " + query)
    parts.append("Return a QueryPlan JSON object:")

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Generic High-Information Lexical Anchor & Slot Extraction (Core Hardening)
# ---------------------------------------------------------------------------

_STOPWORDS_SET = {
    "what", "which", "where", "when", "who", "whom", "whose", "why", "how",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "can", "could", "shall", "should", "will", "would",
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "with",
    "about", "against", "between", "into", "through", "during", "before", "after",
    "above", "below", "to", "from", "up", "down", "in", "out", "on", "off",
    "it", "at", "by", "of", "no", "so", "my", "he", "we", "us", "as", "am",
    "tell", "me", "give", "show", "explain", "detail", "details", "difference",
    "please", "kindly", "exactly", "find", "information", "according", "document",
    "file", "paper", "manual", "section", "mention", "state", "say"
}

def extract_lexical_anchors(query: str) -> List[str]:
    """
    Extracts high-information lexical anchors generically without fixture dictionaries:
    - Quoted terms and backticked code tokens
    - Technical tags, codes, and hyphenated identifiers (e.g. P-101A, KC-450, AES-256)
    - Technical acronyms and alphanumeric codes (e.g. INT4, FP16, FIDO2, ZTNA, SRAM)
    - Capitalized entity phrases (e.g. proper nouns, names)
    - Numbers with technical units or significant numbers/dates (e.g. 45.0 kg, 16.5 bar, 1881, 221B, 8443)
    """
    if not query:
        return []
    anchors: List[str] = []

    # 1. Quoted terms and backticked code tokens
    for m in re.finditer(r'[`"\']([^`"\']{2,50})[`"\']', query):
        q_term = m.group(1).strip()
        if q_term and q_term.lower() not in _STOPWORDS_SET:
            anchors.append(q_term)

    # 2. Technical tags, model numbers, hyphenated/dotted codes
    for m in re.finditer(r'\b[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)+\b', query):
        tag = m.group(0).strip()
        if tag.lower() not in _STOPWORDS_SET:
            anchors.append(tag)

    # 2b. Technical acronyms and alphanumeric codes (e.g. INT4, FP16, FIDO2, ZTNA, SRAM)
    for m in re.finditer(r'\b[A-Za-z]{2,5}\d*\b', query):
        token = m.group(0).strip()
        lower_t = token.lower()
        if lower_t not in _STOPWORDS_SET and (token.isupper() or len(token) <= 4 or bool(re.search(r'\d', token))):
            if lower_t not in {w.lower() for w in anchors}:
                anchors.append(token)

    # 3. Capitalized multi-word or single-word entities (skip initial sentence word)
    tokens = query.split()
    if len(tokens) > 1:
        rest_of_query = " ".join(tokens[1:])
        for m in re.finditer(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', rest_of_query):
            ent = m.group(0).strip()
            if ent.lower() not in _STOPWORDS_SET and len(ent) >= 3:
                anchors.append(ent)

    # 4. Numbers with units or significant numbers (e.g. 45.0 kg, 16.5 bar, 1881, 221B, 8443)
    for m in re.finditer(r'\b\d+(?:\.\d+)?\s*(?:kg|bar|kpa|mpa|v|volts?|hz|mhz|ghz|m3/h|°c|c|f|sec|ms|s|gb|mb|kb|ports?)\b', query, re.I):
        anchors.append(m.group(0).strip())
    for m in re.finditer(r'\b\d{3,5}\b', query):
        anchors.append(m.group(0).strip())
    for m in re.finditer(r'\b\d+[A-Za-z]\b', query):
        anchors.append(m.group(0).strip())

    seen = set()
    deduped: List[str] = []
    for a in anchors:
        clean_a = a.strip()
        lower_a = clean_a.lower()
        if lower_a not in seen and len(clean_a) >= 2:
            seen.add(lower_a)
            deduped.append(clean_a)
    return deduped


def detect_question_slot(query: str) -> Tuple[str, List[str]]:
    """
    Identifies the requested information slot and expected evidence markers:
    WHO, WHAT, WHERE, WHEN, WHY, HOW, RELATIONSHIP, NUMERIC ATTRIBUTE
    """
    q_lower = (query or "").lower()
    if re.search(r'\b(?:where|where\'s|address|located|reside|residence|live|room|street|building|headquarters|location|site)\b', q_lower):
        return "location", ["street", "address", "road", "lane", "place", "building", "located", "room", "reside", "live", "site"]
    if re.search(r'\b(?:when|what\s+year|what\s+date|what\s+time|how\s+long|timeline|duration)\b', q_lower):
        return "temporal", ["year", "date", "month", "time", "during", "century", "day"]
    if re.search(r'\b(?:who|whom|whose|author|creator|inventor|lead|founder|lead\s+investigator)\b', q_lower):
        return "entity", ["name", "person", "by", "author", "creator", "dr", "mr", "mrs"]
    if re.search(r'\b(?:why|what\s+causes?|what\s+caused|root\s+cause|reason\s+for|how\s+come)\b', q_lower):
        return "causal", ["because", "due to", "caused by", "root cause", "as a result", "trigger", "reason"]
    if re.search(r'\b(?:how\s+do\s+i|how\s+to|what\s+are\s+the\s+steps|procedure|what\s+happens\s+after|sequence)\b', q_lower):
        return "procedural", ["step", "first", "then", "after", "next", "procedure", "verify", "ensure"]
    if re.search(r'\b(?:what\s+value|how\s+many|how\s+much|what\s+is\s+the\s+amount|what\s+voltage|pressure|temperature|port|rate|interval|threshold|range|capacity|pre-charge)\b', q_lower):
        return "numeric", ["bar", "kg", "volts", "v", "hz", "ms", "port", "range", "rate", "value", "pre-charge"]
    if re.search(r'\b(?:how\s+did|how\s+is\s+.*related|relationship|how\s+do\s+.*interact|connection\s+between|how\s+did\s+.*meet|how\s+were\s+.*introduced)\b', q_lower):
        return "relational", ["relation", "meet", "met", "introduced", "connection", "interact", "together"]
    return "general", []


def detect_proposition(query: str) -> Tuple[bool, Optional[str], Optional[str], Optional[str]]:
    """
    Detects queries asserting a factual proposition/hypothesis to verify.
    Returns: (is_proposition, subject, property_concept, asserted_value)
    """
    q_clean = (query or "").strip().rstrip("?.!")

    # Pattern 1: Did X [verb/property] Y? e.g. "Did Watson meet Holmes in 1895?"
    m1 = re.search(r'^(?:did|was|were|is|are|does|do|didn\'t|wasn\'t|isn\'t)\s+([a-zA-Z0-9_\s-]+?)\s+(meet|live|located|use|require|have|set\s+to|introduced\s+by|born\s+in)\s+(?:at\s+|in\s+|to\s+|with\s+|by\s+)?([a-zA-Z0-9_\s.-]+)$', q_clean, re.I)
    if m1:
        subj = m1.group(1).strip()
        prop = m1.group(2).strip()
        val = m1.group(3).strip()
        return True, subj, prop, val

    # Pattern 2: "Is X located at Y?" or "Does X use Y?"
    m2 = re.search(r'\b(?:does|is|did)\s+([a-zA-Z0-9_\s-]+?)\s+(use|have|run\s+on|feature|specify|require)\s+([a-zA-Z0-9_\s.-]+)', q_clean, re.I)
    if m2:
        subj = m2.group(1).strip()
        prop = m2.group(2).strip()
        val = m2.group(3).strip()
        return True, subj, prop, val

    return False, None, None, None


# ---------------------------------------------------------------------------
# User Challenge / Correction Detection (Pass 2)
# ---------------------------------------------------------------------------

def detect_user_challenge(
    query: str,
    conversation_context: Optional[List[Dict[str, Any]]] = None
) -> Tuple[bool, Optional[str]]:
    """
    Detects user challenge / correction turns:
    'look again', 'check again', 'you missed it', 'are you sure?', "that's in the document",
    'look carefully', 'i think the document contains more detail', 'read again', 'check the source'.
    Recovers the prior substantive factual query that was challenged.
    """
    if not query:
        return False, None

    q_clean = query.strip().lower().rstrip(".!?")

    challenge_patterns = [
        r'\b(?:no\s+there\s+is|look\s+carefully|look\s+again|check\s+again|check\s+carefully|check\s+the\s+source|check\s+the\s+document)\b',
        r'\b(?:you\s+missed\s+it|it\s+is\s+in\s+the\s+document|that\s+is\s+in\s+the\s+source|it\s+does\s+say|it\s+does\s+state|are\s+you\s+sure)\b',
        r'\b(?:read\s+again|re-?examine|re-?read|it\s+is\s+there|no\s+it\s+is\s+there|i\s+think\s+the\s+document\s+contains)\b',
        r'\b(?:contains?\s+more\s+detail|more\s+information\s+in\s+the\s+document|search\s+again)\b',
    ]

    is_challenge = any(bool(re.search(pat, q_clean, re.I)) for pat in challenge_patterns)
    if not is_challenge:
        return False, None

    if not conversation_context:
        return True, None

    # Search backwards for the most recent substantive user turn before this one
    target_q = None
    for turn in reversed(conversation_context):
        role = turn.get("role", "").lower()
        content = turn.get("content", "").strip()
        if role == "user" and content:
            # Must not be another challenge pattern and not a short meta phrase
            if not any(bool(re.search(pat, content.lower(), re.I)) for pat in challenge_patterns) and len(content) >= 4:
                target_q = content
                break

    return True, target_q


# ---------------------------------------------------------------------------
# Answer Facet Extraction (Bounded Completeness, Comparison & Multi-Hop)
# ---------------------------------------------------------------------------

def extract_answer_facets(
    query: str,
    plan: Optional[QueryPlan] = None
) -> AnswerFacetSet:
    """
    Extracts independently verifiable answer facets from the user query.
    Decomposes compound questions and comparisons into discrete required facets.
    """
    clean_q = (query or "").strip().rstrip("?.!")

    # 1. COMPARISON: "How did A differ from B?", "Compare A and B", "difference between A and B", "A vs B"
    m_comp = re.search(
        r'\b(?:how\s+(?:did|does|do)\s+([a-zA-Z0-9_\s.\'-]+?)\s+(?:differ\s+from|compare\s+(?:to|with)?)\s+([a-zA-Z0-9_\s.\'-]+))\b',
        clean_q,
        re.IGNORECASE
    )
    if not m_comp:
        m_comp = re.search(
            r'\b(?:compare\s+([a-zA-Z0-9_\s.\'-]+?)\s+(?:and|with|to)\s+([a-zA-Z0-9_\s.\'-]+))\b',
            clean_q,
            re.IGNORECASE
        )
    if not m_comp:
        m_comp = re.search(
            r'\b(?:difference\s+between\s+([a-zA-Z0-9_\s.\'-]+?)\s+and\s+([a-zA-Z0-9_\s.\'-]+))\b',
            clean_q,
            re.IGNORECASE
        )
    if not m_comp:
        m_comp = re.search(
            r'\b(?:what\s+separates\s+([a-zA-Z0-9_\s.\'-]+?)\s+from\s+([a-zA-Z0-9_\s.\'-]+))\b',
            clean_q,
            re.IGNORECASE
        )
    if not m_comp:
        m_comp = re.search(
            r'\b(?:where\s+do\s+([a-zA-Z0-9_\s.\'-]+?)\s+and\s+([a-zA-Z0-9_\s.\'-]+?)\s+disagree)\b',
            clean_q,
            re.IGNORECASE
        )
    if not m_comp:
        m_comp = re.search(
            r'\b([a-zA-Z0-9_\s.\'-]+?)\s+(?:vs\.?|versus)\s+([a-zA-Z0-9_\s.\'-]+)\b',
            clean_q,
            re.IGNORECASE
        )

    if m_comp:
        target_a = m_comp.group(1).strip()
        target_b = m_comp.group(2).strip()
        kw_a = [w.lower() for w in re.findall(r'\b[A-Za-z0-9_-]+\b', target_a) if (w.lower() not in _STOPWORDS_SET or (w.isupper() and len(w) == 1)) and (len(w) >= 2 or w.isalnum())]
        kw_b = [w.lower() for w in re.findall(r'\b[A-Za-z0-9_-]+\b', target_b) if (w.lower() not in _STOPWORDS_SET or (w.isupper() and len(w) == 1)) and (len(w) >= 2 or w.isalnum())]
        facets = [
            AnswerFacet(
                facetId="facet_0",
                facetType="option_a",
                description=f"Evidence establishing {target_a}",
                informationNeed=InformationNeed.DEFINITION,
                targetEntity=target_a,
                requiredKeywords=kw_a,
                searchQuery=f"{target_a}",
            ),
            AnswerFacet(
                facetId="facet_1",
                facetType="option_b",
                description=f"Evidence establishing {target_b}",
                informationNeed=InformationNeed.DEFINITION,
                targetEntity=target_b,
                requiredKeywords=kw_b,
                searchQuery=f"{target_b}",
            ),
        ]
        return AnswerFacetSet(
            facets=facets,
            isComparison=True,
            bridgeEntities=[target_a, target_b]
        )

    # 2. COMPOUND: Coordinating questions separated by 'and'
    m_compound = re.search(
        r'^(?:what|where|when|who|how|which|why)\b.*?\s+and\s+(?:what|where|when|who|how|which|why)\b.*$',
        clean_q,
        re.IGNORECASE
    )
    if not m_compound:
        m_compound = re.search(
            r'\b(?:what\s+(?:are|is|did)\s+(.+?)\s+and\s+(?:what|where|when|who|how|which|why|rated|operating|maximum|minimum|test|testing|evidence|verification)?\s*(.+))\b',
            clean_q,
            re.IGNORECASE
        )

    if m_compound:
        parts = re.split(r'\s+and\s+', clean_q, maxsplit=1, flags=re.IGNORECASE)
        if len(parts) == 2:
            part1 = parts[0].strip()
            part2 = parts[1].strip()
            kw_part1 = [w.lower() for w in re.findall(r'\b[A-Za-z0-9_-]+\b', part1) if (w.lower() not in _STOPWORDS_SET or (w.isupper() and len(w) == 1)) and (len(w) >= 2 or w.isalnum())]
            kw_part2 = [w.lower() for w in re.findall(r'\b[A-Za-z0-9_-]+\b', part2) if (w.lower() not in _STOPWORDS_SET or (w.isupper() and len(w) == 1)) and (len(w) >= 2 or w.isalnum())]
            if kw_part1 and kw_part2:
                anchors = extract_lexical_anchors(clean_q)
                anchor_str = " ".join(anchors) if anchors else ""
                sq1 = f"{part1} {anchor_str}".strip() if anchor_str and not any(a.lower() in part1.lower() for a in anchors) else part1
                sq2 = f"{part2} {anchor_str}".strip() if anchor_str and not any(a.lower() in part2.lower() for a in anchors) else part2
                facets = [
                    AnswerFacet(
                        facetId="facet_0",
                        facetType="facet_a",
                        description=f"Evidence establishing {part1}",
                        informationNeed=InformationNeed.DEFINITION,
                        targetEntity=part1,
                        requiredKeywords=kw_part1,
                        searchQuery=sq1,
                    ),
                    AnswerFacet(
                        facetId="facet_1",
                        facetType="facet_b",
                        description=f"Evidence establishing {part2}",
                        informationNeed=InformationNeed.DEFINITION,
                        targetEntity=part2,
                        requiredKeywords=kw_part2,
                        searchQuery=sq2,
                    ),
                ]
                return AnswerFacetSet(
                    facets=facets,
                    isCompound=True,
                    bridgeEntities=[part1, part2]
                )

    # 3. MULTI-HOP / CONNECTION: "How are X and Y connected", "How is X connected to Y", "What connects A to B", "connection between A and B"
    m_connect = re.search(
        r'\b(?:how\s+(?:are|is)\s+(?:the\s+events\s+involving\s+)?([a-zA-Z0-9_\s.\'-]+?)\s+(?:connected\s+to|related\s+to|linked\s+to)\s+([a-zA-Z0-9_\s.\'-]+))\b',
        clean_q,
        re.IGNORECASE
    )
    if not m_connect:
        m_connect = re.search(
            r'\b(?:what\s+(?:is\s+the\s+connection\s+between|connects)\s+([a-zA-Z0-9_\s.\'-]+?)\s+and\s+([a-zA-Z0-9_\s.\'-]+))\b',
            clean_q,
            re.IGNORECASE
        )
    if not m_connect:
        m_connect = re.search(
            r'\b(?:how\s+are\s+([a-zA-Z0-9_\s.\'-]+?)\s+and\s+([a-zA-Z0-9_\s.\'-]+?)\s+(?:connected|related|linked))\b',
            clean_q,
            re.IGNORECASE
        )
    if not m_connect:
        m_connect = re.search(
            r'\b(?:what\s+is\s+the\s+relationship\s+between\s+([a-zA-Z0-9_\s.\'-]+?)\s+and\s+([a-zA-Z0-9_\s.\'-]+))\b',
            clean_q,
            re.IGNORECASE
        )

    if m_connect:
        ep1 = m_connect.group(1).strip()
        ep2 = m_connect.group(2).strip()
        kw_ep1 = [w.lower() for w in re.findall(r'\b[A-Za-z0-9_-]+\b', ep1) if (w.lower() not in _STOPWORDS_SET or (w.isupper() and len(w) == 1)) and (len(w) >= 2 or w.isalnum())]
        kw_ep2 = [w.lower() for w in re.findall(r'\b[A-Za-z0-9_-]+\b', ep2) if (w.lower() not in _STOPWORDS_SET or (w.isupper() and len(w) == 1)) and (len(w) >= 2 or w.isalnum())]
        facets = [
            AnswerFacet(
                facetId="facet_0",
                facetType="endpoint_a",
                description=f"Evidence establishing {ep1}",
                informationNeed=InformationNeed.DEFINITION,
                targetEntity=ep1,
                requiredKeywords=kw_ep1,
                searchQuery=ep1,
            ),
            AnswerFacet(
                facetId="facet_1",
                facetType="endpoint_b",
                description=f"Evidence establishing {ep2}",
                informationNeed=InformationNeed.DEFINITION,
                targetEntity=ep2,
                requiredKeywords=kw_ep2,
                searchQuery=ep2,
            ),
        ]
        return AnswerFacetSet(
            facets=facets,
            isMultiHop=True,
            bridgeEntities=[ep1, ep2]
        )

    # 4. DIRECT / SINGLE FACET
    kw_direct = [w.lower() for w in re.findall(r'\b[A-Za-z0-9_-]+\b', clean_q) if (w.lower() not in _STOPWORDS_SET or (w.isupper() and len(w) == 1)) and (len(w) >= 2 or w.isalnum())]
    facet = AnswerFacet(
        facetId="facet_direct",
        description=f"Requested information: {clean_q}",
        informationNeed=InformationNeed.DEFINITION,
        targetEntity=clean_q,
        requiredKeywords=kw_direct,
        searchQuery=clean_q,
    )
    return AnswerFacetSet(
        facets=[facet],
        isCompound=False,
        isComparison=False,
        bridgeEntities=[]
    )


# ---------------------------------------------------------------------------
# Planner fallback -- always safe
# ---------------------------------------------------------------------------

def _make_fallback_plan(query: str) -> QueryPlan:
    """Safe fallback used when planner fails. Preserves current stable retrieval."""
    clean = (query or "").strip()
    anchors = extract_lexical_anchors(clean)
    slot, _ = detect_question_slot(clean)
    is_prop, p_subj, p_prop, p_val = detect_proposition(clean)
    facets = extract_answer_facets(clean)

    search_qs = [clean] if clean else []
    if is_prop:
        # Build unpoisoned property query (Sections 14 & 15)
        # Strips asserted value from the query to prevent search poisoning while preserving subject and property words
        clean_prop_q = clean
        if p_val:
            clean_prop_q = re.sub(re.escape(p_val), '', clean_prop_q, flags=re.I).strip()
        clean_prop_q = re.sub(r'^(?:does|is|did|was|were|are|can|should|could|would)\s+', '', clean_prop_q, flags=re.I).strip()
        clean_prop_q = clean_prop_q.rstrip("?.!")
        if clean_prop_q and clean_prop_q not in search_qs:
            search_qs.insert(0, clean_prop_q)
    elif anchors and " ".join(anchors) not in search_qs:
        search_qs.append(" ".join(anchors))

    ret_mode = "focused"
    ret_strat = "focused"
    task = "targeted"
    if facets.isComparison:
        task = "comparison"
        ret_mode = "comparative"
        ret_strat = "comparative"
        for f in facets.facets:
            if f.searchQuery and f.searchQuery not in search_qs:
                search_qs.append(f.searchQuery)
    elif facets.isCompound:
        task = "multi_part"
        ret_mode = "broad"
        for f in facets.facets:
            if f.searchQuery and f.searchQuery not in search_qs:
                search_qs.append(f.searchQuery)
    elif facets.isMultiHop:
        task = "multi_hop"
        ret_mode = "focused"
        ret_strat = "focused"
        if facets.facets and facets.facets[0].searchQuery and facets.facets[0].searchQuery not in search_qs:
            search_qs.append(facets.facets[0].searchQuery)

    return QueryPlan(
        task=task,
        standalone_query=clean,
        retrieval_mode=ret_mode,
        search_queries=search_qs,
        comparison_targets=facets.bridgeEntities if facets.isComparison else [],
        needs_clarification=False,
        clarification_question=None,
        facets=facets,
        source_scope="project",
        target=clean,
        operation="compare" if facets.isComparison else "lookup",
        retrieval_strategy=ret_strat,
        question_slot=slot,
        lexical_anchors=anchors,
        is_proposition=is_prop,
        proposition_subject=p_subj,
        proposition_property=p_prop,
        proposition_value=p_val,
    )


# ---------------------------------------------------------------------------
# Deterministic fast-path overrides (no Gemini needed)
# ---------------------------------------------------------------------------

def _try_deterministic_plan(query: str) -> Optional[QueryPlan]:
    """
    Cheap deterministic classification for obvious cases.
    Returns QueryPlan if classified, None if Gemini planner should be used.
    """
    if _is_social(query):
        return QueryPlan(
            task="social",
            standalone_query=_normalize_for_plan(query),
            retrieval_mode="focused",
            search_queries=[],
            source_scope="project",
            operation="lookup",
            retrieval_strategy="focused",
        )

    if _is_product_help(query):
        return QueryPlan(
            task="product_help",
            standalone_query=_normalize_for_plan(query),
            retrieval_mode="focused",
            search_queries=[],
            source_scope="project",
            operation="explain",
            retrieval_strategy="focused",
        )

    return None


# ---------------------------------------------------------------------------
# Gemini planner (one call, low temperature, structured JSON)
# ---------------------------------------------------------------------------

async def _call_planner_gemini(
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout: float = 8.0,
) -> Optional[str]:
    """
    Single low-temperature Gemini call for query planning.
    Returns raw JSON string or None on failure.
    """
    import requests as req_lib

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        + model
        + ":generateContent"
    )
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 512,
            "responseMimeType": "application/json",
        },
    }

    def _sync():
        for attempt in range(2):
            try:
                res = req_lib.post(url, headers=headers, json=payload, timeout=timeout)
                if res.status_code == 429 and attempt == 0:
                    time.sleep(3.0)
                    continue
                if res.status_code != 200:
                    logger.warning(
                        "[planner] Gemini HTTP %s: %s", res.status_code, res.text[:200]
                    )
                    return None
                data = res.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as exc:
                if attempt == 0:
                    time.sleep(1.0)
                    continue
                logger.warning("[planner] Gemini call failed: %s", exc)
                return None
        return None

    return await asyncio.to_thread(_sync)


# ---------------------------------------------------------------------------
# Source-agnostic pattern helpers
# ---------------------------------------------------------------------------

_DOC_REFERENT_PATTERNS = [
    re.compile(r'\b(?:this|the|that|uploaded)\s+(?:document|pdf|file|notes|doc|guide|manual|paper|specification|spec)\b', re.IGNORECASE),
    re.compile(r'\b(?:its|the)\s+contents\b', re.IGNORECASE),
    re.compile(r'\bwhat(?:\'?s|\s+is)\s+in\s+it\b', re.IGNORECASE),
    re.compile(r'\bwhat\s+does\s+(?:it|this|the|that)\s+(?:document|file|pdf|doc)?\s*contain\b', re.IGNORECASE),
    re.compile(r'\bsummarize\s+(?:it|this|the\s+document|the\s+file|this\s+file|this\s+document)\b', re.IGNORECASE),
]

_PROCEDURE_PATTERNS = [
    re.compile(r'\b(?:what\s+(?:do\s+i|should\s+i|to)\s+do\s+after|what\s+happens\s+(?:after|next)|what\s+comes\s+(?:after|before)|what\s+are\s+the\s+steps|how\s+do\s+i\s+set\s+(?:it\s+)?up|how\s+to\s+install|setup\s+steps|procedure)\b', re.IGNORECASE),
]

_SECTION_PATTERNS = [
    re.compile(r'\b(?:what\s+does|what\s+is\s+in)\s+([a-zA-Z0-9_\s-]{3,30}?)\s+(?:section|explain\s+there|say\s+there|discuss\s+there|explain|say)\b', re.IGNORECASE),
    re.compile(r'\b(?:summarize|explain)\s+(?:the\s+)?([a-zA-Z0-9_\s-]{3,30}?)\s+section\b', re.IGNORECASE),
]

_EXTRACT_PATTERNS = [
    re.compile(r'\bwhat\s+(?:libraries|lib|components|sensors|pins|parameters|tools)\s+(?:does\s+it\s+need|are\s+needed|are\s+required|are\s+used|do\s+i\s+need)\b', re.IGNORECASE),
    re.compile(r'\bwhich\s+(?:lib|library|libraries|sensor|pin)\b', re.IGNORECASE),
]

_LOCATE_PATTERNS = [
    re.compile(r'\b(?:where\s+does\s+(?:it|the\s+document)\s+(?:mention|explain|discuss|show)|which\s+page\s+discusses|where\s+is\s+this\s+explained)\b', re.IGNORECASE),
]


def _find_prior_document(
    conversation_context: Optional[List[Dict[str, Any]]],
    ready_docs: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Inspects recent turns for mention of a known ready document."""
    if not conversation_context:
        return None
    for turn in reversed(conversation_context):
        content = (turn.get("content") or "").lower()
        for doc in ready_docs:
            fn = doc.get("filename", "").lower()
            base = os.path.splitext(fn)[0].lower()
            if fn and fn in content:
                return doc
            if len(base) >= 5 and base in content:
                return doc
    return None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def strip_document_filename_references(text: str, doc_filenames: Optional[List[str]] = None) -> str:
    """
    Strips document file references (e.g. 'in Manual.pdf', 'of Notes.txt') from search queries.
    Prevents file names from polluting BM25 keyword tokens and cross-encoder reranking.
    """
    if not text:
        return ""
    clean = text
    if doc_filenames:
        for fn in doc_filenames:
            if fn and fn.lower() in clean.lower():
                clean = re.sub(rf'\b(?:in|from|frm|within|of|for|about)\s+(?:the\s+)?{re.escape(fn)}\b', '', clean, flags=re.I)
                clean = re.sub(rf'\b{re.escape(fn)}\b', '', clean, flags=re.I)
    # Strip filename with preceding preposition (non-greedy, e.g. 'from the DHT11 Notes for Students.pdf')
    clean = re.sub(r'\b(?:in|from|frm|within|of|for|about)\s+(?:the\s+)?[A-Za-z0-9_\-.][A-Za-z0-9_\-.\s]{0,50}?\.(?:pdf|txt|md)\b', '', clean, flags=re.I)
    # Strip standalone filename without spaces (e.g. 'KC450_Chiller_Manual.pdf')
    clean = re.sub(r'\b[A-Za-z0-9_\-.]+\.(?:pdf|txt|md)\b', '', clean, flags=re.I)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean if len(clean) >= 2 else text


async def understand_query(
    query: str,
    conversation_context: Optional[List[Dict[str, Any]]] = None,
    project_context: Optional[Dict[str, Any]] = None,
) -> QueryPlan:
    """
    Interprets what information the user needs and produces a QueryPlan.
    """
    raw_query = (query or "").strip()
    if not raw_query:
        return _make_fallback_plan(raw_query)

    # 1. Fast path: social / product_help (no Gemini needed)
    fast = _try_deterministic_plan(raw_query)
    if fast is not None:
        logger.info("[planner] Fast path: task=%s query='%s'", fast.task, raw_query[:60])
        return fast

    # 2. Extract ready documents information
    project_name = None
    ready_docs: List[Dict[str, Any]] = []
    ready_doc_titles: List[str] = []

    if project_context and isinstance(project_context, dict):
        project_name = project_context.get("projectName")
        ready_docs = project_context.get("readyDocs") or []
        if not ready_docs:
            raw_titles = (
                project_context.get("readyDocTitles")
                or project_context.get("filenames")
                or []
            )
            ready_docs = [{"id": None, "filename": str(t)} for t in raw_titles[:8]]
        ready_doc_titles = [d.get("filename", "") for d in ready_docs if d.get("filename")]

    # 3. Gemini planner path
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY", "")
    model = os.getenv("LLM_PLANNER_MODEL") or os.getenv("LLM_MODEL") or "gemini-3.6-flash"

    user_prompt = _build_planner_prompt(
        query=raw_query,
        conversation_context=conversation_context,
        project_name=project_name,
        ready_doc_titles=ready_doc_titles,
    )

    t0 = time.perf_counter()
    raw_json = None
    if api_key:
        try:
            raw_json = await _call_planner_gemini(
                api_key=api_key,
                model=model,
                system_prompt=_PLANNER_SYSTEM,
                user_prompt=user_prompt,
            )
        except Exception as planner_exc:
            logger.warning("[planner] Unexpected planner exception: %s, using fallback", planner_exc)
            raw_json = None
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    # Parse and validate with Pydantic
    plan = None
    if raw_json:
        try:
            data = json.loads(raw_json)
            plan = QueryPlan(**data)
        except Exception as exc:
            logger.warning("[planner] Plan parse/validation failed (%s), fallback for query='%s'", exc, raw_query[:60])
            plan = None

    if plan is None:
        plan = _make_fallback_plan(raw_query)

    # Clean standalone_query and search_queries: strip document file references
    if plan.standalone_query:
        plan.standalone_query = strip_document_filename_references(plan.standalone_query, ready_doc_titles)

    if plan.search_queries:
        cleaned_sqs = []
        for sq in plan.search_queries:
            csq = strip_document_filename_references(sq, ready_doc_titles)
            if csq and csq not in cleaned_sqs:
                cleaned_sqs.append(csq)
        if cleaned_sqs:
            plan.search_queries = cleaned_sqs

    # Clean standalone_query: strip trailing document file references (e.g. 'in document.pdf')
    if plan.standalone_query:
        clean_sa = re.sub(r'\s+(?:in|from|within)\s+(?:the\s+)?[A-Za-z0-9_\s-]+\.(?:pdf|txt|md)\s*$', '', plan.standalone_query, flags=re.I).strip()
        if clean_sa and len(clean_sa) >= 3:
            plan.standalone_query = clean_sa

    # Safety: ensure standalone_query is never empty
    if not plan.standalone_query:
        plan.standalone_query = raw_query

    # 4. Source Scope and Document Referent Resolution (Priority 1 - 5)
    # Check if query specifically names a document
    resolved_doc: Optional[Dict[str, Any]] = None
    for doc in ready_docs:
        fn = doc.get("filename", "")
        base = os.path.splitext(fn)[0].lower()
        if fn and fn.lower() in raw_query.lower():
            resolved_doc = doc
            break
        words = [w for w in re.findall(r'[a-zA-Z0-9]{4,}', base)]
        if words and any(w in raw_query.lower() for w in words):
            resolved_doc = doc
            break

    # If planner explicitly provided a matching document name
    if not resolved_doc and plan.resolved_document_name:
        for doc in ready_docs:
            if doc.get("filename", "").lower() == plan.resolved_document_name.lower():
                resolved_doc = doc
                break

    # Check for document referents ("the document", "this PDF", "its contents", "what does it contain")
    has_doc_ref = any(p.search(raw_query) for p in _DOC_REFERENT_PATTERNS)
    if not resolved_doc and has_doc_ref:
        if len(ready_docs) == 1:
            resolved_doc = ready_docs[0]
            plan.source_scope = "single_document"
        elif len(ready_docs) > 1:
            prior_doc = _find_prior_document(conversation_context, ready_docs)
            if prior_doc:
                resolved_doc = prior_doc
                plan.source_scope = "previous_grounded_scope"
            else:
                # Ambiguous multiple documents -> ask clarification (Section 15, 57)
                plan.needs_clarification = True
                doc_list = ", ".join(d.get("filename", "") for d in ready_docs[:4])
                plan.clarification_question = f"Which document are you referring to? (Available: {doc_list})"

    # Contextual document retention for follow-ups
    if not resolved_doc and conversation_context:
        prior_doc = _find_prior_document(conversation_context, ready_docs)
        if prior_doc:
            resolved_doc = prior_doc
        elif len(ready_docs) == 1 and plan.source_scope in ("single_document", "document_section", "previous_grounded_scope"):
            resolved_doc = ready_docs[0]

    # Assign resolved document
    if resolved_doc:
        plan.resolved_document_name = resolved_doc.get("filename")
        plan.resolved_document_id = resolved_doc.get("id")

    # 5. Refine Operation & Retrieval Strategy based on information need
    clean_q = raw_query.lower()
    if any(k in clean_q for k in [
        "what does it contain", "what does the uploaded doc explain", "what does the uploaded document contain",
        "what does this document contain", "what does the document contain", "what's in it", "what is in it",
        "what r its contents", "what are its contents", "its contents", "contents of"
    ]):
        plan.operation = "outline"
        plan.retrieval_strategy = "coverage"
        plan.retrieval_mode = "broad"
        plan.task = "overview"
        if not plan.resolved_document_name and len(ready_docs) == 1:
            plan.resolved_document_name = ready_docs[0].get("filename")
            plan.resolved_document_id = ready_docs[0].get("id")
            plan.source_scope = "single_document"
        if plan.resolved_document_name:
            plan.search_queries = [plan.resolved_document_name]

    elif any(k in clean_q for k in ["summarize", "summary of the document", "summarize this file", "summarize it", "summarize this"]):
        plan.operation = "summarize"
        plan.retrieval_strategy = "coverage"
        plan.retrieval_mode = "broad"
        plan.task = "overview"
        if not plan.resolved_document_name and len(ready_docs) == 1:
            plan.resolved_document_name = ready_docs[0].get("filename")
            plan.resolved_document_id = ready_docs[0].get("id")
            plan.source_scope = "single_document"
        if plan.resolved_document_name:
            plan.search_queries = [plan.resolved_document_name]

    elif any(k in clean_q for k in ["compare", "comparison", "how are the two", "how do the two", "difference between"]):
        plan.operation = "compare"
        plan.retrieval_strategy = "comparative"
        plan.retrieval_mode = "comparative"
        plan.task = "comparison"

    elif any(p.search(raw_query) for p in _PROCEDURE_PATTERNS):
        plan.operation = "procedure"
        plan.retrieval_strategy = "procedural"
        if "after" in clean_q:
            plan.search_queries = [plan.standalone_query or raw_query, "procedure steps following installation deployment"]

    elif any(p.search(raw_query) for p in _EXTRACT_PATTERNS):
        plan.operation = "extract"

    elif any(p.search(raw_query) for p in _LOCATE_PATTERNS):
        plan.operation = "locate"

    # Section queries: exact section topic/heading preservation (Section 23, 24)
    for sec_pat in _SECTION_PATTERNS:
        sec_m = sec_pat.search(raw_query)
        if sec_m:
            sec_name = sec_m.group(1).strip()
            sec_name = re.sub(r'^(?:the|this|that)\s+', '', sec_name, flags=re.IGNORECASE).strip()
            if len(sec_name) >= 3:
                plan.source_scope = "document_section"
                plan.retrieval_strategy = "section"
                plan.target = sec_name
                doc_name = plan.resolved_document_name or ""
                # Preserved literally without invented words (Section 24)
                plan.search_queries = [sec_name]
                if doc_name:
                    plan.search_queries.append(f"{doc_name} {sec_name}")
                break

    # Enrich plan with lexical anchors, slot, and proposition verification
    anchors = extract_lexical_anchors(raw_query)
    slot, _ = detect_question_slot(raw_query)
    is_prop, p_subj, p_prop, p_val = detect_proposition(raw_query)

    plan.lexical_anchors = anchors
    if plan.question_slot == "general":
        plan.question_slot = slot
    plan.is_proposition = is_prop
    plan.proposition_subject = p_subj
    plan.proposition_property = p_prop
    plan.proposition_value = p_val

    # Structure search_queries according to Section 4 & 15:
    # 1. Best semantic rewrite / property query
    # 2. Original or lightly normalized lexical query
    # 3. High-information anchor query
    if plan.task not in ("social", "product_help"):
        ordered_searches: List[str] = []
        if is_prop and p_subj:
            # Contradiction-aware property search (Section 14 & 15):
            # Retrieve evidence about the PROPERTY, not only the asserted VALUE.
            if slot == "location":
                prop_q = f"{p_subj} address residence live located street"
            elif slot == "numeric" or any(k in raw_query.lower() for k in ["volt", "pressure", "port", "temp", "rate", "charge"]):
                prop_q = f"{p_subj} specification parameter rating value"
            elif slot == "temporal" or any(k in raw_query.lower() for k in ["when", "year", "date"]):
                prop_q = f"{p_subj} date year time timeline"
            else:
                prop_q = f"{p_subj} {p_prop or ''}".strip()
            ordered_searches.append(prop_q)
            if raw_query not in ordered_searches:
                ordered_searches.append(raw_query)
        else:
            # Standard queries: semantic rewrite first
            primary_q = plan.search_queries[0] if plan.search_queries else (plan.standalone_query or raw_query)
            ordered_searches.append(primary_q)
            # High-fidelity fallback second (Section 4)
            if raw_query not in ordered_searches:
                ordered_searches.append(raw_query)
            # Retain any additional planner search queries
            for sq in (plan.search_queries or []):
                if sq and sq not in ordered_searches:
                    ordered_searches.append(sq)

        # Lexical anchor query (Section 5)
        if anchors:
            anchor_q = " ".join(anchors)
            if anchor_q not in ordered_searches and len(ordered_searches) < 4:
                ordered_searches.append(anchor_q)

        plan.search_queries = ordered_searches[:4]
    elif not plan.search_queries and plan.task not in ("social", "product_help"):
        plan.search_queries = [plan.standalone_query]

    # Multi-facet and comparison decomposition
    if plan.task not in ("social", "product_help"):
        plan.facets = extract_answer_facets(plan.standalone_query or raw_query, plan)
        if plan.facets.isComparison:
            plan.task = "comparison"
            plan.retrieval_mode = "comparative"
            plan.retrieval_strategy = "comparative"
            plan.comparison_targets = plan.facets.bridgeEntities
            for f in plan.facets.facets:
                if f.searchQuery and f.searchQuery not in plan.search_queries:
                    plan.search_queries.append(f.searchQuery)
        elif plan.facets.isCompound:
            plan.task = "multi_part"
            plan.retrieval_mode = "broad"
            for f in plan.facets.facets:
                if f.searchQuery and f.searchQuery not in plan.search_queries:
                    plan.search_queries.append(f.searchQuery)
        elif plan.facets.isMultiHop:
            plan.task = "multi_hop"
            plan.retrieval_mode = "focused"
            plan.retrieval_strategy = "focused"
            if plan.facets.facets and plan.facets.facets[0].searchQuery and plan.facets.facets[0].searchQuery not in plan.search_queries:
                plan.search_queries.append(plan.facets.facets[0].searchQuery)

    logger.info(
        "[planner] task=%s mode=%s strat=%s op=%s slot=%s queries=%d doc=%s clarify=%s facets=%d",
        plan.task, plan.retrieval_mode, plan.retrieval_strategy, plan.operation,
        plan.question_slot, len(plan.search_queries), plan.resolved_document_name, plan.needs_clarification,
        len(plan.facets.facets) if plan.facets else 0
    )
    return plan


# ---------------------------------------------------------------------------
# Telemetry helpers (internal diagnostics only -- never exposed in UI)
# ---------------------------------------------------------------------------

def build_telemetry(
    plan: QueryPlan,
    original_query: str,
    first_pass_candidate_count: int = 0,
    first_pass_sufficient: bool = False,
    fallback_used: bool = False,
    final_candidate_count: int = 0,
    final_sufficient: bool = False,
) -> Dict[str, Any]:
    """Internal telemetry dict. Never serialized to user-facing API response."""
    return {
        "originalQuery": original_query,
        "task": plan.task,
        "standaloneQuery": plan.standalone_query,
        "retrievalMode": plan.retrieval_mode,
        "searchQueryCount": len(plan.search_queries),
        "fallbackUsed": fallback_used,
        "firstPassCandidateCount": first_pass_candidate_count,
        "firstPassSufficiency": first_pass_sufficient,
        "finalCandidateCount": final_candidate_count,
        "finalSufficiency": final_sufficient,
    }
