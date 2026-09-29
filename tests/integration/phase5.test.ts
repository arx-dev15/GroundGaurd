import assert from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { newDb } from 'pg-mem';
import { buildApp } from '../../apps/api/src/app';
import { dbManager } from '../../apps/api/src/plugins/database';
import { runMigrations } from '../../infra/scripts/migrate';

describe('GroundGuard Phase 5 Conversations + Grounded RAG Generation Test Suite', () => {
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

    // 2. Run migrations (including 005, 006, 007)
    await runMigrations(dbManager.getPool());

    const pool = dbManager.getPool();
    await pool.query("DELETE FROM projects WHERE name LIKE 'Phase 5 Test Project%'");
    await pool.query("DELETE FROM users WHERE email LIKE '%@testphase5.com'");

    // 3. Register User A
    const resA = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'usera@testphase5.com', password: 'Password123!', name: 'User A' },
    });
    const bodyA = JSON.parse(resA.payload);
    userAToken = bodyA.token;
    userAId = bodyA.user.id;

    // 4. Register User B
    const resB = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'userb@testphase5.com', password: 'Password123!', name: 'User B' },
    });
    const bodyB = JSON.parse(resB.payload);
    userBToken = bodyB.token;
    userBId = bodyB.user.id;

    // 5. Create Project A (owned by User A)
    const pResA = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { name: 'Phase 5 Test Project A', description: 'Testing conversations and generation' },
    });
    const pBodyA = JSON.parse(pResA.payload);
    projectAId = pBodyA.project.id;

    // 6. Create Project B (owned by User B)
    const pResB = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${userBToken}` },
      payload: { name: 'Phase 5 Test Project B', description: 'Isolated project for User B' },
    });
    const pBodyB = JSON.parse(pResB.payload);
    projectBId = pBodyB.project.id;
  });

  after(async () => {
    const pool = dbManager.getPool();
    await pool.query("DELETE FROM projects WHERE name LIKE 'Phase 5 Test Project%'");
    await pool.query("DELETE FROM users WHERE email LIKE '%@testphase5.com'");
  });

  // ==========================================
  // Section 1: Conversation Ownership & Lifecycle
  // ==========================================

  test('User A can create a conversation in Project A', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectAId}/conversations`,
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { title: 'Piping Design Discussion' },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.ok(body.conversation);
    assert.strictEqual(body.conversation.projectId, projectAId);
    assert.strictEqual(body.conversation.title, 'Piping Design Discussion');
    assert.ok(body.conversation.id.startsWith('conv_'));
    conversationAId = body.conversation.id;
  });

  test('User A can list conversations in Project A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectAId}/conversations`,
      headers: { authorization: `Bearer ${userAToken}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(Array.isArray(body.conversations));
    assert.strictEqual(body.conversations.length, 1);
    assert.strictEqual(body.conversations[0].id, conversationAId);
  });

  test('User A can retrieve conversation by ID via project route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectAId}/conversations/${conversationAId}`,
      headers: { authorization: `Bearer ${userAToken}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.conversation.id, conversationAId);
  });

  // ==========================================
  // Section 2: Project Isolation & Authorization
  // ==========================================

  test('User B cannot view or access User A conversation (project isolation)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectAId}/conversations/${conversationAId}`,
      headers: { authorization: `Bearer ${userBToken}` },
    });

    // User B does not own Project A -> 404
    assert.strictEqual(res.statusCode, 404);
  });

  test('User A conversation cannot be accessed under a different project ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectBId}/conversations/${conversationAId}`,
      headers: { authorization: `Bearer ${userBToken}` },
    });

    // Conversation A belongs to Project A, not Project B -> 404
    assert.strictEqual(res.statusCode, 404);
  });

  test('User B cannot post a message to User A conversation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectAId}/conversations/${conversationAId}/messages`,
      headers: { authorization: `Bearer ${userBToken}` },
      payload: { content: 'Unauthorized message attempt' },
    });

    assert.strictEqual(res.statusCode, 404);
  });

  // ==========================================
  // Section 3: Messages & Sufficiency Abstention Gate
  // ==========================================

  test('Posting a question to empty project triggers retrieval and abstains cleanly (zero evidence)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectAId}/conversations/${conversationAId}/messages`,
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { content: 'What is the operating pressure of boiler B-201?' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);

    // Verify structured response per Phase 5 spec
    assert.ok(body.requestId, 'requestId must be present');
    assert.ok(body.generationId, 'generationId must be present');
    assert.strictEqual(body.conversationId, conversationAId);
    assert.strictEqual(body.status, 'completed');
    assert.ok(body.answer, 'answer must be provided');
    assert.match(body.answer, /(?:no ready documents|not contain sufficient evidence)/i);
    assert.strictEqual(body.modelVersion, 'groundguard-abstention-gate');
    assert.strictEqual(body.metadata?.abstention, true);
    assert.strictEqual(body.sufficiency?.sufficient, false);

    // Verify userMessage was persisted
    assert.ok(body.userMessage);
    assert.strictEqual(body.userMessage.role, 'user');
    assert.strictEqual(body.userMessage.content, 'What is the operating pressure of boiler B-201?');

    // Verify assistant message was persisted
    assert.ok(body.message);
    assert.strictEqual(body.message.role, 'assistant');
    assert.strictEqual(body.message.content, body.answer);
    assert.strictEqual(body.message.generationId, body.generationId);
  });

  test('Conversation history contains both user question and assistant abstention message', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectAId}/conversations/${conversationAId}/messages`,
      headers: { authorization: `Bearer ${userAToken}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(Array.isArray(body.messages));
    assert.strictEqual(body.messages.length, 2);

    const [userMsg, assistantMsg] = body.messages;
    assert.strictEqual(userMsg.role, 'user');
    assert.strictEqual(userMsg.content, 'What is the operating pressure of boiler B-201?');
    assert.strictEqual(assistantMsg.role, 'assistant');
    assert.match(assistantMsg.content, /(?:no ready documents|not contain sufficient evidence)/i);
  });

  // ==========================================
  // Section 4: Request Validation
  // ==========================================

  test('Rejects empty or blank message content with 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectAId}/conversations/${conversationAId}/messages`,
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { content: '   ' },
    });

    assert.strictEqual(res.statusCode, 400);
  });

  test('Rejects non-object payload with 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectAId}/conversations/${conversationAId}/messages`,
      headers: { authorization: `Bearer ${userAToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify('invalid payload'),
    });

    assert.strictEqual(res.statusCode, 400);
  });

  after(async () => {
    await app.close();
    await dbManager.getPool().end();
  });
});
