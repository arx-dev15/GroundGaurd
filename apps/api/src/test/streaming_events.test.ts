import assert from 'node:assert';
import { generationEvents } from '../services/generation-events';

async function runStreamingEventsTests() {
  console.log('=== Running M3 Streaming Events Unit & Invariant Tests ===');

  const genId = 'gen_test_stream_123';

  // 1. Publish sequence of answer.delta events
  const deltas = [
    { delta: 'Campus ', sequence: 1 },
    { delta: 'Monitor ', sequence: 2 },
    { delta: 'is ', sequence: 3 },
    { delta: 'designed ', sequence: 4 },
    { delta: 'for campus safety.', sequence: 5 },
  ];

  generationEvents.publish(genId, 'generation.started', { generationId: genId });
  generationEvents.publish(genId, 'answer.started', { generationId: genId });

  for (const d of deltas) {
    generationEvents.publish(genId, 'answer.delta', { ...d, generationId: genId });
  }

  generationEvents.publish(genId, 'answer.completed', {
    generationId: genId,
    answer: 'Campus Monitor is designed for campus safety.',
  });

  // 2. Validate event history ordering and contents
  const history = generationEvents.history(genId);
  assert.strictEqual(history.length, 8, 'History should contain started, answer.started, 5 deltas, and answer.completed');
  assert.strictEqual(history[0].event, 'generation.started');
  assert.strictEqual(history[1].event, 'answer.started');

  let accumulated = '';
  for (let i = 0; i < 5; i++) {
    const deltaEvt = history[2 + i];
    assert.strictEqual(deltaEvt.event, 'answer.delta');
    const data = deltaEvt.data as { delta: string; sequence: number };
    assert.strictEqual(data.sequence, i + 1, `Delta sequence should be ${i + 1}`);
    accumulated += data.delta;
  }
  assert.strictEqual(accumulated, 'Campus Monitor is designed for campus safety.');

  // 3. Test Subscription Forwarding
  const subGenId = 'gen_test_sub_456';
  const received: Array<{ event: string; data: any }> = [];
  const unsubscribe = generationEvents.subscribe(subGenId, (evt) => {
    received.push(evt);
  });

  generationEvents.publish(subGenId, 'answer.started', { generationId: subGenId });
  generationEvents.publish(subGenId, 'answer.delta', { delta: 'Hello ', sequence: 1 });
  generationEvents.publish(subGenId, 'answer.delta', { delta: 'World', sequence: 2 });
  generationEvents.publish(subGenId, 'generation.completed', { generationId: subGenId, answer: 'Hello World' });

  assert.strictEqual(received.length, 4, 'Subscriber should have received 4 events');
  assert.strictEqual(received[1].event, 'answer.delta');
  assert.strictEqual((received[1].data as any).delta, 'Hello ');
  assert.strictEqual((received[2].data as any).delta, 'World');

  unsubscribe();

  // 4. Test Cancellation Handling
  const cancelGenId = 'gen_test_cancel_789';
  generationEvents.publish(cancelGenId, 'generation.started', { generationId: cancelGenId });
  generationEvents.markCancelled(cancelGenId);

  const isCancelled = await generationEvents.isCancelled(cancelGenId);
  assert.strictEqual(isCancelled, true, 'Generation should be marked as cancelled');

  console.log('=== All M3 Streaming Events Tests Passed Successfully! ===');
}

runStreamingEventsTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
