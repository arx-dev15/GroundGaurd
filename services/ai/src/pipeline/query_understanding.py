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


class QueryPlan(BaseModel):
    task: AllowedTask = "targeted"
    standalone_query: str = ""
    retrieval_mode: AllowedRetrievalMode = "focused"
    search_queries: List[str] = Field(default_factory=list)
    comparison_targets: List[str] = Field(default_factory=list)
    needs_clarification: bool = False
    clarification_question: Optional[str] = None

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
        recent = conversation_context[-6:]
        ctx_lines = []
        for turn in recent:
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
    for m in re.finditer(r'\b[A-Z]{2,}\d*\b|\b[A-Z]+\d+\b', query):
        acro = m.group(0).strip()
        if acro.lower() not in _STOPWORDS_SET and len(acro) >= 2:
            anchors.append(acro)

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
# Planner fallback -- always safe
# ---------------------------------------------------------------------------

def _make_fallback_plan(query: str) -> QueryPlan:
    """Safe fallback used when planner fails. Preserves current stable retrieval."""
    clean = (query or "").strip()
    anchors = extract_lexical_anchors(clean)
    slot, _ = detect_question_slot(clean)
    is_prop, p_subj, p_prop, p_val = detect_proposition(clean)

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

    return QueryPlan(
        task="targeted",
        standalone_query=clean,
        retrieval_mode="focused",
        search_queries=search_qs,
        comparison_targets=[],
        needs_clarification=False,
        clarification_question=None,
        source_scope="project",
        target=clean,
        operation="lookup",
        retrieval_strategy="focused",
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
    model = os.getenv("LLM_PLANNER_MODEL", "gemini-flash-lite-latest")

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

    logger.info(
        "[planner] task=%s mode=%s strat=%s op=%s slot=%s queries=%d doc=%s clarify=%s",
        plan.task, plan.retrieval_mode, plan.retrieval_strategy, plan.operation,
        plan.question_slot, len(plan.search_queries), plan.resolved_document_name, plan.needs_clarification,
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
