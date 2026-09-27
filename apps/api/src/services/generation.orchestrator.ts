import { generationRepository, DBGeneration } from '../repositories/generation.repository';
import { conversationRepository } from '../repositories/conversation.repository';
import { aiClient } from '../clients/ai.client';

export class GenerationOrchestrator {
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

  private async runPipeline(generationId: string): Promise<void> {
    const startedAt = Date.now();
    const generation = await generationRepository.findGenerationById(generationId);
    if (!generation) return; // shouldn't happen, we just created it

    try {
      await generationRepository.updateGeneration(generationId, { status: 'generating' });

      const result = await aiClient.generate({
        projectId: generation.projectId,
        query: generation.query,
        requestId: generation.requestId,
        generationId: generation.id,
        options: { maxRecoveryAttempts: generation.maxRecoveryAttempts },
      });

      const totalLatencyMs = Date.now() - startedAt;

      if (result.status === 'failed' || result.error) {
        await generationRepository.updateGeneration(generationId, {
          status: 'failed',
          errorCode: result.error?.code ?? 'GENERATION_FAILED',
          errorMessage: result.error?.message ?? 'Generation service returned a failure',
          totalLatencyMs,
          completedAt: new Date(),
        });
        return;
      }

      // Atomic Phase 6 persistence: generation update, claims, and claim evidence provenance
      await generationRepository.persistCompletedGeneration({
        generationId,
        projectId: generation.projectId,
        answer: result.answer ?? null,
        modelVersion: result.modelVersion ?? null,
        metadata: (result.metadata as Record<string, unknown>) ?? null,
        totalLatencyMs,
        claims: result.claims ?? [],
        conversationId: generation.conversationId,
      });
    } catch (err: any) {
      const totalLatencyMs = Date.now() - startedAt;
      await generationRepository
        .updateGeneration(generationId, {
          status: 'failed',
          errorCode: 'GENERATION_FAILED',
          errorMessage: 'Generation service unavailable',
          totalLatencyMs,
          completedAt: new Date(),
        })
        .catch(() => {
          /* best-effort; if this also fails the generation stays stuck at 'generating' */
        });
      console.error(`[generation ${generationId}] pipeline failed`, err?.message || err);
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
    const generation = await generationRepository.createGeneration({
      requestId,
      projectId: data.projectId,
      conversationId: data.conversationId,
      query: data.query,
      maxRecoveryAttempts: 0,
    });

    await generationRepository.updateGeneration(generation.id, { status: 'generating' });

    // 3. Invoke M2 /generate directly
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
        await generationRepository.updateGeneration(generation.id, {
          status: 'failed',
          errorCode: result.error?.code ?? 'GENERATION_FAILED',
          errorMessage: result.error?.message ?? 'Generation failed',
          modelVersion: result.modelVersion ?? null,
          metadata: (result.metadata as Record<string, unknown>) ?? null,
          totalLatencyMs,
          completedAt: new Date(),
        });

        return {
          requestId,
          generationId: generation.id,
          conversationId: data.conversationId,
          status: 'failed' as const,
          answer: undefined,
          evidence: result.evidence ?? [],
          sufficiency: result.sufficiency,
          modelVersion: result.modelVersion,
          metadata: result.metadata,
          error: result.error ?? {
            code: 'GENERATION_FAILED',
            message: 'Generation failed',
          },
          userMessage: {
            id: userMsg.id,
            conversationId: userMsg.conversationId,
            role: userMsg.role,
            content: userMsg.content,
            createdAt: userMsg.createdAt.toISOString(),
          },
        };
      }

      // 4. Successful generation / abstention: atomically persist generation, assistant message, claims, evidence
      const persisted = await generationRepository.persistCompletedGeneration({
        generationId: generation.id,
        projectId: data.projectId,
        answer: result.answer ?? null,
        modelVersion: result.modelVersion ?? null,
        metadata: (result.metadata as Record<string, unknown>) ?? null,
        totalLatencyMs,
        claims: result.claims ?? [],
        conversationId: data.conversationId,
      });

      return {
        requestId,
        generationId: generation.id,
        conversationId: data.conversationId,
        status: 'completed' as const,
        answer: result.answer,
        evidence: result.evidence ?? [],
        sufficiency: result.sufficiency,
        claims: result.claims ?? [],
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

      throw err;
    }
  }
}

export const generationOrchestrator = new GenerationOrchestrator();