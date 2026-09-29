import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../utils/errors';
import { APIError } from '@groundguard/contracts';

export function registerErrorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: Error | AppError, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.requestId || 'req_unknown';

    if (error instanceof AppError) {
      const payload: APIError = {
        error: {
          code: error.code,
          message: error.message,
        },
        requestId,
      };
      return reply.status(error.statusCode).send(payload);
    }

    const anyErr = error as any;
    if (anyErr?.code === 'FST_REQ_FILE_TOO_LARGE' || anyErr?.statusCode === 413) {
      const payload: APIError = {
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'File size exceeds maximum allowed limit of 10MB',
        },
        requestId,
      };
      return reply.status(413).send(payload);
    }

    if (anyErr?.statusCode && anyErr.statusCode >= 400 && anyErr.statusCode < 500) {
      const payload: APIError = {
        error: {
          code: anyErr.code || 'BAD_REQUEST',
          message: anyErr.message || 'Invalid request',
        },
        requestId,
      };
      return reply.status(anyErr.statusCode).send(payload);
    }

    // Default 500 error without exposing stack traces or secrets
    fastify.log.error({ err: error, requestId }, 'Unhandled Application Error');

    const payload: APIError = {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An internal server error occurred',
      },
      requestId,
    };
    return reply.status(500).send(payload);
  });
}
