import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { userRepository } from '../repositories/user.repository';
import { AppError } from '../utils/errors';

export interface AuthenticatedUserContext {
  id: string;
  email: string;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUserContext;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if ((request.query as Record<string, unknown>)?.token) {
    const queryToken = (request.query as Record<string, unknown>).token;
    if (typeof queryToken === 'string') {
      token = queryToken.trim();
    }
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
