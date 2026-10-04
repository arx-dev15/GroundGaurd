import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { userRepository } from '../repositories/user.repository';
import { AppError } from '../utils/errors';

import crypto from 'node:crypto';
import { apiKeyRepository } from '../repositories/api-key.repository';

export interface AuthenticatedUserContext {
  id: string;
  email: string;
  name: string;
}

export interface ApiKeyContext {
  id: string;
  projectId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUserContext;
    apiKey?: ApiKeyContext;
  }
}

export function assertProjectAuthorized(request: FastifyRequest, projectId: string): void {
  if (request.apiKey && request.apiKey.projectId && request.apiKey.projectId !== projectId) {
    throw new AppError('FORBIDDEN', 'API key is not authorized to access this project', 403);
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  const isBearerKey = authHeader?.startsWith('Bearer gg_');
  const rawApiKey = (request.headers['x-api-key'] as string | undefined) ||
    (authHeader?.startsWith('ApiKey ') ? authHeader.substring(7).trim() : undefined) ||
    (isBearerKey ? authHeader?.substring(7).trim() : undefined);

  if (rawApiKey) {
    const keyHash = crypto.createHash('sha256').update(rawApiKey.trim()).digest('hex');
    const apiKey = await apiKeyRepository.findActiveApiKeyByHash(keyHash);
    if (!apiKey) {
      throw new AppError('UNAUTHORIZED', 'Invalid or revoked API key', 401);
    }

    const dbUser = await userRepository.findById(apiKey.userId);
    if (!dbUser) {
      throw new AppError('UNAUTHORIZED', 'User associated with API key not found', 401);
    }

    apiKeyRepository.updateLastUsed(apiKey.id);

    request.user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
    };
    request.apiKey = {
      id: apiKey.id,
      projectId: apiKey.projectId,
    };
    return;
  }

  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('UNAUTHORIZED', 'Token has expired', 401);
    }
    throw new AppError('UNAUTHORIZED', 'Invalid authentication token', 401);
  }

  const userId = decoded.sub;
  if (!userId || typeof userId !== 'string') {
    throw new AppError('UNAUTHORIZED', 'Invalid token payload', 401);
  }

  const dbUser = await userRepository.findById(userId);
  if (!dbUser) {
    throw new AppError('UNAUTHORIZED', 'Authenticated user no longer exists', 401);
  }

  request.user = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
  };
}
