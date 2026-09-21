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
      aiService: aiResult.ok ? { status: 'ok' } : { status: 'error', error: aiResult.error },
      mlService: mlResult.ok ? { status: 'ok' } : { status: 'error', error: mlResult.error },
    };

    const isAllOk = pgResult.ok && redisResult.ok && aiResult.ok && mlResult.ok;
    const statusCode = isAllOk ? 200 : 503;

    return reply.status(statusCode).send({
      service: 'api',
      status: isAllOk ? 'ok' : 'degraded',
      dependencies,
    });
  });
}
