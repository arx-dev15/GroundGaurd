import assert from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { newDb } from 'pg-mem';
import { buildApp } from '../../apps/api/src/app';
import { dbManager } from '../../apps/api/src/plugins/database';
import { userRepository } from '../../apps/api/src/repositories/user.repository';
import { projectRepository } from '../../apps/api/src/repositories/project.repository';
import { documentRepository } from '../../apps/api/src/repositories/document.repository';
import { runMigrations } from '../../infra/scripts/migrate';

describe('GroundGuard Phase 3 Document Ingestion & RAG Foundation Test Suite', () => {
  const app = buildApp();
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;
  let projectAId: string;
  let projectBId: string;
  let documentAId: string;

  const validSamplePdf = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 55 >>\nstream\nBT\n/F1 12 Tf\n72 712 Td\n(Sample GroundGuard PDF Text for RAG testing) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000214 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n318\n%%EOF'
  );

  before(async () => {
    // Check if live Postgres is reachable; if not, use pg-mem pool for unit/integration tests
    const liveHealth = await dbManager.checkHealth();
    if (!liveHealth.ok) {
      const memDb = newDb();
      memDb.registerExtension('vector', (schema: any) => {
        schema.registerEquivalentType({
          name: 'vector',
          equivalentTo: schema.getType('text'),
        });
      });
      const memPool = memDb.adapters.createPg().Pool;
      const testPool = new memPool();
      (dbManager as any).pool = testPool;
    }

    // 1. Run migrations to establish schema
    await runMigrations(dbManager.getPool());

    const pool = dbManager.getPool();
    await pool.query("DELETE FROM projects WHERE name LIKE 'Test Project Phase 3%'");
    await pool.query("DELETE FROM users WHERE email LIKE '%@testphase3.com'");

    // Register User A
    const resA = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'usera@testphase3.com', password: 'Password123!', name: 'User A' },
    });
    const bodyA = JSON.parse(resA.payload);
    userAToken = bodyA.token;
    userAId = bodyA.user.id;

    // Register User B
    const resB = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'userb@testphase3.com', password: 'Password123!', name: 'User B' },
    });
    const bodyB = JSON.parse(resB.payload);
    userBToken = bodyB.token;
    userBId = bodyB.user.id;

    // Create Project A & Project B
    const projA = await projectRepository.createProject({ userId: userAId, name: 'Test Project Phase 3 Alpha' });
    projectAId = projA.id;

    const projB = await projectRepository.createProject({ userId: userBId, name: 'Test Project Phase 3 Beta' });
    projectBId = projB.id;
  });

  after(async () => {
    try {
      const pool = dbManager.getPool();
      await pool.query("DELETE FROM documents WHERE filename LIKE 'sample%'");
      await pool.query("DELETE FROM projects WHERE name LIKE 'Test Project Phase 3%'");
      await pool.query("DELETE FROM users WHERE email LIKE '%@testphase3.com'");
      await dbManager.close();
    } catch (_) {}
  });

  describe('1. PDF Document Upload & Ingestion Integration', () => {
    test('1.1 Should upload PDF, persist document metadata, and process ingestion', async () => {
      const boundary = '--------------------------testboundary123';
      const multipartPayload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
        ),
        validSamplePdf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectAId}/documents`,
        headers: {
          authorization: `Bearer ${userAToken}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: multipartPayload,
      });

      assert.strictEqual(res.statusCode, 201);
      const body = JSON.parse(res.payload);
      assert.ok(body.document);
      assert.ok(body.document.id.startsWith('doc_'));
      assert.strictEqual(body.document.projectId, projectAId);
      assert.strictEqual(body.document.filename, 'sample.pdf');
      assert.ok(body.document.status);

      documentAId = body.document.id;

      // Verify PostgreSQL persistence
      const dbDoc = await documentRepository.findDocumentById(documentAId);
      assert.ok(dbDoc);
      assert.strictEqual(dbDoc.projectId, projectAId);
    });

    test('1.2 Should list documents in Project A correctly', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/projects/${projectAId}/documents`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.ok(Array.isArray(body.documents));
      assert.strictEqual(body.documents.length, 1);
      assert.strictEqual(body.documents[0].id, documentAId);
    });

    test('1.3 Should get single Document A details by documentId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/documents/${documentAId}`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.document.id, documentAId);
    });

    test('1.4 Should get Document A status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/documents/${documentAId}/status`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.documentId, documentAId);
      assert.ok(body.status);
    });
  });

  describe('2. Strict Multi-Tenant Isolation Invariants', () => {
    test('2.1 MANDATORY: User B cannot upload documents to User A project (404)', async () => {
      const boundary = '--------------------------testboundary123';
      const multipartPayload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="hacked.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
        ),
        validSamplePdf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectAId}/documents`,
        headers: {
          authorization: `Bearer ${userBToken}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: multipartPayload,
      });

      assert.strictEqual(res.statusCode, 404);
    });

    test('2.2 MANDATORY: User B listing /v1/projects/:projectIdA/documents returns 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/projects/${projectAId}/documents`,
        headers: {
          authorization: `Bearer ${userBToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 404);
    });

    test('2.3 MANDATORY: User B reading GET /v1/documents/:documentIdA returns 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/documents/${documentAId}`,
        headers: {
          authorization: `Bearer ${userBToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 404);
    });

    test('2.4 MANDATORY: User B reading GET /v1/documents/:documentIdA/status returns 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/documents/${documentAId}/status`,
        headers: {
          authorization: `Bearer ${userBToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 404);
    });

    test('2.5 MANDATORY: User B deleting DELETE /v1/documents/:documentIdA returns 404', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/documents/${documentAId}`,
        headers: {
          authorization: `Bearer ${userBToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('3. Input Validation & Error Sanitization', () => {
    test('3.1 Should reject non-PDF text file upload with 400 Bad Request', async () => {
      const boundary = '--------------------------testboundary456';
      const invalidPayload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="invalid.txt"\r\nContent-Type: text/plain\r\n\r\n`
        ),
        Buffer.from('Hello plain text file not a pdf'),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectAId}/documents`,
        headers: {
          authorization: `Bearer ${userAToken}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: invalidPayload,
      });

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error.code, 'BAD_REQUEST');
      assert.ok(body.error.message.includes('not a valid PDF'));
    });

    test('3.2 Should reject empty file upload with 400 Bad Request', async () => {
      const boundary = '--------------------------testboundary789';
      const emptyPayload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="empty.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
        ),
        Buffer.from(''),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectAId}/documents`,
        headers: {
          authorization: `Bearer ${userAToken}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: emptyPayload,
      });

      assert.strictEqual(res.statusCode, 400);
    });
  });

  describe('4. Atomic Deletion & Cascading Cleanups', () => {
    test('4.1 User A DELETE /v1/documents/:documentIdA succeeds', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/documents/${documentAId}`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.ok(body.message.includes('deleted successfully'));

      // Verify subsequent GET returns 404
      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/documents/${documentAId}`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });
      assert.strictEqual(getRes.statusCode, 404);
    });
  });

  describe('5. Phase 1 & Phase 2 Regressions Check', () => {
    test('5.1 /health should return 200 OK', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });
      assert.strictEqual(res.statusCode, 200);
    });

    test('5.2 GET /v1/auth/me should return User A context', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });
      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.user.id, userAId);
    });
  });
});
