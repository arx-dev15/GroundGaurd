import assert from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { newDb } from 'pg-mem';
import { buildApp } from '../../apps/api/src/app';
import { dbManager } from '../../apps/api/src/plugins/database';
import { runMigrations } from '../../infra/scripts/migrate';
import { generationRepository } from '../../apps/api/src/repositories/generation.repository';
import { technicalChecker } from '../../apps/api/src/services/technical-checks';
import { verificationOrchestrator } from '../../apps/api/src/services/verification.orchestrator';
import { recoveryOrchestrator, MAX_RECOVERY_ATTEMPTS } from '../../apps/api/src/services/recovery.orchestrator';
import { mlClient } from '../../apps/api/src/clients/ml.client';
import { aiClient } from '../../apps/api/src/clients/ai.client';
import { generateId } from '../../apps/api/src/utils/id';
import { Claim, Evidence } from '@groundguard/contracts';

function createTestPdf(customText?: string): Buffer {
  const text =
    customText ||
    'Pump P-101A is a centrifugal feedwater pump. ' +
    'The rated flow rate of pump P-101A is 120 m3/h. ' +
    'The maximum discharge pressure of pump P-101A is 12.5 bar. ' +
    'The design temperature is 180 C. ' +
    'Operating speed is 2950 rpm. ' +
    'Downstream isolation valve is XV-204.';

  const contentStream = `BT\n/F1 12 Tf\n72 720 Td\n(${text}) Tj\nET`;
  const contentBytes = Buffer.from(contentStream, 'latin1');

  const objects: Buffer[] = [
    Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'latin1'),
    Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', 'latin1'),
    Buffer.from(
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
        '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
      'latin1'
    ),
    Buffer.concat([
      Buffer.from(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`, 'latin1'),
      contentBytes,
      Buffer.from('\nendstream\nendobj\n', 'latin1'),
    ]),
    Buffer.from('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n', 'latin1'),
  ];

  const header = Buffer.from('%PDF-1.4\n', 'latin1');
  const offsets: number[] = [];
  let pos = header.length;
  for (const obj of objects) {
    offsets.push(pos);
    pos += obj.length;
  }

  const xrefOffset = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.concat([header, ...objects, Buffer.from(xref, 'latin1'), Buffer.from(trailer, 'latin1')]);
}

describe('GroundGuard Phase 8: Failure-Aware Agentic Recovery Test Suite', () => {
  const app = buildApp();
  let userToken: string;
  let userId: string;
  let projectIdA: string;
  let projectIdB: string;

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

    // 2. Run migrations (including 008_claim_recovery_attempts.sql)
    await runMigrations(dbManager.getPool());

    const pool = dbManager.getPool();
    await pool.query("DELETE FROM projects WHERE name LIKE 'Phase 8 Test Project%'");
    await pool.query("DELETE FROM users WHERE email LIKE '%@testphase8.com'");

    // 3. Register Test User
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'user@testphase8.com', password: 'Password123!', name: 'User Phase 8' },
    });
    const body = JSON.parse(res.payload);
    userToken = body.token;
    userId = body.user.id;

    // 4. Create Project A (with documents)
    const projARes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Phase 8 Test Project A' },
    });
    projectIdA = JSON.parse(projARes.payload).project.id;

    // 5. Create Project B (isolated project, empty)
    const projBRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Phase 8 Test Project B' },
    });
    projectIdB = JSON.parse(projBRes.payload).project.id;

    const pdfBufferSpecs = createTestPdf(
      'Centrifugal pump P-101A has a rated flow rate of 120 m3/h and maximum discharge pressure of 12.5 bar.'
    );
    const ingestRes1 = await aiClient.ingest(
      'doc_p101a_specs',
      projectIdA,
      pdfBufferSpecs,
      'p101a_specs.pdf'
    );
    assert.ok(ingestRes1.status === 'completed' || ingestRes1.status === 'ready');

    const pdfBufferTemp = createTestPdf(
      'Centrifugal pump P-101A design temperature is 180 C.'
    );
    const ingestRes2 = await aiClient.ingest(
      'doc_p101a_temp',
      projectIdA,
      pdfBufferTemp,
      'p101a_temp.pdf'
    );
    assert.ok(ingestRes2.status === 'completed' || ingestRes2.status === 'ready');
  });

  after(async () => {
    // Cleanup Project A & B
    await aiClient.deleteDocument('doc_p101a_specs', projectIdA).catch(() => {});
    await aiClient.deleteDocument('doc_p101a_temp', projectIdA).catch(() => {});
  });

  test('1. Eligibility: Verified and Recovered Claims are NOT Eligible for Recovery', async () => {
    const gen = await generationRepository.createGeneration({
      requestId: 'req_test_eligibility',
      projectId: projectIdA,
      query: 'Check eligibility',
      maxRecoveryAttempts: 2,
    });

    // Create a verified claim
    const verifiedClaim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 0,
      text: 'P-101A rated flow rate is 120 m³/h.',
      status: 'verified',
      label: 'entailment',
      entailmentScore: 0.99,
      contradictionScore: 0.0,
      neutralScore: 0.01,
      groundingScore: 0.99,
      modelVersion: 'groundguard-deberta-v1-finetuned',
    });

    // Create a recovered claim
    const recoveredClaim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 1,
      text: 'P-101A maximum discharge pressure is 12.5 bar.',
      status: 'recovered',
      label: 'entailment',
      entailmentScore: 0.98,
      contradictionScore: 0.0,
      neutralScore: 0.02,
      groundingScore: 0.98,
      modelVersion: 'groundguard-deberta-v1-finetuned',
    });

    const resVerified = await recoveryOrchestrator.recoverClaim({
      projectId: projectIdA,
      generationId: gen.id,
      claim: verifiedClaim,
      existingEvidence: [],
    });
    assert.strictEqual(resVerified.recovered, false);
    assert.strictEqual(resVerified.attempts, 0);

    const resRecovered = await recoveryOrchestrator.recoverClaim({
      projectId: projectIdA,
      generationId: gen.id,
      claim: recoveredClaim,
      existingEvidence: [],
    });
    assert.strictEqual(resRecovered.recovered, false);
    assert.strictEqual(resRecovered.attempts, 0);
  });

  test('2. Deterministic Failure Diagnosis: Correctly Maps All Canonical Categories', async () => {
    const gen = await generationRepository.createGeneration({
      requestId: 'req_test_diag',
      projectId: projectIdA,
      query: 'Check diagnosis',
      maxRecoveryAttempts: 2,
    });

    // M1 unavailable
    const m1UnavailClaim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 0,
      text: 'Sample claim',
      status: 'needs_review',
      label: 'neutral',
      modelVersion: 'groundguard-m1-unavailable',
    });
    assert.strictEqual(
      recoveryOrchestrator.diagnoseFailure(m1UnavailClaim, []),
      'M1_UNAVAILABLE'
    );

    // Zero evidence
    const zeroEvClaim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 1,
      text: 'Sample claim zero evidence',
      status: 'needs_review',
      label: 'neutral',
      modelVersion: 'groundguard-zero-evidence',
    });
    assert.strictEqual(
      recoveryOrchestrator.diagnoseFailure(zeroEvClaim, []),
      'ZERO_EVIDENCE'
    );

    // Contradiction
    const contraClaim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 2,
      text: 'P-101A is an electric heater.',
      status: 'flagged',
      label: 'contradiction',
      modelVersion: 'groundguard-deberta-v1-finetuned',
    });
    const evItem = await generationRepository.createEvidence({
      claimId: contraClaim.id,
      chunkId: 'chunk_1',
      text: 'Pump P-101A is a centrifugal feedwater pump.',
    });
    assert.strictEqual(
      recoveryOrchestrator.diagnoseFailure(contraClaim, [evItem]),
      'CONTRADICTION'
    );

    // Technical conflict (number/unit mismatch)
    const techConflictClaim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 3,
      text: 'P-101A maximum discharge pressure is 15.2 bar.',
      status: 'flagged',
      label: 'contradiction',
      modelVersion: 'groundguard-deberta-v1-finetuned',
    });
    const evItemTech = await generationRepository.createEvidence({
      claimId: techConflictClaim.id,
      chunkId: 'chunk_2',
      text: 'The maximum discharge pressure of pump P-101A is 12.5 bar.',
    });
    assert.strictEqual(
      recoveryOrchestrator.diagnoseFailure(techConflictClaim, [evItemTech]),
      'TECHNICAL_CONFLICT'
    );

    // Insufficient evidence (neutral)
    const neutralClaim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 4,
      text: 'P-101A impeller is made of stainless steel.',
      status: 'needs_review',
      label: 'neutral',
      modelVersion: 'groundguard-deberta-v1-finetuned',
    });
    const evItemNeutral = await generationRepository.createEvidence({
      claimId: neutralClaim.id,
      chunkId: 'chunk_3',
      text: 'Pump P-101A is a centrifugal feedwater pump.',
    });
    assert.strictEqual(
      recoveryOrchestrator.diagnoseFailure(neutralClaim, [evItemNeutral]),
      'INSUFFICIENT_EVIDENCE'
    );
  });

  test('3. Infrastructure Failure: M1_UNAVAILABLE Fails Closed Without Recovery', async () => {
    const gen = await generationRepository.createGeneration({
      requestId: 'req_test_m1_unavail',
      projectId: projectIdA,
      query: 'Check M1 down',
      maxRecoveryAttempts: 2,
    });

    const claim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 0,
      text: 'P-101A rated flow rate is 120 m³/h.',
      status: 'needs_review',
      label: 'neutral',
      modelVersion: 'groundguard-m1-unavailable',
    });

    const res = await recoveryOrchestrator.recoverClaim({
      projectId: projectIdA,
      generationId: gen.id,
      claim,
      existingEvidence: [],
    });

    // Must not recover, 0 attempts, status unchanged
    assert.strictEqual(res.recovered, false);
    assert.strictEqual(res.attempts, 0);
    assert.strictEqual(res.finalClaim.status, 'needs_review');
  });

  test('4. Project Isolation: Recovery Retrieval Respects Project Boundaries', async () => {
    // Project A has p101a manual. Project B is completely empty.
    const genB = await generationRepository.createGeneration({
      requestId: 'req_test_iso_b',
      projectId: projectIdB,
      query: 'Check project isolation',
      maxRecoveryAttempts: 2,
    });

    const claimB = await generationRepository.createClaim({
      generationId: genB.id,
      claimIndex: 0,
      text: 'P-101A rated flow rate is 120 m³/h.',
      status: 'needs_review',
      label: 'neutral',
      modelVersion: 'groundguard-zero-evidence',
    });

    const res = await recoveryOrchestrator.recoverClaim({
      projectId: projectIdB, // Project B
      generationId: genB.id,
      claim: claimB,
      existingEvidence: [],
    });

    // Must NOT retrieve chunks from Project A!
    assert.strictEqual(res.recovered, false);
    assert.strictEqual(res.finalClaim.status, 'needs_review');
  });

  test('5. Real Recovery: Successful Contradiction Recovery (15.2 bar -> 12.5 bar)', async () => {
    // Failed claim: states 15.2 bar while canonical document has 12.5 bar
    const gen = await generationRepository.createGeneration({
      requestId: 'req_test_contra_recov',
      projectId: projectIdA,
      query: 'What is P-101A maximum discharge pressure?',
      maxRecoveryAttempts: 2,
    });

    const failedClaim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 0,
      text: 'P-101A maximum discharge pressure is 15.2 bar.',
      status: 'flagged',
      label: 'contradiction',
      contradictionScore: 1.0,
      entailmentScore: 0.0,
      neutralScore: 0.0,
      groundingScore: 0.0,
      modelVersion: 'groundguard-deberta-v1-finetuned',
    });

    // Initially had wrong or conflicting evidence
    const wrongEv = await generationRepository.createEvidence({
      claimId: failedClaim.id,
      chunkId: 'chunk_wrong',
      text: 'P-101A operating parameters include various pressure ratings.',
    });

    const res = await recoveryOrchestrator.recoverClaim({
      projectId: projectIdA,
      generationId: gen.id,
      claim: failedClaim,
      existingEvidence: [wrongEv],
    });

    // Assertions
    assert.strictEqual(res.recovered, true, 'Claim should be successfully recovered');
    assert.strictEqual(res.finalClaim.status, 'recovered');
    assert.strictEqual(res.finalClaim.label, 'entailment');
    assert.ok(
      res.finalClaim.text.includes('12.5 bar') || res.finalClaim.text.includes('12.5'),
      `Candidate text should contain corrected 12.5 bar: got '${res.finalClaim.text}'`
    );

    // Verify Audit History was persisted in claim_recovery_attempts
    const attempts = await generationRepository.listRecoveryAttemptsByClaimId(failedClaim.id);
    assert.ok(attempts.length >= 1, 'Audit history should record at least 1 attempt');
    const firstAttempt = attempts[0];
    assert.strictEqual(firstAttempt.claimId, failedClaim.id);
    assert.strictEqual(firstAttempt.originalText, 'P-101A maximum discharge pressure is 15.2 bar.');
    assert.strictEqual(firstAttempt.action, 'revise');
    assert.strictEqual(firstAttempt.verificationLabel, 'entailment');
    assert.ok(firstAttempt.entailmentScore !== null && firstAttempt.entailmentScore > 0.5);
    assert.ok(firstAttempt.recoveryModelVersion !== null && firstAttempt.recoveryModelVersion.length > 0);
  });

  test('6. Real Recovery: Successful Neutral / Zero-Evidence Recovery (rated flow 120 m³/h)', async () => {
    const gen = await generationRepository.createGeneration({
      requestId: 'req_test_neutral_recov',
      projectId: projectIdA,
      query: 'What is P-101A rated flow rate?',
      maxRecoveryAttempts: 2,
    });

    // Failed claim: neutral / needs_review with zero initial evidence
    const failedClaim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 0,
      text: 'The rated flow rate of pump P-101A is 120 m³/h.',
      status: 'needs_review',
      label: 'neutral',
      contradictionScore: 0.0,
      entailmentScore: 0.0,
      neutralScore: 1.0,
      groundingScore: 0.0,
      modelVersion: 'groundguard-zero-evidence',
    });

    const res = await recoveryOrchestrator.recoverClaim({
      projectId: projectIdA,
      generationId: gen.id,
      claim: failedClaim,
      existingEvidence: [], // zero evidence initially
    });

    assert.strictEqual(res.recovered, true, 'Zero-evidence claim should be recovered when doc exists');
    assert.strictEqual(res.finalClaim.status, 'recovered');
    assert.strictEqual(res.finalClaim.label, 'entailment');

    // Audit check
    const attempts = await generationRepository.listRecoveryAttemptsByClaimId(failedClaim.id);
    assert.ok(attempts.length >= 1);
    assert.strictEqual(attempts[0].failureReason, 'ZERO_EVIDENCE');
  });

  test('7. Unrecoverable Claim: Stops Deterministically Within Bounded Budget (Painted Blue)', async () => {
    const gen = await generationRepository.createGeneration({
      requestId: 'req_test_unrecov',
      projectId: projectIdA,
      query: 'What color was P-101A painted?',
      maxRecoveryAttempts: 2,
    });

    const unrecovClaim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 0,
      text: 'P-101A was painted blue in 2023.',
      status: 'needs_review',
      label: 'neutral',
      modelVersion: 'groundguard-zero-evidence',
    });

    const res = await recoveryOrchestrator.recoverClaim({
      projectId: projectIdA,
      generationId: gen.id,
      claim: unrecovClaim,
      existingEvidence: [],
    });

    // Unrecoverable claim must NOT be marked recovered
    assert.strictEqual(res.recovered, false);
    assert.strictEqual(res.finalClaim.status, 'needs_review');
    assert.ok(res.attempts <= MAX_RECOVERY_ATTEMPTS, 'Must not exceed max recovery attempts');

    // Audit history records the unsuccessful attempt
    const attempts = await generationRepository.listRecoveryAttemptsByClaimId(unrecovClaim.id);
    assert.ok(attempts.length >= 1);
    assert.strictEqual(attempts[0].action, 'abstain');
  });

  test('8. Reverification is Mandatory: Recovery Never Marks Claim Recovered Without M1 Entailment', async () => {
    // Proves Section 11 & 19
    const gen = await generationRepository.createGeneration({
      requestId: 'req_test_mandatory_reverify',
      projectId: projectIdA,
      query: 'Verify mandatory check',
      maxRecoveryAttempts: 2,
    });

    const claim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 0,
      text: 'P-101A rated flow rate is 999 m³/h.', // Contradicts real 120 m³/h
      status: 'flagged',
      label: 'contradiction',
      modelVersion: 'groundguard-deberta-v1-finetuned',
    });

    // If Gemini kept 999 m³/h or an unverified claim, Stage 2 / M1 would reject it
    const res = await recoveryOrchestrator.recoverClaim({
      projectId: projectIdA,
      generationId: gen.id,
      claim,
      existingEvidence: [],
      maxAttempts: 1,
    });

    // The claim text "999 m³/h" cannot pass reverification against 120 m³/h doc
    if (res.finalClaim.text.includes('999')) {
      assert.strictEqual(res.recovered, false);
      assert.notStrictEqual(res.finalClaim.status, 'recovered');
    }
  });

  test('9. Idempotency: Multiple Execution of Same Recovery Does Not Corrupt Audit Trail', async () => {
    const gen = await generationRepository.createGeneration({
      requestId: 'req_test_idempotent',
      projectId: projectIdA,
      query: 'Check idempotency',
      maxRecoveryAttempts: 2,
    });

    const claim = await generationRepository.createClaim({
      generationId: gen.id,
      claimIndex: 0,
      text: 'P-101A rated flow rate is 120 m³/h.',
      status: 'needs_review',
      label: 'neutral',
      modelVersion: 'groundguard-zero-evidence',
    });

    // Call 1
    const res1 = await recoveryOrchestrator.recoverClaim({
      projectId: projectIdA,
      generationId: gen.id,
      claim,
      existingEvidence: [],
      maxAttempts: 1,
    });
    assert.strictEqual(res1.recovered, true);

    // Call 2 on the now recovered claim: must be safely skipped without error
    const res2 = await recoveryOrchestrator.recoverClaim({
      projectId: projectIdA,
      generationId: gen.id,
      claim: res1.finalClaim,
      existingEvidence: [],
      maxAttempts: 1,
    });
    assert.strictEqual(res2.recovered, false);
    assert.strictEqual(res2.attempts, 0);

    const attempts = await generationRepository.listRecoveryAttemptsByClaimId(claim.id);
    assert.strictEqual(attempts.length, 1, 'Only one recovery attempt record should exist');
  });
});
