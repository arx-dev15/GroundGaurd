import assert from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { newDb } from 'pg-mem';
import { buildApp } from '../../apps/api/src/app';
import { dbManager } from '../../apps/api/src/plugins/database';
import { runMigrations } from '../../infra/scripts/migrate';
import { generationRepository } from '../../apps/api/src/repositories/generation.repository';
import { EvidenceItem, Claim } from '@groundguard/contracts';

describe('GroundGuard Phase 6: Claim Extraction + Evidence Provenance Test Suite', () => {
  const app = buildApp();
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;
  let projectAId: string;
  let projectBId: string;
  let conversationAId: string;

  before(async () => {
    // 1. Establish database connection or test pool
    const liveHealth = await dbManager.checkHealth();
    if (!liveHealth.ok) {
      const memDb = newDb();
      memDb.public.interceptQueries((q: string) => {
        if (q.includes('CREATE EXTENSION')) return [];
        return null;
      });
      const memPool = memDb.adapters.createPg().Pool;
      const testPool = new memPool();
      dbManager.setTestPool(testPool);
    }

    // 2. Run migrations
    await runMigrations(dbManager.getPool());

    const pool = dbManager.getPool();
    await pool.query("DELETE FROM projects WHERE name LIKE 'Phase 6 Test Project%'");
    await pool.query("DELETE FROM users WHERE email LIKE '%@testphase6.com'");

    // 3. Register User A
    const resA = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'usera@testphase6.com', password: 'Password123!', name: 'User A' },
    });
    const bodyA = JSON.parse(resA.payload);
    userAToken = bodyA.token;
    userAId = bodyA.user.id;

    // 4. Register User B
    const resB = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'userb@testphase6.com', password: 'Password123!', name: 'User B' },
    });
    const bodyB = JSON.parse(resB.payload);
    userBToken = bodyB.token;
    userBId = bodyB.user.id;

    // 5. Create Project A
    const pResA = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { name: 'Phase 6 Test Project A', description: 'Testing claim extraction & provenance' },
    });
    const pBodyA = JSON.parse(pResA.payload);
    projectAId = pBodyA.project.id;

    // 6. Create Project B
    const pResB = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${userBToken}` },
      payload: { name: 'Phase 6 Test Project B', description: 'User B isolation project' },
    });
    const pBodyB = JSON.parse(pResB.payload);
    projectBId = pBodyB.project.id;

    // 7. Create Conversation A
    const cResA = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectAId}/conversations`,
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { title: 'Pump Specifications Conversation' },
    });
    const cBodyA = JSON.parse(cResA.payload);
    conversationAId = cBodyA.conversation.id;
  });

  after(async () => {
    const pool = dbManager.getPool();
    await pool.query("DELETE FROM projects WHERE name LIKE 'Phase 6 Test Project%'");
    await pool.query("DELETE FROM users WHERE email LIKE '%@testphase6.com'");
  });

  // ==========================================
  // Section 1: Transactional Persistence of Claims & Evidence
  // ==========================================

  test('persistCompletedGeneration atomically saves generation, claims, and candidate evidence', async () => {
    // Create generation record
    const gen = await generationRepository.createGeneration({
      requestId: 'req_test_01',
      projectId: projectAId,
      conversationId: conversationAId,
      query: 'What is the rated capacity and operating pressure of P-101A?',
      maxRecoveryAttempts: 0,
    });

    const sampleEvidence: EvidenceItem[] = [
      {
        chunkId: 'chk_flow_01',
        documentId: 'doc_specs_01',
        text: 'Pump P-101A rated capacity is 120 m3/h.',
        pageNumber: 2,
      },
      {
        chunkId: 'chk_press_01',
        documentId: 'doc_specs_01',
        text: 'Pump P-101A maximum operating pressure is 15.2 bar.',
        pageNumber: 3,
      },
    ];

    const sampleClaims: Claim[] = [
      {
        claimId: 'temp_claim_0',
        ordinal: 0,
        text: 'P-101A has a rated flow of 120 m3/h.',
        sourceText: 'Pump P-101A rated capacity is 120 m3/h.',
        status: 'pending',
        evidence: [sampleEvidence[0]],
      },
      {
        claimId: 'temp_claim_1',
        ordinal: 1,
        text: 'P-101A has a maximum discharge pressure of 15.2 bar.',
        sourceText: 'Pump P-101A maximum operating pressure is 15.2 bar.',
        status: 'pending',
        evidence: [sampleEvidence[1]],
      },
      {
        claimId: 'temp_claim_2',
        ordinal: 2,
        text: 'P-101A was commissioned in 2021.',
        status: 'pending',
        evidence: [], // Zero evidence candidate allowed (Section 19)
      },
    ];

    const answer = 'Pump P-101A has a rated flow of 120 m3/h and maximum discharge pressure of 15.2 bar. It was commissioned in 2021.';

    await generationRepository.persistCompletedGeneration({
      generationId: gen.id,
      projectId: projectAId,
      conversationId: conversationAId,
      answer,
      modelVersion: 'gemini/gemini-flash-lite-latest',
      metadata: { claimExtraction: { status: 'completed', claimCount: 3 } },
      claims: sampleClaims,
    });

    // Verify generation status is verifying per Phase 9 lifecycle contract
    const updatedGen = await generationRepository.findGenerationById(gen.id);
    assert.ok(updatedGen);
    assert.strictEqual(updatedGen.status, 'verifying');
    assert.strictEqual(updatedGen.answer, answer);

    // Read back claims via repository
    const persistedClaims = await generationRepository.findClaimsByGenerationId(gen.id);
    assert.strictEqual(persistedClaims.length, 3);

    // Verify Claim 0
    assert.strictEqual(persistedClaims[0].ordinal, 0);
    assert.strictEqual(persistedClaims[0].text, 'P-101A has a rated flow of 120 m3/h.');
    assert.strictEqual(persistedClaims[0].status, 'pending');
    assert.strictEqual(persistedClaims[0].evidence?.length, 1);
    assert.strictEqual(persistedClaims[0].evidence?.[0].chunkId, 'chk_flow_01');
    assert.strictEqual(persistedClaims[0].evidence?.[0].documentId, 'doc_specs_01');
    assert.strictEqual(persistedClaims[0].evidence?.[0].pageNumber, 2);

    // Verify Claim 1
    assert.strictEqual(persistedClaims[1].ordinal, 1);
    assert.strictEqual(persistedClaims[1].text, 'P-101A has a maximum discharge pressure of 15.2 bar.');
    assert.strictEqual(persistedClaims[1].status, 'pending');
    assert.strictEqual(persistedClaims[1].evidence?.length, 1);
    assert.strictEqual(persistedClaims[1].evidence?.[0].chunkId, 'chk_press_01');

    // Verify Claim 2 (Zero candidate evidence preserved)
    assert.strictEqual(persistedClaims[2].ordinal, 2);
    assert.strictEqual(persistedClaims[2].text, 'P-101A was commissioned in 2021.');
    assert.strictEqual(persistedClaims[2].status, 'pending');
    assert.strictEqual(persistedClaims[2].evidence?.length, 0);

    // Verify NO Phase 7 verification labels exist on persisted claims
    for (const c of persistedClaims) {
      assert.strictEqual(c.status, 'pending');
      const rawC = c as any;
      assert.ok(!rawC.label, 'Verification label must NOT exist in Phase 6');
      assert.ok(!rawC.groundingScore, 'Grounding score must NOT exist in Phase 6');
    }
  });

  // ==========================================
  // Section 2: Public API Endpoint GET /v1/generations/:id/claims
  // ==========================================

  test('GET /v1/generations/:id/claims returns all claims and candidate evidence', async () => {
    // Fetch generation created in previous test
    const pool = dbManager.getPool();
    const genRes = await pool.query('SELECT id FROM generations WHERE project_id = $1 LIMIT 1', [projectAId]);
    const genId = genRes.rows[0].id;

    const res = await app.inject({
      method: 'GET',
      url: `/v1/generations/${genId}/claims`,
      headers: { authorization: `Bearer ${userAToken}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(Array.isArray(body.claims));
    assert.strictEqual(body.claims.length, 3);

    // Check ordering and fields
    assert.strictEqual(body.claims[0].ordinal, 0);
    assert.strictEqual(body.claims[0].status, 'pending');
    assert.strictEqual(body.claims[0].text, 'P-101A has a rated flow of 120 m3/h.');
    assert.strictEqual(body.claims[0].evidence.length, 1);
    assert.strictEqual(body.claims[0].evidence[0].chunkId, 'chk_flow_01');

    assert.strictEqual(body.claims[2].ordinal, 2);
    assert.strictEqual(body.claims[2].evidence.length, 0);
  });

  // ==========================================
  // Section 3: Project Isolation & Security
  // ==========================================

  test('User B cannot access claims belonging to User A (Project Isolation)', async () => {
    const pool = dbManager.getPool();
    const genRes = await pool.query('SELECT id FROM generations WHERE project_id = $1 LIMIT 1', [projectAId]);
    const genId = genRes.rows[0].id;

    const res = await app.inject({
      method: 'GET',
      url: `/v1/generations/${genId}/claims`,
      headers: { authorization: `Bearer ${userBToken}` },
    });

    // Must be rejected with 404 (Not Found / Unauthorized)
    assert.strictEqual(res.statusCode, 404);
  });

  // ==========================================
  // Section 4: Abstention Path Produces Zero Claims
  // ==========================================

  test('Abstention response produces zero claim rows in database', async () => {
    const gen = await generationRepository.createGeneration({
      requestId: 'req_test_02',
      projectId: projectAId,
      conversationId: conversationAId,
      query: 'What is the design temperature of heat exchanger E-301?',
      maxRecoveryAttempts: 0,
    });

    const abstentionAnswer = 'The provided documentation does not contain sufficient evidence to answer this question.';

    await generationRepository.persistCompletedGeneration({
      generationId: gen.id,
      projectId: projectAId,
      conversationId: conversationAId,
      answer: abstentionAnswer,
      modelVersion: 'groundguard-abstention-gate',
      metadata: { abstention: true },
      claims: [],
    });

    const persistedClaims = await generationRepository.findClaimsByGenerationId(gen.id);
    assert.strictEqual(persistedClaims.length, 0, 'Abstention must persist 0 claims');

    // Read via API
    const res = await app.inject({
      method: 'GET',
      url: `/v1/generations/${gen.id}/claims`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.claims.length, 0);
  });

  // ==========================================
  // Section 5: Transactional Integrity / Rollback on Error
  // ==========================================

  test('Failed persistence rolls back transaction atomically', async () => {
    const gen = await generationRepository.createGeneration({
      requestId: 'req_test_03',
      projectId: projectAId,
      conversationId: conversationAId,
      query: 'Test rollback transaction',
      maxRecoveryAttempts: 0,
    });

    // Provide invalid data that causes a database error inside the transaction
    try {
      await generationRepository.persistCompletedGeneration({
        generationId: 'non_existent_gen_id_that_causes_failure',
        projectId: projectAId,
        conversationId: conversationAId,
        answer: 'This should not persist',
        modelVersion: 'gemini-flash',
        claims: [{ claimId: 'temp_claim_rollback', ordinal: 0, text: 'Rollback claim', status: 'pending' }],
      });
      assert.fail('Should have thrown an error');
    } catch (err) {
      assert.ok(err, 'Expected error during invalid transaction');
    }

    // Verify original generation remains unchanged
    const originalGen = await generationRepository.findGenerationById(gen.id);
    assert.ok(originalGen);
    assert.strictEqual(originalGen.status, 'queued');

    const claims = await generationRepository.findClaimsByGenerationId(gen.id);
    assert.strictEqual(claims.length, 0);
  });

  // ==========================================
  // Section 6: Canonical Claim ID Uniqueness Across Generations
  // ==========================================

  test('Two generations both having temporary claim_0 receive unique canonical database claim IDs', async () => {
    const gen1 = await generationRepository.createGeneration({
      requestId: 'req_uniq_01',
      projectId: projectAId,
      conversationId: conversationAId,
      query: 'Query 1',
      maxRecoveryAttempts: 0,
    });

    const gen2 = await generationRepository.createGeneration({
      requestId: 'req_uniq_02',
      projectId: projectAId,
      conversationId: conversationAId,
      query: 'Query 2',
      maxRecoveryAttempts: 0,
    });

    await generationRepository.persistCompletedGeneration({
      generationId: gen1.id,
      projectId: projectAId,
      conversationId: conversationAId,
      answer: 'Pump P-101A operates at 1450 rpm.',
      modelVersion: 'gemini/gemini-flash-lite-latest',
      claims: [{ claimId: 'claim_0', ordinal: 0, text: 'Pump P-101A operates at 1450 rpm.', status: 'pending' }],
    });

    await generationRepository.persistCompletedGeneration({
      generationId: gen2.id,
      projectId: projectAId,
      conversationId: conversationAId,
      answer: 'Valve V-204 operates at 10 bar.',
      modelVersion: 'gemini/gemini-flash-lite-latest',
      claims: [{ claimId: 'claim_0', ordinal: 0, text: 'Valve V-204 operates at 10 bar.', status: 'pending' }],
    });

    const res1 = await app.inject({
      method: 'GET',
      url: `/v1/generations/${gen1.id}/claims`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const body1 = JSON.parse(res1.payload);

    const res2 = await app.inject({
      method: 'GET',
      url: `/v1/generations/${gen2.id}/claims`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const body2 = JSON.parse(res2.payload);

    assert.strictEqual(body1.claims[0].externalClaimId, 'claim_0');
    assert.strictEqual(body2.claims[0].externalClaimId, 'claim_0');

    // Canonical claimId MUST be distinct and unique across generations
    assert.notStrictEqual(body1.claims[0].claimId, body2.claims[0].claimId);
    assert.ok(body1.claims[0].claimId.startsWith('claim_'));
    assert.ok(body2.claims[0].claimId.startsWith('claim_'));

    // Both claim IDs can be retrieved individually via GET /v1/claims/:claimId
    const claimGet1 = await app.inject({
      method: 'GET',
      url: `/v1/claims/${body1.claims[0].claimId}`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    assert.strictEqual(claimGet1.statusCode, 200);
    assert.strictEqual(JSON.parse(claimGet1.payload).claim.text, 'Pump P-101A operates at 1450 rpm.');

    const claimGet2 = await app.inject({
      method: 'GET',
      url: `/v1/claims/${body2.claims[0].claimId}`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    assert.strictEqual(claimGet2.statusCode, 200);
    assert.strictEqual(JSON.parse(claimGet2.payload).claim.text, 'Valve V-204 operates at 10 bar.');
  });

  after(async () => {
    await app.close();
    await dbManager.getPool().end();
  });
});

