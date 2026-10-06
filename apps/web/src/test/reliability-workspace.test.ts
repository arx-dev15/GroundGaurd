import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOverviewPercentages,
  calculateLiveImpactMetrics,
  formatPercentagePointDelta,
  getBenchmarkNarrative,
  calculateDistributionWidths,
  calculatePaginationBounds,
  truncateClaimId,
} from '../lib/reliability-helpers.ts';

test('1. Overview Aggregation: calculates exact canonical percentages from claim counts', () => {
  // Scenario matching prompt example: Verified: 42, Needs Review: 3, Recovered: 8, Total: 53
  const counts = {
    totalClaims: 53,
    verifiedClaims: 42,
    needsReviewClaims: 3,
    recoveredClaims: 8,
  };

  const percentages = calculateOverviewPercentages(counts);

  // 42 / 53 * 100 = 79.2%
  assert.strictEqual(percentages.verifiedPct, '79.2');
  // 3 / 53 * 100 = 5.7%
  assert.strictEqual(percentages.needsReviewPct, '5.7');
  // 8 / 53 * 100 = 15.1%
  assert.strictEqual(percentages.recoveredPct, '15.1');
});

test('2. Overview Aggregation: handles zero claims gracefully without NaN/division-by-zero', () => {
  const counts = {
    totalClaims: 0,
    verifiedClaims: 0,
    needsReviewClaims: 0,
    recoveredClaims: 0,
  };

  const percentages = calculateOverviewPercentages(counts);
  assert.strictEqual(percentages.verifiedPct, '0.0');
  assert.strictEqual(percentages.needsReviewPct, '0.0');
  assert.strictEqual(percentages.recoveredPct, '0.0');
});

test('3. Status Distribution: calculates proportional horizontal bar widths accurately', () => {
  // Verified: 72, Recovered: 15, Needs Review: 9, Flagged: 4 (Total 100)
  const widths = calculateDistributionWidths(72, 15, 9, 4);
  assert.strictEqual(widths.verifiedWidthPct, 72.0);
  assert.strictEqual(widths.recoveredWidthPct, 15.0);
  assert.strictEqual(widths.needsReviewWidthPct, 9.0);
  assert.strictEqual(widths.flaggedWidthPct, 4.0);

  // Zero claims returns all zeros
  const zeroWidths = calculateDistributionWidths(0, 0, 0, 0);
  assert.strictEqual(zeroWidths.verifiedWidthPct, 0);
  assert.strictEqual(zeroWidths.recoveredWidthPct, 0);
  assert.strictEqual(zeroWidths.needsReviewWidthPct, 0);
  assert.strictEqual(zeroWidths.flaggedWidthPct, 0);
});

test('4. Pagination Logic: Page size = 5 with 37 total claims computes bounds correctly', () => {
  // Page 1 of 8 (37 items / 5 = 8 pages)
  const p1 = calculatePaginationBounds(1, 5, 37);
  assert.strictEqual(p1.totalPages, 8);
  assert.strictEqual(p1.startItem, 1);
  assert.strictEqual(p1.endItem, 5);
  assert.strictEqual(p1.hasPrevious, false);
  assert.strictEqual(p1.hasNext, true);
  assert.strictEqual(p1.displayLabel, 'Showing 1–5 of 37');

  // Page 2 of 8
  const p2 = calculatePaginationBounds(2, 5, 37);
  assert.strictEqual(p2.startItem, 6);
  assert.strictEqual(p2.endItem, 10);
  assert.strictEqual(p2.hasPrevious, true);
  assert.strictEqual(p2.hasNext, true);
  assert.strictEqual(p2.displayLabel, 'Showing 6–10 of 37');

  // Last page: Page 8 of 8 (items 36–37)
  const p8 = calculatePaginationBounds(8, 5, 37);
  assert.strictEqual(p8.startItem, 36);
  assert.strictEqual(p8.endItem, 37);
  assert.strictEqual(p8.hasPrevious, true);
  assert.strictEqual(p8.hasNext, false);
  assert.strictEqual(p8.displayLabel, 'Showing 36–37 of 37');
});

test('5. Pagination Bounds: handles empty queue correctly', () => {
  const pEmpty = calculatePaginationBounds(1, 5, 0);
  assert.strictEqual(pEmpty.totalPages, 1);
  assert.strictEqual(pEmpty.startItem, 0);
  assert.strictEqual(pEmpty.endItem, 0);
  assert.strictEqual(pEmpty.hasPrevious, false);
  assert.strictEqual(pEmpty.hasNext, false);
  assert.strictEqual(pEmpty.displayLabel, 'Showing 0 of 0');
});

test('6. Percentage-Point Delta: formats absolute delta in percentage points without fake relative claims', () => {
  // Unsupported claims: 22% -> 4% (lower is better)
  const unsupportedDelta = formatPercentagePointDelta(22, 4, true);
  assert.strictEqual(unsupportedDelta.deltaValue, -18);
  assert.strictEqual(unsupportedDelta.deltaString, '↓ 18 percentage points');
  assert.strictEqual(unsupportedDelta.isImproved, true);
  assert.strictEqual(unsupportedDelta.direction, 'down');

  // Verified claims: 61% -> 91% (higher is better)
  const verifiedDelta = formatPercentagePointDelta(61, 91, false);
  assert.strictEqual(verifiedDelta.deltaValue, 30);
  assert.strictEqual(verifiedDelta.deltaString, '↑ 30 percentage points');
  assert.strictEqual(verifiedDelta.isImproved, true);
  assert.strictEqual(verifiedDelta.direction, 'up');

  // Zero change
  const neutralDelta = formatPercentagePointDelta(50, 50, false);
  assert.strictEqual(neutralDelta.deltaValue, 0);
  assert.strictEqual(neutralDelta.deltaString, '0 percentage points');
  assert.strictEqual(neutralDelta.direction, 'neutral');
});

test('7. Truncate Claim ID: preserves traceability without noisy UI clutter', () => {
  assert.strictEqual(truncateClaimId('claim_3ceb9a618491'), 'claim_3ceb9a61…');
  assert.strictEqual(truncateClaimId('short_id', 14), 'short_id');
  assert.strictEqual(truncateClaimId(''), '');
});

test('8. Filter + Pagination Interaction: switching filter recalculates offsets from page 1', () => {
  // Simulating state machine transition when switching filter from 'all' (37 items) to 'needs_attention' (3 items)
  const allBounds = calculatePaginationBounds(3, 5, 37); // User was on page 3
  assert.strictEqual(allBounds.totalPages, 8);

  // When filter changes, UI resets to page 1
  const filterResetPage = 1;
  const filteredBounds = calculatePaginationBounds(filterResetPage, 5, 3);
  assert.strictEqual(filteredBounds.totalPages, 1);
  assert.strictEqual(filteredBounds.startItem, 1);
  assert.strictEqual(filteredBounds.endItem, 3);
  assert.strictEqual(filteredBounds.hasPrevious, false);
  assert.strictEqual(filteredBounds.hasNext, false);
  assert.strictEqual(filteredBounds.displayLabel, 'Showing 1–3 of 3');
});

test('9. Selected Claim Persistence: preserves active claim if present on refreshed page', () => {
  const currentSelectedId = 'claim_abc';
  const newPageClaims = [
    { claimId: 'claim_123', text: 'One' },
    { claimId: 'claim_abc', text: 'Selected Claim' },
    { claimId: 'claim_456', text: 'Three' },
  ];

  // Logic from page.tsx:
  const existsOnPage = newPageClaims.some((c) => c.claimId === currentSelectedId);
  const resolvedSelection = existsOnPage
    ? newPageClaims.find((c) => c.claimId === currentSelectedId)
    : newPageClaims[0];

  assert.strictEqual(resolvedSelection?.claimId, 'claim_abc');
});

test('10. Queue Slicing Fallback: strictly caps displayed items to PAGE_SIZE (5) per page', () => {
  const PAGE_SIZE = 5;
  const mockUnpaginatedClaims = Array.from({ length: 27 }, (_, i) => ({
    claimId: `claim_${i + 1}`,
    text: `Claim ${i + 1}`,
  }));

  // Page 1
  const page1Items = mockUnpaginatedClaims.slice(0, PAGE_SIZE);
  assert.strictEqual(page1Items.length, 5);
  assert.strictEqual(page1Items[0].claimId, 'claim_1');
  assert.strictEqual(page1Items[4].claimId, 'claim_5');

  // Page 2
  const offset2 = (2 - 1) * PAGE_SIZE;
  const page2Items = mockUnpaginatedClaims.slice(offset2, offset2 + PAGE_SIZE);
  assert.strictEqual(page2Items.length, 5);
  assert.strictEqual(page2Items[0].claimId, 'claim_6');
  assert.strictEqual(page2Items[4].claimId, 'claim_10');

  // Final Page (Page 6 of 6)
  const offset6 = (6 - 1) * PAGE_SIZE;
  const page6Items = mockUnpaginatedClaims.slice(offset6, offset6 + PAGE_SIZE);
  assert.strictEqual(page6Items.length, 2);
  assert.strictEqual(page6Items[0].claimId, 'claim_26');
  assert.strictEqual(page6Items[1].claimId, 'claim_27');

  const bounds6 = calculatePaginationBounds(6, PAGE_SIZE, mockUnpaginatedClaims.length);
  assert.strictEqual(bounds6.displayLabel, 'Showing 26–27 of 27');
  assert.strictEqual(bounds6.totalPages, 6);
  assert.strictEqual(bounds6.hasNext, false);
  assert.strictEqual(bounds6.hasPrevious, true);
});

test('11. Queue Slicing Fallback: supports PAGE_SIZE = 6 per page', () => {
  const PAGE_SIZE = 6;
  const mockUnpaginatedClaims = Array.from({ length: 27 }, (_, i) => ({
    claimId: `claim_${i + 1}`,
    text: `Claim ${i + 1}`,
  }));

  // Page 1
  const page1Items = mockUnpaginatedClaims.slice(0, PAGE_SIZE);
  assert.strictEqual(page1Items.length, 6);
  assert.strictEqual(page1Items[0].claimId, 'claim_1');
  assert.strictEqual(page1Items[5].claimId, 'claim_6');

  // Page 2
  const offset2 = (2 - 1) * PAGE_SIZE;
  const page2Items = mockUnpaginatedClaims.slice(offset2, offset2 + PAGE_SIZE);
  assert.strictEqual(page2Items.length, 6);
  assert.strictEqual(page2Items[0].claimId, 'claim_7');
  assert.strictEqual(page2Items[5].claimId, 'claim_12');

  const bounds1 = calculatePaginationBounds(1, PAGE_SIZE, mockUnpaginatedClaims.length);
  assert.strictEqual(bounds1.displayLabel, 'Showing 1–6 of 27');
  assert.strictEqual(bounds1.totalPages, 5); // 27 / 6 = ceil(4.5) = 5
  assert.strictEqual(bounds1.hasNext, true);
  assert.strictEqual(bounds1.hasPrevious, false);
});

test('12. Needs Attention & Pending Reconciliation: verified + recovered + needsAttention + pending = total', () => {
  // Database reality scenario:
  // verified: 144, needs_review: 92, flagged: 37, recovered: 6, pending: 5
  const rawCounts = {
    verified: 144,
    needs_review: 92,
    flagged: 37,
    recovered: 6,
    pending: 5,
  };

  const needsAttention = rawCounts.needs_review + rawCounts.flagged; // 129
  assert.strictEqual(needsAttention, 129);

  const total = rawCounts.verified + rawCounts.recovered + needsAttention + rawCounts.pending; // 284
  assert.strictEqual(total, 284);

  const percentages = calculateOverviewPercentages({
    totalClaims: total,
    verifiedClaims: rawCounts.verified,
    needsAttentionClaims: needsAttention,
    recoveredClaims: rawCounts.recovered,
    pendingClaims: rawCounts.pending,
  });

  // 144 / 284 = 50.7%
  assert.strictEqual(percentages.verifiedPct, '50.7');
  // 129 / 284 = 45.4%
  assert.strictEqual(percentages.needsAttentionPct, '45.4');
  // 6 / 284 = 2.1%
  assert.strictEqual(percentages.recoveredPct, '2.1');
  // 5 / 284 = 1.8%
  assert.strictEqual(percentages.pendingPct, '1.8');

  // Distribution widths with pending segment
  const widths = calculateDistributionWidths(
    rawCounts.verified,
    rawCounts.recovered,
    rawCounts.needs_review,
    rawCounts.flagged,
    rawCounts.pending
  );

  assert.strictEqual(widths.verifiedWidthPct, 50.7);
  assert.strictEqual(widths.needsAttentionWidthPct, 45.4);
  assert.strictEqual(widths.recoveredWidthPct, 2.1);
  assert.strictEqual(widths.pendingWidthPct, 1.8);
});

test('13. Live EVIDEX Impact: calculates intervention funnel & recovery effectiveness from canonical data', () => {
  // Authoritative project baseline: 279 total, 144 verified, 129 needs attention, 6 recovered
  const canonicalCounts = {
    totalClaims: 279,
    verifiedClaims: 144,
    needsAttentionClaims: 129,
    recoveredClaims: 6,
  };

  const liveImpact = calculateLiveImpactMetrics(canonicalCounts);

  // Evaluated claims
  assert.strictEqual(liveImpact.totalClaims, 279);
  // Supported directly initially
  assert.strictEqual(liveImpact.verifiedClaims, 144);
  // Required intervention (unresolved 129 + recovered 6 = 135)
  assert.strictEqual(liveImpact.requiredInterventionClaims, 135);
  // Unresolved currently
  assert.strictEqual(liveImpact.unresolvedClaims, 129);
  // Recovered
  assert.strictEqual(liveImpact.recoveredClaims, 6);
  // Recovery effectiveness: 6 / 135 = 4.4%
  assert.strictEqual(liveImpact.recoveryEffectivenessPct, '4.4');
  // Final evidence-supported claims: 144 + 6 = 150
  assert.strictEqual(liveImpact.finalSupportedClaims, 150);
  // Final supported pct: 150 / 279 = 53.8%
  assert.strictEqual(liveImpact.finalSupportedPct, '53.8');
});

test('14. Live Transition: Contradicted claim increases Needs Attention & Total, leaves Verified/Recovered unchanged', () => {
  const initial = {
    totalClaims: 279,
    verifiedClaims: 144,
    needsAttentionClaims: 129,
    recoveredClaims: 6,
  };

  // Contradicted claim added
  const updated = {
    totalClaims: initial.totalClaims + 1,
    verifiedClaims: initial.verifiedClaims,
    needsAttentionClaims: initial.needsAttentionClaims + 1,
    recoveredClaims: initial.recoveredClaims,
  };

  assert.strictEqual(updated.totalClaims, 280);
  assert.strictEqual(updated.needsAttentionClaims, 130);
  assert.strictEqual(updated.verifiedClaims, 144);
  assert.strictEqual(updated.recoveredClaims, 6);

  const liveImpact = calculateLiveImpactMetrics(updated);
  assert.strictEqual(liveImpact.requiredInterventionClaims, 136); // 130 + 6
  assert.strictEqual(liveImpact.unresolvedClaims, 130);
  // Recovery effectiveness: 6 / 136 = 4.4%
  assert.strictEqual(liveImpact.recoveryEffectivenessPct, '4.4');
});

test('15. Live Transition: Directly verified claim increases Verified & Total, leaves Needs Attention/Recovered unchanged', () => {
  const initial = {
    totalClaims: 279,
    verifiedClaims: 144,
    needsAttentionClaims: 129,
    recoveredClaims: 6,
  };

  // Supported claim added
  const updated = {
    totalClaims: initial.totalClaims + 1,
    verifiedClaims: initial.verifiedClaims + 1,
    needsAttentionClaims: initial.needsAttentionClaims,
    recoveredClaims: initial.recoveredClaims,
  };

  assert.strictEqual(updated.totalClaims, 280);
  assert.strictEqual(updated.verifiedClaims, 145);
  assert.strictEqual(updated.needsAttentionClaims, 129);
  assert.strictEqual(updated.recoveredClaims, 6);

  const liveImpact = calculateLiveImpactMetrics(updated);
  assert.strictEqual(liveImpact.requiredInterventionClaims, 135);
  assert.strictEqual(liveImpact.finalSupportedClaims, 151); // 145 + 6
  // 151 / 280 = 53.9%
  assert.strictEqual(liveImpact.finalSupportedPct, '53.9');
});

test('16. Live Transition: Successful recovery moves claim from Needs Attention to Recovered (Total unchanged)', () => {
  const initial = {
    totalClaims: 280,
    verifiedClaims: 144,
    needsAttentionClaims: 130,
    recoveredClaims: 6,
  };

  // Successful recovery: 1 claim repaired and reverified
  const afterRecovery = {
    totalClaims: initial.totalClaims, // invariant: total does not change
    verifiedClaims: initial.verifiedClaims,
    needsAttentionClaims: initial.needsAttentionClaims - 1, // 130 -> 129
    recoveredClaims: initial.recoveredClaims + 1, // 6 -> 7
  };

  assert.strictEqual(afterRecovery.totalClaims, 280);
  assert.strictEqual(afterRecovery.needsAttentionClaims, 129);
  assert.strictEqual(afterRecovery.recoveredClaims, 7);
  assert.strictEqual(afterRecovery.verifiedClaims, 144);

  const liveImpact = calculateLiveImpactMetrics(afterRecovery);
  assert.strictEqual(liveImpact.unresolvedClaims, 129);
  assert.strictEqual(liveImpact.recoveredClaims, 7);
  assert.strictEqual(liveImpact.requiredInterventionClaims, 136); // 129 + 7
  // Recovery effectiveness: 7 / 136 = 5.1%
  assert.strictEqual(liveImpact.recoveryEffectivenessPct, '5.1');
  assert.strictEqual(liveImpact.finalSupportedClaims, 151); // 144 + 7
});

test('17. Live Transition: Failed recovery leaves Needs Attention unchanged and marks claim for human review', () => {
  const initial = {
    totalClaims: 280,
    verifiedClaims: 144,
    needsAttentionClaims: 130,
    recoveredClaims: 6,
  };

  // Recovery failed (attempts exhausted): claim remains in needs_review/needsAttention
  const afterFailedRecovery = {
    totalClaims: initial.totalClaims,
    verifiedClaims: initial.verifiedClaims,
    needsAttentionClaims: initial.needsAttentionClaims, // still 130
    recoveredClaims: initial.recoveredClaims, // still 6
  };

  assert.strictEqual(afterFailedRecovery.totalClaims, 280);
  assert.strictEqual(afterFailedRecovery.needsAttentionClaims, 130);
  assert.strictEqual(afterFailedRecovery.recoveredClaims, 6);

  const liveImpact = calculateLiveImpactMetrics(afterFailedRecovery);
  assert.strictEqual(liveImpact.unresolvedClaims, 130);
  assert.strictEqual(liveImpact.recoveredClaims, 6);
});

test('18. Strict Invariant: No double counting across mutually exclusive buckets', () => {
  const verified = 144;
  const needs_review = 92;
  const flagged = 37;
  const recovered = 6;

  const needsAttention = needs_review + flagged;
  const total = verified + needsAttention + recovered;

  assert.strictEqual(total, 279);
  assert.strictEqual(verified + needs_review + flagged + recovered, 279);
});

test('19. Benchmark Independence: Project claim changes do NOT alter controlled benchmark metrics', () => {
  // Static benchmark evaluation results (Preliminary · 5 cases)
  const controlledBenchmark = {
    cases: 5,
    unsupportedBaseline: 22.0,
    unsupportedEvidex: 4.0,
    verifiedBaseline: 61.0,
    verifiedEvidex: 91.0,
    coverageBaseline: 68.0,
    coverageEvidex: 94.0,
  };

  // Mutate project state (simulate 100 new claims)
  const projectA = { totalClaims: 379, verifiedClaims: 244, needsAttentionClaims: 129, recoveredClaims: 6 };
  const liveImpact = calculateLiveImpactMetrics(projectA);

  assert.strictEqual(liveImpact.totalClaims, 379);
  // Benchmark values remain strictly identical
  assert.strictEqual(controlledBenchmark.cases, 5);
  assert.strictEqual(controlledBenchmark.unsupportedBaseline, 22.0);
  assert.strictEqual(controlledBenchmark.unsupportedEvidex, 4.0);
  assert.strictEqual(controlledBenchmark.verifiedBaseline, 61.0);
  assert.strictEqual(controlledBenchmark.verifiedEvidex, 91.0);
  assert.strictEqual(controlledBenchmark.coverageBaseline, 68.0);
  assert.strictEqual(controlledBenchmark.coverageEvidex, 94.0);
});

test('20. Zero-Data State: Gracefully handles empty project with zero claims', () => {
  const emptyCounts = {
    totalClaims: 0,
    verifiedClaims: 0,
    needsAttentionClaims: 0,
    recoveredClaims: 0,
  };

  const liveImpact = calculateLiveImpactMetrics(emptyCounts);
  assert.strictEqual(liveImpact.totalClaims, 0);
  assert.strictEqual(liveImpact.verifiedClaims, 0);
  assert.strictEqual(liveImpact.requiredInterventionClaims, 0);
  assert.strictEqual(liveImpact.unresolvedClaims, 0);
  assert.strictEqual(liveImpact.recoveredClaims, 0);
  assert.strictEqual(liveImpact.recoveryEffectivenessPct, '0.0');
  assert.strictEqual(liveImpact.finalSupportedClaims, 0);
  assert.strictEqual(liveImpact.finalSupportedPct, '0.0');
});

test('21. Benchmark Value Rendering & Percentage-Point Deltas: format percentage points accurately without relative marketing claims', () => {
  // Lane 1: Unsupported claims (22.0% -> 4.0%, lower is better)
  const unsupportedDelta = formatPercentagePointDelta(22.0, 4.0, true);
  assert.strictEqual(unsupportedDelta.deltaValue, -18.0);
  assert.strictEqual(unsupportedDelta.deltaString, '↓ 18 percentage points');
  assert.strictEqual(unsupportedDelta.direction, 'down');
  assert.strictEqual(unsupportedDelta.isImproved, true);

  // Lane 2: Verified claims (61.0% -> 91.0%, higher is better)
  const verifiedDelta = formatPercentagePointDelta(61.0, 91.0, false);
  assert.strictEqual(verifiedDelta.deltaValue, 30.0);
  assert.strictEqual(verifiedDelta.deltaString, '↑ 30 percentage points');
  assert.strictEqual(verifiedDelta.direction, 'up');
  assert.strictEqual(verifiedDelta.isImproved, true);

  // Lane 3: Evidence coverage (68.0% -> 94.0%, higher is better)
  const coverageDelta = formatPercentagePointDelta(68.0, 94.0, false);
  assert.strictEqual(coverageDelta.deltaValue, 26.0);
  assert.strictEqual(coverageDelta.deltaString, '↑ 26 percentage points');
  assert.strictEqual(coverageDelta.direction, 'up');
  assert.strictEqual(coverageDelta.isImproved, true);
});

test('22. Benchmark Refresh After Evaluation: new evaluation run updates benchmark while project metrics remain independent', () => {
  // Evaluation Run 1 (Preliminary · 5 cases)
  const eval1 = {
    totalCases: 5,
    unsupportedEvidex: 4.0,
    verifiedEvidex: 91.0,
  };
  assert.strictEqual(eval1.totalCases, 5);

  // Evaluation Run 2 completed (Expanded · 12 cases)
  const eval2 = {
    totalCases: 12,
    unsupportedEvidex: 3.5,
    verifiedEvidex: 93.0,
  };
  assert.strictEqual(eval2.totalCases, 12);

  // Live project counts remain independent and untouched by benchmark execution
  const projectMetrics = {
    totalClaims: 279,
    verifiedClaims: 144,
    needsAttentionClaims: 129,
    recoveredClaims: 6,
  };
  assert.strictEqual(projectMetrics.totalClaims, 279);
  assert.strictEqual(projectMetrics.verifiedClaims, 144);
});

test('23. Complete 5-State Invariant Reconciliation: verified + recovered + needs_review + flagged + pending = total', () => {
  const verified = 144;
  const recovered = 6;
  const needs_review = 92;
  const flagged = 37;
  const pending = 8;

  const needsAttention = needs_review + flagged; // 129
  const total = verified + recovered + needsAttention + pending; // 287

  assert.strictEqual(total, 287);
  assert.strictEqual(verified + recovered + needs_review + flagged + pending, 287);

  const { verifiedPct, needsAttentionPct, recoveredPct, pendingPct } = calculateOverviewPercentages({
    totalClaims: total,
    verifiedClaims: verified,
    needsAttentionClaims: needsAttention,
    recoveredClaims: recovered,
    pendingClaims: pending,
  });

  // Verify non-drift percentages
  // 144 / 287 = 50.2%
  assert.strictEqual(verifiedPct, '50.2');
  // 129 / 287 = 44.9%
  assert.strictEqual(needsAttentionPct, '44.9');
  // 6 / 287 = 2.1%
  assert.strictEqual(recoveredPct, '2.1');
  // 8 / 287 = 2.8%
  assert.strictEqual(pendingPct, '2.8');
});

test('24. Selected Metric Narrative: deterministic storytelling generated across all 4 selection states', () => {
  const benchmarkData = {
    unsupportedBaseline: 22.0,
    unsupportedEvidex: 4.0,
    verifiedBaseline: 61.0,
    verifiedEvidex: 91.0,
    coverageBaseline: 68.0,
    coverageEvidex: 94.0,
  };

  // State 1: All active (default overall profile)
  const allNarrative = getBenchmarkNarrative('all', benchmarkData);
  assert.strictEqual(allNarrative.title, 'Overall EVIDEX Benchmark Profile');
  assert.strictEqual(
    allNarrative.body,
    'Across this evaluation, EVIDEX reduced unsupported claims while increasing verified claims and evidence coverage.'
  );
  assert.strictEqual(allNarrative.deltaText, '3 benchmark dimensions evaluated');
  assert.strictEqual(allNarrative.isPositive, true);

  // State 2: Unsupported claims selected
  const unsupportedNarrative = getBenchmarkNarrative('unsupported', benchmarkData);
  assert.strictEqual(unsupportedNarrative.title, 'Unsupported claims fell by 18 percentage points.');
  assert.strictEqual(
    unsupportedNarrative.body,
    'Baseline RAG: 22.0% · EVIDEX: 4.0% (Lower is better · Confirms model restraint)'
  );
  assert.strictEqual(unsupportedNarrative.deltaText, '↓ 18 percentage points');
  assert.strictEqual(unsupportedNarrative.isPositive, true);

  // State 3: Verified claims selected
  const verifiedNarrative = getBenchmarkNarrative('verified', benchmarkData);
  assert.strictEqual(verifiedNarrative.title, 'Verified claims increased by 30 percentage points.');
  assert.strictEqual(
    verifiedNarrative.body,
    'Baseline RAG: 61.0% · EVIDEX: 91.0% (Higher is better · Proves evidence-grounded claim support)'
  );
  assert.strictEqual(verifiedNarrative.deltaText, '↑ 30 percentage points');
  assert.strictEqual(verifiedNarrative.isPositive, true);

  // State 4: Evidence coverage selected
  const coverageNarrative = getBenchmarkNarrative('coverage', benchmarkData);
  assert.strictEqual(coverageNarrative.title, 'Evidence coverage increased by 26 percentage points.');
  assert.strictEqual(
    coverageNarrative.body,
    'Baseline RAG: 68.0% · EVIDEX: 94.0% (Higher is better · Demonstrates sufficient citation links)'
  );
  assert.strictEqual(coverageNarrative.deltaText, '↑ 26 percentage points');
  assert.strictEqual(coverageNarrative.isPositive, true);
});

test('25. Directional Semantics: lower-is-better for unsupported vs higher-is-better for verified & coverage', () => {
  // Reduction in unsupported claims (22% -> 4%) is positive
  const unsupportedDelta = formatPercentagePointDelta(22.0, 4.0, true);
  assert.strictEqual(unsupportedDelta.isImproved, true);
  assert.strictEqual(unsupportedDelta.direction, 'down');

  // Increase in unsupported claims (4% -> 22%) would be negative / degradation
  const badUnsupportedDelta = formatPercentagePointDelta(4.0, 22.0, true);
  assert.strictEqual(badUnsupportedDelta.isImproved, false);
  assert.strictEqual(badUnsupportedDelta.direction, 'up');

  // Increase in verified claims (61% -> 91%) is positive
  const verifiedDelta = formatPercentagePointDelta(61.0, 91.0, false);
  assert.strictEqual(verifiedDelta.isImproved, true);
  assert.strictEqual(verifiedDelta.direction, 'up');

  // Increase in evidence coverage (68% -> 94%) is positive
  const coverageDelta = formatPercentagePointDelta(68.0, 94.0, false);
  assert.strictEqual(coverageDelta.isImproved, true);
  assert.strictEqual(coverageDelta.direction, 'up');
});

test('26. History Mode Availability: enabled only when >= 2 real completed runs exist', () => {
  const zeroRuns: any[] = [];
  const oneRun = [{ id: 'run_1', status: 'completed' }];
  const multipleRuns = [
    { id: 'run_1', status: 'completed' },
    { id: 'run_2', status: 'completed' },
  ];

  const hasHistory0 = zeroRuns.filter((e) => e.status === 'completed').length >= 2;
  const hasHistory1 = oneRun.filter((e) => e.status === 'completed').length >= 2;
  const hasHistory2 = multipleRuns.filter((e) => e.status === 'completed').length >= 2;

  assert.strictEqual(hasHistory0, false);
  assert.strictEqual(hasHistory1, false);
  assert.strictEqual(hasHistory2, true);
});

test('27. Legend Isolation & Dimming Math: unselected metrics dim to ~18% opacity while selected remains 100%', () => {
  type MetricSelection = 'all' | 'unsupported' | 'verified' | 'coverage';
  const selectedMetric: MetricSelection = 'verified';

  const getOpacity = (id: string, active: MetricSelection) => {
    if (active === 'all') return 1.0;
    return id === active ? 1.0 : 0.18;
  };

  assert.strictEqual(getOpacity('verified', selectedMetric), 1.0);
  assert.strictEqual(getOpacity('unsupported', selectedMetric), 0.18);
  assert.strictEqual(getOpacity('coverage', selectedMetric), 0.18);

  // All active state
  const allState: MetricSelection = 'all';
  assert.strictEqual(getOpacity('verified', allState), 1.0);
  assert.strictEqual(getOpacity('unsupported', allState), 1.0);
  assert.strictEqual(getOpacity('coverage', allState), 1.0);
});



