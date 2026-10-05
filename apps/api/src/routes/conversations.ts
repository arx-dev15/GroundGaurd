import { FastifyInstance } from 'fastify';
import { authenticate, assertProjectAuthorized } from '../middleware/auth';
import { projectRepository } from '../repositories/project.repository';
import {
  conversationRepository,
  DBConversation,
  DBMessage,
} from '../repositories/conversation.repository';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { Conversation, Message } from '@groundguard/contracts';
import { generationOrchestrator } from '../services/generation.orchestrator';

const DEFAULT_TITLE = 'New conversation';
const MAX_TITLE_LENGTH = 255;

function toPublicConversation(c: DBConversation): Conversation {
  return {
    id: c.id,
    projectId: c.projectId,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toPublicMessage(m: DBMessage): Message {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    generationId: m.generationId || undefined,
    createdAt: m.createdAt.toISOString(),
  };
}

function parseTitle(body: unknown): string {
  if (body === undefined || body === null) return DEFAULT_TITLE;
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestError('Request body must be a JSON object');
  }
  const { title } = body as { title?: unknown };
  if (title === undefined || title === null) return DEFAULT_TITLE;
  if (typeof title !== 'string') throw new BadRequestError('title must be a string');

  const trimmed = title.trim();
  if (trimmed.length === 0) return DEFAULT_TITLE;
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new BadRequestError(`title must be at most ${MAX_TITLE_LENGTH} characters`);
  }
  return trimmed;
}

export async function conversationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // POST /v1/projects/:projectId/conversations
  fastify.post('/v1/projects/:projectId/conversations', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.user!.id;

    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');
    assertProjectAuthorized(request, projectId);

    const title = parseTitle(request.body);
    const conversation = await conversationRepository.createConversation({ projectId, title });

    return reply.status(201).send({ conversation: toPublicConversation(conversation) });
  });

  // GET /v1/projects/:projectId/conversations
  fastify.get('/v1/projects/:projectId/conversations', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.user!.id;

    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');
    assertProjectAuthorized(request, projectId);

    const rows = await conversationRepository.listConversationsByProjectId(projectId);
    return reply.status(200).send({ conversations: rows.map(toPublicConversation) });
  });

  // GET /v1/projects/:projectId/conversations/:conversationId
  fastify.get('/v1/projects/:projectId/conversations/:conversationId', async (request, reply) => {
    const { projectId, conversationId } = request.params as { projectId: string; conversationId: string };
    const userId = request.user!.id;

    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');
    assertProjectAuthorized(request, projectId);

    const conversation = await conversationRepository.findConversationByIdAndUserId(conversationId, userId);
    if (!conversation || conversation.projectId !== projectId) throw new NotFoundError('Conversation not found');

    return reply.status(200).send({ conversation: toPublicConversation(conversation) });
  });

  // GET /v1/conversations/:conversationId (alias)
  fastify.get('/v1/conversations/:conversationId', async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };
    const userId = request.user!.id;

    const conversation = await conversationRepository.findConversationByIdAndUserId(conversationId, userId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    assertProjectAuthorized(request, conversation.projectId);

    return reply.status(200).send({ conversation: toPublicConversation(conversation) });
  });

  // GET /v1/projects/:projectId/conversations/:conversationId/messages
  fastify.get('/v1/projects/:projectId/conversations/:conversationId/messages', async (request, reply) => {
    const { projectId, conversationId } = request.params as { projectId: string; conversationId: string };
    const userId = request.user!.id;

    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');
    assertProjectAuthorized(request, projectId);

    const conversation = await conversationRepository.findConversationByIdAndUserId(conversationId, userId);
    if (!conversation || conversation.projectId !== projectId) throw new NotFoundError('Conversation not found');

    const rows = await conversationRepository.listMessagesByConversationId(conversationId);
    return reply.status(200).send({ messages: rows.map(toPublicMessage) });
  });

  // GET /v1/conversations/:conversationId/messages (alias)
  fastify.get('/v1/conversations/:conversationId/messages', async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };
    const userId = request.user!.id;

    const conversation = await conversationRepository.findConversationByIdAndUserId(conversationId, userId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    assertProjectAuthorized(request, conversation.projectId);

    const rows = await conversationRepository.listMessagesByConversationId(conversationId);
    return reply.status(200).send({ messages: rows.map(toPublicMessage) });
  });

  // POST /v1/projects/:projectId/conversations/:conversationId/messages
  fastify.post('/v1/projects/:projectId/conversations/:conversationId/messages', async (request, reply) => {
    const { projectId, conversationId } = request.params as { projectId: string; conversationId: string };
    const userId = request.user!.id;

    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');
    assertProjectAuthorized(request, projectId);

    const conversation = await conversationRepository.findConversationByIdAndUserId(conversationId, userId);
    if (!conversation || conversation.projectId !== projectId) throw new NotFoundError('Conversation not found');

    const body = request.body as { content?: unknown; query?: unknown; stream?: unknown };
    if (!body || typeof body !== 'object') {
      throw new BadRequestError('Request body must be a JSON object');
    }

    const rawContent = body.content ?? body.query;
    if (typeof rawContent !== 'string' || rawContent.trim().length === 0) {
      throw new BadRequestError('content is required and must be a non-empty string');
    }
    if (rawContent.length > 2000) {
      throw new BadRequestError('content must be at most 2000 characters');
    }

    if (body.stream === true || (request.query as any)?.stream === 'true') {
      const generation = await generationOrchestrator.createGeneration({
        projectId,
        conversationId,
        query: rawContent.trim(),
        maxRecoveryAttempts: 2,
        requestId: request.requestId,
      });
      return reply.status(202).send({
        requestId: request.requestId,
        generationId: generation.id,
        status: generation.status,
      });
    }

    const result = await generationOrchestrator.sendMessage({
      projectId,
      conversationId,
      query: rawContent.trim(),
      requestId: request.requestId,
    });

    return reply.status(200).send(result);
  });
}