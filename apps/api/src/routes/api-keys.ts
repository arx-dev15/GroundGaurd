import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { authenticate, assertProjectAuthorized } from '../middleware/auth';
import { apiKeyRepository, DBApiKey } from '../repositories/api-key.repository';
import { projectRepository } from '../repositories/project.repository';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { ApiKey, CreateApiKeyResponse, ApiKeyListResponse } from '@groundguard/contracts';


function toPublicApiKey(k: DBApiKey): ApiKey {
  return {
    id: k.id,
    name: k.name,
    projectId: k.projectId,
    keyPrefix: k.keyPrefix,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
    createdAt: k.createdAt.toISOString(),
  };
}


export async function apiKeyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);


  // POST/v1/api-keys
  fastify.post('/v1/api-keys', async (request, reply) => {
    const userId = request.user!.id;
    const body = request.body as { name?: unknown; projectId?: unknown; expiresAt?: unknown };


    if (!body || typeof body !== 'object') {
      throw new BadRequestError('Request body must be a JSON object');
    }


    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new BadRequestError('name is required and must be a non-empty string');
    }
    if (body.name.length > 255) {
      throw new BadRequestError('name must not exceed 255 characters');
    }


    let projectId: string | undefined;
    if (body.projectId !== undefined) {
      if (typeof body.projectId !== 'string') {
        throw new BadRequestError('projectId must be a string');
      }
      assertProjectAuthorized(request, body.projectId);
      const project = await projectRepository.findProjectByIdAndUserId(body.projectId, userId);
      if (!project) {
        throw new NotFoundError('Project not found');
      }
      projectId = project.id;
    }


    let expiresAt: Date | undefined;
    if (body.expiresAt !== undefined) {
      if (typeof body.expiresAt !== 'string') {
        throw new BadRequestError('expiresAt must be an ISO date string');
      }
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestError('expiresAt must be a valid date');
      }
      expiresAt = parsed;
    }


    const randomSecret = 'gg_' + crypto.randomBytes(32).toString('hex');
    const keyPrefix = randomSecret.substring(0, 10) + '...';
    const keyHash = crypto.createHash('sha256').update(randomSecret).digest('hex');


    const created = await apiKeyRepository.createApiKey({
      userId,
      name: body.name.trim(),
      projectId,
      keyPrefix,
      keyHash,
      expiresAt,
    });


    const res: CreateApiKeyResponse = {
      apiKey: toPublicApiKey(created),
      secretKey: randomSecret,
    };


    return reply.status(201).send(res);
  });


  // GET/v1/api-keys
  fastify.get('/v1/api-keys', async (request, reply) => {
    const userId = request.user!.id;
    const keys = await apiKeyRepository.listApiKeysByUserId(userId);
    const res: ApiKeyListResponse = {
      apiKeys: keys.map(toPublicApiKey),
    };
    return reply.status(200).send(res);
  });


  // DELETE /v1/api-keys/:keyId
  fastify.delete('/v1/api-keys/:keyId', async (request, reply) => {
    const userId = request.user!.id;
    const { keyId } = request.params as { keyId: string };

    const success = await apiKeyRepository.revokeApiKey(keyId, userId);
    if (!success) {
      throw new NotFoundError('API key not found');
    }

    return reply.status(200).send({ success: true });
  });
}
