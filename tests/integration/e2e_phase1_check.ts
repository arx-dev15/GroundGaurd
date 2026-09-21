/**
 * Phase 1 Live Services Verification Script
 * Validates connectivity across M3 (4000), M2 (8000), Mock M1 (8001), PostgreSQL, Redis,
 * contract validations, and x-request-id propagation.
 */

import { AIClient } from '../../apps/api/src/clients/ai.client';
import { MLClient } from '../../apps/api/src/clients/ml.client';

async function runE2ECheck() {
  console.log('=== GroundGuard Phase 1 Live Integration Verification ===\n');

  const apiPort = process.env.PORT || 4000;
  const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:8001';

  const requestId = `req_e2e_verify_${Date.now()}`;

  // 1. M3 Liveness
  console.log(`[1] Testing M3 Liveness (http://localhost:${apiPort}/health)...`);
  try {
    const res = await fetch(`http://localhost:${apiPort}/health`, {
      headers: { 'x-request-id': requestId },
    });
    const body = await res.json();
    console.log(` -> M3 Health Status: ${res.status}`, body);
    if (res.headers.get('x-request-id') === requestId) {
      console.log(' -> x-request-id propagation to M3 reply: PASSED ✓');
    } else {
      console.warn(' -> x-request-id header missing/mismatched');
    }
  } catch (err: any) {
    console.error(' -> M3 Health check failed:', err.message);
  }

  // 2. M2 Health
  console.log(`\n[2] Testing M2 Health (${aiUrl}/health)...`);
  const aiClient = new AIClient(aiUrl);
  const aiHealth = await aiClient.checkHealth();
  console.log(' -> M2 Health result:', aiHealth);

  // 3. Mock M1 Health
  console.log(`\n[3] Testing Mock M1 Health (${mlUrl}/health)...`);
  const mlClient = new MLClient(mlUrl);
  const mlHealth = await mlClient.checkHealth();
  console.log(' -> Mock M1 Health result:', mlHealth);

  // 4. M3 -> M2 /generate request & x-request-id propagation
  if (aiHealth.ok) {
    console.log(`\n[4] Testing AIClient -> M2 /generate with x-request-id=${requestId}...`);
    try {
      const genResult = await aiClient.generate(
        {
          projectId: 'proj_test_1',
          query: 'What was the revenue in 2024?',
        },
        requestId
      );
      console.log(' -> M2 Generate Response:', JSON.stringify(genResult, null, 2));
      if (genResult.requestId === requestId) {
        console.log(' -> x-request-id propagation through AIClient to M2: PASSED ✓');
      }
    } catch (err: any) {
      console.error(' -> AIClient generate failed:', err.message);
    }
  }

  // 5. M3 -> Mock M1 /verify request & x-request-id propagation
  if (mlHealth.ok) {
    console.log(`\n[5] Testing MLClient -> Mock M1 /verify with x-request-id=${requestId}...`);
    try {
      const verifyResult = await mlClient.verify(
        {
          requestId,
          claimId: 'claim_test_1',
          claim: 'The revenue was ₹80 Cr.',
          evidence: [{ chunkId: 'chunk_1', text: 'Revenue was ₹50 Cr.' }],
        },
        requestId
      );
      console.log(' -> Mock M1 Verify Response:', JSON.stringify(verifyResult, null, 2));
      if (verifyResult.requestId === requestId && verifyResult.label === 'contradiction') {
        console.log(' -> Mock M1 verify contract & x-request-id propagation: PASSED ✓');
      }
    } catch (err: any) {
      console.error(' -> MLClient verify failed:', err.message);
    }
  }

  // 6. M3 Readiness
  console.log(`\n[6] Testing M3 Readiness (http://localhost:${apiPort}/health/readiness)...`);
  try {
    const res = await fetch(`http://localhost:${apiPort}/health/readiness`);
    const body = await res.json();
    console.log(` -> M3 Readiness Status: ${res.status}`, JSON.stringify(body, null, 2));
  } catch (err: any) {
    console.error(' -> M3 Readiness check failed:', err.message);
  }

  console.log('\n=== E2E Check Finished ===');
}

if (require.main === module) {
  runE2ECheck();
}
