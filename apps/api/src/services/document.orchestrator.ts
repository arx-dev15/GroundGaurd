import { documentRepository, DBDocument } from '../repositories/document.repository';
import { chunkRepository } from '../repositories/chunk.repository';
import { aiClient } from '../clients/ai.client';
import { saveUploadedFile, deleteStoredFile } from '../utils/storage';
import { generateId } from '../utils/id';
import { BadRequestError, NotFoundError, ServiceUnavailableError } from '../utils/errors';
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

export class DocumentOrchestrator {
  public async processDocumentUpload(data: {
    projectId: string;
    filename: string;
    fileSize: number;
    mimeType: string;
    fileBuffer: Buffer;
    requestId?: string;
  }): Promise<Document> {
    // 1. PDF Content Validation (MIME & PDF Header Magic Bytes)
    if (data.fileBuffer.length === 0) {
      throw new BadRequestError('Uploaded file is empty');
    }
    const magicBytes = data.fileBuffer.subarray(0, 4).toString('utf-8');
    if (!magicBytes.startsWith('%PDF')) {
      throw new BadRequestError('Uploaded file is not a valid PDF document');
    }

    // 2. Generate document ID and persist file to disk
    const docId = generateId('doc');
    const filePath = await saveUploadedFile(data.projectId, docId, data.fileBuffer);

    // Insert initial document record in PostgreSQL ('uploaded') with real filePath
    const tempDoc = await documentRepository.createDocument({
      id: docId,
      projectId: data.projectId,
      filename: data.filename,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      filePath: filePath,
    });

    // Update with status 'processing'
    await documentRepository.updateStatus(tempDoc.id, 'processing');

    // 3. Invoke M2 AI Service HTTP Ingestion
    let m2IndexingSucceeded = false;
    try {
      const ingestRes = await aiClient.ingest(
        tempDoc.id,
        data.projectId,
        data.fileBuffer,
        data.filename,
        data.requestId
      );

      const isIngestSuccessful =
        (ingestRes.status === 'completed' || ingestRes.status === 'ready') &&
        Boolean(ingestRes.indexStatus?.qdrant) &&
        Boolean(ingestRes.indexStatus?.tantivy) &&
        (ingestRes.chunksCreated > 0 || (ingestRes.chunks && ingestRes.chunks.length > 0));

      if (!isIngestSuccessful) {
        const sanitizedMsg = ingestRes.errorMessage || 'Document processing failed or retrieval artifacts were incomplete';
        // Compensating cleanup if partial indexing occurred in derived stores
        try {
          await aiClient.deleteDocument(tempDoc.id, data.projectId);
        } catch (_) {
          // Compensating cleanup attempt completed
        }
        const failedDoc = await documentRepository.updateStatus(tempDoc.id, 'failed', 0, sanitizedMsg);
        return toPublicDocument(failedDoc!);
      }

      m2IndexingSucceeded = true;

      // Persist canonical chunks and lineage metadata in PostgreSQL
      if (ingestRes.chunks && ingestRes.chunks.length > 0) {
        await chunkRepository.saveChunks(tempDoc.id, ingestRes.chunks);
      }

      // 4. M3 performs the final status transition to 'ready' only after all required retrieval artifacts exist
      const readyDoc = await documentRepository.updateStatus(
        tempDoc.id,
        'ready',
        ingestRes.chunksCreated || (ingestRes.chunks ? ingestRes.chunks.length : 0),
        undefined
      );
      return toPublicDocument(readyDoc!);
    } catch (err: any) {
      // Compensating cleanup: If M2 indexing succeeded but M3 canonical persistence failed, purge M2 derived stores
      if (m2IndexingSucceeded) {
        try {
          await aiClient.deleteDocument(tempDoc.id, data.projectId);
        } catch (_) {
          // Compensating cleanup attempt completed
        }
      }

      // On exception/timeout, M3 marks the document status 'failed' with sanitized message
      const sanitizedMsg = 'Document processing service unavailable or persistence failed';
      const failedDoc = await documentRepository.updateStatus(tempDoc.id, 'failed', 0, sanitizedMsg);
      return toPublicDocument(failedDoc!);
    }
  }

  public async deleteDocument(documentId: string, projectId: string): Promise<void> {
    const existing = await documentRepository.findDocumentByIdAndProjectId(documentId, projectId);
    if (!existing) {
      throw new NotFoundError('Document not found');
    }

    // Step 1: If document was ready or processing, purge derived stores (Qdrant, Tantivy, NetworkX) via M2
    if (existing.status === 'ready' || existing.status === 'processing') {
      try {
        await aiClient.deleteDocument(documentId, projectId);
      } catch (err: any) {
        throw new ServiceUnavailableError('AI Service derived index purge failed');
      }
    } else {
      // If failed or uploaded, attempt cleanup in M2 if reachable
      try {
        await aiClient.deleteDocument(documentId, projectId);
      } catch (_) {
        // Safe to proceed since unready documents never indexed derived data
      }
    }

    // Step 2: Atomic SQL ON DELETE CASCADE removes document row & all associated vector chunks from PostgreSQL
    const deleted = await documentRepository.deleteDocument(documentId, projectId);
    if (!deleted) {
      throw new NotFoundError('Document not found');
    }

    // Step 3: Unlink physical file from disk
    if (deleted.filePath) {
      await deleteStoredFile(deleted.filePath);
    }
  }
}

export const documentOrchestrator = new DocumentOrchestrator();
