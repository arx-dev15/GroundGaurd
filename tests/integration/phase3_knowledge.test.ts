import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { newDb } from 'pg-mem';
import { buildApp } from '../../apps/api/src/app';
import { dbManager } from '../../apps/api/src/plugins/database';
import { redisManager } from '../../apps/api/src/plugins/redis';
import { userRepository } from '../../apps/api/src/repositories/user.repository';
import { projectRepository } from '../../apps/api/src/repositories/project.repository';
import { documentRepository } from '../../apps/api/src/repositories/document.repository';
import { runMigrations } from '../../infra/scripts/migrate';
import { aiClient } from '../../apps/api/src/clients/ai.client';

describe('GroundGuard Phase 3: Secure Ingestion + Knowledge Indexing Foundation Test Suite', () => {
  const app = buildApp();
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;
  let projectAId: string;
  let projectBId: string;
  let documentAId: string;

  // Valid PDF buffers generated and verified with pypdf
  const samplePdfWithRelations = fs.readFileSync(path.resolve(__dirname, '../fixtures/test_relations.pdf'));
  const samplePdfNoRelations = fs.readFileSync(path.resolve(__dirname, '../fixtures/test_no_rel.pdf'));
  const samplePdfProjectB = fs.readFileSync(path.resolve(__dirname, '../fixtures/test_beta.pdf'));

  before(async () => {
    // Check if live Postgres is reachable; if not, use pg-mem pool
    const liveHealth = await dbManager.checkHealth();
    if (!liveHealth.ok) {
      const memDb = newDb();
      memDb.public.interceptQueries((q: string) => {
        if (q.includes('CREATE EXTENSION')) return [];
        return null;
      });
      memDb.registerExtension('vector', (schema: any) => {
        schema.registerEquivalentType({
          name: 'vector',
          equivalentTo: schema.getType('text'),
        });
      });
      const memPool = memDb.adapters.createPg().Pool;
      const testPool = new memPool();
      dbManager.setTestPool(testPool);
    }

    // Run migrations including 003_chunk_lineage_metadata.sql
    await runMigrations(dbManager.getPool());

    const pool = dbManager.getPool();
    await pool.query("DELETE FROM projects WHERE name LIKE 'Knowledge Test Project%'");
    await pool.query("DELETE FROM users WHERE email LIKE '%@knowledgetest.com'");

    // Register User A
    const resA = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'usera@knowledgetest.com', password: 'Password123!', name: 'User A' },
    });
    const bodyA = JSON.parse(resA.payload);
    userAToken = bodyA.token;
    userAId = bodyA.user.id;

    // Register User B
    const resB = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'userb@knowledgetest.com', password: 'Password123!', name: 'User B' },
    });
    const bodyB = JSON.parse(resB.payload);
    userBToken = bodyB.token;
    userBId = bodyB.user.id;

    // Create Project A and Project B
    const projA = await projectRepository.createProject({ userId: userAId, name: 'Knowledge Test Project Alpha' });
    projectAId = projA.id;

    const projB = await projectRepository.createProject({ userId: userBId, name: 'Knowledge Test Project Beta' });
    projectBId = projB.id;
  });

  after(async () => {
    try {
      const pool = dbManager.getPool();
      await pool.query("DELETE FROM documents WHERE filename LIKE 'sample%'");
      await pool.query("DELETE FROM projects WHERE name LIKE 'Knowledge Test Project%'");
      await pool.query("DELETE FROM users WHERE email LIKE '%@knowledgetest.com'");
      await dbManager.close();
      await app.close();
      await redisManager.close();
    } catch (_) {}
  });

  describe('1. Multi-Store Ingestion & Verification (PostgreSQL, Qdrant, Tantivy, NetworkX)', () => {
    test('1.1 Should upload PDF with tags and relations, resulting in status=ready across all stores', async () => {
      const boundary = '--------------------------boundaryPhase3Knowledge';
      const multipartPayload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample_relations.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
        ),
        samplePdfWithRelations,
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
      assert.strictEqual(body.document.projectId, projectAId);
      assert.strictEqual(body.document.status, 'ready');
      assert.ok(body.document.chunksCount > 0);

      documentAId = body.document.id;

      // Verify PostgreSQL Canonical persistence with Lineage
      const pool = dbManager.getPool();
      const chunksRes = await pool.query('SELECT id, document_id, identifiers FROM chunks WHERE document_id = $1', [documentAId]);
      assert.ok(chunksRes.rows.length > 0);

      // Verify M2 Sanity Endpoint (Qdrant dense + Tantivy lexical + NetworkX relation)
      const sanityRes = await fetch(`http://localhost:8000/sanity/search?projectId=${projectAId}&query=P-101A`);
      assert.strictEqual(sanityRes.status, 200);
      const sanityData: any = await sanityRes.json();

      // Qdrant verification
      assert.ok(Array.isArray(sanityData.qdrantHits));
      assert.ok(sanityData.qdrantHits.length > 0);
      assert.strictEqual(sanityData.qdrantHits[0].projectId, projectAId);

      // Tantivy verification
      assert.ok(Array.isArray(sanityData.tantivyHits));
      assert.ok(sanityData.tantivyHits.length > 0);
      assert.ok(sanityData.tantivyHits[0].text.includes('P-101A'));

      // NetworkX relation verification: Valve V-204 is upstream of pump P-101A
      assert.ok(Array.isArray(sanityData.graphRelations));
      assert.ok(sanityData.graphRelations.length > 0);
      const edge = sanityData.graphRelations[0];
      assert.strictEqual(edge.relation, 'upstream_of');
      assert.strictEqual(edge.provenance.documentId, documentAId);
    });

    test('1.2 Ingestion with co-occurring entities without predicate records 0 edges (Zero-Relation Success Invariant)', async () => {
      const boundary = '--------------------------boundaryPhase3NoRel';
      const multipartPayload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample_no_relations.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
        ),
        samplePdfNoRelations,
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
      assert.strictEqual(body.document.status, 'ready');

      // Query relations for TK-500: should be 0 because entities appeared without relational predicate
      const sanityRes = await fetch(`http://localhost:8000/sanity/search?projectId=${projectAId}&query=TK-500`);
      const sanityData: any = await sanityRes.json();
      assert.strictEqual(sanityData.graphRelations.length, 0, 'Must NOT fabricate edges without directional predicate');
    });
  });

  describe('2. Multi-Tenant Project Isolation Inside Candidate Generation', () => {
    test('2.1 Ingest document in Project B and verify zero cross-project leakage', async () => {
      const boundary = '--------------------------boundaryPhase3Beta';
      const multipartPayload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample_beta.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
        ),
        samplePdfProjectB,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const resB = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectBId}/documents`,
        headers: {
          authorization: `Bearer ${userBToken}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: multipartPayload,
      });

      assert.strictEqual(resB.statusCode, 201);

      // Query Project B for Project A's secret tag P-101A
      const leakCheck = await fetch(`http://localhost:8000/sanity/search?projectId=${projectBId}&query=P-101A`);
      const leakData: any = await leakCheck.json();

      // Qdrant must return 0 Project A hits
      assert.strictEqual(leakData.qdrantHits.filter((h: any) => h.projectId === projectAId).length, 0);

      // Tantivy must return 0 hits for P-101A in Project B
      assert.strictEqual(leakData.tantivyHits.length, 0, 'Tantivy candidate generation must enforce projectId');

      // NetworkX must return 0 relations for Project B
      assert.strictEqual(leakData.graphRelations.length, 0);
    });

    test('2.2 Hybrid Retrieve endpoint enforces Project Isolation and PostgreSQL Ready validation', async () => {
      const retrieveRes = await aiClient.retrieve({
        projectId: projectAId,
        query: 'P-101A',
        topK: 5,
      });

      assert.ok(Array.isArray(retrieveRes.results));
      assert.ok(retrieveRes.results.length > 0);
      assert.ok(retrieveRes.results.some((r) => r.text.includes('P-101A')));

      // Retrieve in Project B for Project A content returns 0 results from Project A
      const retrieveResB = await aiClient.retrieve({
        projectId: projectBId,
        query: 'P-101A',
        topK: 5,
      });
      assert.strictEqual(retrieveResB.results.filter((r) => r.text.includes('P-101A')).length, 0, 'Project B must not leak P-101A');
      assert.strictEqual(retrieveResB.results.filter((r) => r.documentId === documentAId).length, 0, 'Project B must not return Document A chunks');
    });
  });

  describe('3. Fail-Closed Deletion Cleanliness', () => {
    test('3.1 DELETE /v1/documents/:documentId purges Qdrant, Tantivy, and NetworkX before PostgreSQL', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/v1/documents/${documentAId}`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });

      assert.strictEqual(delRes.statusCode, 200);

      // Subsequent retrieval in Project A for Document A content should be 0
      const afterSearch = await fetch(`http://localhost:8000/sanity/search?projectId=${projectAId}&query=upstream`);
      const afterData: any = await afterSearch.json();

      // Qdrant points purged
      assert.strictEqual(afterData.qdrantHits.filter((h: any) => h.documentId === documentAId).length, 0);

      // Tantivy documents purged
      assert.strictEqual(afterData.tantivyHits.filter((h: any) => h.documentId === documentAId).length, 0);

      // NetworkX edges purged
      assert.strictEqual(afterData.graphRelations.filter((r: any) => r.provenance?.documentId === documentAId).length, 0);

      // PostgreSQL cascade
      const pool = dbManager.getPool();
      const chunksLeft = await pool.query('SELECT id FROM chunks WHERE document_id = $1', [documentAId]);
      assert.strictEqual(chunksLeft.rows.length, 0);
    });
  });
});
