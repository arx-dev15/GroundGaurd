import { FastifyInstance } from 'fastify';
import { dbManager } from '../plugins/database';
import { redisManager } from '../plugins/redis';
import { aiClient } from '../clients/ai.client';
import { mlClient } from '../clients/ml.client';

export async function healthRoutes(fastify: FastifyInstance) {
  // Liveness check
  fastify.get('/health', async (request, reply) => {
    return reply.status(200).send({ service: 'api', status: 'ok' });
  });

  // Readiness check validating all dependencies
  fastify.get('/health/readiness', async (request, reply) => {
    const [pgResult, redisResult, aiResult, mlResult] = await Promise.all([
      dbManager.checkHealth(),
      redisManager.checkHealth(),
      aiClient.checkHealth(),
      mlClient.checkHealth(),
    ]);

    const dependencies = {
      postgres: pgResult.ok ? { status: 'ok' } : { status: 'error', error: pgResult.error },
      redis: redisResult.ok ? { status: 'ok' } : { status: 'error', error: redisResult.error },
      aiService: !aiResult.ok
        ? { status: 'error', error: aiResult.error }
        : aiResult.status && aiResult.status !== 'ok'
          // e.g. dense retrieval unavailable -> AI service running lexical-only
          ? { status: aiResult.status, retrievalMode: aiResult.retrievalMode, error: aiResult.degradationReason }
          : { status: 'ok' },
      mlService: mlResult.ok ? { status: 'ok' } : { status: 'error', error: mlResult.error },
    };

    const aiOk = aiResult.ok && (!aiResult.status || aiResult.status === 'ok');
    const isAllOk = pgResult.ok && redisResult.ok && aiOk && mlResult.ok;
    const statusCode = isAllOk ? 200 : 503;

    return reply.status(statusCode).send({
      service: 'api',
      status: isAllOk ? 'ok' : 'degraded',
      dependencies,
    });
  });
}
