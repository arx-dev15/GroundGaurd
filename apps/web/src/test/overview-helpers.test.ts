import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeProjectReadiness,
  getHeroSummaryText,
  getSuggestedNextSteps,
  formatBytes,
  formatRelativeTime,
} from '../lib/overview-helpers.ts';

test('1. Readiness State: READY when all documents ready and no issues', () => {
  const state = computeProjectReadiness({
    totalDocs: 8,
    readyDocsCount: 8,
    processingDocsCount: 0,
    failedDocsCount: 0,
    flaggedClaimsCount: 0,
  });
  assert.strictEqual(state, 'READY');

  const summary = getHeroSummaryText(state, {
    totalDocs: 8,
    readyDocsCount: 8,
    processingDocsCount: 0,
    failedDocsCount: 0,
    flaggedClaimsCount: 0,
    totalChunks: 120,
    totalClaims: 45,
  });
  assert.strictEqual(
    summary,
    'Your evidence base is ready. EVIDEX has indexed 8 sources across 120 passages. All evaluated claims are verified.'
  );
});

test('2. Readiness State: NEEDS_ATTENTION when claims need review with real counts', () => {
  const state = computeProjectReadiness({
    totalDocs: 1,
    readyDocsCount: 1,
    processingDocsCount: 0,
    failedDocsCount: 0,
    flaggedClaimsCount: 175,
  });
  assert.strictEqual(state, 'NEEDS_ATTENTION');

  const summary = getHeroSummaryText(state, {
    totalDocs: 1,
    readyDocsCount: 1,
    processingDocsCount: 0,
    failedDocsCount: 0,
    flaggedClaimsCount: 175,
    totalChunks: 79,
    totalClaims: 597,
  });
  assert.strictEqual(
    summary,
    'Your evidence base is ready. EVIDEX has evaluated 597 claims from 79 indexed passages. 175 claims still need review.'
  );
});

test('3. Readiness State: NEEDS_ATTENTION when document failed', () => {
  const state = computeProjectReadiness({
    totalDocs: 5,
    readyDocsCount: 4,
    processingDocsCount: 0,
    failedDocsCount: 1,
    flaggedClaimsCount: 0,
  });
  assert.strictEqual(state, 'NEEDS_ATTENTION');

  const summary = getHeroSummaryText(state, {
    totalDocs: 5,
    readyDocsCount: 4,
    processingDocsCount: 0,
    failedDocsCount: 1,
    flaggedClaimsCount: 0,
  });
  assert.strictEqual(summary, '1 source encountered an ingestion issue and requires re-processing.');
});

test('4. Readiness State: PREPARING when documents are actively processing with 0 ready', () => {
  const state = computeProjectReadiness({
    totalDocs: 2,
    readyDocsCount: 0,
    processingDocsCount: 2,
    failedDocsCount: 0,
    flaggedClaimsCount: 0,
  });
  assert.strictEqual(state, 'PREPARING');

  const summary = getHeroSummaryText(state, {
    totalDocs: 2,
    readyDocsCount: 0,
    processingDocsCount: 2,
    failedDocsCount: 0,
    flaggedClaimsCount: 0,
  });
  assert.strictEqual(
    summary,
    '2 sources are still being processed. Inquiries will be enabled once indexing completes.'
  );
});

test('5. Suggested Next Steps: prioritizes unverified claims when flagged > 0', () => {
  const steps = getSuggestedNextSteps({
    totalDocs: 8,
    readyDocsCount: 8,
    processingDocsCount: 0,
    failedDocsCount: 0,
    flaggedClaimsCount: 175,
    conversationsCount: 2,
    projectId: 'proj_123',
  });

  assert.strictEqual(steps.length, 3);
  assert.strictEqual(steps[0].priorityNumber, 1);
  assert.strictEqual(steps[0].id, 'review-claims');
  assert.strictEqual(steps[0].title, 'Review 175 unresolved claims');
  assert.strictEqual(steps[0].actionLabel, 'Reliability');
});

test('6. Suggested Next Steps: intelligently marks cross-source comparison disabled when 1 source exists', () => {
  const steps = getSuggestedNextSteps({
    totalDocs: 1,
    readyDocsCount: 1,
    processingDocsCount: 0,
    failedDocsCount: 0,
    flaggedClaimsCount: 0,
    conversationsCount: 1,
    projectId: 'proj_single',
  });

  assert.strictEqual(steps.length, 3);
  assert.strictEqual(steps[0].id, 'add-second-source');
  assert.strictEqual(steps[1].id, 'compare-evidence-disabled');
  assert.strictEqual(steps[1].isDisabled, true);
  assert.strictEqual(steps[1].disabledReason, 'Available after another source is added');
});

test('7. Formatting helpers: formatBytes and formatRelativeTime', () => {
  assert.strictEqual(formatBytes(0), '0 B');
  assert.strictEqual(formatBytes(1024), '1 KB');
  assert.strictEqual(formatBytes(5 * 1024 * 1024), '5 MB');
  assert.strictEqual(formatRelativeTime(''), '');
});

test('8. Suggested Next Steps: includes whyExplanation for all steps', () => {
  const steps = getSuggestedNextSteps({
    totalDocs: 1,
    readyDocsCount: 1,
    processingDocsCount: 0,
    failedDocsCount: 0,
    flaggedClaimsCount: 175,
    conversationsCount: 1,
    projectId: 'proj_test',
  });

  assert.strictEqual(steps.length, 3);
  steps.forEach((step) => {
    assert.ok(step.whyExplanation, `Step ${step.id} should have whyExplanation`);
    assert.ok(step.whyExplanation.length > 10);
  });
});

test('9. Evidence Signals: deterministically generates meaningful observations', () => {
  const { generateEvidenceSignals } = require('../lib/overview-helpers.ts');
  const signals = generateEvidenceSignals({
    totalDocs: 1,
    readyDocsCount: 1,
    failedDocsCount: 0,
    totalChunks: 79,
    totalClaims: 597,
    verifiedClaims: 361,
    recoveredClaims: 61,
    flaggedClaims: 175,
  });

  assert.ok(signals.length >= 2);
  const singleSource = signals.find((s: any) => s.id === 'single-source');
  assert.ok(singleSource);
  assert.match(singleSource.statement, /depends on one source/);

  const recovered = signals.find((s: any) => s.id === 'recovered-claims');
  assert.ok(recovered);
  assert.match(recovered.statement, /61 assertions were autonomously repaired/);
});
