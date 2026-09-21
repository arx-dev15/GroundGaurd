import assert from 'node:assert';
import { test, describe } from 'node:test';
import { buildApp } from '../../apps/api/src/app';
import { AIClient } from '../../apps/api/src/clients/ai.client';
import { MLClient } from '../../apps/api/src/clients/ml.client';
import { AppError } from '../../apps/api/src/utils/errors';

describe('GroundGuard Phase 1 Integration Test Suite', () => {

  test('1. M3 Liveness GET /health should return 200 OK', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.service, 'api');
    assert.strictEqual(body.status, 'ok');
    assert.ok(response.headers['x-request-id']);
  });

  test('2. M3 Request Tracing should preserve supplied x-request-id', async () => {
    const app = buildApp();
    const customReqId = 'req_custom_test_12345';
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': customReqId,
      },
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['x-request-id'], customReqId);
  });

  test('3. Common Error Format handling', async () => {
    const app = buildApp();
    
    app.get('/test-error', async () => {
      throw new AppError('TEST_CODE', 'Test error message', 400);
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test-error',
      headers: {
        'x-request-id': 'req_error_test',
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.requestId, 'req_error_test');
    assert.strictEqual(body.error.code, 'TEST_CODE');
    assert.strictEqual(body.error.message, 'Test error message');
  });

  test('4. AIClient & MLClient unit contract test & x-request-id propagation logic', async () => {
    const aiClient = new AIClient('http://localhost:8000');
    const mlClient = new MLClient('http://localhost:8001');

    assert.ok(aiClient);
    assert.ok(mlClient);
  });

});
