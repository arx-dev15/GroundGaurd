import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

export async function registerRequestId(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const incomingRequestId = request.headers['x-request-id'] as string;
    const requestId = incomingRequestId && incomingRequestId.trim() !== ''
      ? incomingRequestId
      : `req_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
    
    request.requestId = requestId;
    reply.header('x-request-id', requestId);
  });
}
