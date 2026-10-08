/**
 * Regression (gen_bd878a64 shape): 8 claims, 7 unverified -> recovery must be bounded per generation,
 * must not re-try an unchanged claim after 'keep', must prioritize contradicted claims, and must still
 * recover a claim when re-verification entails it. Repository / M2 / M1 clients are stubbed.
 */
import assert from 'node:assert';
import { recoveryOrchestrator, MAX_RECOVERY_ATTEMPTS_PER_GENERATION } from '../services/recovery.orchestrator';
import { generationRepository } from '../repositories/generation.repository';
import { aiClient } from '../clients/ai.client';
import { mlClient } from '../clients/ml.client';

const EV = { id: 'e1', chunkId: 'chk_da8c9ff4de9b', documentId: 'doc_stud', text: 'He was more than six feet high, was in the prime of life ...', metadata: { filename: 'stud.pdf' } };

function setup(statuses: string[]) {
  const repo = generationRepository as any;
  const claims = statuses.map((st, i) => ({ id: `c${i}`, generationId: 'g', text: `Claim ${i}`, status: st,
    label: st === 'flagged' ? 'contradiction' : st === 'verified' ? 'entailment' : 'neutral', modelVersion: 'm1', claimIndex: i }));
  repo.findGenerationById = async () => ({ id: 'g', projectId: 'p1', maxRecoveryAttempts: 2 });
  repo.listClaimsByGenerationId = async () => claims;
  repo.listEvidenceByClaimId = async () => [EV];
  repo.createRecoveryAttempt = async () => ({});
  repo.updateGeneration = async () => ({});
  repo.createEvidence = async () => ({});
  repo.updateClaimRecovered = async (id: string) => ({ ...claims.find((c) => c.id === id), status: 'recovered' });
  return claims;
}

async function run() {
  console.log('=== Recovery budget regression ===');

  // 1. 'keep' + non-entailed re-verification: one attempt per claim, total bounded by the generation budget.
  setup(['needs_review', 'needs_review', 'needs_review', 'needs_review', 'verified', 'needs_review', 'needs_review', 'needs_review']);
  const order: string[] = [];
  (aiClient as any).recover = async (req: any) => {
    order.push(req.claimId);
    return { requestId: 'r', claimId: req.claimId, action: 'keep', candidateClaim: `Claim ${req.claimId}`, recoveryEvidence: [EV], modelVersion: 'gemini' };
  };
  (mlClient as any).verifyBatch = async (p: any) => ({ requestId: 'r', modelVersion: 'm1', results: p.items.map((it: any) => ({
    claimId: it.claimId, label: 'neutral', groundingScore: 0.1, scores: { entailment: 0.01, contradiction: 0.01, neutral: 0.98 } })) });
  const r1 = await recoveryOrchestrator.recoverGenerationClaims('g', 'req');
  assert.ok(!order.includes('c4'), 'already verified claim must not be recovered');
  assert.strictEqual(new Set(order).size, order.length, "no claim re-tried after an unchanged 'keep'");
  assert.strictEqual(r1.totalAttempts, Math.min(7, MAX_RECOVERY_ATTEMPTS_PER_GENERATION), `bounded attempts (got ${r1.totalAttempts})`);
  console.log(`[OK] 7 unverified claims -> ${r1.totalAttempts} attempts (was 15 in gen_bd878a64)`);

  // 2. Contradicted claims are recovered first when the budget is scarce.
  setup(['needs_review', 'needs_review', 'needs_review', 'needs_review', 'needs_review', 'needs_review', 'needs_review', 'flagged']);
  order.length = 0;
  await recoveryOrchestrator.recoverGenerationClaims('g', 'req');
  assert.strictEqual(order[0], 'c7', 'flagged (contradicted) claim recovered first');
  console.log('[OK] contradicted claim prioritised');

  // 3. A real revision that M1 entails is still recovered (verification semantics unchanged).
  setup(['flagged']);
  (aiClient as any).recover = async (req: any) => ({ requestId: 'r', claimId: req.claimId, action: 'revise',
    candidateClaim: 'Pump P-101A has a rated flow of 450 gpm.', recoveryEvidence: [EV], modelVersion: 'gemini' });
  (mlClient as any).verifyBatch = async (p: any) => ({ requestId: 'r', modelVersion: 'm1', results: p.items.map((it: any) => ({
    claimId: it.claimId, label: 'entailment', groundingScore: 0.9, scores: { entailment: 0.95, contradiction: 0.01, neutral: 0.04 } })) });
  const r3 = await recoveryOrchestrator.recoverGenerationClaims('g', 'req');
  assert.strictEqual(r3.recoveredCount, 1, 'entailed revision recovers the claim');
  console.log('[OK] entailed revision still recovers');
  process.exit(0);
}

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
