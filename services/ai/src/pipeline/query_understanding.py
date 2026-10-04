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
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), ".env"))

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


class QueryPlan(BaseModel):
    task: AllowedTask = "targeted"
    standalone_query: str = ""
    retrieval_mode: AllowedRetrievalMode = "focused"
    search_queries: List[str] = Field(default_factory=list)
    comparison_targets: List[str] = Field(default_factory=list)
    needs_clarification: bool = False
    clarification_question: Optional[str] = None

    def model_post_init(self, __context) -> None:
        # Cap list fields at 4 elements
        if len(self.search_queries) > 4:
            self.search_queries = self.search_queries[:4]
        if len(self.comparison_targets) > 4:
            self.comparison_targets = self.comparison_targets[:4]


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
        r'\b(?:what\s+can\s+(?:you|u|this|groundguard)\s+do'
        r'|how\s+(?:do\s+i\s+use|does\s+(?:this|groundguard)\s+work)'
        r'|what\s+(?:is|are)\s+(?:your|its|this\s+app\'?s?|groundguard\s*\'?s?)\s+capabilities'
        r'|explain\s+groundguard)\b',
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

_PLANNER_SYSTEM = (
    "You are GroundGuard's internal query understanding engine.\n\n"
    "YOU ARE NOT ANSWERING THE USER.\n"
    "YOU ARE INTERPRETING WHAT INFORMATION THEY NEED FROM PROJECT DOCUMENTS.\n"
    "DO NOT PRODUCE FACTUAL PROJECT CLAIMS.\n"
    "RETURN RETRIEVAL PLANNING METADATA ONLY.\n\n"
    "Your job: given a user query and optional conversation context, output a JSON QueryPlan.\n\n"
    "TASK DEFINITIONS (choose exactly one):\n"
    "- targeted: Direct question about a specific entity, identifier, or fact.\n"
    "- overview: Broad request for key concepts, main ideas, project summary, or 'what should I know'.\n"
    "- thematic: Asking what documents say about a theme (monitoring, limitations, benefits, technologies).\n"
    "- comparison: Comparing two or more systems, approaches, or entities.\n"
    "- follow_up: Anaphoric continuation of prior conversation (uses pronouns/references from context).\n"
    "- multi_part: Single query decomposable into 2-4 distinct sub-questions.\n"
    "- transform: Rewrite/summarize/reformat a prior answer (simpler, shorter, bullets).\n"
    "- social: Greeting, farewell, thanks, acknowledgment.\n"
    "- product_help: How to use GroundGuard, capabilities, what can be asked.\n\n"
    "RETRIEVAL MODE:\n"
    "- focused: 1 targeted query for a specific fact or entity.\n"
    "- broad: 2-4 semantic queries to cover major project themes.\n"
    "- comparative: 1-2 queries per comparison target.\n\n"
    "REFERENT RESOLUTION & SPECIFICITY:\n"
    "- When user queries use pronouns or demonstratives ('it', 'those', 'they', 'these', 'that'), resolve them to the SPECIFIC sub-topic, entity, or set referenced in the immediately preceding turn.\n"
    "- Do NOT drift to the generic parent project if a specific sub-topic was asked (e.g. if previous turn discussed 'technologies', 'Why are those useful?' means 'Why are those technologies useful?', NOT generic project benefits).\n"
    "- If resolving 'it' following a question about a system (e.g. 'System X'), 'What technologies does it use?' must resolve to 'What technologies does System X use?'.\n\n"
    "SEARCH QUERIES:\n"
    "- For focused: exactly 1 query, the best retrieval formulation.\n"
    "- For broad: 2-4 queries, each targeting a distinct project theme.\n"
    "- For comparative: 1-2 queries per target side.\n"
    "- Queries must be semantically meaningful for vector + keyword retrieval.\n"
    "- CRITICAL FOR TRANSFORM TASKS ('explain simply', 'in bullets', 'make it shorter'):\n"
    "  * search_queries MUST contain ONLY factual subject keywords (e.g. ['System X technologies IoT sensors machine learning usefulness']).\n"
    "  * NEVER include transform or meta-instruction words like 'simpler', 'simply', 'in simpler terms', 'shorter', 'bullets' in search_queries, as document chunks do not contain these meta-words.\n"
    "- Do NOT hardcode domain knowledge. Generate queries based on query intent.\n"
    "- Maximum 4 total search_queries.\n\n"
    "STANDALONE QUERY:\n"
    "- Resolve anaphora and context into an explicit self-contained information need.\n"
    "- For transform tasks, preserve BOTH the requested operation AND the resolved subject (e.g. 'Explain in simpler terms why the technologies used in System X are useful').\n"
    "- If no anaphora, standalone_query = original query.\n\n"
    "CLARIFICATION:\n"
    "- Set needs_clarification=true ONLY when ambiguity genuinely prevents responsible retrieval.\n"
    "- Example: 'compare them' with no resolvable referents -> clarification needed.\n"
    "- 'What are the main things here?' inside a project -> DO NOT clarify, interpret as overview.\n\n"
    'OUTPUT FORMAT (strict JSON, no extra text):\n'
    '{\n'
    '  "task": "...",\n'
    '  "standalone_query": "...",\n'
    '  "retrieval_mode": "...",\n'
    '  "search_queries": ["...", "..."],\n'
    '  "comparison_targets": [],\n'
    '  "needs_clarification": false,\n'
    '  "clarification_question": null\n'
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
        parts.append("READY DOCUMENTS: " + titles_str)

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
# Planner fallback -- always safe
# ---------------------------------------------------------------------------

def _make_fallback_plan(query: str) -> QueryPlan:
    """Safe fallback used when planner fails. Preserves current stable retrieval."""
    clean = (query or "").strip()
    return QueryPlan(
        task="targeted",
        standalone_query=clean,
        retrieval_mode="focused",
        search_queries=[clean] if clean else [],
        comparison_targets=[],
        needs_clarification=False,
        clarification_question=None,
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
        )

    if _is_product_help(query):
        return QueryPlan(
            task="product_help",
            standalone_query=_normalize_for_plan(query),
            retrieval_mode="focused",
            search_queries=[],
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
# Main entry point
# ---------------------------------------------------------------------------

async def understand_query(
    query: str,
    conversation_context: Optional[List[Dict[str, Any]]] = None,
    project_context: Optional[Dict[str, Any]] = None,
) -> QueryPlan:
    """
    Interprets what information the user needs and produces a QueryPlan.

    Architecture contract:
    - Social/product-help: deterministic fast path (0 planner calls).
    - Substantive queries: 1 Gemini planner call.
    - On any planner failure: safe fallback plan (original query, targeted, focused).
    - No loops. No agentic behavior. No tools. No browsing.
    - M2 never calls M1. This function never calls M1.

    Args:
        query: Raw user query string.
        conversation_context: Bounded list of prior turns (for anaphora resolution).
        project_context: Dict with optional keys: projectName, readyDocTitles, filenames.

    Returns:
        QueryPlan with task, standalone_query, retrieval_mode, search_queries.
    """
    raw_query = (query or "").strip()
    if not raw_query:
        return _make_fallback_plan(raw_query)

    # 1. Fast path: social / product_help (no Gemini needed)
    fast = _try_deterministic_plan(raw_query)
    if fast is not None:
        logger.info("[planner] Fast path: task=%s query='%s'", fast.task, raw_query[:60])
        return fast

    # 2. Gemini planner path
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY", "")
    model = os.getenv("LLM_PLANNER_MODEL", "gemini-flash-lite-latest")

    if not api_key:
        logger.info("[planner] No Gemini key, fallback for query='%s'", raw_query[:60])
        return _make_fallback_plan(raw_query)

    project_name = None
    ready_doc_titles: List[str] = []
    if project_context and isinstance(project_context, dict):
        project_name = project_context.get("projectName")
        raw_titles = (
            project_context.get("readyDocTitles")
            or project_context.get("filenames")
            or []
        )
        ready_doc_titles = [str(t) for t in raw_titles[:8]]

    user_prompt = _build_planner_prompt(
        query=raw_query,
        conversation_context=conversation_context,
        project_name=project_name,
        ready_doc_titles=ready_doc_titles,
    )

    t0 = time.perf_counter()
    try:
        raw_json = await _call_planner_gemini(
            api_key=api_key,
            model=model,
            system_prompt=_PLANNER_SYSTEM,
            user_prompt=user_prompt,
        )
    except Exception as planner_exc:
        logger.warning("[planner] Unexpected planner exception: %s, using fallback", planner_exc)
        return _make_fallback_plan(raw_query)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    if not raw_json:
        logger.warning("[planner] Empty response after %dms, using fallback", elapsed_ms)
        return _make_fallback_plan(raw_query)

    # Parse and validate with Pydantic
    try:
        data = json.loads(raw_json)
        plan = QueryPlan(**data)

        # Safety: ensure standalone_query is never empty
        if not plan.standalone_query:
            plan.standalone_query = raw_query

        # Safety: ensure search_queries populated for retrieval-needing tasks
        if plan.task not in ("social", "product_help", "transform") and not plan.search_queries:
            plan.search_queries = [plan.standalone_query]

        logger.info(
            "[planner] task=%s mode=%s queries=%d elapsed=%dms clarify=%s",
            plan.task, plan.retrieval_mode, len(plan.search_queries),
            elapsed_ms, plan.needs_clarification,
        )
        return plan

    except Exception as exc:
        logger.warning(
            "[planner] Plan parse/validation failed (%s), fallback for query='%s'",
            exc, raw_query[:60],
        )
        return _make_fallback_plan(raw_query)


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
