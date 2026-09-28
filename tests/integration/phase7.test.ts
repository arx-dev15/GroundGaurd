import assert from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { newDb } from 'pg-mem';
import { buildApp } from '../../apps/api/src/app';
import { dbManager } from '../../apps/api/src/plugins/database';
import { runMigrations } from '../../infra/scripts/migrate';
import { generationRepository } from '../../apps/api/src/repositories/generation.repository';
import { technicalChecker } from '../../apps/api/src/services/technical-checks';
import { verificationOrchestrator } from '../../apps/api/src/services/verification.orchestrator';
import { mlClient } from '../../apps/api/src/clients/ml.client';
import { generateId } from '../../apps/api/src/utils/id';
import { Claim, Evidence } from '@groundguard/contracts';

describe('GroundGuard Phase 7: Dual-Stage Grounding Verification Test Suite', () => {
  const app = buildApp();
  let userToken: string;
  let userId: string;
  let projectId: string;
  let conversationId: string;

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
    await pool.query("DELETE FROM projects WHERE name LIKE 'Phase 7 Test Project%'");
    await pool.query("DELETE FROM users WHERE email LIKE '%@testphase7.com'");

    // 3. Register User
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'user@testphase7.com', password: 'Password123!', name: 'User Phase 7' },
    });
    const body = JSON.parse(res.payload);
    userToken = body.token;
    userId = body.user.id;

    // 4. Create Project
    const projRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Phase 7 Test Project' },
    });
    const projBody = JSON.parse(projRes.payload);
    projectId = projBody.project.id;

    // 5. Create Conversation
    const convRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/conversations`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Phase 7 Verification Conversation' },
    });
    const convBody = JSON.parse(convRes.payload);
    conversationId = convBody.conversation.id;
  });

  after(async () => {
    const pool = dbManager.getPool();
    try {
      await pool.query("DELETE FROM projects WHERE name LIKE 'Phase 7 Test Project%'");
      await pool.query("DELETE FROM users WHERE email LIKE '%@testphase7.com'");
    } catch {
      // Ignore cleanup error in test
    }
  });

  test('Stage 1: Real M1 Health & Model Metadata on Port 8001', async () => {
    const health = await mlClient.health();
    assert.strictEqual(health.status, 'ok', 'M1 service must be ok');
    assert.strictEqual(health.modelLoaded, true, 'M1 fine-tuned model must be loaded');
    assert.strictEqual(health.modelVersion, 'groundguard-deberta-v1-finetuned', 'Must load fine-tuned modelVersion');

    const info = await mlClient.modelInfo();
    assert.strictEqual(info.modelVersion, 'groundguard-deberta-v1-finetuned');
    assert.deepStrictEqual(info.labels.sort(), ['contradiction', 'entailment', 'neutral'].sort());
  });

  test('Stage 1: Real M1 Single Inference Sanity (Contradiction & Neutral)', async () => {
    // Contradiction case
    const contraRes = await mlClient.verify({
      requestId: 'test_p7_contra',
      claimId: 'c_contra',
      claim: 'P-101A has a maximum discharge pressure of 15.2 bar.',
      evidence: [{
        chunkId: 'chk_1',
        text: 'P-101A has a maximum discharge pressure of 12.5 bar.',
      }]
    });
    assert.strictEqual(contraRes.claimId, 'c_contra');
    assert.strictEqual(contraRes.label, 'contradiction');
    assert.ok(contraRes.scores.contradiction > 0.8, 'Contradiction score must be > 0.8');
    assert.ok(contraRes.groundingScore < 0.2, 'Grounding score must be low');

    // Neutral case
    const neutralRes = await mlClient.verify({
      requestId: 'test_p7_neutral',
      claimId: 'c_neutral',
      claim: 'P-101A was installed in 2019.',
      evidence: [{
        chunkId: 'chk_2',
        text: 'P-101A has a rated flow of 120 m³/h.',
      }]
    });
    assert.strictEqual(neutralRes.claimId, 'c_neutral');
    assert.strictEqual(neutralRes.label, 'neutral');
    assert.ok(neutralRes.scores.neutral > 0.8, 'Neutral score must be > 0.8');

    // Score invariants
    for (const res of [contraRes, neutralRes]) {
      const sum = res.scores.entailment + res.scores.contradiction + res.scores.neutral;
      assert.ok(Math.abs(sum - 1.0) < 0.01, 'Scores must sum to approximately 1.0');
      assert.ok(res.scores.entailment >= 0 && res.scores.entailment <= 1);
      assert.ok(res.scores.contradiction >= 0 && res.scores.contradiction <= 1);
      assert.ok(res.scores.neutral >= 0 && res.scores.neutral <= 1);
    }
  });

  test('Stage 1: Real M1 Batch Verify', async () => {
    const items = [
      {
        claimId: 'batch_c1',
        claim: 'Centrifugal pump P-101A is designed with a rated flow rate of 120 m3/h.',
        evidence: [{ chunkId: 'b1', text: 'Centrifugal pump P-101A is designed with a rated flow rate of 120 m3/h.' }]
      },
      {
        claimId: 'batch_c2',
        claim: 'P-101A has a maximum discharge pressure of 15.2 bar.',
        evidence: [{ chunkId: 'b2', text: 'P-101A has a maximum discharge pressure of 12.5 bar.' }]
      },
      {
        claimId: 'batch_c3',
        claim: 'P-101A was installed in 2019.',
        evidence: [{ chunkId: 'b3', text: 'P-101A has a rated flow of 120 m3/h.' }]
      }
    ];

    const batchRes = await mlClient.verifyBatch({ requestId: 'req_batch_test', items });
    assert.strictEqual(batchRes.results.length, 3, 'Batch must return 3 results');
    assert.strictEqual(batchRes.results[0].claimId, 'batch_c1');
    assert.strictEqual(batchRes.results[1].claimId, 'batch_c2');
    assert.strictEqual(batchRes.results[2].claimId, 'batch_c3');
    assert.strictEqual(batchRes.results[0].label, 'entailment');
    assert.strictEqual(batchRes.results[1].label, 'contradiction');
    assert.strictEqual(batchRes.results[2].label, 'neutral');
  });

  test('Stage 2: Deterministic Technical Checks (All mandatory checks)', () => {
    // 1. Numeric mismatch
    const numCheck = technicalChecker.evaluate(
      'P-101A maximum pressure is 15.2 bar.',
      'P-101A maximum pressure is 12.5 bar.'
    );
    assert.strictEqual(numCheck.passed, false);
    assert.strictEqual(numCheck.conflicts[0].type, 'number_mismatch');

    // 2. Negative sign mismatch
    const signCheck = technicalChecker.evaluate(
      'Operating temperature is 20 C.',
      'Operating temperature is -20 C.'
    );
    assert.strictEqual(signCheck.passed, false);
    assert.strictEqual(signCheck.conflicts[0].type, 'sign_mismatch');

    // 3. Unit mismatch
    const unitCheck = technicalChecker.evaluate(
      'Rated flow is 120 m3/h.',
      'Rated flow is 120 bar.'
    );
    assert.strictEqual(unitCheck.passed, false);
    assert.strictEqual(unitCheck.conflicts[0].type, 'unit_mismatch');

    // 4. Identifier mismatch
    const idCheck = technicalChecker.evaluate(
      'Pump P-101B is operating.',
      'Pump P-101A is operating.'
    );
    assert.strictEqual(idCheck.passed, false);
    assert.strictEqual(idCheck.conflicts[0].type, 'identifier_mismatch');

    // 5. Percentage mismatch
    const pctCheck = technicalChecker.evaluate(
      'Efficiency is 85%.',
      'Efficiency is 90%.'
    );
    assert.strictEqual(pctCheck.passed, false);
    assert.strictEqual(pctCheck.conflicts[0].type, 'percentage_mismatch');

    // 6. Date mismatch
    const dateCheck = technicalChecker.evaluate(
      'Installed in 2019.',
      'Installed in 2024.'
    );
    assert.strictEqual(dateCheck.passed, false);
    assert.strictEqual(dateCheck.conflicts[0].type, 'date_mismatch');

    // 7. Negation polarity mismatch
    const negCheck = technicalChecker.evaluate(
      'Valve V-204 is not closed.',
      'Valve V-204 is closed.'
    );
    assert.strictEqual(negCheck.passed, false);
    assert.strictEqual(negCheck.conflicts[0].type, 'negation_mismatch');

    // 8. Modality escalation mismatch
    const modCheck = technicalChecker.evaluate(
      'Isolation valve V-204 must remain closed.',
      'Isolation valve V-204 should remain closed.'
    );
    assert.strictEqual(modCheck.passed, false);
    assert.strictEqual(modCheck.conflicts[0].type, 'modality_escalation');

    // Consistent technical values PASS
    const passCheck = technicalChecker.evaluate(
      'Centrifugal pump P-101A has a rated flow of 120 m3/h and maximum pressure of 15.2 bar.',
      'Centrifugal pump P-101A has a rated flow of 120 m3/h and maximum pressure of 15.2 bar.'
    );
    assert.strictEqual(passCheck.passed, true);
    assert.strictEqual(passCheck.conflicts.length, 0);
  });

  test('Decision Policy Composition: Stage 1 + Stage 2', () => {
    // Semantic entailment + Technical PASS -> verified
    const r1 = verificationOrchestrator.composeDecision(
      'entailment',
      { entailment: 0.95, contradiction: 0.02, neutral: 0.03 },
      0.95,
      { passed: true, conflicts: [] }
    );
    assert.strictEqual(r1.finalStatus, 'verified');
    assert.strictEqual(r1.finalLabel, 'entailment');

    // Semantic entailment BUT Technical Conflict -> flagged (contradiction)
    const r2 = verificationOrchestrator.composeDecision(
      'entailment',
      { entailment: 0.90, contradiction: 0.05, neutral: 0.05 },
      0.90,
      { passed: false, conflicts: [{ type: 'number_mismatch', details: '15.2 != 12.5' }] }
    );
    assert.strictEqual(r2.finalStatus, 'flagged');
    assert.strictEqual(r2.finalLabel, 'contradiction');
    assert.strictEqual(r2.scores.contradiction, 1.0);
    assert.strictEqual(r2.groundingScore, 0.0);

    // Contradiction -> flagged
    const r3 = verificationOrchestrator.composeDecision(
      'contradiction',
      { entailment: 0.01, contradiction: 0.98, neutral: 0.01 },
      0.0,
      { passed: true, conflicts: [] }
    );
    assert.strictEqual(r3.finalStatus, 'flagged');
    assert.strictEqual(r3.finalLabel, 'contradiction');

    // Neutral -> needs_review
    const r4 = verificationOrchestrator.composeDecision(
      'neutral',
      { entailment: 0.1, contradiction: 0.1, neutral: 0.8 },
      0.1,
      { passed: true, conflicts: [] }
    );
    assert.strictEqual(r4.finalStatus, 'needs_review');
    assert.strictEqual(r4.finalLabel, 'neutral');

    // Zero evidence -> needs_review without calling M1
    const rZero = verificationOrchestrator.resolveZeroEvidence();
    assert.strictEqual(rZero.finalStatus, 'needs_review');
    assert.strictEqual(rZero.finalLabel, 'neutral');
    assert.strictEqual(rZero.modelVersion, 'groundguard-zero-evidence');

    // FORBIDDEN INVARIANT: recovered must never be used in Phase 7
    assert.notStrictEqual(r1.finalStatus, 'recovered');
    assert.notStrictEqual(r2.finalStatus, 'recovered');
    assert.notStrictEqual(r3.finalStatus, 'recovered');
    assert.notStrictEqual(r4.finalStatus, 'recovered');
    assert.notStrictEqual(rZero.finalStatus, 'recovered');
  });

  test('Full Phase 7 Verification Orchestration & Database Persistence', async () => {
    // 0. Create initial generation record
    const gen = await generationRepository.createGeneration({
      requestId: 'req_test_e2e_p7',
      projectId,
      conversationId,
      query: 'What are the specs of P-101A?',
      maxRecoveryAttempts: 0,
    });
    const generationId = gen.id;

    const evidenceList: Evidence[] = [
      {
        chunkId: 'chk_p7_1',
        documentId: 'doc_p7_manual',
        text: 'Centrifugal pump P-101A is designed with a rated flow rate of 120 m3/h and maximum discharge pressure of 12.5 bar.',
        pageNumber: 1,
        section: 'Specs',
        heading: 'Pump Specifications',
        score: 0.95
      }
    ];

    const initialClaims: Claim[] = [
      {
        claimId: 'claim_entailed',
        text: 'Centrifugal pump P-101A is designed with a rated flow rate of 120 m3/h.',
        status: 'pending',
        evidence: evidenceList
      },
      {
        claimId: 'claim_conflicting',
        text: 'Centrifugal pump P-101A maximum discharge pressure is 15.2 bar.',
        status: 'pending',
        evidence: evidenceList
      },
      {
        claimId: 'claim_zero_evidence',
        text: 'Pump P-101A was repainted in blue in 2023.',
        status: 'pending',
        evidence: []
      }
    ];

    // 1. Persist generation with pending claims
    await generationRepository.persistCompletedGeneration({
      generationId,
      projectId,
      conversationId,
      answer: 'P-101A has flow rate 120 m3/h and max pressure 15.2 bar. It was repainted in 2023.',
      claims: initialClaims,
      totalLatencyMs: 500
    });

    // Verify initial claims are 'pending'
    const persistedPending = await generationRepository.listClaimsByGenerationId(generationId);
    assert.strictEqual(persistedPending.length, 3);
    assert.ok(persistedPending.every((c) => c.status === 'pending'));

    // 2. Run Phase 7 Verification Orchestrator
    const verifiedResults = await verificationOrchestrator.verifyGenerationClaims(
      generationId,
      'req_test_e2e_p7'
    );

    assert.strictEqual(verifiedResults.length, 3);

    // 3. Read back verified claims directly from PostgreSQL
    const persistedVerified = await generationRepository.listClaimsByGenerationId(generationId);
    assert.strictEqual(persistedVerified.length, 3);

    const c1 = persistedVerified.find((c) => c.text.includes('rated flow rate of 120 m3/h'))!;
    const c2 = persistedVerified.find((c) => c.text.includes('15.2 bar'))!;
    const c3 = persistedVerified.find((c) => c.text.includes('repainted in blue'))!;

    // Claim 1: Supported -> verified (entailment)
    assert.strictEqual(c1.status, 'verified', 'Claim 1 must be verified');
    assert.strictEqual(c1.label, 'entailment');
    assert.ok(c1.entailmentScore! > 0.8);
    assert.strictEqual(c1.modelVersion, 'groundguard-deberta-v1-finetuned');

    // Claim 2: Conflicting number (15.2 vs 12.5) -> flagged (contradiction)
    assert.strictEqual(c2.status, 'flagged', 'Claim 2 must be flagged');
    assert.strictEqual(c2.label, 'contradiction');
    assert.ok(c2.contradictionScore! > 0.8);

    // Claim 3: Zero evidence -> needs_review (neutral)
    assert.strictEqual(c3.status, 'needs_review', 'Claim 3 with zero evidence must be needs_review');
    assert.strictEqual(c3.label, 'neutral');
    assert.strictEqual(c3.modelVersion, 'groundguard-zero-evidence');
    assert.strictEqual(c3.groundingScore, 0.0);

    // Invariant: no claims are 'pending' or 'recovered'
    assert.ok(persistedVerified.every((c) => c.status !== 'pending' && (c.status as string) !== 'recovered'));
  });
});
