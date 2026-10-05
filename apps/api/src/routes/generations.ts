import { FastifyInstance } from 'fastify';
import { authenticate, assertProjectAuthorized } from '../middleware/auth';
import { generationRateLimiter, claimRetryRateLimiter } from '../middleware/rate-limit';
import { projectRepository } from '../repositories/project.repository';
import { conversationRepository } from '../repositories/conversation.repository';
import {
  generationRepository,
  DBGeneration,
  DBClaim,
  DBEvidence,
  DBRecoveryAttempt,
} from '../repositories/generation.repository';
import { generationOrchestrator } from '../services/generation.orchestrator';
import { recoveryOrchestrator } from '../services/recovery.orchestrator';
import { generationEvents } from '../services/generation-events';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { Claim, Evidence, RecoveryAttempt } from '@groundguard/contracts';

const MAX_QUERY_LENGTH = 2000;
const MAX_RECOVERY_ATTEMPTS_LIMIT = 5;

function toGenerationResult(g: DBGeneration) {
  return {
    requestId: g.requestId,
    generationId: g.id,
    status: g.status,
    answer: g.answer ?? undefined,
    error: g.errorCode ? { code: g.errorCode, message: g.errorMessage ?? '' } : undefined,
  };
}

function toPublicClaim(c: DBClaim, evidence: DBEvidence[] = []): Claim {
  const claim: Claim = {
    claimId: c.id,
    externalClaimId: c.externalClaimId ?? undefined,
    text: c.text,
    status: c.status,
    ordinal: c.claimIndex,
    evidence: evidence.map(toPublicEvidence),
  };
  if (c.label) {
    claim.verification = {
      label: c.label,
      scores: {
        entailment: c.entailmentScore ?? 0,
        contradiction: c.contradictionScore ?? 0,
        neutral: c.neutralScore ?? 0,
      },
      groundingScore: c.groundingScore ?? 0,
      modelVersion: c.modelVersion ?? '',
    };
  }
  return claim;
}

function toPublicEvidence(e: DBEvidence): Evidence {
  const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : (e.metadata ?? {});
  return {
    evidenceId: e.id,
    chunkId: e.chunkId,
    documentId: e.documentId ?? undefined,
    text: e.text,
    metadata: meta,
    pageNumber: (meta?.pageNumber as number) ?? undefined,
    section: (meta?.section as string) ?? undefined,
    heading: (meta?.heading as string) ?? undefined,
  };
}

function toPublicRecoveryAttempt(r: DBRecoveryAttempt): RecoveryAttempt {
  let ev: any = undefined;
  if (r.recoveryEvidence) {
    ev = typeof r.recoveryEvidence === 'string' ? JSON.parse(r.recoveryEvidence) : r.recoveryEvidence;
  }
  return {
    id: r.id,
    claimId: r.claimId,
    attemptNumber: r.attemptNumber,
    failureReason: r.failureReason,
    action: (r.action as any) || 'revise',
    originalText: r.originalText,
    candidateText: r.candidateText,
    verificationLabel: r.verificationLabel,
    entailmentScore: r.entailmentScore,
    contradictionScore: r.contradictionScore,
    neutralScore: r.neutralScore,
    groundingScore: r.groundingScore,
    modelVersion: r.modelVersion,
    recoveryModelVersion: r.recoveryModelVersion,
    recoveryEvidence: ev,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function generationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // POST /v1/projects/:projectId/generations
  fastify.post('/v1/projects/:projectId/generations', { preHandler: [generationRateLimiter] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.user!.id;

    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');
    assertProjectAuthorized(request, projectId);

    const body = request.body as {
      query?: unknown;
      conversationId?: unknown;
      options?: { stream?: unknown; maxRecoveryAttempts?: unknown };
    };

    if (!body || typeof body !== 'object') throw new BadRequestError('Request body must be a JSON object');
    if (typeof body.query !== 'string' || body.query.trim().length === 0) {
      throw new BadRequestError('query is required and must be a non-empty string');
    }
    if (body.query.length > MAX_QUERY_LENGTH) {
      throw new BadRequestError(`query must be at most ${MAX_QUERY_LENGTH} characters`);
    }

    let conversationId: string | undefined;
    if (body.conversationId !== undefined) {
      if (typeof body.conversationId !== 'string') throw new BadRequestError('conversationId must be a string');
      const conv = await conversationRepository.findConversationByIdAndUserId(body.conversationId, userId);
      if (!conv || conv.projectId !== projectId) throw new NotFoundError('Conversation not found');
      conversationId = conv.id;
    }

    let maxRecoveryAttempts = 2;
    if (body.options?.maxRecoveryAttempts !== undefined) {
      const v = body.options.maxRecoveryAttempts;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_RECOVERY_ATTEMPTS_LIMIT) {
        throw new BadRequestError(`options.maxRecoveryAttempts must be an integer between 0 and ${MAX_RECOVERY_ATTEMPTS_LIMIT}`);
      }
      maxRecoveryAttempts = v;
    }

    const generation = await generationOrchestrator.createGeneration({
      projectId,
      conversationId,
      query: body.query.trim(),
      maxRecoveryAttempts,
      requestId: request.requestId,
    });

    return reply.status(202).send(toGenerationResult(generation));
  });

  // GET /v1/generations/:generationId
  fastify.get('/v1/generations/:generationId', async (request, reply) => {
    const { generationId } = request.params as { generationId: string };
    const userId = request.user!.id;

    const generation = await generationRepository.findGenerationByIdAndUserId(generationId, userId);
    if (!generation) throw new NotFoundError('Generation not found');
    assertProjectAuthorized(request, generation.projectId);

    return reply.status(200).send(toGenerationResult(generation));
  });

  // GET /v1/generations/:generationId/claims
  fastify.get('/v1/generations/:generationId/claims', async (request, reply) => {
    const { generationId } = request.params as { generationId: string };
    const userId = request.user!.id;

    const generation = await generationRepository.findGenerationByIdAndUserId(generationId, userId);
    if (!generation) throw new NotFoundError('Generation not found');
    assertProjectAuthorized(request, generation.projectId);

    const claims = await generationRepository.listClaimsByGenerationId(generationId);
    const withEvidence = await Promise.all(
      claims.map(async (c) => toPublicClaim(c, await generationRepository.listEvidenceByClaimId(c.id)))
    );

    return reply.status(200).send({ claims: withEvidence });
  });

  // GET /v1/claims/:claimId
  fastify.get('/v1/claims/:claimId', async (request, reply) => {
    const { claimId } = request.params as { claimId: string };
    const userId = request.user!.id;

    const claim = await generationRepository.findClaimByIdAndUserId(claimId, userId);
    if (!claim) throw new NotFoundError('Claim not found');
    const gen = await generationRepository.findGenerationById(claim.generationId);
    if (gen) assertProjectAuthorized(request, gen.projectId);

    const evidence = await generationRepository.listEvidenceByClaimId(claim.id);
    return reply.status(200).send({ claim: toPublicClaim(claim, evidence) });
  });

  // GET /v1/claims/:claimId/evidence
  fastify.get('/v1/claims/:claimId/evidence', async (request, reply) => {
    const { claimId } = request.params as { claimId: string };
    const userId = request.user!.id;

    const claim = await generationRepository.findClaimByIdAndUserId(claimId, userId);
    if (!claim) throw new NotFoundError('Claim not found');
    const gen = await generationRepository.findGenerationById(claim.generationId);
    if (gen) assertProjectAuthorized(request, gen.projectId);

    const evidence = await generationRepository.listEvidenceByClaimId(claim.id);
    return reply.status(200).send({ evidence: evidence.map(toPublicEvidence) });
  });

  // GET /v1/claims/:claimId/recovery-attempts
  fastify.get('/v1/claims/:claimId/recovery-attempts', async (request, reply) => {
    const { claimId } = request.params as { claimId: string };
    const userId = request.user!.id;

    const claim = await generationRepository.findClaimByIdAndUserId(claimId, userId);
    if (!claim) throw new NotFoundError('Claim not found');
    const gen = await generationRepository.findGenerationById(claim.generationId);
    if (gen) assertProjectAuthorized(request, gen.projectId);

    const attempts = await generationRepository.listRecoveryAttemptsByClaimId(claim.id);
    return reply.status(200).send({ recoveryAttempts: attempts.map(toPublicRecoveryAttempt) });
  });

  // POST /v1/claims/:claimId/retry
  fastify.post('/v1/claims/:claimId/retry', async (request, reply) => {
    const { claimId } = request.params as { claimId: string };
    const userId = request.user!.id;

    const claim = await generationRepository.findClaimByIdAndUserId(claimId, userId);
    if (!claim) throw new NotFoundError('Claim not found');

    if (claim.status !== 'flagged' && claim.status !== 'needs_review') {
      throw new BadRequestError(`Claim '${claimId}' is in '${claim.status}' state and is not eligible for recovery`);
    }

    const generation = await generationRepository.findGenerationById(claim.generationId);
    if (!generation) throw new NotFoundError('Generation not found');
    assertProjectAuthorized(request, generation.projectId);

    const existingEvidence = await generationRepository.listEvidenceByClaimId(claim.id);
    const existingAttempts = await generationRepository.listRecoveryAttemptsByClaimId(claim.id);

    const maxRecoveryAttempts = generation.maxRecoveryAttempts || 2;
    if (existingAttempts.length >= maxRecoveryAttempts) {
      throw new BadRequestError(`Recovery attempt limit reached (${maxRecoveryAttempts} attempts maximum).`);
    }

    const result = await recoveryOrchestrator.recoverClaim({
      projectId: generation.projectId,
      generationId: generation.id,
      claim,
      existingEvidence,
      requestId: generation.requestId,
      startAttempt: existingAttempts.length + 1,
      maxAttempts: 1,
    });

    if (result.attempts > 0) {
      await generationRepository.updateGeneration(generation.id, {
        recoveryAttempts: (generation.recoveryAttempts ?? 0) + result.attempts,
      }).catch(() => {});
    }

    const updatedClaim = await generationRepository.findClaimByIdAndUserId(claimId, userId);
    const updatedEvidence = await generationRepository.listEvidenceByClaimId(claim.id);
    const updatedAttempts = await generationRepository.listRecoveryAttemptsByClaimId(claim.id);

    return reply.status(200).send({
      claim: toPublicClaim(updatedClaim || result.finalClaim, updatedEvidence),
      recoveryAttempts: updatedAttempts.map(toPublicRecoveryAttempt),
    });
  });

  // GET /v1/generations/:generationId/events
  fastify.get('/v1/generations/:generationId/events', async (request, reply) => {
    const { generationId } = request.params as { generationId: string };
    const userId = request.user!.id;

    const generation = await generationRepository.findGenerationByIdAndUserId(generationId, userId);
    if (!generation) throw new NotFoundError('Generation not found');
    assertProjectAuthorized(request, generation.projectId);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': request.headers.origin || '*',
      'Access-Control-Allow-Credentials': 'true',
    });

    const lastEventIdStr = request.headers['last-event-id'];
    const lastEventId = typeof lastEventIdStr === 'string' ? parseInt(lastEventIdStr, 10) : 0;

    const history = generationEvents.history(generationId);
    for (const evt of history) {
      if (!Number.isNaN(lastEventId) && evt.id <= lastEventId) continue;
      reply.raw.write(`id: ${evt.id}\nevent: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
    }

    if (generationEvents.isTerminal(generationId) || generation.status === 'completed' || generation.status === 'failed' || generation.status === 'cancelled') {
      if (history.length === 0) {
        const terminalEvent = generation.status === 'completed' ? 'generation.completed' : 'generation.failed';
        const terminalData: Record<string, unknown> = { generationId, answer: generation.answer };
        if (generation.status === 'cancelled') {
          terminalData.code = 'GENERATION_CANCELLED';
          terminalData.message = 'Generation was cancelled by user';
        }
        reply.raw.write(`id: 1\nevent: ${terminalEvent}\ndata: ${JSON.stringify(terminalData)}\n\n`);
      }
      reply.raw.end();
      return;
    }

    const unsubscribe = generationEvents.subscribe(generationId, (evt) => {
      reply.raw.write(`id: ${evt.id}\nevent: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
      if (evt.event === 'generation.completed' || evt.event === 'generation.failed') {
        reply.raw.end();
      }
    });

    request.raw.on('close', () => {
      unsubscribe();
    });
  });

  // POST /v1/generations/:generationId/cancel
  fastify.post('/v1/generations/:generationId/cancel', async (request, reply) => {
    const { generationId } = request.params as { generationId: string };
    const userId = request.user!.id;

    const generation = await generationRepository.findGenerationByIdAndUserId(generationId, userId);
    if (!generation) throw new NotFoundError('Generation not found');
    assertProjectAuthorized(request, generation.projectId);

    const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
    if (TERMINAL_STATUSES.has(generation.status)) {
      throw new BadRequestError(`Cannot cancel generation in '${generation.status}' state`);
    }

    const cancelled = await generationOrchestrator.cancelGeneration(generationId);
    return reply.status(200).send(toGenerationResult(cancelled));
  });
}