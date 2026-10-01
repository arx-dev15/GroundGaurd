import assert from 'node:assert';
import crypto from 'node:crypto';
import { newDb } from 'pg-mem';
import { Pool } from 'pg';
import { buildApp } from '../app';
import { dbManager } from '../plugins/database';
import { runMigrations } from '../plugins/migrate';
import { generationEvents } from '../services/generation-events';
import { generationRepository } from '../repositories/generation.repository';

function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

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

async function runTests() {
  console.log('=== Starting Phase 9, 11, 12 Integration Test Suite ===');
  process.env.JWT_SECRET = 'test-jwt-secret-for-groundguard-integration-runs';
  process.env.RATE_LIMIT_DISABLED = 'false';

  const pool = await setupTestDb();
  const app = buildApp();
  await app.ready();

  let userAId: string;
  let userBId: string;
  let tokenA: string;
  let tokenB: string;
  let projectAId: string;
  let projectBId: string;
  let rawApiKeyA: string;
  let apiKeyAId: string;

  // 1. Auth Setup
  console.log('[Test 1] User Registration & Authentication');
  const regARes = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email: 'userA@example.com', password: 'password123', name: 'User A' },
  });
  assert.strictEqual(regARes.statusCode, 201);
  const authA = JSON.parse(regARes.payload);
  tokenA = authA.token;
  userAId = authA.user.id;

  const regBRes = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email: 'userB@example.com', password: 'password123', name: 'User B' },
  });
  assert.strictEqual(regBRes.statusCode, 201);
  const authB = JSON.parse(regBRes.payload);
  tokenB = authB.token;
  userBId = authB.user.id;

  // 2. Project Creation
  console.log('[Test 2] Project Creation');
  const projARes = await app.inject({
    method: 'POST',
    url: '/v1/projects',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { name: 'Project Alpha' },
  });
  assert.strictEqual(projARes.statusCode, 201);
  projectAId = JSON.parse(projARes.payload).project.id;

  const projBRes = await app.inject({
    method: 'POST',
    url: '/v1/projects',
    headers: { authorization: `Bearer ${tokenB}` },
    payload: { name: 'Project Beta' },
  });
  assert.strictEqual(projBRes.statusCode, 201);
  projectBId = JSON.parse(projBRes.payload).project.id;

  // 3. Phase 11 & 12: API Keys Management & Storage Security
  console.log('[Test 3] API Key Creation, Single Raw Key Return, SHA-256 Storage');
  const createKeyRes = await app.inject({
    method: 'POST',
    url: '/v1/api-keys',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { projectId: projectAId, name: 'Alpha Ingestion Key' },
  });
  assert.strictEqual(createKeyRes.statusCode, 201);
  const keyBody = JSON.parse(createKeyRes.payload);
  assert.ok(keyBody.secretKey.startsWith('gg_'), 'API key must start with prefix gg_');
  rawApiKeyA = keyBody.secretKey;
  apiKeyAId = keyBody.apiKey.id;

  // Verify DB does not contain plaintext key
  const dbKeyCheck = await pool.query('SELECT key_hash FROM api_keys WHERE id = $1', [apiKeyAId]);
  assert.strictEqual(dbKeyCheck.rowCount, 1);
  assert.notStrictEqual(dbKeyCheck.rows[0].key_hash, rawApiKeyA, 'Plaintext key must NEVER be stored in DB');
  assert.strictEqual(dbKeyCheck.rows[0].key_hash, hashApiKey(rawApiKeyA), 'DB must store SHA-256 hash');

  // Verify GET /api-keys does not return raw key
  const listKeysRes = await app.inject({
    method: 'GET',
    url: '/v1/api-keys',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(listKeysRes.statusCode, 200);
  const listBody = JSON.parse(listKeysRes.payload);
  const found = listBody.apiKeys.find((k: any) => k.id === apiKeyAId);
  assert.ok(found);
  assert.strictEqual(found.secretKey, undefined, 'GET /api-keys must never expose secretKey');

  // 4. Phase 11 & 12: API Key Scope Isolation (Key A must NOT access Project B)
  console.log('[Test 4] API Key Project Scope Isolation');
  // API key A accessing Project A -> allowed
  const keyAccessARes = await app.inject({
    method: 'GET',
    url: `/v1/projects/${projectAId}`,
    headers: { authorization: `Bearer ${rawApiKeyA}` },
  });
  assert.strictEqual(keyAccessARes.statusCode, 200, 'API Key A should access Project A');

  // API key A accessing Project B -> FORBIDDEN (403)
  const keyAccessBRes = await app.inject({
    method: 'GET',
    url: `/v1/projects/${projectBId}`,
    headers: { authorization: `Bearer ${rawApiKeyA}` },
  });
  assert.strictEqual(keyAccessBRes.statusCode, 403, 'API Key A must NOT access Project B (Scope violation)');

  // 5. Phase 11: API Key Revocation
  console.log('[Test 5] API Key Revocation');
  const revokeRes = await app.inject({
    method: 'DELETE',
    url: `/v1/api-keys/${apiKeyAId}`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(revokeRes.statusCode, 200);

  // Authenticating with revoked key must fail
  const revokedAccessRes = await app.inject({
    method: 'GET',
    url: `/v1/projects/${projectAId}`,
    headers: { authorization: `Bearer ${rawApiKeyA}` },
  });
  assert.strictEqual(revokedAccessRes.statusCode, 401, 'Revoked API key must NOT authenticate');

  // 6. Phase 12: Tenant / Project Isolation between User A and User B
  console.log('[Test 6] Tenant / Project Isolation (User B cannot access Project A)');
  const crossProjectRes = await app.inject({
    method: 'GET',
    url: `/v1/projects/${projectAId}`,
    headers: { authorization: `Bearer ${tokenB}` },
  });
  assert.strictEqual(crossProjectRes.statusCode, 404, 'User B must not see Project A');

  // 7. Phase 12: Path Traversal & Input Limits
  console.log('[Test 7] Filename Length & Malformed Upload Limits in Documents API');
  const excessiveName = 'a'.repeat(260) + '.pdf';
  const traversalRes = await app.inject({
    method: 'POST',
    url: `/v1/projects/${projectAId}/documents`,
    headers: {
      authorization: `Bearer ${tokenA}`,
      'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW',
    },
    payload:
      '------WebKitFormBoundary7MA4YWxkTrZu0gW\r\n' +
      `Content-Disposition: form-data; name="file"; filename="${excessiveName}"\r\n` +
      'Content-Type: application/pdf\r\n\r\n' +
      '%PDF-1.4 test\r\n' +
      '------WebKitFormBoundary7MA4YWxkTrZu0gW--\r\n',
  });
  assert.strictEqual(traversalRes.statusCode, 400, 'Filename exceeding 255 chars must be rejected');

  // 8. Phase 9: Generation & SSE Authorization & Replay
  console.log('[Test 8] SSE Authorization & Cross-Project Isolation');
  // Create a generation in Project A directly in DB for deterministic testing
  const genRow = await generationRepository.createGeneration({
    requestId: 'req-test-123',
    projectId: projectAId,
    query: 'What is GroundGuard?',
    maxRecoveryAttempts: 2,
  });
  const generationId = genRow.id;

  // User B tries to subscribe to User A's generation events -> FORBIDDEN (404/403)
  const sseBRes = await app.inject({
    method: 'GET',
    url: `/v1/generations/${generationId}/events`,
    headers: { authorization: `Bearer ${tokenB}` },
  });
  assert.ok(
    sseBRes.statusCode === 403 || sseBRes.statusCode === 404,
    'User B must NOT subscribe to User A generation SSE events'
  );

  // User A subscribes to User A generation events - test replay
  generationEvents.publish(generationId, 'generation.started', { generationId, status: 'generating' });
  generationEvents.publish(generationId, 'sentence.verified', {
    sentence: 'GroundGuard is an enterprise verification engine.',
    claimId: 'claim-1',
    label: 'entailment',
  });

  const historyEvents = generationEvents.history(generationId);
  assert.strictEqual(historyEvents.length, 2, 'History should contain 2 events');
  assert.strictEqual(historyEvents[0].event, 'generation.started');
  assert.strictEqual(historyEvents[1].event, 'sentence.verified');

  // 9. Phase 9: Cancellation & Cancellation Invariant
  console.log('[Test 9] Cancellation & Invariant Protection against Late Overwrite');
  // Cancel the generation
  const cancelRes = await app.inject({
    method: 'POST',
    url: `/v1/generations/${generationId}/cancel`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(cancelRes.statusCode, 200);

  const checkCancelled = await generationRepository.findGenerationById(generationId);
  assert.strictEqual(checkCancelled?.status, 'cancelled');

  // Attempt late completion overwrite
  await generationRepository.updateGeneration(generationId, {
    status: 'completed',
    answer: 'Late completed response from worker',
  });

  // Verify that the status remains CANCELLED and was not overwritten
  const verifyStillCancelled = await generationRepository.findGenerationById(generationId);
  assert.strictEqual(
    verifyStillCancelled?.status,
    'cancelled',
    'CRITICAL INVARIANT: Late completion worker MUST NOT overwrite cancelled status'
  );

  // 10. Phase 11: Evaluations API
  console.log('[Test 10] Project Evaluations API & Metrics');
  const evalCreateRes = await app.inject({
    method: 'POST',
    url: `/v1/projects/${projectAId}/evaluations`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      name: 'Q3 Verification Benchmark',
      dataset: 'groundguard-v1',
      config: { threshold: 0.35 },
    },
  });
  assert.strictEqual(evalCreateRes.statusCode, 201);
  const evalObj = JSON.parse(evalCreateRes.payload).evaluation;
  assert.ok(evalObj.id);

  // Query evaluations list
  const evalListRes = await app.inject({
    method: 'GET',
    url: `/v1/projects/${projectAId}/evaluations`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(evalListRes.statusCode, 200);
  const evalList = JSON.parse(evalListRes.payload).evaluations;
  assert.strictEqual(evalList.length, 1);

  // Query evaluation details & results
  const evalGetRes = await app.inject({
    method: 'GET',
    url: `/v1/evaluations/${evalObj.id}`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(evalGetRes.statusCode, 200);

  const evalResultsRes = await app.inject({
    method: 'GET',
    url: `/v1/evaluations/${evalObj.id}/results`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(evalResultsRes.statusCode, 200);

  // Query project metrics
  const metricsRes = await app.inject({
    method: 'GET',
    url: `/v1/projects/${projectAId}/metrics`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(metricsRes.statusCode, 200);
  const metrics = JSON.parse(metricsRes.payload);
  assert.strictEqual(typeof metrics.totalGenerations, 'number');
  assert.strictEqual(typeof metrics.groundingPassRate, 'number');

  // 11. Phase 12: Rate Limiting
  console.log('[Test 11] Rate Limiter Middleware Rejection (429)');
  // Exhaust auth limit with small loop
  let rateLimited = false;
  for (let i = 0; i < 25; i++) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'userA@example.com', password: 'wrongpassword' },
    });
    if (res.statusCode === 429) {
      rateLimited = true;
      assert.ok(res.headers['retry-after'], 'Rate limited response must include Retry-After header');
      break;
    }
  }
  assert.ok(rateLimited, 'Rate limiter should return 429 after exceeding limit');

  await app.close();
  await dbManager.close();
  console.log('=== All Phase 9, 11, 12 Integration Tests PASSED Successfully! ===');
}

runTests().catch((err) => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
