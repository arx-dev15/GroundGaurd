import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAskEvent, initialAskProgress, type AskProgress } from '../lib/ask-progress.ts';

const run = (events: Array<[string, any]>): AskProgress =>
  events.reduce((p, [e, d]) => applyAskEvent(p, e, d), initialAskProgress());

test('stages advance only on their real events', () => {
  let p = initialAskProgress();
  assert.equal(p.retrievalCompleted, false);
  p = applyAskEvent(p, 'generation.started', {});
  assert.equal(p.retrievalCompleted, false, 'generation.started is not retrieval progress');
  p = applyAskEvent(p, 'retrieval.completed', { evidenceCount: 5 });
  assert.equal(p.retrievalCompleted, true);
  assert.equal(p.evidenceCount, 5);
  assert.equal(p.answerStarted, false);
  p = applyAskEvent(p, 'answer.delta', { delta: 'The ', sequence: 1 });
  assert.equal(p.answerStarted, true);
  assert.equal(p.answerCompleted, false, 'draft not complete until answer.completed');
  p = applyAskEvent(p, 'answer.completed', { answer: 'x' });
  assert.equal(p.answerCompleted, true);
});

test('claim verdict counts come from real sentence events (M3 payload shape)', () => {
  const p = run([
    ['answer.completed', {}],
    ['sentence.verified', { claimId: 'c1', status: 'verified', label: 'entailment' }],
    ['sentence.flagged', { claimId: 'c2', status: 'needs_review', label: 'neutral' }],
    ['sentence.flagged', { claimId: 'c3', status: 'flagged', label: 'contradiction' }],
  ]);
  assert.equal(p.claimsSupported, 1);
  assert.equal(p.claimsNeedReview, 2);
});

test('recovery resets provisional counts and tracks completion', () => {
  const p = run([['answer.completed', {}], ['sentence.flagged', {}], ['recovery.started', { claims: ['c2'] }]]);
  assert.equal(p.recoveryStarted, true);
  assert.equal(p.claimsNeedReview, 0, 're-emitted verdicts after recovery are counted fresh');
  assert.equal(applyAskEvent(p, 'recovery.completed', {}).recoveryCompleted, true);
});

test('unknown and terminal events never mark stages done', () => {
  const p = run([['generation.failed', { code: 'LLM_ERROR' }], ['heartbeat', {}], ['generation.completed', {}]]);
  assert.deepEqual(
    [p.retrievalCompleted, p.answerStarted, p.answerCompleted, p.recoveryStarted],
    [false, false, false, false]
  );
});

test('recovery stop reason from M3 is surfaced; absent for older servers', () => {
  const stopped = applyAskEvent(initialAskProgress(), 'recovery.completed', { claims: ['c1'], stoppedReason: 'time_budget' });
  assert.equal(stopped.recoveryStopReason, 'time_budget');
  assert.equal(applyAskEvent(initialAskProgress(), 'recovery.completed', { claims: ['c1'] }).recoveryStopReason, undefined);
});
