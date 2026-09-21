import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { registerRequestId } from './middleware/request-id';
import { registerErrorHandler } from './middleware/error-handler';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { projectRoutes } from './routes/projects';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  // Middleware / Plugins
  app.register(cors, { origin: true });
  registerRequestId(app);
  registerErrorHandler(app);

  // Routes
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(projectRoutes);

  return app;
}
