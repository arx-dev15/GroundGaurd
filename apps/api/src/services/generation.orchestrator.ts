import { generationRepository, DBGeneration } from '../repositories/generation.repository';
import { conversationRepository } from '../repositories/conversation.repository';
import { aiClient } from '../clients/ai.client';
import { verificationOrchestrator } from './verification.orchestrator';
import { recoveryOrchestrator } from './recovery.orchestrator';
import { generationEvents } from './generation-events';
import { performance } from 'node:perf_hooks';

function withStageTimings(
  metadata: Record<string, unknown> | null | undefined,
  timings: Record<string, number | null>,
): Record<string, unknown> {
  const existing = metadata?.stageTimingsMs;
  return {
    ...(metadata ?? {}),
    stageTimingsMs: {
      ...(existing && typeof existing === 'object' ? existing : {}),
      ...timings,
    },
  };
}

export class GenerationOrchestrator {
  private activeControllers = new Map<string, AbortController>();

  public async createGeneration(data: {
    projectId: string;
    conversationId?: string | null;
    query: string;
    maxRecoveryAttempts: number;
    requestId?: string;
  }): Promise<DBGeneration> {
    const { generateId } = await import('../utils/id');
    const requestId = data.requestId || generateId('req');

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
    generationEvents.markCancelled(generationId);

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
    const startedAt = performance.now();
    const generation = await generationRepository.findGenerationById(generationId);
    if (!generation) return; // shouldn't happen, we just created it

    if (await generationEvents.isCancelled(generationId)) return;

    const abortController = new AbortController();
    this.activeControllers.set(generationId, abortController);

    try {
      await generationRepository.updateGeneration(generationId, { status: 'generating' });
      generationEvents.publish(generationId, 'generation.started', {
        generationId,
        requestId: generation.requestId,
      });

      // Fetch bounded recent conversation history for interpretation context if in a conversation
      let conversationContext: Array<{ role: 'user' | 'assistant'; content: string }> | undefined = undefined;
      if (generation.conversationId) {
        try {
          const priorMessages = await conversationRepository.listMessagesByConversationId(generation.conversationId);
          const validPrior = priorMessages
            .filter(
              (m) =>
                m.content !== generation.query &&
                !m.content.startsWith('GroundGuard was unable') &&
                !m.content.startsWith('EVIDEX was unable') &&
                !m.content.startsWith('EvideX was unable') &&
                !m.content.startsWith('Generation service unavailable')
            )
            .slice(-6);

          const ctx: Array<{ role: 'user' | 'assistant'; content: string }> = [];
          let totalChars = 0;
          for (let i = validPrior.length - 1; i >= 0; i--) {
            const m = validPrior[i];
            const cappedContent =
              m.role === 'assistant' && m.content.length > 400
                ? m.content.slice(0, 400) + '...'
                : m.content;

            if (totalChars + cappedContent.length > 1500 && ctx.length > 0) {
              break;
            }

            ctx.unshift({
              role: m.role as 'user' | 'assistant',
              content: cappedContent,
            });
            totalChars += cappedContent.length;
          }
          if (ctx.length > 0) conversationContext = ctx;
        } catch (_) {}
      }

      const result = await aiClient.generateStream(
        {
          projectId: generation.projectId,
          query: generation.query,
          requestId: generation.requestId,
          generationId: generation.id,
          conversationId: generation.conversationId ?? undefined,
          conversationContext,
          options: { maxRecoveryAttempts: generation.maxRecoveryAttempts },
        },
        (eventType, eventData) => {
          // Forward stream events through canonical SSE bus
          if (eventType === 'planning.started' || eventType === 'planning.completed' || eventType === 'retrieval.completed' || eventType === 'answer.started' || eventType === 'answer.delta' || eventType === 'answer.completed') {
            generationEvents.publish(generationId, eventType, eventData);
          }
        },
        generation.requestId,
        abortController.signal
      );

      // Check if cancelled while M2 /generate was running
      if (await generationEvents.isCancelled(generationId) || abortController.signal.aborted) return;
      const postGen = await generationRepository.findGenerationById(generationId);
      if (postGen?.status === 'cancelled') return;

      const totalLatencyMs = Math.round(performance.now() - startedAt);

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
      if (await generationEvents.isCancelled(generationId) || abortController.signal.aborted) return;
      const postPersist = await generationRepository.findGenerationById(generationId);
      if (postPersist?.status === 'cancelled') return;

      // Phase 7: Dual-stage Grounding Verification (M1 cross-encoder + deterministic checks)
      const verificationStarted = performance.now();
      await verificationOrchestrator.verifyGenerationClaims(generationId, generation.requestId);
      const verificationLatencyMs = Math.round(performance.now() - verificationStarted);
      const flagged = await this.emitClaimEvents(generationId);

      // Check if cancelled before recovery
      if (await generationEvents.isCancelled(generationId) || abortController.signal.aborted) return;
      const postVerify = await generationRepository.findGenerationById(generationId);
      if (postVerify?.status === 'cancelled') return;

      // Phase 8: Failure-Aware Agentic Recovery (for failed claims)
      const recoveryStarted = performance.now();
      if (generation.maxRecoveryAttempts > 0) {
        if (flagged.size > 0) {
          await generationRepository.updateGeneration(generationId, { status: 'recovering' });
          generationEvents.publish(generationId, 'recovery.started', { claims: [...flagged] });
        }
        const recoveryOutcome = await recoveryOrchestrator.recoverGenerationClaims(generationId, generation.requestId);
        if (flagged.size > 0) {
          await this.emitClaimEvents(generationId, flagged);
          generationEvents.publish(generationId, 'recovery.completed', {
            claims: [...flagged],
            recoveredCount: recoveryOutcome.recoveredCount,
            attempts: recoveryOutcome.totalAttempts,
            stoppedReason: recoveryOutcome.stoppedReason ?? null, // 'time_budget' | 'attempt_budget' | 'cancelled' | null
          });
        }
      }
      const recoveryLatencyMs = Math.round(performance.now() - recoveryStarted);

      // Final check if cancelled
      if (await generationEvents.isCancelled(generationId) || abortController.signal.aborted) return;
      const preComplete = await generationRepository.findGenerationById(generationId);
      if (preComplete?.status === 'cancelled') return;

      // Transition to completed
      const completedAt = Math.round(performance.now() - startedAt);
      const completedMetadata = withStageTimings(
        (result.metadata as Record<string, unknown>) ?? null,
        { m1Verification: verificationLatencyMs, recovery: recoveryLatencyMs, total: completedAt },
      );
      await generationRepository.updateGeneration(generationId, {
        status: 'completed',
        metadata: completedMetadata,
        verificationLatencyMs,
        totalLatencyMs: completedAt,
        completedAt: new Date(),
      });

      generationEvents.publish(generationId, 'generation.completed', {
        generationId,
        answer: result.answer ?? null,
        totalLatencyMs: completedAt,
      });
    } catch (err: any) {
      if (await generationEvents.isCancelled(generationId) || abortController.signal.aborted || err?.name === 'AbortError') return;
      const checkCancelled = await generationRepository.findGenerationById(generationId);
      if (checkCancelled?.status === 'cancelled') return;

      const totalLatencyMs = Math.round(performance.now() - startedAt);
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
    const startedAt = performance.now();

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

    // 2. Delegate all user queries directly to M2 via aiClient.generate
    // Single Assistant Language Owner: M2 owns natural language understanding, query planning,
    // conversational/product-help responses, and grounded generation. M3 owns orchestration, auth,
    // persistence, and SSE events.
    try {
      // Fetch bounded recent conversation history for interpretation context (up to 6 turns, max 1500 chars)
      // Prioritize the most recent messages first so immediate context is never starved
      let conversationContext: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      try {
        const priorMessages = await conversationRepository.listMessagesByConversationId(data.conversationId);
        const validPrior = priorMessages
          .filter(
            (m) =>
              m.id !== userMsg.id &&
              !m.content.startsWith('GroundGuard was unable') &&
              !m.content.startsWith('EVIDEX was unable') &&
              !m.content.startsWith('EvideX was unable') &&
              !m.content.startsWith('Generation service unavailable')
          )
          .slice(-6);

        let totalChars = 0;
        for (let i = validPrior.length - 1; i >= 0; i--) {
          const m = validPrior[i];
          const cappedContent =
            m.role === 'assistant' && m.content.length > 400
              ? m.content.slice(0, 400) + '...'
              : m.content;

          if (totalChars + cappedContent.length > 1500 && conversationContext.length > 0) {
            break;
          }

          conversationContext.unshift({
            role: m.role as 'user' | 'assistant',
            content: cappedContent,
          });
          totalChars += cappedContent.length;
        }
      } catch (_) {
        // Fallback: continue without context if prior message fetch fails
      }

      const result = await aiClient.generateStream(
        {
          projectId: data.projectId,
          query: data.query,
          requestId,
          generationId: generation.id,
          conversationId: data.conversationId,
          conversationContext: conversationContext.length > 0 ? conversationContext : undefined,
        },
        (eventType, eventData) => {
          if (eventType === 'planning.started' || eventType === 'planning.completed' || eventType === 'retrieval.completed' || eventType === 'answer.started' || eventType === 'answer.delta' || eventType === 'answer.completed') {
            generationEvents.publish(generation.id, eventType, eventData);
          }
        },
        requestId
      );

      const totalLatencyMs = Math.round(performance.now() - startedAt);

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

        generationEvents.publish(generation.id, 'generation.failed', {
          code,
          message,
        });

        return {
          requestId,
          generationId: generation.id,
          conversationId: data.conversationId,
          status: 'failed' as const,
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
          message: null as any,
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
      let finalClaims: any[] = [];
      let verificationLatencyMs = 0;
      let recoveryLatencyMs = 0;
      if (result.claims && result.claims.length > 0) {
        const verificationStarted = performance.now();
        await verificationOrchestrator.verifyGenerationClaims(generation.id, requestId);
        verificationLatencyMs = Math.round(performance.now() - verificationStarted);
        const flagged = await this.emitClaimEvents(generation.id);

        // Phase 8: Failure-Aware Agentic Recovery (for failed claims)
        if (maxRecoveryAttempts > 0) {
          const recoveryStarted = performance.now();
          if (flagged.size > 0) {
            await generationRepository.updateGeneration(generation.id, { status: 'recovering' });
            generationEvents.publish(generation.id, 'recovery.started', { claims: [...flagged] });
          }
          const recoveryOutcome = await recoveryOrchestrator.recoverGenerationClaims(generation.id, requestId);
          if (flagged.size > 0) {
            await this.emitClaimEvents(generation.id, flagged);
            generationEvents.publish(generation.id, 'recovery.completed', {
              claims: [...flagged],
              recoveredCount: recoveryOutcome.recoveredCount,
              attempts: recoveryOutcome.totalAttempts,
              stoppedReason: recoveryOutcome.stoppedReason ?? null,
            });
          }
          recoveryLatencyMs = Math.round(performance.now() - recoveryStarted);
        }

        finalClaims = await verificationOrchestrator.getHydratedClaims(generation.id);
      }

      // Transition generation to completed
      const completedAt = Math.round(performance.now() - startedAt);
      const completedMetadata = withStageTimings(
        (result.metadata as Record<string, unknown>) ?? null,
        { m1Verification: verificationLatencyMs, recovery: recoveryLatencyMs, total: completedAt },
      );
      await generationRepository.updateGeneration(generation.id, {
        status: 'completed',
        metadata: completedMetadata,
        verificationLatencyMs,
        totalLatencyMs: completedAt,
        completedAt: new Date(),
      });

      generationEvents.publish(generation.id, 'generation.completed', {
        generationId: generation.id,
        answer: result.answer ?? null,
        totalLatencyMs: completedAt,
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
      const errStr = (err.message || '').toLowerCase();
      let code = 'SERVICE_UNAVAILABLE';
      if (errStr.includes('ai') || errStr.includes('inference') || errStr.includes('8000')) {
        code = 'AI_SERVICE_UNAVAILABLE';
      } else if (errStr.includes('ml') || errStr.includes('verif') || errStr.includes('8001') || errStr.includes('deberta')) {
        code = 'VERIFICATION_SERVICE_UNAVAILABLE';
      } else if (errStr.includes('retriev') || errStr.includes('qdrant') || errStr.includes('tantivy')) {
        code = 'RETRIEVAL_UNAVAILABLE';
      } else if (errStr.includes('gemini') || errStr.includes('provider')) {
        code = 'GENERATION_PROVIDER_UNAVAILABLE';
      }

      const totalLatencyMs = Math.round(performance.now() - startedAt);
      await generationRepository
        .updateGeneration(generation.id, {
          status: 'failed',
          errorCode: code,
          errorMessage: err.message || 'Generation service unavailable',
          totalLatencyMs,
          completedAt: new Date(),
        })
        .catch(() => {});

      generationEvents.publish(generation.id, 'generation.failed', {
        code,
        message: err.message || 'Generation service unavailable',
      });

      return {
        requestId,
        generationId: generation.id,
        conversationId: data.conversationId,
        status: 'failed' as const,
        evidence: [],
        claims: [],
        error: {
          code,
          message: err.message || 'Generation service unavailable',
        },
        userMessage: {
          id: userMsg.id,
          conversationId: userMsg.conversationId,
          role: userMsg.role,
          content: userMsg.content,
          createdAt: userMsg.createdAt.toISOString(),
        },
        message: null as any,
      };
    }
  }
}

export const generationOrchestrator = new GenerationOrchestrator();