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
import { generationRoutes } from './routes/generations';
import { apiKeyRoutes } from './routes/api-keys';
import { evaluationRoutes } from './routes/evaluations';

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

  // Allow bodyless JSON POST/PUT requests to parse as empty object rather than throw FST_ERR_CTP_EMPTY_JSON_BODY
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim() === '')) {
      return done(null, {});
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err: any) {
      done(err, undefined);
    }
  });

   // Routes
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(projectRoutes);
  app.register(documentRoutes);
  app.register(conversationRoutes);
  app.register(generationRoutes);
  app.register(apiKeyRoutes);
  app.register(evaluationRoutes);
  return app;
}
