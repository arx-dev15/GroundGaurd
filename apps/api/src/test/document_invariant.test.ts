import assert from 'node:assert';
import { newDb } from 'pg-mem';
import { Pool } from 'pg';
import { dbManager } from '../plugins/database';
import { runMigrations } from '../plugins/migrate';
import { documentOrchestrator } from '../services/document.orchestrator';
import { projectRepository } from '../repositories/project.repository';
import { userRepository } from '../repositories/user.repository';
import { aiClient } from '../clients/ai.client';
import type { IngestResponse } from '@groundguard/contracts';

async function setupTestDb(): Promise<Pool> {
  const memDb = newDb();
  memDb.public.interceptQueries((q: string) => {
    if (q.includes('CREATE EXTENSION')) return [];
    return null;
  });
  const memPool = memDb.adapters.createPg().Pool;
  const testPool = new memPool();
  dbManager.setTestPool(testPool as any);
  await runMigrations(dbManager.getPool(), { isPgMem: true });
  return dbManager.getPool();
}

async function runInvariantTests() {
  console.log('=== Starting Document Ready Invariant Test Suite ===');
  await setupTestDb();

  const user = await userRepository.createUser({
    email: 'invariant-test@groundguard.io',
    passwordHash: 'hashed_pw',
    name: 'Invariant Tester',
  });

  const project = await projectRepository.createProject({
    userId: user.id,
    name: 'Invariant Test Project',
  });

  const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

  // Test Case 1: M2 ingest success (all indexes created + chunks > 0) -> status becomes READY
  console.log('[Test 1] Complete M2 Ingest Success -> status is READY');
  const originalIngest = aiClient.ingest;
  aiClient.ingest = async (): Promise<IngestResponse> => {
    return {
      documentId: 'doc_temp',
      status: 'completed',
      chunksCreated: 2,
      indexStatus: {
        qdrant: true,
        tantivy: true,
        networkx: true,
        graphEdgesCount: 1,
      },
      chunks: [
        { id: 'chk_1', text: 'First chunk', pageNumber: 1, identifiers: [] },
        { id: 'chk_2', text: 'Second chunk', pageNumber: 1, identifiers: [] },
      ],
    };
  };

  const docReady = await documentOrchestrator.processDocumentUpload({
    projectId: project.id,
    filename: 'success.pdf',
    fileSize: validPdfBuffer.length,
    mimeType: 'application/pdf',
    fileBuffer: validPdfBuffer,
  });

  assert.strictEqual(docReady.status, 'ready', 'Document must become READY when all indexes succeed');
  assert.strictEqual(docReady.chunksCount, 2, 'Chunks count must match created chunks');

  // Test Case 2: M2 ingest failure -> status MUST NOT become READY
  console.log('[Test 2] M2 Ingest Failure -> status is FAILED (NOT ready)');
  aiClient.ingest = async (): Promise<IngestResponse> => {
    return {
      documentId: 'doc_temp',
      status: 'failed',
      chunksCreated: 0,
      errorMessage: 'PDF text extraction failed',
    };
  };

  const docFailed = await documentOrchestrator.processDocumentUpload({
    projectId: project.id,
    filename: 'failed.pdf',
    fileSize: validPdfBuffer.length,
    mimeType: 'application/pdf',
    fileBuffer: validPdfBuffer,
  });

  assert.strictEqual(docFailed.status, 'failed', 'Document must become FAILED when M2 ingest reports failure');
  assert.notStrictEqual(docFailed.status, 'ready', 'Document must NOT become ready on ingest failure');

  // Test Case 3: Partial ingest failure (e.g. Qdrant ok, Tantivy fails) -> status MUST NOT become READY
  console.log('[Test 3] Partial Ingest Failure (Qdrant ok, Tantivy failed) -> status is FAILED');
  aiClient.ingest = async (): Promise<IngestResponse> => {
    return {
      documentId: 'doc_temp',
      status: 'completed',
      chunksCreated: 1,
      indexStatus: {
        qdrant: true,
        tantivy: false, // Tantivy failed!
        networkx: true,
        graphEdgesCount: 0,
      },
      chunks: [
        { id: 'chk_3', text: 'Third chunk', pageNumber: 1, identifiers: [] },
      ],
    };
  };

  const docPartial = await documentOrchestrator.processDocumentUpload({
    projectId: project.id,
    filename: 'partial.pdf',
    fileSize: validPdfBuffer.length,
    mimeType: 'application/pdf',
    fileBuffer: validPdfBuffer,
  });

  assert.strictEqual(docPartial.status, 'failed', 'Document must become FAILED on partial index failure');
  assert.notStrictEqual(docPartial.status, 'ready', 'Document must NOT become ready when Tantivy indexing failed');

  // Test Case 4: Zero chunks created -> status MUST NOT become READY
  console.log('[Test 4] Zero Chunks Created -> status is FAILED');
  aiClient.ingest = async (): Promise<IngestResponse> => {
    return {
      documentId: 'doc_temp',
      status: 'completed',
      chunksCreated: 0,
      indexStatus: {
        qdrant: true,
        tantivy: true,
        networkx: true,
        graphEdgesCount: 0,
      },
      chunks: [],
    };
  };

  const docZeroChunks = await documentOrchestrator.processDocumentUpload({
    projectId: project.id,
    filename: 'zero_chunks.pdf',
    fileSize: validPdfBuffer.length,
    mimeType: 'application/pdf',
    fileBuffer: validPdfBuffer,
  });

  assert.strictEqual(docZeroChunks.status, 'failed', 'Document must become FAILED when zero chunks were created');
  assert.notStrictEqual(docZeroChunks.status, 'ready', 'Document must NOT become ready with zero chunks');

  // Restore
  aiClient.ingest = originalIngest;

  console.log('✅ ALL DOCUMENT READY INVARIANT REGRESSION TESTS PASSED!');
}

runInvariantTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
