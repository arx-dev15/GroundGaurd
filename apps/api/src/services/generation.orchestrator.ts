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

      // Persist whatever claims/evidence M2 returned. Currently always [] (placeholder),
      // but this loop needs no changes when M2's real Phase 5 generation ships.
      const claims = result.claims ?? [];
      for (let idx = 0; idx < claims.length; idx++) {
        const c = claims[idx];
        const dbClaim = await generationRepository.createClaim({
          generationId,
          externalClaimId: c.claimId,
          claimIndex: idx,
          text: c.text,
          status: c.status ?? 'pending',
          label: c.verification?.label ?? null,
          entailmentScore: c.verification?.scores.entailment ?? null,
          contradictionScore: c.verification?.scores.contradiction ?? null,
          neutralScore: c.verification?.scores.neutral ?? null,
          groundingScore: c.verification?.groundingScore ?? null,
          modelVersion: c.verification?.modelVersion ?? null,
        });

        for (const ev of c.evidence ?? []) {
          await generationRepository.createEvidence({
            claimId: dbClaim.id,
            chunkId: ev.chunkId,
            documentId: ev.documentId ?? null,
            text: ev.text,
            metadata: ev.metadata ?? {},
          });
        }
      }

      await generationRepository.updateGeneration(generationId, {
        status: 'completed',
        answer: result.answer ?? null,
        totalLatencyMs,
        generationLatencyMs: totalLatencyMs,
        completedAt: new Date(),
      });

      if (generation.conversationId && result.answer) {
        await conversationRepository.createMessage({
          conversationId: generation.conversationId,
          role: 'assistant',
          content: result.answer,
          generationId,
        });
      }
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
}

export const generationOrchestrator = new GenerationOrchestrator();