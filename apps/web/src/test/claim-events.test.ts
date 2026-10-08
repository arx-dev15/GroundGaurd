import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClaimEvent, mergeClaimUpdate } from '../lib/claim-events.ts';
import { applyAskEvent, initialAskProgress, parseSourcePreviews } from '../lib/ask-progress.ts';

test('flat M3 verdict payload is parsed (canonical contract)', () => {
  const u = normalizeClaimEvent({ claimId: 'c1', text: 'P-101A flows 450 gpm.', status: 'verified', label: 'entailment', groundingScore: 0.91 });
  assert.equal(u?.claimId, 'c1');
  assert.equal(u?.status, 'verified');
  assert.equal(u?.verification?.label, 'entailment');
  assert.equal(u?.verification?.groundingScore, 0.91);
});

test('nested legacy payload still accepted; payload without identity ignored', () => {
  assert.equal(normalizeClaimEvent({ claim: { claimId: 'c2', text: 't', status: 'flagged' } })?.status, 'flagged');
  assert.equal(normalizeClaimEvent({ claims: ['c1'] }), null);   // recovery.completed summary carries ids only
  assert.equal(normalizeClaimEvent(null), null);
});

test('repeated verdicts update by stable id without duplication and keep evidence/scores', () => {
  const existing = [{ claimId: 'c1', text: 'x', status: 'needs_review', evidence: [{ chunkId: 'k1', text: 'e' } as any],
    verification: { label: 'neutral', scores: { entailment: 0.1, contradiction: 0.1, neutral: 0.8 }, groundingScore: 0.1, modelVersion: 'm1' } } as any];
  let list = mergeClaimUpdate(existing, normalizeClaimEvent({ claimId: 'c1', status: 'needs_review', label: 'neutral' })!);
  list = mergeClaimUpdate(list, normalizeClaimEvent({ claimId: 'c1', status: 'recovered', label: 'entailment', groundingScore: 0.9 })!);
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'recovered');
  assert.equal(list[0].evidence?.length, 1, 'evidence preserved');
  assert.equal(list[0].verification?.scores.neutral, 0.8, 'real scores preserved (events carry none)');
  assert.equal(list[0].verification?.label, 'entailment');
  const added = mergeClaimUpdate(list, normalizeClaimEvent({ claimId: 'c2', status: 'flagged', label: 'contradiction' })!);
  assert.deepEqual(added.map((c) => c.claimId), ['c1', 'c2']);
});

test('source previews: bounded, validated, and absent for old servers', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ chunkId: `k${i}`, documentName: 'Pump Spec', pageNumber: 1, excerpt: 'y'.repeat(500) }));
  const parsed = parseSourcePreviews(many);
  assert.equal(parsed.length, 5);
  assert.ok(parsed.every((s) => s.excerpt.length <= 241));
  assert.deepEqual(parseSourcePreviews([{ documentName: 'no id' }, { chunkId: 'k', excerpt: 'no name' }, 'junk']), []);
  const oldServer = applyAskEvent(initialAskProgress(), 'retrieval.completed', { generationId: 'g', evidenceCount: 3 });
  assert.equal(oldServer.retrievalCompleted, true);
  assert.deepEqual(oldServer.sources, []);
  assert.equal(oldServer.planning, 'unknown', 'no planning events -> planning stage not shown');
});

test('planning events reported truthfully', () => {
  let p = applyAskEvent(initialAskProgress(), 'planning.started', {});
  assert.equal(p.planning, 'active');
  p = applyAskEvent(p, 'planning.completed', { plannerSource: 'deterministic_fast_path', latencyMs: 1 });
  assert.equal(p.planning, 'done');
  assert.equal(p.plannerSource, 'deterministic_fast_path');
});
