"""
GroundGuard Phase 1 MVP: Regression tests for Ask Behavior Defect Fixes

Verifies:
1. 'it' = previous entity in query resolution.
2. 'those' = immediately previous referenced set (no drift).
3. 'transform' preserves operation and decouples factual search queries from transform instructions.
4. Source modality preservation and related work attribution invariants in prompts.
5. Dialogue progression for repeated social greetings.
"""

import unittest
import asyncio
from unittest.mock import AsyncMock, MagicMock
from src.pipeline.query_understanding import (
    _build_planner_prompt,
    _PLANNER_SYSTEM,
    QueryPlan,
)
from src.pipeline.prompts import (
    GROUNDGUARD_SYSTEM_PROMPT,
    CLAIM_EXTRACTION_SYSTEM_PROMPT,
)
from src.pipeline.conversational import (
    SOCIAL_SYSTEM_PROMPT,
    ABSTENTION_SYSTEM_PROMPT,
    generate_social_response,
    generate_abstention_response,
)
from src.pipeline.llm import RealLLMRuntime, LLMResponse


def run_async(coro):
    return asyncio.run(coro)


class TestAskBehaviorFixes(unittest.TestCase):

    def test_referent_resolution_instructions_present(self):
        """Planner system prompt must explicitly require specific referent resolution and prevent parent-entity drift."""
        system_lower = _PLANNER_SYSTEM.lower()
        self.assertIn("referent resolution & specificity", system_lower)
        self.assertIn("do not drift to the generic parent project", system_lower)
        self.assertIn("resolve them to the specific sub-topic", system_lower)

    def test_transform_search_query_decoupling_instructions_present(self):
        """Planner system prompt must instruct never to put transform words like 'simpler' in search_queries."""
        system_lower = _PLANNER_SYSTEM.lower()
        self.assertIn("critical for transform tasks", system_lower)
        self.assertIn("never include transform or meta-instruction words", system_lower)
        self.assertIn("search_queries must contain only factual subject keywords", system_lower)

    def test_planner_prompt_context_budget(self):
        """Planner prompt builder must include up to 6 turns and cap assistant messages at 400 chars."""
        context = [
            {"role": "user", "content": "What is Campus Monitor?"},
            {"role": "assistant", "content": "A" * 500},
            {"role": "user", "content": "What technologies does it use?"},
            {"role": "assistant", "content": "B" * 500},
        ]
        prompt = _build_planner_prompt("Why are those useful?", context, "Demo", ["doc1.pdf"])
        # Should contain recent conversation
        self.assertIn("RECENT CONVERSATION:", prompt)
        # Assistant content should be bounded at 400 chars, not 200
        self.assertIn("A" * 400, prompt)
        self.assertNotIn("A" * 401, prompt)

    def test_source_modality_preservation_in_grounding_prompt(self):
        """Grounding prompt must explicitly mandate preserving modality ('will investigate', 'could', 'aims to')."""
        prompt_lower = GROUNDGUARD_SYSTEM_PROMPT.lower()
        self.assertIn("source modality preservation", prompt_lower)
        self.assertIn("will investigate", prompt_lower)
        self.assertIn("never flatten hypothetical, future, or potential statements", prompt_lower)

    def test_related_work_attribution_in_grounding_prompt(self):
        """Grounding prompt must prohibit attributing related work citations to the project."""
        prompt_lower = GROUNDGUARD_SYSTEM_PROMPT.lower()
        self.assertIn("attribution & related work discipline", prompt_lower)
        self.assertIn("do not attribute findings or capabilities from external citations", prompt_lower)

    def test_simplified_explanations_in_grounding_prompt(self):
        """Grounding prompt must guide simplification when requested."""
        prompt_lower = GROUNDGUARD_SYSTEM_PROMPT.lower()
        self.assertIn("simplified explanations", prompt_lower)
        self.assertIn("everyday explanations without heavy academic jargon", prompt_lower)

    def test_atomic_claim_decomposition_prompt(self):
        """Claim extraction prompt must enforce single-predicate atomic propositions."""
        prompt_lower = CLAIM_EXTRACTION_SYSTEM_PROMPT.lower()
        self.assertIn("split compound sentences, multi-clause conjunctions", prompt_lower)
        self.assertIn("each atomic claim must express exactly one factual", prompt_lower)
        self.assertIn("map each claim only to the specific evidence blocks", prompt_lower)

    def test_social_dialogue_progression_prompt(self):
        """Social prompt must instruct model to acknowledge continued greetings naturally."""
        prompt_lower = SOCIAL_SYSTEM_PROMPT.lower()
        self.assertIn("dialogue progression", prompt_lower)
        self.assertIn("notice if the user has already greeted you", prompt_lower)

    # -----------------------------------------------------------------------
    # Regression Test A: Fresh greeting must NOT imply previous interaction
    # -----------------------------------------------------------------------
    def test_regression_a_fresh_greeting_no_prior_interaction_language(self):
        """
        Regression Test A:
        context = []
        query = 'hey'
        Response MUST NOT imply previous interaction ('again', 'welcome back', 'back').
        """
        mock_llm = MagicMock(spec=RealLLMRuntime)
        mock_llm.is_configured.return_value = True

        # Simulate model accidentally returning 'again' on turn 1
        mock_llm.generate_answer = AsyncMock(return_value=LLMResponse(
            answer="Hey again! What would you like to explore in this project?",
            modelVersion="test-gemini",
            provider="google",
            latencyMs=50
        ))

        resp = run_async(generate_social_response(
            user_message="hey",
            sub_intent="greeting",
            project_name="Campus Monitor",
            recent_context=[],
            llm_runtime=mock_llm,
        ))

        # 1. Verify prompt sent to LLM explicitly tells it this is turn 1
        call_args = mock_llm.generate_answer.call_args[1]
        user_prompt = call_args["user_prompt"]
        self.assertIn("Recent conversation: NONE (Fresh conversation - first interaction)", user_prompt)
        self.assertIn("imply previous interaction", user_prompt)

        # 2. Verify deterministic safeguard cleans up any accidental repetition language
        resp_lower = resp.lower()
        self.assertNotIn("again", resp_lower)
        self.assertNotIn("welcome back", resp_lower)
        self.assertNotIn("back", resp_lower)

    # -----------------------------------------------------------------------
    # Regression Test B: Repeated greeting allows natural acknowledgment
    # -----------------------------------------------------------------------
    def test_regression_b_repeated_greeting_allows_natural_continuation(self):
        """
        Regression Test B:
        context contains previous greeting exchange
        query = 'hey'
        Response MAY acknowledge repetition naturally.
        """
        mock_llm = MagicMock(spec=RealLLMRuntime)
        mock_llm.is_configured.return_value = True
        mock_llm.generate_answer = AsyncMock(return_value=LLMResponse(
            answer="Hello again! What else would you like to explore regarding Campus Monitor?",
            modelVersion="test-gemini",
            provider="google",
            latencyMs=50
        ))

        context = [
            {"role": "user", "content": "hey"},
            {"role": "assistant", "content": "Hello! How can I help you with this project today?"}
        ]

        resp = run_async(generate_social_response(
            user_message="hey",
            sub_intent="greeting",
            project_name="Campus Monitor",
            recent_context=context,
            llm_runtime=mock_llm,
        ))

        # Verify ongoing conversation context was passed to LLM
        call_args = mock_llm.generate_answer.call_args[1]
        user_prompt = call_args["user_prompt"]
        self.assertIn("Recent conversation (ongoing exchange):", user_prompt)
        self.assertIn("USER: hey", user_prompt)
        self.assertIn("acknowledge repetition naturally", user_prompt)

        # Repetition acknowledgment is permitted and preserved
        self.assertIn("Hello again!", resp)

    # -----------------------------------------------------------------------
    # Regression Test C: Abstention has zero world answer and no domain leakage
    # -----------------------------------------------------------------------
    def test_regression_c_abstention_no_world_answer_and_no_domain_leakage(self):
        """
        Regression Test C:
        Query = 'Who is the president of France?'
        Active project = 'Campus Monitor'
        Expected:
        - no world answer
        - no industrial engineering reference
        - no unrelated domain
        - concise grounded abstention
        """
        # 1. Verify system prompt explicitly bans industrial engineering and unrelated domain leakage
        prompt_lower = ABSTENTION_SYSTEM_PROMPT.lower()
        self.assertNotIn("assistant for industrial engineering", prompt_lower)
        self.assertIn("evidence-grounded project documentation", prompt_lower)
        self.assertIn("no unrelated domain leakage", prompt_lower)
        self.assertIn("strictly no world-knowledge answering", prompt_lower)

        # 2. Test generation safeguard against domain leakage
        mock_llm = MagicMock(spec=RealLLMRuntime)
        mock_llm.is_configured.return_value = True
        mock_llm.generate_answer = AsyncMock(return_value=LLMResponse(
            answer="I couldn't find information about that in the Campus Monitor sources.",
            modelVersion="test-gemini",
            provider="google",
            latencyMs=60
        ))

        resp = run_async(generate_abstention_response(
            query="Who is the president of France?",
            insufficiency_reason="no relevant chunks found",
            project_name="Campus Monitor",
            doc_titles=["campus_monitor__an_ai_driven_real_time_smart_campus_environment_monitoring_system.pdf"],
            llm_runtime=mock_llm,
        ))

        resp_lower = resp.lower()
        self.assertNotIn("macron", resp_lower)
        self.assertNotIn("emmanuel", resp_lower)
        self.assertNotIn("industrial engineering", resp_lower)
        self.assertNotIn("piping", resp_lower)
        self.assertIn("campus monitor", resp_lower)

    # -----------------------------------------------------------------------
    # Answer Composition & Transform Scope Invariants
    # -----------------------------------------------------------------------
    def test_natural_assistant_prose_and_direct_question_brevity_in_prompt(self):
        """Prompt must instruct concise 2-4 sentence answers for simple questions and avoid repetitive prefixes."""
        prompt_lower = GROUNDGUARD_SYSTEM_PROMPT.lower()
        self.assertIn("natural assistant prose & direct question brevity", prompt_lower)
        self.assertIn("2–4 coherent sentences", prompt_lower)
        self.assertIn("avoid repetitive robotic boilerplate prefixes", prompt_lower)

    def test_semantic_deduplication_instructions_in_prompt(self):
        """Prompt must instruct semantic deduplication of overlapping technologies."""
        prompt_lower = GROUNDGUARD_SYSTEM_PROMPT.lower()
        self.assertIn("semantic deduplication", prompt_lower)
        self.assertIn("consolidate overlapping terms and near-synonyms into coherent conceptual groups", prompt_lower)

    def test_minimum_sufficient_answer_and_related_work_discipline_in_prompt(self):
        """Prompt must instruct minimum sufficient answer and exclude related work unless requested."""
        prompt_lower = GROUNDGUARD_SYSTEM_PROMPT.lower()
        self.assertIn("minimum sufficient answer", prompt_lower)
        self.assertIn("prefer relevant + supported over supported but tangential", prompt_lower)
        self.assertIn("exclude related work and prior literature", prompt_lower)

    def test_transform_scope_preservation_in_prompt_and_builder(self):
        """Prompt must mandate preserving factual scope for transform queries, and prompt builder must insert directive."""
        prompt_lower = GROUNDGUARD_SYSTEM_PROMPT.lower()
        self.assertIn("transform scope preservation", prompt_lower)
        self.assertIn("preserve the exact factual scope of the immediately preceding answer", prompt_lower)
        self.assertIn("do not introduce new subtopics, capabilities, or facts", prompt_lower)

        from src.pipeline.prompts import build_grounded_user_prompt
        context = [
            {"role": "user", "content": "Why are those useful?"},
            {"role": "assistant", "content": "IoT devices collect real-time data while ML models detect patterns and computer vision spots anomalies."}
        ]
        prompt = build_grounded_user_prompt(
            query="Explain that more simply.",
            evidence_context="=== EVIDENCE_1 ===\nCampus Monitor also tracks lighting and energy occupancy.",
            conversation_context=context,
            standalone_query="Explain the usefulness of Campus Monitor technologies more simply."
        )
        self.assertIn("TRANSFORM INSTRUCTION (CRITICAL SCOPE PRESERVATION)", prompt)
        self.assertIn("strictly preserve the factual scope of the PREVIOUS ASSISTANT ANSWER", prompt)
        self.assertIn("Do NOT add new facts, components, or subtopics", prompt)


if __name__ == "__main__":
    unittest.main()

