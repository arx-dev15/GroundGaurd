import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { registerRequestId } from './middleware/request-id';
import { registerErrorHandler } from './middleware/error-handler';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { projectRoutes } from './routes/projects';
import { documentRoutes } from './routes/documents';
import { conversationRoutes } from './routes/conversations';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  // Middleware / Plugins
  app.register(cors, { origin: true });
  app.register(multipart, {
    limits: { 
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
  });
  registerRequestId(app);
  registerErrorHandler(app);

  // Routes
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(projectRoutes);
  app.register(documentRoutes);
  app.register(documentRoutes);
  app.register(conversationRoutes)

  return app;
}

