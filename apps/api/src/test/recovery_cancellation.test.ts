/**
 * Regression: recovery must stop issuing provider-backed /recover calls once a generation is cancelled.
 * Repository and M2 client are stubbed (no DB, no LLM).
 */
import assert from 'node:assert';
import { recoveryOrchestrator } from '../services/recovery.orchestrator';
import { generationRepository } from '../repositories/generation.repository';
import { generationEvents } from '../services/generation-events';
import { aiClient } from '../clients/ai.client';

async function run() {
  console.log('=== Recovery cancellation regression ===');
  const genId = 'gen_cancel_during_recovery';
  const claim = (id: string) => ({
    id, generationId: genId, text: `Pump P-101A flows at 900 gpm (${id}).`, status: 'flagged', label: 'contradiction',
    modelVersion: 'm1', claimIndex: 0,
  });
  const repo = generationRepository as any;
  repo.findGenerationById = async () => ({ id: genId, projectId: 'p1', maxRecoveryAttempts: 2 });
  repo.listClaimsByGenerationId = async () => [claim('c1'), claim('c2')];
  repo.listEvidenceByClaimId = async () => [{ id: 'e1', chunkId: 'k1', documentId: 'd1', text: 'Rated flow is 450 gpm.', metadata: {} }];
  repo.createRecoveryAttempt = async () => ({});
  repo.updateGeneration = async () => ({});
  repo.updateClaim = async () => ({});

  let recoverCalls = 0;
  (aiClient as any).recover = async (req: any) => {
    recoverCalls++;
    generationEvents.markCancelled(genId); // user cancels while the first recovery call is in flight
    return { requestId: 'r', claimId: req.claimId, action: 'abstain', candidateClaim: null, recoveryEvidence: [], modelVersion: 'x', reason: 'silent' };
  };

  await recoveryOrchestrator.recoverGenerationClaims(genId, 'req');
  assert.strictEqual(recoverCalls, 1, `no further /recover calls after cancellation (got ${recoverCalls})`);
  console.log('[OK] recovery stops after cancellation (1 call instead of up to 4)');
  process.exit(0);
}

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
