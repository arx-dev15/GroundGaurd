import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { userRepository } from '../repositories/user.repository';
import { authenticate } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rate-limit';
import { AppError, BadRequestError } from '../utils/errors';

export async function authRoutes(fastify: FastifyInstance) {
  // POST /v1/auth/register
  fastify.post('/v1/auth/register', { preHandler: [authRateLimiter] }, async (request, reply) => {
    const { email, password, name } = (request.body || {}) as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new BadRequestError('Valid email is required');
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new BadRequestError('Password must be at least 6 characters long');
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new BadRequestError('Name is required');
    }

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new AppError('EMAIL_EXISTS', 'Email is already registered', 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userRepository.createUser({
      email,
      passwordHash,
      name,
    });

    const token = jwt.sign({ sub: user.id }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    });

    return reply.status(201).send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      token,
    });
  });

  // POST /v1/auth/login
  fastify.post('/v1/auth/login', { preHandler: [authRateLimiter] }, async (request, reply) => {
    const { email, password } = (request.body || {}) as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      throw new BadRequestError('Email and password are required');
    }

    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    const token = jwt.sign({ sub: user.id }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    });

    return reply.status(200).send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      token,
    });
  });

  // POST /v1/auth/logout
  fastify.post('/v1/auth/logout', async (request, reply) => {
    return reply.status(200).send({
      message: 'Logged out successfully',
    });
  });

  // GET /v1/auth/me
  fastify.get('/v1/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user!;
    const dbUser = await userRepository.findById(user.id);
    if (!dbUser) {
      throw new AppError('UNAUTHORIZED', 'Authenticated user no longer exists', 401);
    }

    return reply.status(200).send({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        createdAt: dbUser.createdAt.toISOString(),
        updatedAt: dbUser.updatedAt.toISOString(),
      },
    });
  });
}
