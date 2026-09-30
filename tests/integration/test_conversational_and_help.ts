import { buildApp } from '../../apps/api/src/app';
import { dbManager } from '../../apps/api/src/plugins/database';
import { conversationRepository } from '../../apps/api/src/repositories/conversation.repository';
import { projectRepository } from '../../apps/api/src/repositories/project.repository';
import { userRepository } from '../../apps/api/src/repositories/user.repository';
import { documentRepository } from '../../apps/api/src/repositories/document.repository';
import { generateId } from '../../apps/api/src/utils/id';

import { newDb } from 'pg-mem';
import { runMigrations } from '../../infra/scripts/migrate';

async function runTest() {
  console.log('--- Starting Conversational & Product Help Integration Verification ---');
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
  await runMigrations(dbManager.getPool());

  const app = await buildApp();
  await app.ready();

  const email = `test_chat_${Date.now()}@example.com`;
  const registerRes = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: {
      email,
      password: 'Password123!',
      name: 'Test Chat User',
    },
  });
  const { user, token } = JSON.parse(registerRes.payload);

  const project = await projectRepository.createProject({
    name: 'Test Sensor Project',
    userId: user.id,
    description: 'Project for testing conversational flows',
  });

  // Create 2 mock ready documents
  await documentRepository.createDocument({
    projectId: project.id,
    filename: 'dht11_datasheet.pdf',
    fileSize: 10240,
    mimeType: 'application/pdf',
    filePath: '/tmp/dht11_datasheet.pdf',
  });
  const doc2 = await documentRepository.createDocument({
    projectId: project.id,
    filename: 'sensor_wiring_guide.pdf',
    fileSize: 20480,
    mimeType: 'application/pdf',
    filePath: '/tmp/sensor_wiring_guide.pdf',
  });
  await documentRepository.updateStatus(doc2.id, 'ready', 5);

  const jwt = token;

  // 1. Create a Conversation
  console.log('\n[Step 1] Creating new conversation...');
  const createConvRes = await app.inject({
    method: 'POST',
    url: `/v1/projects/${project.id}/conversations`,
    headers: { authorization: `Bearer ${jwt}` },
    payload: { title: 'Test Conversation' },
  });
  console.log('Create Conv status:', createConvRes.statusCode);
  const conv = JSON.parse(createConvRes.body).conversation;
  console.log('Created Conversation ID:', conv.id);

  // 2. Send "hello"
  console.log('\n[Step 2] Sending "hello"...');
  const helloRes = await app.inject({
    method: 'POST',
    url: `/v1/projects/${project.id}/conversations/${conv.id}/messages`,
    headers: { authorization: `Bearer ${jwt}` },
    payload: { content: 'hello' },
  });
  console.log('Send "hello" status:', helloRes.statusCode);
  const helloData = JSON.parse(helloRes.body);
  console.log('User Message ID:', helloData.userMessage?.id, 'Role:', helloData.userMessage?.role);
  console.log('Assistant Message ID:', helloData.message?.id, 'Content:', helloData.message?.content);
  console.log('Claims Count:', helloData.claims?.length);

  if (!helloData.message?.content || !helloData.message?.content.includes('What would you like to explore')) {
    throw new Error('Greeting response was not properly generated or persisted!');
  }

  // 3. Send "what can I ask?"
  console.log('\n[Step 3] Sending "what can I ask?"...');
  const helpRes = await app.inject({
    method: 'POST',
    url: `/v1/projects/${project.id}/conversations/${conv.id}/messages`,
    headers: { authorization: `Bearer ${jwt}` },
    payload: { content: 'what can I ask?' },
  });
  console.log('Send "what can I ask?" status:', helpRes.statusCode);
  const helpData = JSON.parse(helpRes.body);
  console.log('Help Assistant Message ID:', helpData.message?.id, 'Content:\n', helpData.message?.content);

  if (!helpData.message?.content || !helpData.message?.content.includes('ready document')) {
    throw new Error('Product help response was not properly generated or persisted!');
  }

  // 4. Send "thanks"
  console.log('\n[Step 4] Sending "thanks"...');
  const thanksRes = await app.inject({
    method: 'POST',
    url: `/v1/projects/${project.id}/conversations/${conv.id}/messages`,
    headers: { authorization: `Bearer ${jwt}` },
    payload: { content: 'thanks' },
  });
  console.log('Send "thanks" status:', thanksRes.statusCode);
  const thanksData = JSON.parse(thanksRes.body);
  console.log('Thanks Assistant Message ID:', thanksData.message?.id, 'Content:', thanksData.message?.content);

  if (!thanksData.message?.content || !thanksData.message?.content.includes('welcome')) {
    throw new Error('Thanks response was not properly generated or persisted!');
  }

  // 5. Fetch all messages in the conversation from database
  console.log('\n[Step 5] Fetching all messages in conversation...');
  const listMsgRes = await app.inject({
    method: 'GET',
    url: `/v1/projects/${project.id}/conversations/${conv.id}/messages`,
    headers: { authorization: `Bearer ${jwt}` },
  });
  const listData = JSON.parse(listMsgRes.body);
  console.log(`Total messages in DB: ${listData.messages?.length}`);
  listData.messages?.forEach((m: any, i: number) => {
    console.log(`  [${i + 1}] (${m.role.toUpperCase()}): ${m.content.slice(0, 60)}...`);
  });

  if (listData.messages?.length !== 6) {
    throw new Error(`Expected exactly 6 messages in DB, got ${listData.messages?.length}`);
  }

  console.log('\n✅ ALL CONVERSATIONAL & HELP ROUTING INTEGRATION TESTS PASSED!');
  await app.close();
  await dbManager.close();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
