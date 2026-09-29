import { generationRepository, DBGeneration } from '../repositories/generation.repository';
import { conversationRepository } from '../repositories/conversation.repository';
import { aiClient } from '../clients/ai.client';
import { verificationOrchestrator } from './verification.orchestrator';
import { recoveryOrchestrator } from './recovery.orchestrator';
import { generationEvents } from './generation-events';

export class GenerationOrchestrator {
  private activeControllers = new Map<string, AbortController>();

  public async createGeneration(data: {
    projectId: string;
    conversationId?: string | null;
    query: string;
    maxRecoveryAttempts: number;
  }): Promise<DBGeneration> {
    const { generateId } = await import('../utils/id');
    const requestId = generateId('req');

    const generation = await generationRepository.createGeneration({
      requestId,
      projectId: data.projectId,
      conversationId: data.conversationId ?? null,
      query: data.query,
      maxRecoveryAttempts: data.maxRecoveryAttempts,
    });

    if (data.conversationId) {
      await conversationRepository.createMessage({
        conversationId: data.conversationId,
        role: 'user',
        content: data.query,
      });
    }

    // Fire and forget: the route returns "queued" immediately, this runs in the background.
    this.runPipeline(generation.id).catch((err) => {
      // Reached only if runPipeline's own try/catch failed to write a status, e.g. the DB itself is down.
      console.error(`[generation ${generation.id}] unhandled pipeline error`, err?.message || err);
    });

    return generation;
  }

  public async cancelGeneration(generationId: string): Promise<DBGeneration> {
    const controller = this.activeControllers.get(generationId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(generationId);
    }

    const updated = await generationRepository.updateGeneration(generationId, {
      status: 'cancelled',
      completedAt: new Date(),
    });

    generationEvents.publish(generationId, 'generation.failed', {
      code: 'GENERATION_CANCELLED',
      message: 'Generation was cancelled by user',
    });

    if (!updated) {
      throw new Error(`Generation ${generationId} not found`);
    }
    return updated;
  }

  private static readonly FLAGGED = new Set(['flagged', 'needs_review']);

  private async emitClaimEvents(generationId: string, onlyIds?: Set<string>): Promise<Set<string>> {
    const claims = await verificationOrchestrator.getHydratedClaims(generationId);
    const flagged = new Set<string>();
    for (const c of claims) {
      if (onlyIds && !onlyIds.has(c.claimId)) continue;
      const isFlagged = GenerationOrchestrator.FLAGGED.has(c.status);
      if (isFlagged) flagged.add(c.claimId);
      generationEvents.publish(generationId, isFlagged ? 'sentence.flagged' : 'sentence.verified', {
        claimId: c.claimId,
        text: c.text,
        status: c.status,
        label: c.verification?.label,
        groundingScore: c.verification?.groundingScore,
      });
    }
    return flagged;
  }

  private async runPipeline(generationId: string): Promise<void> {
    const startedAt = Date.now();
    const generation = await generationRepository.findGenerationById(generationId);
    if (!generation) return; // shouldn't happen, we just created it

    const abortController = new AbortController();
    this.activeControllers.set(generationId, abortController);

    try {
      await generationRepository.updateGeneration(generationId, { status: 'generating' });
      generationEvents.publish(generationId, 'generation.started', {
        generationId,
        requestId: generation.requestId,
      });

      const result = await aiClient.generate({
        projectId: generation.projectId,
        query: generation.query,
        requestId: generation.requestId,
        generationId: generation.id,
        options: { maxRecoveryAttempts: generation.maxRecoveryAttempts },
      });

      // Check if cancelled while M2 /generate was running
      const postGen = await generationRepository.findGenerationById(generationId);
      if (postGen?.status === 'cancelled') return;

      const totalLatencyMs = Date.now() - startedAt;

      if (result.status === 'failed' || result.error) {
        const code = result.error?.code ?? 'GENERATION_FAILED';
        const message = result.error?.message ?? 'Generation service returned a failure';
        await generationRepository.updateGeneration(generationId, {
          status: 'failed',
          errorCode: code,
          errorMessage: message,
          totalLatencyMs,
          completedAt: new Date(),
        });
        generationEvents.publish(generationId, 'generation.failed', { code, message });
        return;
      }

      // Atomic Phase 6 persistence: transition to 'verifying' while verification and recovery proceed
      await generationRepository.persistCompletedGeneration({
        generationId,
        projectId: generation.projectId,
        status: 'verifying',
        answer: result.answer ?? null,
        modelVersion: result.modelVersion ?? null,
        metadata: (result.metadata as Record<string, unknown>) ?? null,
        totalLatencyMs,
        claims: result.claims ?? [],
        conversationId: generation.conversationId,
      });

      // Check if cancelled before verification
      const postPersist = await generationRepository.findGenerationById(generationId);
      if (postPersist?.status === 'cancelled') return;

      // Phase 7: Dual-stage Grounding Verification (M1 cross-encoder + deterministic checks)
      await verificationOrchestrator.verifyGenerationClaims(generationId, generation.requestId);
      const flagged = await this.emitClaimEvents(generationId);

      // Check if cancelled before recovery
      const postVerify = await generationRepository.findGenerationById(generationId);
      if (postVerify?.status === 'cancelled') return;

      // Phase 8: Failure-Aware Agentic Recovery (for failed claims)
      if (generation.maxRecoveryAttempts > 0) {
        if (flagged.size > 0) {
          await generationRepository.updateGeneration(generationId, { status: 'recovering' });
          generationEvents.publish(generationId, 'recovery.started', { claims: [...flagged] });
        }
        await recoveryOrchestrator.recoverGenerationClaims(generationId, generation.requestId);
        if (flagged.size > 0) {
          await this.emitClaimEvents(generationId, flagged);
          generationEvents.publish(generationId, 'recovery.completed', { claims: [...flagged] });
        }
      }

      // Final check if cancelled
      const preComplete = await generationRepository.findGenerationById(generationId);
      if (preComplete?.status === 'cancelled') return;

      // Transition to completed
      await generationRepository.updateGeneration(generationId, {
        status: 'completed',
        completedAt: new Date(),
      });

      generationEvents.publish(generationId, 'generation.completed', {
        generationId,
        answer: result.answer ?? null,
        totalLatencyMs: Date.now() - startedAt,
      });
    } catch (err: any) {
      const checkCancelled = await generationRepository.findGenerationById(generationId);
      if (checkCancelled?.status === 'cancelled') return;

      const totalLatencyMs = Date.now() - startedAt;
      await generationRepository
        .updateGeneration(generationId, {
          status: 'failed',
          errorCode: 'GENERATION_FAILED',
          errorMessage: err?.message || 'Generation service unavailable',
          totalLatencyMs,
          completedAt: new Date(),
        })
        .catch(() => {
          /* best-effort; if this also fails the generation stays stuck at 'generating' */
        });
      generationEvents.publish(generationId, 'generation.failed', {
        code: 'GENERATION_FAILED',
        message: err?.message || 'Generation service unavailable',
      });
      console.error(`[generation ${generationId}] pipeline failed`, err?.message || err);
    } finally {
      this.activeControllers.delete(generationId);
    }
  }

  /**
   * Phase 5 Synchronous Conversation Message Flow:
   * Client -> M3 -> persist user message -> create generation -> M2 /generate -> persist assistant message + generation -> return
   */
  public async sendMessage(data: {
    projectId: string;
    conversationId: string;
    query: string;
    requestId?: string;
  }) {
    const { generateId } = await import('../utils/id');
    const requestId = data.requestId || generateId('req');
    const startedAt = Date.now();

    // 1. Persist user message
    const userMsg = await conversationRepository.createMessage({
      conversationId: data.conversationId,
      role: 'user',
      content: data.query,
    });

    // 2. Establish generation record
    const maxRecoveryAttempts = 2;
    const generation = await generationRepository.createGeneration({
      requestId,
      projectId: data.projectId,
      conversationId: data.conversationId,
      query: data.query,
      maxRecoveryAttempts,
    });

    await generationRepository.updateGeneration(generation.id, { status: 'generating' });

    const cleanQuery = data.query.trim();

    // 2a. Conversational Greetings & Casual Chat (Zero retrieval, zero hallucination)
    const GREETING_REGEX = /^\s*(?:hi|hey|hello|heyy+|howdy|greetings|good\s+(?:morning|afternoon|evening|day)|what'?s\s+up|sup|yo)(?:\s+(?:there|groundguard|bot|assistant))?[\s!.,?]*$/i;
    const THANKS_REGEX = /^\s*(?:thanks|thank\s+you|thx|ty|many\s+thanks|much\s+appreciated|thanks\s+a\s+lot|thank\s+you\s+so\s+much)[\s!.,?]*$/i;
    const FAREWELL_REGEX = /^\s*(?:bye|goodbye|see\s+ya|cya|farewell|have\s+a\s+good\s+one|catch\s+you\s+later)[\s!.,?]*$/i;
    const ACK_REGEX = /^\s*(?:ok|okay|cool|great|awesome|understood|got\s+it|nice|perfect|sure|fine)[\s!.,?]*$/i;
    const HELP_REGEX = /^\s*(?:what\s+(?:can|should|to)\s+(?:i|we)\s+ask(?:\s+you)?|what\s+to\s+ask|how\s+(?:do\s+i\s+use\s+this|does\s+(?:this|groundguard)\s+work)|what\s+can\s+you\s+do|what\s+are\s+your\s+capabilities|how\s+can\s+you\s+help|what\s+documents\s+do\s+i\s+have|what\s+is\s+groundguard|help|help\s+me|explain\s+groundguard)[\s!.,?]*$/i;

    if (GREETING_REGEX.test(cleanQuery) || THANKS_REGEX.test(cleanQuery) || FAREWELL_REGEX.test(cleanQuery) || ACK_REGEX.test(cleanQuery)) {
      let reply = "Hey! What would you like to explore in this project? I can help you ask questions from your uploaded knowledge, compare sources, or find evidence for a claim.";
      if (THANKS_REGEX.test(cleanQuery)) {
        reply = "You're welcome! Let me know if you need any more evidence-backed answers from your project knowledge.";
      } else if (FAREWELL_REGEX.test(cleanQuery)) {
        reply = "Goodbye! Whenever you need to investigate technical claims or documentation, I'll be here.";
      } else if (ACK_REGEX.test(cleanQuery)) {
        reply = "Sounds good! Whenever you're ready, ask a question about your project documents.";
      }

      const totalLatencyMs = Date.now() - startedAt;
      const persisted = await generationRepository.persistCompletedGeneration({
        generationId: generation.id,
        projectId: data.projectId,
        status: 'completed',
        answer: reply,
        modelVersion: 'groundguard-conversational',
        metadata: { intent: 'conversational' },
        totalLatencyMs,
        claims: [],
        conversationId: data.conversationId,
      });

      return {
        requestId,
        generationId: generation.id,
        conversationId: data.conversationId,
        status: 'completed' as const,
        answer: reply,
        evidence: [],
        claims: [],
        modelVersion: 'groundguard-conversational',
        metadata: { intent: 'conversational' },
        userMessage: {
          id: userMsg.id,
          conversationId: userMsg.conversationId,
          role: userMsg.role,
          content: userMsg.content,
          createdAt: userMsg.createdAt.toISOString(),
        },
        message: persisted.assistantMessage,
      };
    }

    // 2b. Product & Help Guidance (Uses real project ready documents metadata)
    if (HELP_REGEX.test(cleanQuery)) {
      const { documentRepository } = await import('../repositories/document.repository');
      const docs = await documentRepository.listDocumentsByProjectId(data.projectId);
      const readyDocs = docs.filter((d) => d.status === 'ready');
      const readyCount = readyDocs.length;
      const docLabel = readyCount === 1 ? 'document' : 'documents';

      let reply: string;
      if (readyCount > 0) {
        reply = `You currently have ${readyCount} ready ${docLabel}.\n\nYou can ask me to:\n• explain something from your documents\n• compare information across sources\n• find evidence supporting a claim\n• summarize a topic in this project`;
      } else {
        reply = 'You currently have no ready documents in this project.\n\nUpload technical manuals, datasheets, or PDFs in the Knowledge tab to start asking grounded questions.';
      }

      const totalLatencyMs = Date.now() - startedAt;
      const persisted = await generationRepository.persistCompletedGeneration({
        generationId: generation.id,
        projectId: data.projectId,
        status: 'completed',
        answer: reply,
        modelVersion: 'groundguard-product-help',
        metadata: { intent: 'product_help', readyDocumentCount: readyCount },
        totalLatencyMs,
        claims: [],
        conversationId: data.conversationId,
      });

      return {
        requestId,
        generationId: generation.id,
        conversationId: data.conversationId,
        status: 'completed' as const,
        answer: reply,
        evidence: [],
        claims: [],
        modelVersion: 'groundguard-product-help',
        metadata: { intent: 'product_help', readyDocumentCount: readyCount },
        userMessage: {
          id: userMsg.id,
          conversationId: userMsg.conversationId,
          role: userMsg.role,
          content: userMsg.content,
          createdAt: userMsg.createdAt.toISOString(),
        },
        message: persisted.assistantMessage,
      };
    }

    // 3. Substantive Question: Invoke M2 Grounded Pipeline (Retrieval -> Sufficiency -> Generation -> Claims -> Verification)
    try {
      const result = await aiClient.generate({
        projectId: data.projectId,
        query: data.query,
        requestId,
        generationId: generation.id,
        conversationId: data.conversationId,
      });

      const totalLatencyMs = Date.now() - startedAt;

      if (result.status === 'failed' || result.error) {
        const code = result.error?.code ?? 'GENERATION_FAILED';
        const message = result.error?.message ?? 'Generation failed';
        await generationRepository.updateGeneration(generation.id, {
          status: 'failed',
          errorCode: code,
          errorMessage: message,
          modelVersion: result.modelVersion ?? null,
          metadata: (result.metadata as Record<string, unknown>) ?? null,
          totalLatencyMs,
          completedAt: new Date(),
        });

        const fallbackText =
          result.error?.message ||
          'GroundGuard was unable to generate an answer for this question. Please try rephrasing or check your knowledge base.';
        const assistantMsg = await conversationRepository.createMessage({
          conversationId: data.conversationId,
          role: 'assistant',
          content: fallbackText,
          generationId: generation.id,
        });

        return {
          requestId,
          generationId: generation.id,
          conversationId: data.conversationId,
          status: 'failed' as const,
          answer: fallbackText,
          evidence: result.evidence ?? [],
          sufficiency: result.sufficiency,
          modelVersion: result.modelVersion,
          metadata: result.metadata,
          error: {
            code,
            message,
          },
          userMessage: {
            id: userMsg.id,
            conversationId: userMsg.conversationId,
            role: userMsg.role,
            content: userMsg.content,
            createdAt: userMsg.createdAt.toISOString(),
          },
          message: {
            id: assistantMsg.id,
            conversationId: assistantMsg.conversationId,
            role: assistantMsg.role,
            content: assistantMsg.content,
            generationId: assistantMsg.generationId ?? undefined,
            createdAt: assistantMsg.createdAt.toISOString(),
          },
        };
      }

      // 4. Successful generation / abstention: atomically persist generation, assistant message, claims, evidence
      const persisted = await generationRepository.persistCompletedGeneration({
        generationId: generation.id,
        projectId: data.projectId,
        status: 'verifying',
        answer: result.answer ?? null,
        modelVersion: result.modelVersion ?? null,
        metadata: (result.metadata as Record<string, unknown>) ?? null,
        totalLatencyMs,
        claims: result.claims ?? [],
        conversationId: data.conversationId,
      });

      // Phase 7: Dual-stage Grounding Verification (M1 cross-encoder + deterministic checks)
      await verificationOrchestrator.verifyGenerationClaims(generation.id, requestId);
      const flagged = await this.emitClaimEvents(generation.id);

      // Phase 8: Failure-Aware Agentic Recovery (for failed claims)
      if (maxRecoveryAttempts > 0) {
        if (flagged.size > 0) {
          await generationRepository.updateGeneration(generation.id, { status: 'recovering' });
          generationEvents.publish(generation.id, 'recovery.started', { claims: [...flagged] });
        }
        await recoveryOrchestrator.recoverGenerationClaims(generation.id, requestId);
        if (flagged.size > 0) {
          await this.emitClaimEvents(generation.id, flagged);
          generationEvents.publish(generation.id, 'recovery.completed', { claims: [...flagged] });
        }
      }

      const finalClaims = await verificationOrchestrator.getHydratedClaims(generation.id);

      // Transition generation to completed
      await generationRepository.updateGeneration(generation.id, {
        status: 'completed',
        completedAt: new Date(),
      });

      generationEvents.publish(generation.id, 'generation.completed', {
        generationId: generation.id,
        answer: result.answer ?? null,
        totalLatencyMs: Date.now() - startedAt,
      });

      return {
        requestId,
        generationId: generation.id,
        conversationId: data.conversationId,
        status: 'completed' as const,
        answer: result.answer,
        evidence: result.evidence ?? [],
        sufficiency: result.sufficiency,
        claims: finalClaims,
        modelVersion: result.modelVersion,
        metadata: result.metadata,
        userMessage: {
          id: userMsg.id,
          conversationId: userMsg.conversationId,
          role: userMsg.role,
          content: userMsg.content,
          createdAt: userMsg.createdAt.toISOString(),
        },
        message: persisted.assistantMessage,
      };
    } catch (err: any) {
      const totalLatencyMs = Date.now() - startedAt;
      await generationRepository
        .updateGeneration(generation.id, {
          status: 'failed',
          errorCode: 'SERVICE_UNAVAILABLE',
          errorMessage: err.message || 'Generation service unavailable',
          totalLatencyMs,
          completedAt: new Date(),
        })
        .catch(() => {});

      generationEvents.publish(generation.id, 'generation.failed', {
        code: 'SERVICE_UNAVAILABLE',
        message: err.message || 'Generation service unavailable',
      });

      const fallbackText =
        'GroundGuard was unable to complete grounded verification because the AI inference service is temporarily unreachable. Please check that the service is running, or retry your question.';

      const assistantMsg = await conversationRepository.createMessage({
        conversationId: data.conversationId,
        role: 'assistant',
        content: fallbackText,
        generationId: generation.id,
      });

      return {
        requestId,
        generationId: generation.id,
        conversationId: data.conversationId,
        status: 'failed' as const,
        answer: fallbackText,
        evidence: [],
        claims: [],
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: err.message || 'Generation service unavailable',
        },
        userMessage: {
          id: userMsg.id,
          conversationId: userMsg.conversationId,
          role: userMsg.role,
          content: userMsg.content,
          createdAt: userMsg.createdAt.toISOString(),
        },
        message: {
          id: assistantMsg.id,
          conversationId: assistantMsg.conversationId,
          role: assistantMsg.role,
          content: assistantMsg.content,
          generationId: assistantMsg.generationId ?? undefined,
          createdAt: assistantMsg.createdAt.toISOString(),
        },
      };
    }
  }
}

export const generationOrchestrator = new GenerationOrchestrator();