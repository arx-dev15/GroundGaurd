import assert from 'node:assert';
import { test, describe, before, after } from 'node:test';
import jwt from 'jsonwebtoken';
import { newDb } from 'pg-mem';
import { buildApp } from '../../apps/api/src/app';
import { config } from '../../apps/api/src/config/env';
import { dbManager } from '../../apps/api/src/plugins/database';
import { redisManager } from '../../apps/api/src/plugins/redis';
import { userRepository } from '../../apps/api/src/repositories/user.repository';
import { runMigrations } from '../../infra/scripts/migrate';

describe('GroundGuard Phase 2 Auth & Project Isolation Test Suite', () => {
  const app = buildApp();
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;
  let projectAId: string;

  before(async () => {
    // Check if live Postgres is reachable; if not, use pg-mem pool for database testing
    const liveHealth = await dbManager.checkHealth();
    if (!liveHealth.ok) {
      const memDb = newDb();
      memDb.public.interceptQueries((q: string) => {
        if (q.includes('CREATE EXTENSION')) return [];
        return null;
      });
      memDb.registerExtension('vector', (schema: any) => {
        schema.registerEquivalentType({
          name: 'vector',
          equivalentTo: schema.getType('text'),
        });
      });
      const memPool = memDb.adapters.createPg().Pool;
      const testPool = new memPool();
      dbManager.setTestPool(testPool);
    }

    // 1. Run migrations to establish schema
    await runMigrations(dbManager.getPool());

    // Clean up test data if left over from previous runs
    const pool = dbManager.getPool();
    await pool.query("DELETE FROM projects WHERE name LIKE 'Test Project%'");
    await pool.query("DELETE FROM users WHERE email LIKE '%@testphase2.com'");
  });

  after(async () => {
    try {
      const pool = dbManager.getPool();
      await pool.query("DELETE FROM projects WHERE name LIKE 'Test Project%'");
      await pool.query("DELETE FROM users WHERE email LIKE '%@testphase2.com'");
      await dbManager.close();
      await app.close();
      await redisManager.close();
    } catch (_) {}
  });

  describe('1. Registration & Password Hashing Invariants', () => {
    test('1.1 Should register a new valid user securely without exposing passwordHash', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: 'usera@testphase2.com',
          password: 'Password123!',
          name: 'User A',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      const body = JSON.parse(res.payload);
      assert.ok(body.token);
      assert.ok(body.user.id.startsWith('usr_'));
      assert.strictEqual(body.user.email, 'usera@testphase2.com');
      assert.strictEqual(body.user.name, 'User A');
      assert.strictEqual(body.user.passwordHash, undefined, 'passwordHash must never be exposed');

      userAToken = body.token;
      userAId = body.user.id;

      // Verify DB persistence & password hashing
      const dbUser = await userRepository.findByEmail('usera@testphase2.com');
      assert.ok(dbUser);
      assert.strictEqual(dbUser.email, 'usera@testphase2.com');
      assert.notStrictEqual(dbUser.passwordHash, 'Password123!', 'Stored password must be hashed');
      assert.ok(dbUser.passwordHash.startsWith('$2'), 'Must be bcrypt hash');
    });

    test('1.2 Should reject duplicate registration with 409 EMAIL_EXISTS', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: 'usera@testphase2.com',
          password: 'AnotherPassword123!',
          name: 'User A Duplicate',
        },
      });

      assert.strictEqual(res.statusCode, 409);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error.code, 'EMAIL_EXISTS');
    });

    test('1.3 Should reject registration missing required name parameter', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: 'noname@testphase2.com',
          password: 'Password123!',
        },
      });

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error.code, 'BAD_REQUEST');
    });
  });

  describe('2. Login & Credential Validation', () => {
    test('2.1 Should login successfully with correct credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: {
          email: 'usera@testphase2.com',
          password: 'Password123!',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.ok(body.token);
      assert.strictEqual(body.user.id, userAId);
    });

    test('2.2 Should reject login with wrong password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: {
          email: 'usera@testphase2.com',
          password: 'WrongPassword!',
        },
      });

      assert.strictEqual(res.statusCode, 401);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error.code, 'INVALID_CREDENTIALS');
    });

    test('2.3 Should reject login for non-existent email safely', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: {
          email: 'unknown@testphase2.com',
          password: 'Password123!',
        },
      });

      assert.strictEqual(res.statusCode, 401);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error.code, 'INVALID_CREDENTIALS');
    });
  });

  describe('3. JWT Authentication & Expiration Invariants', () => {
    test('3.1 GET /v1/auth/me should return current user for valid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.user.id, userAId);
      assert.strictEqual(body.user.email, 'usera@testphase2.com');
    });

    test('3.2 Should reject expired JWT token with 401 UNAUTHORIZED', async () => {
      const expiredToken = jwt.sign({ sub: userAId }, config.jwtSecret, { expiresIn: '-1s' });
      const res = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 401);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error.code, 'UNAUTHORIZED');
      assert.ok(body.error.message.includes('expired'));
    });

    test('3.3 Should reject JWT token for non-existent user with 401 UNAUTHORIZED', async () => {
      const nonexistentToken = jwt.sign({ sub: 'usr_nonexistent_9999999999' }, config.jwtSecret, { expiresIn: '1h' });
      const res = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: {
          authorization: `Bearer ${nonexistentToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 401);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error.code, 'UNAUTHORIZED');
    });

    test('3.4 Should execute honest stateless logout acknowledgment', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/logout',
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.ok(body.message.includes('Logged out successfully'));
    });
  });

  describe('4. Project CRUD & Strict Cross-User Isolation', () => {
    before(async () => {
      // Register User B for cross-user authorization tests
      const resB = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: 'userb@testphase2.com',
          password: 'Password123!',
          name: 'User B',
        },
      });
      const bodyB = JSON.parse(resB.payload);
      userBToken = bodyB.token;
      userBId = bodyB.user.id;
    });

    test('4.1 User A creates Project A', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
        payload: {
          name: 'Test Project Alpha',
          description: 'Project Alpha Description',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      const body = JSON.parse(res.payload);
      assert.ok(body.project.id.startsWith('proj_'));
      assert.strictEqual(body.project.name, 'Test Project Alpha');
      assert.strictEqual(body.project.description, 'Project Alpha Description');
      assert.strictEqual(body.project.userId, undefined, 'Public contract should not expose internal userId');

      projectAId = body.project.id;
    });

    test('4.2 User A listing /v1/projects returns Project A', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/projects',
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.ok(Array.isArray(body.projects));
      assert.strictEqual(body.projects.length, 1);
      assert.strictEqual(body.projects[0].id, projectAId);
    });

    test('4.3 MANDATORY: User B listing /v1/projects must NEVER contain User A projects', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/projects',
        headers: {
          authorization: `Bearer ${userBToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.projects.length, 0, 'User B must see zero projects');
    });

    test('4.4 MANDATORY: User B accessing GET /v1/projects/:projectIdA must return 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/projects/${projectAId}`,
        headers: {
          authorization: `Bearer ${userBToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 404);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error.code, 'NOT_FOUND');
    });

    test('4.5 MANDATORY: User B accessing PATCH /v1/projects/:projectIdA must return 404', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/projects/${projectAId}`,
        headers: {
          authorization: `Bearer ${userBToken}`,
        },
        payload: {
          name: 'Hacked Name',
        },
      });

      assert.strictEqual(res.statusCode, 404);
    });

    test('4.6 MANDATORY: User B accessing DELETE /v1/projects/:projectIdA must return 404', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/projects/${projectAId}`,
        headers: {
          authorization: `Bearer ${userBToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 404);
    });

    test('4.7 User A PATCH with empty payload should return 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/projects/${projectAId}`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
        payload: {},
      });

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error.code, 'BAD_REQUEST');
    });

    test('4.8a User A PATCH attempting protected/unsupported fields (userId, id, createdAt) fails with 400 BAD_REQUEST', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/projects/${projectAId}`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
        payload: {
          name: 'Updated Project Alpha',
          userId: 'usr_hacked_123',
          id: 'proj_hacked_123',
        },
      });

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error.code, 'BAD_REQUEST');
      assert.ok(body.error.message.includes('Unsupported or protected field'));
    });

    test('4.8b User A PATCH updating name with valid fields succeeds', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/projects/${projectAId}`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
        payload: {
          name: 'Updated Project Alpha',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.project.id, projectAId, 'ID must remain unchanged');
      assert.strictEqual(body.project.name, 'Updated Project Alpha');
    });

    test('4.9 User A DELETE removes project successfully', async () => {
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/v1/projects/${projectAId}`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });

      assert.strictEqual(deleteRes.statusCode, 200);

      // Verify subsequent GET returns 404
      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/projects/${projectAId}`,
        headers: {
          authorization: `Bearer ${userAToken}`,
        },
      });

      assert.strictEqual(getRes.statusCode, 404);
    });
  });

  describe('5. Phase 1 Regressions Check', () => {
    test('5.1 /health should return 200 OK', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });
      assert.strictEqual(res.statusCode, 200);
    });

    test('5.2 /health/readiness should execute dependency check', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health/readiness',
      });
      assert.ok(res.statusCode === 200 || res.statusCode === 503);
      const body = JSON.parse(res.payload);
      assert.ok(body.dependencies);
      assert.ok(body.dependencies.postgres);
    });
  });
});
