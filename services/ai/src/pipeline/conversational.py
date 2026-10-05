"""
GroundGuard Phase 1 MVP: Conversational & Natural Response Engine

Provides natural language generation for non-retrieval / boundary turns:
- Social interactions (greetings, thanks, farewells, acknowledgments)
- Product help (explaining true GroundGuard capabilities per fixed manifest)
- Natural grounded abstention (conversational explanation of insufficient evidence)
- Natural clarification (prompting user to clarify ambiguous comparison/referents)

CRITICAL INVARIANTS:
1. Strict GroundGuard Product Principle:
   - FLEXIBLE ABOUT LANGUAGE.
   - NATURAL IN CONVERSATION.
   - STRICT ABOUT FACTUAL EVIDENCE.
2. Capability Manifest: Product help is strictly constrained to implemented features.
   Never invent features (no web search, no editing PDFs, no world knowledge).
3. Zero Mock / Single Owner: All generation runs through M2's RealLLMRuntime.
4. Robust Fallbacks: If LLM fails or is unavailable, each path returns a concise,
   deterministic fallback response.
"""

import re
import logging
from typing import Optional, List, Dict, Any
from src.pipeline.llm import RealLLMRuntime

logger = logging.getLogger("m2-conversational")

# ---------------------------------------------------------------------------
# Section 10: Fixed Product Capability Manifest (True capabilities only)
# ---------------------------------------------------------------------------
GROUNDGUARD_CAPABILITY_MANIFEST = [
    "answer questions using uploaded project evidence",
    "synthesize information across project documents",
    "compare supported information across sources",
    "show citations/evidence",
    "inspect individual factual claims",
    "show verification state",
    "show recovery when unsupported claims are repaired",
    "let users review claims needing attention",
]

# ---------------------------------------------------------------------------
# Fallback Constants (Deterministic safety nets for resilience, never normal UX)
# ---------------------------------------------------------------------------
FALLBACK_SOCIAL_GREETING = "Hey — what would you like to explore in this project?"
FALLBACK_SOCIAL_THANKS = "You're welcome."
FALLBACK_SOCIAL_FAREWELL = "Goodbye! Whenever you need to investigate technical claims or documentation, I'll be here."
FALLBACK_SOCIAL_ACK = "Sure — what would you like to check next?"
FALLBACK_PRODUCT_HELP = (
    "I can help you explore this project's documents, compare what different "
    "sources say, and trace factual claims back to their evidence. If something "
    "isn't well supported, EvideX AI can flag it for review."
)
FALLBACK_ABSTENTION = "I couldn't find enough evidence in this project's sources to answer that confidently."
FALLBACK_CLARIFICATION = "Could you clarify which systems or documents you would like to compare?"


# ---------------------------------------------------------------------------
# Section 7: Natural Social Response Generation
# ---------------------------------------------------------------------------
SOCIAL_SYSTEM_PROMPT = """You are EvideX AI, an enterprise AI assistant for evidence-grounded project documentation.
Respond naturally and briefly to the user's social message (greeting, thanks, farewell, or acknowledgment).

RULES:
1. Stay within the current project context if a project name is provided.
2. Do NOT introduce any factual project claims, numbers, specs, or equipment details.
3. Do NOT describe internal architecture, models, or algorithms.
4. Do NOT market aggressively or invent capabilities.
5. Keep your response to 1-2 short sentences maximum. Be warm, professional, and concise.
6. STRICT CONVERSATION STATE CONDITIONING & DIALOGUE PROGRESSION:
   - When Recent conversation is NONE or EMPTY (first turn / fresh conversation):
     * You MUST provide a fresh first-contact greeting (e.g., "Hello! How can I help you with this project today?" or "Hi! What would you like to explore in this project?").
     * You MUST NOT use repetition or continuation words like "again", "back", "welcome back", "still", or imply any prior discussion.
   - When and ONLY when Recent conversation contains prior greetings or interaction from THIS ongoing conversation:
     * Notice if the user has already greeted you and acknowledge the continued exchange naturally (e.g., "Hello again!", "Still here! What else can I help you find?").
7. NO DOMAIN LEAKAGE: Do NOT assume, infer, or mention any specific engineering, scientific, or academic domain (such as 'industrial engineering') unless explicitly stated in the project name.
"""

async def generate_social_response(
    user_message: str,
    sub_intent: Optional[str] = "greeting",
    project_name: Optional[str] = None,
    recent_context: Optional[List[Dict[str, Any]]] = None,
    llm_runtime: Optional[RealLLMRuntime] = None,
) -> str:
    """
    Generates a natural, brief social response using LLM runtime.
    Falls back safely if LLM is unavailable or fails.
    """
    if not llm_runtime or not llm_runtime.is_configured():
        if sub_intent == "thanks":
            return FALLBACK_SOCIAL_THANKS
        elif sub_intent == "farewell":
            return FALLBACK_SOCIAL_FAREWELL
        elif sub_intent == "ack":
            return FALLBACK_SOCIAL_ACK
        return FALLBACK_SOCIAL_GREETING

    proj_str = f"Current project: {project_name}" if project_name else "In the current project."
    has_prior_history = bool(recent_context and len(recent_context) > 0)
    if has_prior_history:
        recent_turns = [
            f"{t.get('role', 'user').upper()}: {t.get('content', '')[:200]}"
            for t in recent_context[-6:]
        ]
        context_str = "Recent conversation (ongoing exchange):\n" + "\n".join(recent_turns) + "\n\n"
        context_instruction = (
            "This is an ongoing conversation. Notice if the user has already greeted you "
            "and acknowledge repetition naturally (e.g. 'Hello again!')."
        )
    else:
        context_str = "Recent conversation: NONE (Fresh conversation - first interaction).\n\n"
        context_instruction = (
            "This is the FIRST message in a fresh conversation. "
            "You MUST NOT use 'again', 'back', 'welcome back', 'still', or imply previous interaction."
        )

    user_prompt = (
        f"{proj_str}\n"
        f"{context_str}"
        f"User message: \"{user_message.strip()}\"\n"
        f"Social intent: {sub_intent}\n"
        f"Instruction: {context_instruction}\n\n"
        f"Provide a natural 1-2 sentence response:"
    )

    try:
        res = await llm_runtime.generate_answer(
            user_prompt=user_prompt,
            system_prompt=SOCIAL_SYSTEM_PROMPT,
        )
        ans = res.answer.strip().strip('"')
        if ans:
            if not has_prior_history:
                # Deterministic safeguard: ensure first-turn greeting never implies prior interaction
                repetition_patterns = [
                    (r'\b(?:hey|hello|hi)\s+again\b', 'Hello'),
                    (r'\bwelcome\s+back\b', 'Welcome'),
                    (r'\bgood\s+to\s+see\s+you\s+again\b', 'Good to see you'),
                    (r'\b(again|welcome back)\b', ''),
                ]
                for pat, repl in repetition_patterns:
                    ans = re.sub(pat, repl, ans, flags=re.IGNORECASE)
                ans = re.sub(r'\s+', ' ', ans).strip()
            return ans
    except Exception as exc:
        logger.warning("[conversational] Social LLM generation failed: %s — using fallback", exc)

    if sub_intent == "thanks":
        return FALLBACK_SOCIAL_THANKS
    elif sub_intent == "farewell":
        return FALLBACK_SOCIAL_FAREWELL
    elif sub_intent == "ack":
        return FALLBACK_SOCIAL_ACK
    return FALLBACK_SOCIAL_GREETING


# ---------------------------------------------------------------------------
# Section 9 & 10: Natural Product Help Generation
# ---------------------------------------------------------------------------
PRODUCT_HELP_SYSTEM_PROMPT = f"""You are EvideX AI, an enterprise AI assistant for evidence-grounded project documentation.
Your job is to explain what EvideX AI can do in a natural, helpful, conversational way.

CRITICAL INVARIANT - ALLOWED CAPABILITY MANIFEST:
You may ONLY describe capabilities from this exact list of TRUE features:
{chr(10).join(f"- {cap}" for cap in GROUNDGUARD_CAPABILITY_MANIFEST)}

STRICT RULES:
1. You may phrase these capabilities naturally and conversationally.
2. You MUST NOT invent any features. Specifically:
   - NO web search or general internet answers
   - NO editing source PDFs
   - NO multi-user collaboration
   - NO external integrations
   - NO world-knowledge answering
3. Do NOT mention internal technical jargon like DeBERTa, RRF, Tantivy, Qdrant, chunk IDs, or embeddings.
4. Keep the explanation concise and direct (2-4 sentences max).
5. EvideX AI keeps all answers strictly grounded in uploaded project documentation.
6. NO DOMAIN LEAKAGE: Do NOT assume, infer, or mention any specific engineering, scientific, or academic domain (such as 'industrial engineering') unless explicitly stated in the project context.
"""

async def generate_product_help_response(
    user_message: str,
    project_name: Optional[str] = None,
    recent_context: Optional[List[Dict[str, Any]]] = None,
    llm_runtime: Optional[RealLLMRuntime] = None,
) -> str:
    """
    Generates natural product help strictly constrained by the capability manifest.
    Falls back safely if LLM is unavailable or fails.
    """
    if not llm_runtime or not llm_runtime.is_configured():
        return FALLBACK_PRODUCT_HELP

    proj_str = f"Project name: {project_name}" if project_name else ""
    user_prompt = (
        f"{proj_str}\n"
        f"User asked: \"{user_message.strip()}\"\n\n"
        f"Explain EvideX AI's true capabilities clearly and naturally for this project:"
    )

    try:
        res = await llm_runtime.generate_answer(
            user_prompt=user_prompt,
            system_prompt=PRODUCT_HELP_SYSTEM_PROMPT,
        )
        ans = res.answer.strip()
        if ans:
            return ans
    except Exception as exc:
        logger.warning("[conversational] Product help LLM generation failed: %s — using fallback", exc)

    return FALLBACK_PRODUCT_HELP


# ---------------------------------------------------------------------------
# Section 24 & 25: Natural Grounded Abstention Generation
# ---------------------------------------------------------------------------
ABSTENTION_SYSTEM_PROMPT = """You are EvideX AI, an enterprise AI assistant for evidence-grounded project documentation.
The user asked a question, but there is insufficient evidence in the uploaded project documents to answer it.
Your job is to explain this naturally, politely, and concisely to the user.

CRITICAL RULES:
1. STRICTLY NO WORLD-KNOWLEDGE ANSWERING: Do NOT attempt to answer the question using external knowledge or trivia.
2. DO NOT FABRICATE FACTS: Do not invent facts, specifications, or guesses about the project or external world.
3. NO UNRELATED DOMAIN LEAKAGE: Do NOT mention, infer, or assume any project domain or industry (such as 'industrial engineering') unless explicitly stated in the provided project context or document titles. Simply indicate that the requested information is not available in this project's documentation.
4. Be conversational and natural: do not repeat the exact same robotic phrase every time.
5. If available document topics/titles are provided and relevant, you may briefly mention what kinds of topics are covered.
6. Keep your response concise: 1-2 sentences maximum. Clear, professional, and helpful.
"""

async def generate_abstention_response(
    query: str,
    insufficiency_reason: Optional[str] = None,
    project_name: Optional[str] = None,
    doc_titles: Optional[List[str]] = None,
    llm_runtime: Optional[RealLLMRuntime] = None,
) -> str:
    """
    Generates a natural, project-grounded abstention statement.
    Does NOT use world knowledge or answer off-topic queries.
    Falls back safely if LLM fails.
    """
    if not llm_runtime or not llm_runtime.is_configured():
        return FALLBACK_ABSTENTION

    docs_info = f"Documents available in project: {', '.join(doc_titles[:5])}" if doc_titles else "No specific document topics."
    proj_info = f"Project: {project_name}" if project_name else ""

    user_prompt = (
        f"{proj_info}\n"
        f"{docs_info}\n"
        f"User question: \"{query.strip()}\"\n"
        f"Evidence retrieval status: Insufficient evidence ({insufficiency_reason or 'no relevant chunks found'}).\n\n"
        f"Provide a natural 1-2 sentence abstention explaining that the project documents don't have sufficient evidence for this. "
        f"Do not answer from general knowledge and do not mention unrelated domains:"
    )

    try:
        res = await llm_runtime.generate_answer(
            user_prompt=user_prompt,
            system_prompt=ABSTENTION_SYSTEM_PROMPT,
        )
        ans = res.answer.strip().strip('"')
        if ans:
            # Deterministic safeguard against domain leakage
            if "industrial engineering" in ans.lower():
                ans = re.sub(r'\bindustrial\s+engineering\b', 'project', ans, flags=re.IGNORECASE)
            return ans
    except Exception as exc:
        logger.warning("[conversational] Abstention LLM generation failed: %s — using fallback", exc)

    return FALLBACK_ABSTENTION


# ---------------------------------------------------------------------------
# Section 26: Natural Clarification Prompt Generation
# ---------------------------------------------------------------------------
CLARIFICATION_SYSTEM_PROMPT = """You are EvideX AI, an enterprise AI assistant for evidence-grounded project documentation.
The user asked an ambiguous question (such as 'compare them' without clear targets or referents).
Ask a natural, direct, concise clarification question to understand what specific systems, documents, or topics they want to examine.

RULES:
1. 1 short sentence maximum.
2. Direct, polite, and natural.
3. Do not retrieve or invent facts.
4. NO DOMAIN LEAKAGE: Do NOT assume or mention any specific engineering domain (such as 'industrial engineering').
"""

async def generate_clarification_response(
    user_query: str,
    structured_clarification: Optional[str] = None,
    llm_runtime: Optional[RealLLMRuntime] = None,
) -> str:
    """
    Phrases an ambiguous query clarification naturally.
    Falls back to structured_clarification or deterministic fallback.
    """
    if structured_clarification:
        return structured_clarification

    if not llm_runtime or not llm_runtime.is_configured():
        return FALLBACK_CLARIFICATION

    user_prompt = (
        f"Ambiguous user query: \"{user_query.strip()}\"\n"
        f"Ask a natural 1-sentence clarification question:"
    )

    try:
        res = await llm_runtime.generate_answer(
            user_prompt=user_prompt,
            system_prompt=CLARIFICATION_SYSTEM_PROMPT,
        )
        ans = res.answer.strip().strip('"')
        if ans:
            return ans
    except Exception as exc:
        logger.warning("[conversational] Clarification LLM generation failed: %s — using fallback", exc)

    return FALLBACK_CLARIFICATION
