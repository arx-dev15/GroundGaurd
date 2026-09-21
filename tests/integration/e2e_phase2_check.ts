/**
 * Phase 2 Live HTTP Runtime Verification Script
 * Validates actual HTTP flow: register -> login -> /auth/me -> create project -> cross-user isolation -> patch -> delete
 */

async function runPhase2E2ECheck() {
  console.log('=== GroundGuard Phase 2 Live Runtime Verification ===\n');

  const apiPort = process.env.PORT || 4000;
  const baseUrl = `http://localhost:${apiPort}`;

  const emailA = `e2e_usera_${Date.now()}@test.com`;
  const emailB = `e2e_userb_${Date.now()}@test.com`;
  const password = 'Password123!';

  let tokenA: string = '';
  let tokenB: string = '';
  let projectAId: string = '';

  // 1. Register User A
  console.log(`[1] POST ${baseUrl}/v1/auth/register (User A)...`);
  try {
    const res = await fetch(`${baseUrl}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password, name: 'User A E2E' }),
    });
    const body = await res.json();
    console.log(` -> Register Status: ${res.status}`, body);
    if (res.status === 201 && body.token && body.user.id.startsWith('usr_')) {
      tokenA = body.token;
      console.log(' -> Registration PASSED ✓');
    } else {
      console.error(' -> Registration FAILED');
      return;
    }
  } catch (err: any) {
    console.error(' -> Registration request error:', err.message);
    return;
  }

  // 2. Register User B
  console.log(`\n[2] POST ${baseUrl}/v1/auth/register (User B)...`);
  try {
    const res = await fetch(`${baseUrl}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password, name: 'User B E2E' }),
    });
    const body = await res.json();
    tokenB = body.token;
    console.log(` -> User B registered: ${body.user.id}`);
  } catch (err: any) {
    console.error(' -> User B registration error:', err.message);
    return;
  }

  // 3. GET /v1/auth/me (User A)
  console.log(`\n[3] GET ${baseUrl}/v1/auth/me (User A)...`);
  try {
    const res = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const body = await res.json();
    console.log(` -> GET /auth/me Status: ${res.status}`, body);
    if (res.status === 200 && body.user.email === emailA) {
      console.log(' -> Auth Context Resolution PASSED ✓');
    }
  } catch (err: any) {
    console.error(' -> GET /auth/me error:', err.message);
  }

  // 4. User A Creates Project A
  console.log(`\n[4] POST ${baseUrl}/v1/projects (User A)...`);
  try {
    const res = await fetch(`${baseUrl}/v1/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        name: 'E2E Project A',
        description: 'E2E Description',
      }),
    });
    const body = await res.json();
    console.log(` -> Create Project Status: ${res.status}`, body);
    if (res.status === 201 && body.project.id.startsWith('proj_')) {
      projectAId = body.project.id;
      console.log(' -> Project Creation PASSED ✓');
    }
  } catch (err: any) {
    console.error(' -> Create Project error:', err.message);
  }

  // 5. User B List Projects (Must NOT contain Project A)
  console.log(`\n[5] GET ${baseUrl}/v1/projects (User B Isolation Check)...`);
  try {
    const res = await fetch(`${baseUrl}/v1/projects`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const body = await res.json();
    console.log(` -> User B List Projects Status: ${res.status}`, body);
    if (res.status === 200 && body.projects.length === 0) {
      console.log(' -> User Isolation Listing Check PASSED ✓');
    } else {
      console.error(' -> User Isolation Listing Check FAILED! Project leaked to User B.');
    }
  } catch (err: any) {
    console.error(' -> User B List error:', err.message);
  }

  // 6. User B Unauthorized GET /v1/projects/:projectIdA (Must return 404)
  console.log(`\n[6] GET ${baseUrl}/v1/projects/${projectAId} (User B Unauthorized Check)...`);
  try {
    const res = await fetch(`${baseUrl}/v1/projects/${projectAId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const body = await res.json();
    console.log(` -> User B GET Project A Status: ${res.status}`, body);
    if (res.status === 404) {
      console.log(' -> User Authorization 404 Isolation PASSED ✓');
    }
  } catch (err: any) {
    console.error(' -> User B GET project error:', err.message);
  }

  // 7. User A PATCH /v1/projects/:projectIdA
  console.log(`\n[7] PATCH ${baseUrl}/v1/projects/${projectAId} (User A Update)...`);
  try {
    const res = await fetch(`${baseUrl}/v1/projects/${projectAId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ name: 'E2E Project A Updated' }),
    });
    const body = await res.json();
    console.log(` -> PATCH Status: ${res.status}`, body);
    if (res.status === 200 && body.project.name === 'E2E Project A Updated') {
      console.log(' -> Project Update PASSED ✓');
    }
  } catch (err: any) {
    console.error(' -> PATCH error:', err.message);
  }

  // 8. User A DELETE /v1/projects/:projectIdA
  console.log(`\n[8] DELETE ${baseUrl}/v1/projects/${projectAId} (User A Delete)...`);
  try {
    const res = await fetch(`${baseUrl}/v1/projects/${projectAId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const body = await res.json();
    console.log(` -> DELETE Status: ${res.status}`, body);
    if (res.status === 200) {
      console.log(' -> Project Deletion PASSED ✓');
    }
  } catch (err: any) {
    console.error(' -> DELETE error:', err.message);
  }

  console.log('\n=== Phase 2 Live Verification Finished ===');
}

if (require.main === module) {
  runPhase2E2ECheck();
}
