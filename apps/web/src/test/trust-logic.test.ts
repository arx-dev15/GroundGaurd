import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveTrustSummary,
  formatGroundingScore,
  mapSSEEventToStatus,
  CLAIM_STATE_CONFIG,
} from '../lib/trust-utils.ts';
import type { Claim } from '@groundguard/types';

test('CLAIM_STATE_CONFIG maps all canonical states without domain mutation', () => {
  const canonicalStates = ['verified', 'recovered', 'flagged', 'needs_review', 'pending'] as const;

  for (const status of canonicalStates) {
    const config = CLAIM_STATE_CONFIG[status];
    assert.ok(config, `Missing config for canonical state: ${status}`);
    assert.ok(config.label, `Missing label for state: ${status}`);
    assert.ok(config.description, `Missing description for state: ${status}`);
  }

  // Wording checks
  assert.strictEqual(CLAIM_STATE_CONFIG.verified.label, 'Verified');
  assert.strictEqual(CLAIM_STATE_CONFIG.recovered.label, 'Recovered');
  assert.strictEqual(CLAIM_STATE_CONFIG.flagged.label, 'Contradicted');
  assert.strictEqual(CLAIM_STATE_CONFIG.needs_review.label, 'Needs review');
  assert.strictEqual(CLAIM_STATE_CONFIG.pending.label, 'Pending');
});

test('deriveTrustSummary returns "All supported" when all claims are verified', () => {
  const claims: Claim[] = [
    {
      claimId: 'c1',
      text: 'First verified statement',
      status: 'verified',
      evidence: [{ chunkId: 'chk1', text: 'ev1', documentId: 'doc1' }],
    },
    {
      claimId: 'c2',
      text: 'Second verified statement',
      status: 'verified',
      evidence: [{ chunkId: 'chk2', text: 'ev2', documentId: 'doc2' }],
    },
  ];

  const summary = deriveTrustSummary(claims, 'completed');
  assert.strictEqual(summary.headline, 'All supported');
  assert.strictEqual(summary.verifiedCount, 2);
  assert.strictEqual(summary.recoveredCount, 0);
  assert.strictEqual(summary.flaggedCount, 0);
  assert.strictEqual(summary.reviewCount, 0);
  assert.strictEqual(summary.sourceCount, 2);
  assert.strictEqual(summary.variant, 'success');
});

test('deriveTrustSummary returns "Verified with recovery" when claims include recovered without flags', () => {
  const claims: Claim[] = [
    {
      claimId: 'c1',
      text: 'Verified statement',
      status: 'verified',
      evidence: [{ chunkId: 'chk1', text: 'ev1', documentId: 'doc1' }],
    },
    {
      claimId: 'c2',
      text: 'Autonomously recovered statement',
      status: 'recovered',
      evidence: [{ chunkId: 'chk2', text: 'ev2', documentId: 'doc1' }],
    },
  ];

  const summary = deriveTrustSummary(claims, 'completed');
  assert.strictEqual(summary.headline, 'Verified with recovery');
  assert.strictEqual(summary.verifiedCount, 1);
  assert.strictEqual(summary.recoveredCount, 1);
  assert.strictEqual(summary.flaggedCount, 0);
  assert.strictEqual(summary.sourceCount, 1); // Deduplicated doc1
  assert.strictEqual(summary.variant, 'recovered');
});

test('deriveTrustSummary returns "Review required" when any claim is flagged or needs_review', () => {
  const claims: Claim[] = [
    { claimId: 'c1', text: 'Good claim', status: 'verified' },
    { claimId: 'c2', text: 'Bad claim', status: 'flagged' },
    { claimId: 'c3', text: 'Ambiguous claim', status: 'needs_review' },
  ];

  const summary = deriveTrustSummary(claims, 'completed');
  assert.strictEqual(summary.headline, 'Review required');
  assert.strictEqual(summary.flaggedCount, 1);
  assert.strictEqual(summary.reviewCount, 1);
  assert.strictEqual(summary.verifiedCount, 1);
  assert.strictEqual(summary.variant, 'danger');
});

test('deriveTrustSummary returns "Verification incomplete" when claims are pending', () => {
  const claims: Claim[] = [
    { claimId: 'c1', text: 'Pending claim', status: 'pending' },
    { claimId: 'c2', text: 'Verified claim', status: 'verified' },
  ];

  const summary = deriveTrustSummary(claims, 'verifying');
  assert.strictEqual(summary.headline, 'Verification incomplete');
  assert.strictEqual(summary.pendingCount, 1);
  assert.strictEqual(summary.variant, 'neutral');
});

test('deriveTrustSummary handles Cancelled generation correctly', () => {
  const summary = deriveTrustSummary([], 'cancelled');
  assert.strictEqual(summary.headline, 'Cancelled');
  assert.strictEqual(summary.subline, 'Generation was cancelled by user');
  assert.strictEqual(summary.variant, 'neutral');
});

test('deriveTrustSummary handles Failed generation correctly', () => {
  const summary = deriveTrustSummary([], 'failed');
  assert.strictEqual(summary.headline, 'Generation failed');
  assert.strictEqual(summary.variant, 'danger');
});

test('formatGroundingScore avoids false precision', () => {
  assert.strictEqual(formatGroundingScore(0.94218731), '0.94');
  assert.strictEqual(formatGroundingScore(1.0), '1.00');
  assert.strictEqual(formatGroundingScore(0), '0.00');
  assert.strictEqual(formatGroundingScore(undefined), 'N/A');
  assert.strictEqual(formatGroundingScore(NaN), 'N/A');
});

test('mapSSEEventToStatus maps GENERATION_CANCELLED to cancelled and not generic failure', () => {
  const cancelledRes = mapSSEEventToStatus('generation.failed', {
    code: 'GENERATION_CANCELLED',
    message: 'Generation was cancelled by user',
  });

  assert.strictEqual(cancelledRes.state, 'cancelled');
  assert.strictEqual(cancelledRes.label, 'Cancelled by user');
  assert.strictEqual(cancelledRes.isTerminal, true);

  const realFailedRes = mapSSEEventToStatus('generation.failed', {
    code: 'INTERNAL_ERROR',
    message: 'Upstream connection error',
  });

  assert.strictEqual(realFailedRes.state, 'failed');
  assert.strictEqual(realFailedRes.label, 'Upstream connection error');
  assert.strictEqual(realFailedRes.isTerminal, true);
});

test('mapSSEEventToStatus maps intermediate verification and recovery events', () => {
  assert.strictEqual(mapSSEEventToStatus('generation.started').state, 'generating');
  assert.strictEqual(mapSSEEventToStatus('sentence.verified').state, 'verifying');
  assert.strictEqual(mapSSEEventToStatus('sentence.flagged').state, 'verifying');
  assert.strictEqual(mapSSEEventToStatus('recovery.started').state, 'recovering');
  assert.strictEqual(mapSSEEventToStatus('recovery.completed').state, 'recovering');
  assert.strictEqual(mapSSEEventToStatus('generation.completed').state, 'completed');
});

test('deriveTrustSummary shows explicit backend dispositions (Phase 04)', () => {
  // Claim extraction/verification unavailable: never "Informational response" or "Verified"
  const unverified = deriveTrustSummary([], 'completed', 'UNVERIFIED');
  assert.strictEqual(unverified.headline, 'Verification unavailable');
  assert.strictEqual(unverified.verifiedCount, 0);
  assert.notStrictEqual(unverified.variant, 'success');

  // Final abstention: insufficient evidence, no sources, never verified
  const abstained = deriveTrustSummary([], 'completed', 'INSUFFICIENT');
  assert.strictEqual(abstained.headline, 'Insufficient evidence');
  assert.strictEqual(abstained.sourceCount, 0);
  assert.notStrictEqual(abstained.variant, 'success');

  // Without a disposition the claim-based behavior is unchanged
  assert.strictEqual(deriveTrustSummary([], 'completed').headline, 'Informational response');
});
