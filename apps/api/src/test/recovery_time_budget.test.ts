/**
 * Regression (gen_6c84d553 shape): 4 flagged claims, each recovery attempt returns 'keep' and is not entailed.
 * The generation-wide time budget must stop starting new attempts, keep claim statuses honest, and report why.
 */
import assert from 'node:assert';
import { recoveryOrchestrator } from '../services/recovery.orchestrator';
import { generationRepository } from '../repositories/generation.repository';
import { aiClient } from '../clients/ai.client';
import { mlClient } from '../clients/ml.client';

async function run() {
  const repo = generationRepository as any;
  const claims = [0, 1, 2, 3].map((i) => ({ id: `w${i}`, generationId: 'g', text: `Dr. John H. Watson claim ${i}`, status: 'flagged', label: 'contradiction', modelVersion: 'm1', claimIndex: i }));
  const updated: string[] = [];
  repo.findGenerationById = async () => ({ id: 'g', projectId: 'p1', maxRecoveryAttempts: 2 });
  repo.listClaimsByGenerationId = async () => claims;
  repo.listEvidenceByClaimId = async () => [{ id: 'e', chunkId: 'k', documentId: 'd', text: 'I took my degree of Doctor of Medicine...', metadata: { filename: 'stud.pdf' } }];
  repo.createRecoveryAttempt = async () => ({});
  repo.updateGeneration = async () => ({});
  repo.updateClaimRecovered = async (id: string) => { updated.push(id); return {}; };
  let calls = 0;
  (aiClient as any).recover = async (req: any) => {
    calls++;
    await new Promise((r) => setTimeout(r, 120)); // simulated provider-backed recovery call
    return { requestId: 'r', claimId: req.claimId, action: 'keep', candidateClaim: null, recoveryEvidence: [{ chunkId: 'k2', text: 'x' }], modelVersion: 'gemini' };
  };
  (mlClient as any).verifyBatch = async (p: any) => ({ requestId: 'r', modelVersion: 'm1', results: p.items.map((it: any) => ({
    claimId: it.claimId, label: 'contradiction', groundingScore: 0, scores: { entailment: 0, contradiction: 0.99, neutral: 0.01 } })) });

  process.env.MAX_RECOVERY_SECONDS_PER_GENERATION = '0.2';
  const t0 = Date.now();
  const res = await recoveryOrchestrator.recoverGenerationClaims('g', 'req');
  const elapsed = Date.now() - t0;
  assert.ok(calls >= 1 && calls < 4, `time budget stops new attempts (calls=${calls})`);
  assert.strictEqual(res.stoppedReason, 'time_budget');
  assert.strictEqual(res.recoveredCount, 0);
  assert.deepStrictEqual(updated, [], 'no claim promoted without an entailed re-verification');
  assert.ok(elapsed < 4 * 120, `bounded wall time (${elapsed} ms)`);
  console.log(`[OK] 4 flagged claims -> ${calls} attempts in ${elapsed} ms, stoppedReason=time_budget (unbudgeted: 4 attempts)`);

  delete process.env.MAX_RECOVERY_SECONDS_PER_GENERATION;
  process.env.MAX_RECOVERY_SECONDS_PER_GENERATION = '60';
  calls = 0;
  const full = await recoveryOrchestrator.recoverGenerationClaims('g', 'req');
  assert.strictEqual(calls, 4, 'within budget every flagged claim still gets its attempt');
  assert.strictEqual(full.stoppedReason, undefined);
  console.log('[OK] generous budget keeps existing per-claim behavior (4 attempts)');

  // In-flight bound: a slow /recover (5 s) is aborted at the deadline and its late 'revise' result is never applied.
  process.env.MAX_RECOVERY_SECONDS_PER_GENERATION = '0.15';
  calls = 0;
  let lateApplied = false;
  let sentDeadlineMs: number | undefined;
  (aiClient as any).recover = (req: any, _rid: string, signal?: AbortSignal) => new Promise((resolve, reject) => {
    calls++;
    sentDeadlineMs = req.deadlineMs;
    const t = setTimeout(() => { lateApplied = true; resolve({ requestId: 'r', claimId: req.claimId, action: 'revise', candidateClaim: 'late', recoveryEvidence: [{ chunkId: 'k3', text: 'y' }], modelVersion: 'gemini' }); }, 5000);
    signal?.addEventListener('abort', () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; reject(e); }, { once: true });
  });
  const t1 = Date.now();
  const slow = await recoveryOrchestrator.recoverGenerationClaims('g', 'req');
  const slowElapsed = Date.now() - t1;
  assert.ok(slowElapsed < 1000, `in-flight call bounded by deadline (${slowElapsed} ms)`);
  assert.strictEqual(calls, 1);
  assert.strictEqual(slow.stoppedReason, 'time_budget');
  assert.strictEqual(slow.recoveredCount, 0);
  assert.ok(!lateApplied, 'late result discarded');
  assert.ok(typeof sentDeadlineMs === 'number' && sentDeadlineMs > 0 && sentDeadlineMs <= 150, `remaining budget propagated to M2 (deadlineMs=${sentDeadlineMs})`);
  assert.deepStrictEqual(updated, []);
  console.log(`[OK] slow in-flight /recover aborted at deadline in ${slowElapsed} ms (unbounded: 5000 ms), late result discarded`);
  delete process.env.MAX_RECOVERY_SECONDS_PER_GENERATION;
  process.exit(0);
}
run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
