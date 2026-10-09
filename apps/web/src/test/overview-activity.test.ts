import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimBreakdown,
  documentCounts,
  overviewSummary,
  buildActivityFeed,
  documentsByRecency,
} from '../lib/overview-activity.ts';

const doc = (id: string, status: string, createdAt: string, updatedAt = createdAt, chunksCount = 10) =>
  ({ id, projectId: 'p', filename: `${id}.pdf`, fileSize: 1, mimeType: 'application/pdf', status, chunksCount, createdAt, updatedAt }) as any;
const conv = (id: string, updatedAt: string, title = `Conv ${id}`) => ({ id, projectId: 'p', title, createdAt: updatedAt, updatedAt }) as any;
const claim = (id: string, status: string, generationId: string, createdAt: string, conversationTitle = 'Who was Watson?') =>
  ({ claimId: id, text: 't', status, evidence: [], generationId, conversationTitle, createdAt }) as any;

test('claim breakdown uses real metric buckets and exposes unresolved remainder; null metrics stay unavailable', () => {
  const b = claimBreakdown({ projectId: 'p', totalGenerations: 3, completedGenerations: 3, totalClaims: 10, verifiedClaims: 5, flaggedClaims: 3, recoveredClaims: 1, groundingPassRate: 0, contradictionRate: 0, recoverySuccessRate: 0, averageLatencyMs: 0 });
  assert.deepEqual(b, { total: 10, verified: 5, recovered: 1, needsReview: 3, unresolved: 1 });
  assert.equal(claimBreakdown(null), null);
});

test('summary never claims "all verified" and reports processing/failed documents truthfully', () => {
  const counts = documentCounts([doc('a', 'ready', '2026-10-01'), doc('b', 'processing', '2026-10-02'), doc('c', 'failed', '2026-10-03')]);
  assert.deepEqual(counts, { total: 3, ready: 1, processing: 1, failed: 1 });
  const s = overviewSummary(counts, { total: 4, verified: 2, recovered: 0, needsReview: 1, unresolved: 1 });
  assert.equal(s, '1 document is ready to ask, 1 is still processing, 1 failed to process. 4 claims have been checked; 1 needs review.');
  assert.ok(!/all .*verified/i.test(s));
  assert.match(overviewSummary(counts, null), /Verification results are unavailable/);
  assert.match(overviewSummary({ total: 1, ready: 0, processing: 1, failed: 0 }, { total: 0, verified: 0, recovered: 0, needsReview: 0, unresolved: 0 }), /^No documents are ready yet, 1 is still processing\. No answers have been verified yet\.$/);
});

test('activity feed merges real records newest-first with correct routes and statuses', () => {
  const feed = buildActivityFeed({
    projectId: 'p1',
    conversations: [conv('c1', '2026-10-09T03:00:00Z')],
    documents: [doc('d1', 'ready', '2026-10-01T00:00:00Z', '2026-10-01T00:05:00Z', 42), doc('d2', 'failed', '2026-10-09T04:00:00Z')],
    claims: [
      claim('k1', 'flagged', 'g1', '2026-10-09T03:01:00Z'),
      claim('k2', 'needs_review', 'g1', '2026-10-09T03:02:00Z'),
      claim('k3', 'verified', 'g1', '2026-10-09T03:03:00Z'),
    ],
  });
  assert.deepEqual(feed.map((i) => i.id), ['doc:d2', 'review:g1', 'ask:c1', 'doc:d1']);
  assert.equal(feed[0].tone, 'failed');
  assert.equal(feed[1].detail, '2 claims need review'); // verified claim not counted
  assert.equal(feed[1].timestamp, '2026-10-09T03:02:00Z');
  assert.equal(feed[1].href, '/projects/p1/reliability?status=attention');
  assert.equal(feed[2].href, '/projects/p1/ask?c=c1'); // the Ask page reads ?c=
  assert.equal(feed[3].detail, 'Indexed · 42 passages');
  assert.equal(feed[3].href, '/projects/p1/knowledge/d1');
});

test('activity feed drops records without timestamps, never invents events, and respects the limit', () => {
  const feed = buildActivityFeed({
    projectId: 'p',
    conversations: [conv('c1', ''), ...Array.from({ length: 12 }, (_, i) => conv(`x${i}`, `2026-10-0${(i % 9) + 1}T00:00:00Z`))],
    documents: [],
    claims: [claim('k1', 'flagged', 'g9', '')],
    limit: 5,
  });
  assert.equal(feed.length, 5);
  assert.ok(feed.every((i) => i.kind === 'ask' && i.id !== 'ask:c1'));
  assert.deepEqual(buildActivityFeed({ projectId: 'p', conversations: [], documents: [], claims: [] }), []);
});

test('documents are ordered by upload time, not API order', () => {
  const sorted = documentsByRecency([doc('old', 'ready', '2026-01-01'), doc('new', 'ready', '2026-10-01'), doc('mid', 'ready', '2026-05-01')]);
  assert.deepEqual(sorted.map((d) => d.id), ['new', 'mid', 'old']);
});

import { ledgerLayout, groupActivityByDay, splitLandscape } from '../lib/overview-activity.ts';

test('ledger: one square per claim for small projects, exact counts preserved', () => {
  const l = ledgerLayout({ total: 40, verified: 22, recovered: 3, needsReview: 9, unresolved: 6 });
  assert.equal(l.perCell, 1);
  assert.equal(l.cells.length, 40);
  assert.deepEqual(l.cells.slice(0, 3), ['verified', 'verified', 'verified']);
  assert.equal(l.cells.filter((c) => c === 'needsReview').length, 9);
  assert.deepEqual(l.counts, { verified: 22, recovered: 3, needsReview: 9, unresolved: 6 });
});

test('ledger: large projects scale squares but never hide a small real group', () => {
  const l = ledgerLayout({ total: 5001, verified: 5000, recovered: 0, needsReview: 1, unresolved: 0 }, 200);
  assert.equal(l.perCell, 26);
  assert.equal(l.cells.filter((c) => c === 'needsReview').length, 1);
  assert.equal(l.cells.filter((c) => c === 'recovered').length, 0);
  assert.equal(l.counts.needsReview, 1);
  assert.ok(l.cells.length <= 200 + 4);
});

test('activity groups by calendar day in feed order', () => {
  const now = new Date('2026-10-09T15:00:00');
  const mk = (id: string, ts: string) => ({ id, kind: 'ask', title: id, detail: '', tone: 'neutral', timestamp: ts, href: '#' }) as any;
  const days = groupActivityByDay([mk('a', '2026-10-09T14:00:00'), mk('b', '2026-10-09T09:00:00'), mk('c', '2026-10-08T22:00:00'), mk('d', '2026-10-01T10:00:00')], now);
  assert.deepEqual(days.map((d) => [d.label === 'Today' || d.label === 'Yesterday' ? d.label : 'date', d.items.map((i) => i.id)]), [
    ['Today', ['a', 'b']],
    ['Yesterday', ['c']],
    ['date', ['d']],
  ]);
});

test('landscape only draws positions for page-located sources; uncovered sources are listed, not drawn', () => {
  const page = { totalClaims: 6, regions: [{ unitType: 'page', claimCount: 4 }, { unitType: 'page', claimCount: 2 }] } as any;
  const passage = { totalClaims: 3, regions: [{ unitType: 'passage', claimCount: 3 }] } as any;
  const none = { totalClaims: 0, regions: [{ unitType: 'passage', claimCount: 0 }] } as any;
  const s = splitLandscape([none, passage, page]);
  assert.deepEqual([s.located.length, s.unlocated.length, s.uncovered.length], [1, 1, 1]);
  assert.equal(s.located[0], page);
});

import { sharePercents, ledgerCellSize } from '../lib/overview-activity.ts';

test('share percentages always total 100 and keep non-zero groups visible', () => {
  assert.deepEqual(sharePercents([22, 3, 9, 6]), [55, 8, 22, 15]);
  assert.equal(sharePercents([22, 3, 9, 6]).reduce((a, b) => a + b, 0), 100);
  assert.equal(sharePercents([1, 1, 1]).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(sharePercents([0, 0]), [0, 0]);
  assert.deepEqual(sharePercents([5, 0]), [100, 0]);
});

test('ledger squares shrink as claim count grows', () => {
  assert.ok(ledgerCellSize(40) > ledgerCellSize(120));
  assert.equal(ledgerCellSize(200), 11);
});
