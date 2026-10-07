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

test('5. Suggested Next Steps: prioritizes unverified claims when flagged > 0 and includes Post-MVP item 3', () => {
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
  assert.strictEqual(steps[0].isDisabled, undefined);

  assert.strictEqual(steps[1].priorityNumber, 2);
  assert.strictEqual(steps[1].id, 'compare-evidence');
  assert.strictEqual(steps[1].title, 'Compare evidence across sources');
  assert.strictEqual(steps[1].actionLabel, 'Ask EVIDEX');
  assert.strictEqual(steps[1].isDisabled, undefined);

  assert.strictEqual(steps[2].priorityNumber, 3);
  assert.strictEqual(steps[2].id, 'drift-monitoring');
  assert.strictEqual(steps[2].title, 'Evidence Drift Monitoring');
  assert.strictEqual(steps[2].badge, 'POST-MVP');
  assert.strictEqual(steps[2].isPostMvp, true);
  assert.strictEqual(steps[2].isDisabled, true);
  assert.strictEqual(steps[2].href, undefined);
  assert.strictEqual(steps[2].actionLabel, 'Coming later');
});

test('6. Suggested Next Steps: keeps items 1 & 2 active and item 3 Post-MVP when 1 source exists', () => {
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
  assert.strictEqual(steps[0].priorityNumber, 1);
  assert.strictEqual(steps[0].id, 'review-claims');
  assert.strictEqual(steps[0].title, 'Review unresolved claims');

  assert.strictEqual(steps[1].priorityNumber, 2);
  assert.strictEqual(steps[1].id, 'compare-evidence');
  assert.strictEqual(steps[1].title, 'Compare evidence across sources');
  assert.strictEqual(steps[1].actionLabel, 'Add knowledge');
  assert.strictEqual(steps[1].isDisabled, undefined);

  assert.strictEqual(steps[2].priorityNumber, 3);
  assert.strictEqual(steps[2].id, 'drift-monitoring');
  assert.strictEqual(steps[2].title, 'Evidence Drift Monitoring');
  assert.strictEqual(steps[2].badge, 'POST-MVP');
  assert.strictEqual(steps[2].isPostMvp, true);
  assert.strictEqual(steps[2].isDisabled, true);
  assert.strictEqual(steps[2].href, undefined);
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

test('10. Source Fingerprint: builds page-level regions, preserves source order, and derives hotspot mathematically', () => {
  const { buildSourceFingerprints } = require('../lib/overview-helpers.ts');

  const docs = [
    { id: 'doc_campus', filename: 'Campus Monitor.pdf', chunksCount: 79, status: 'ready' },
  ];

  // Create claims with real page-level evidence attribution
  const claims = [
    // Page 1: 5 claims (4 verified, 1 recovered)
    { status: 'verified', evidence: [{ documentId: 'doc_campus', pageNumber: 1 }] },
    { status: 'verified', evidence: [{ documentId: 'doc_campus', pageNumber: 1 }] },
    { status: 'verified', evidence: [{ documentId: 'doc_campus', pageNumber: 1 }] },
    { status: 'verified', evidence: [{ documentId: 'doc_campus', pageNumber: 1 }] },
    { status: 'recovered', evidence: [{ documentId: 'doc_campus', pageNumber: 1 }] },

    // Page 2: 3 claims (2 verified, 1 review)
    { status: 'verified', evidence: [{ documentId: 'doc_campus', pageNumber: 2 }] },
    { status: 'verified', evidence: [{ documentId: 'doc_campus', pageNumber: 2 }] },
    { status: 'needs_review', evidence: [{ documentId: 'doc_campus', pageNumber: 2 }] },

    // Page 3: 8 claims (1 verified, 1 recovered, 6 review) -> HOTSPOT
    { status: 'verified', evidence: [{ documentId: 'doc_campus', pageNumber: 3 }] },
    { status: 'recovered', evidence: [{ documentId: 'doc_campus', pageNumber: 3 }] },
    { status: 'flagged', evidence: [{ documentId: 'doc_campus', pageNumber: 3 }] },
    { status: 'flagged', evidence: [{ documentId: 'doc_campus', pageNumber: 3 }] },
    { status: 'needs_review', evidence: [{ documentId: 'doc_campus', pageNumber: 3 }] },
    { status: 'needs_review', evidence: [{ documentId: 'doc_campus', pageNumber: 3 }] },
    { status: 'needs_review', evidence: [{ documentId: 'doc_campus', pageNumber: 3 }] },
    { status: 'needs_review', evidence: [{ documentId: 'doc_campus', pageNumber: 3 }] },
  ];

  const fingerprints = buildSourceFingerprints({ documents: docs, claims });
  assert.strictEqual(fingerprints.length, 1);

  const fp = fingerprints[0];
  assert.strictEqual(fp.displayTitle, 'Campus Monitor');
  assert.strictEqual(fp.totalClaims, 16);
  assert.strictEqual(fp.verifiedClaims, 7);
  assert.strictEqual(fp.recoveredClaims, 2);
  assert.strictEqual(fp.needsReviewClaims, 7);

  // Verify regions preservation of spatial order (pages 1, 2, 3)
  assert.strictEqual(fp.regions.length, 3);
  assert.strictEqual(fp.regions[0].label, 'Page 1');
  assert.strictEqual(fp.regions[0].verifiedCount, 4);
  assert.strictEqual(fp.regions[0].recoveredCount, 1);
  assert.strictEqual(fp.regions[0].needsReviewCount, 0);
  assert.strictEqual(fp.regions[0].isHotspot, false);

  assert.strictEqual(fp.regions[1].label, 'Page 2');
  assert.strictEqual(fp.regions[1].needsReviewCount, 1);
  assert.strictEqual(fp.regions[1].isHotspot, false);

  assert.strictEqual(fp.regions[2].label, 'Page 3');
  assert.strictEqual(fp.regions[2].needsReviewCount, 6);
  assert.strictEqual(fp.regions[2].isHotspot, true);

  // Mathematically true hotspot summary
  assert.ok(fp.hotspotRegion);
  assert.strictEqual(fp.hotspotRegion?.label, 'Page 3');
  assert.match(fp.hotspotSummary || '', /Page 3 contains the highest concentration of unresolved claims \(6 claims\)/);
});

test('11. Source Fingerprint: falls back to ordered passage ranges when page numbers are absent', () => {
  const { buildSourceFingerprints } = require('../lib/overview-helpers.ts');

  const docs = [
    { id: 'doc_manual', filename: 'System Manual.pdf', chunksCount: 40, status: 'ready' },
  ];

  const claims = [
    { status: 'verified', evidence: [{ documentId: 'doc_manual' }] },
    { status: 'recovered', evidence: [{ documentId: 'doc_manual' }] },
  ];

  const fingerprints = buildSourceFingerprints({ documents: docs, claims });
  assert.strictEqual(fingerprints.length, 1);

  const fp = fingerprints[0];
  assert.ok(fp.regions.length >= 2);
  assert.strictEqual(fp.regions[0].unitType, 'passage');
  assert.match(fp.regions[0].label, /Passage/);
});

test('12. Project Brief: produces editorial deterministic observations with zero LLM dependence', () => {
  const { generateProjectBrief } = require('../lib/overview-helpers.ts');

  const brief = generateProjectBrief({
    totalDocs: 1,
    readyDocsCount: 1,
    totalChunks: 79,
    totalClaims: 597,
    verifiedClaims: 361,
    recoveredClaims: 61,
    flaggedClaims: 175,
    hotspotLabel: 'pages 8–11',
  });

  assert.strictEqual(brief.length, 4);
  assert.strictEqual(brief[0], 'Your current evidence base depends on one source.');
  assert.strictEqual(brief[1], '79 indexed passages support 597 evaluated claims.');
  assert.strictEqual(brief[2], 'Review pressure is concentrated in pages 8–11.');
  assert.strictEqual(brief[3], '61 previously unsupported claims were recovered and successfully reverified.');
});

test('13. Format display title cleans ugly filenames gracefully', () => {
  const { formatDisplayTitle } = require('../lib/overview-helpers.ts');
  assert.strictEqual(formatDisplayTitle('DHT11 Notes for the Students.pdf'), 'DHT11 Notes For The Students');
  assert.strictEqual(formatDisplayTitle('feedwater_system_beta.pdf'), 'Feedwater System Beta');
  assert.strictEqual(formatDisplayTitle('campus_monitor.pdf'), 'Campus Monitor');
});

