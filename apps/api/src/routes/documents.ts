import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { projectRepository } from '../repositories/project.repository';
import { documentRepository, DBDocument } from '../repositories/document.repository';
import { documentOrchestrator } from '../services/document.orchestrator';
import { BadRequestError, NotFoundError, PayloadTooLargeError } from '../utils/errors';
import { Document } from '@groundguard/contracts';

function toPublicDocument(dbDoc: DBDocument): Document {
  return {
    id: dbDoc.id,
    projectId: dbDoc.projectId,
    filename: dbDoc.filename,
    fileSize: dbDoc.fileSize,
    mimeType: dbDoc.mimeType,
    status: dbDoc.status,
    errorMessage: dbDoc.errorMessage || undefined,
    chunksCount: dbDoc.chunksCount,
    createdAt: dbDoc.createdAt.toISOString(),
    updatedAt: dbDoc.updatedAt.toISOString(),
  };
}

export async function documentRoutes(fastify: FastifyInstance) {
  // All document routes require authentication
  fastify.addHook('preHandler', authenticate);

  // POST /v1/projects/:projectId/documents
  fastify.post('/v1/projects/:projectId/documents', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.user!.id;

    // 1. Verify project ownership (must return 404 if unauthorized)
    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // 2. Validate multipart payload
    if (!request.isMultipart()) {
      throw new BadRequestError('Multipart request with PDF file is required');
    }

    const data = await request.file({
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    });

    if (!data) {
      throw new BadRequestError('PDF file is required');
    }

    const fileBuffer = await data.toBuffer();
    if (data.file.truncated) {
      throw new PayloadTooLargeError('File size exceeds maximum allowed limit of 10MB');
    }
    if (fileBuffer.length === 0) {
      throw new BadRequestError('Uploaded file is empty');
    }

    // 3. Orchestrate ingestion workflow
    const document = await documentOrchestrator.processDocumentUpload({
      projectId,
      filename: data.filename,
      fileSize: fileBuffer.length,
      mimeType: data.mimetype,
      fileBuffer,
      requestId: request.id,
    });

    return reply.status(201).send({ document });
  });

  // GET /v1/projects/:projectId/documents
  fastify.get('/v1/projects/:projectId/documents', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.user!.id;

    // Verify project ownership
    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const dbDocs = await documentRepository.listDocumentsByProjectId(projectId);
    return reply.status(200).send({
      documents: dbDocs.map(toPublicDocument),
    });
  });

  // GET /v1/documents/:documentId
  fastify.get('/v1/documents/:documentId', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const userId = request.user!.id;

    const dbDoc = await documentRepository.findDocumentById(documentId);
    if (!dbDoc) {
      throw new NotFoundError('Document not found');
    }

    // Verify user owns the project that owns the document
    const project = await projectRepository.findProjectByIdAndUserId(dbDoc.projectId, userId);
    if (!project) {
      throw new NotFoundError('Document not found');
    }

    return reply.status(200).send({
      document: toPublicDocument(dbDoc),
    });
  });

  // GET /v1/documents/:documentId/status
  fastify.get('/v1/documents/:documentId/status', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const userId = request.user!.id;

    const dbDoc = await documentRepository.findDocumentById(documentId);
    if (!dbDoc) {
      throw new NotFoundError('Document not found');
    }

    const project = await projectRepository.findProjectByIdAndUserId(dbDoc.projectId, userId);
    if (!project) {
      throw new NotFoundError('Document not found');
    }

    return reply.status(200).send({
      documentId: dbDoc.id,
      status: dbDoc.status,
      chunksCount: dbDoc.chunksCount,
      errorMessage: dbDoc.errorMessage || undefined,
    });
  });

  // DELETE /v1/documents/:documentId
  fastify.delete('/v1/documents/:documentId', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const userId = request.user!.id;

    const dbDoc = await documentRepository.findDocumentById(documentId);
    if (!dbDoc) {
      throw new NotFoundError('Document not found');
    }

    const project = await projectRepository.findProjectByIdAndUserId(dbDoc.projectId, userId);
    if (!project) {
      throw new NotFoundError('Document not found');
    }

    await documentOrchestrator.deleteDocument(documentId, dbDoc.projectId);

    return reply.status(200).send({
      message: 'Document deleted successfully',
    });
  });
}
