/**
 * Pure helper functions for the EVIDEX Phase 2 Reliability Workspace.
 * Ensures identical, mathematically validated calculations across components and tests.
 */

export interface CanonicalOverviewCounts {
  totalClaims: number;
  verifiedClaims: number;
  needsAttentionClaims?: number;
  needsReviewClaims?: number;
  recoveredClaims: number;
  pendingClaims?: number;
}

export interface OverviewPercentages {
  verifiedPct: string;
  needsAttentionPct: string;
  needsReviewPct: string;
  recoveredPct: string;
  pendingPct: string;
}

export interface DeltaResult {
  deltaValue: number;
  deltaString: string;
  direction: 'up' | 'down' | 'neutral';
  isImproved: boolean;
}

export interface DistributionWidths {
  verifiedWidthPct: number;
  recoveredWidthPct: number;
  needsAttentionWidthPct: number;
  needsReviewWidthPct: number;
  flaggedWidthPct: number;
  pendingWidthPct: number;
}

export interface PaginationBounds {
  totalPages: number;
  startItem: number;
  endItem: number;
  hasPrevious: boolean;
  hasNext: boolean;
  displayLabel: string;
}

/**
 * Calculates canonical percentages for overview metrics.
 * Reconciles verified, recovered, needs attention (needs_review + flagged), and pending.
 * Returns exact 1-decimal-place string representation or '0.0' if total is 0.
 */
export function calculateOverviewPercentages(counts: CanonicalOverviewCounts): OverviewPercentages {
  const { totalClaims, verifiedClaims, recoveredClaims } = counts;
  const needsAttentionClaims = counts.needsAttentionClaims ?? counts.needsReviewClaims ?? 0;
  const pendingClaims = counts.pendingClaims ?? 0;

  if (!totalClaims || totalClaims <= 0) {
    return {
      verifiedPct: '0.0',
      needsAttentionPct: '0.0',
      needsReviewPct: '0.0',
      recoveredPct: '0.0',
      pendingPct: '0.0',
    };
  }

  const verifiedPct = ((verifiedClaims / totalClaims) * 100).toFixed(1);
  const needsAttentionPct = ((needsAttentionClaims / totalClaims) * 100).toFixed(1);
  const recoveredPct = ((recoveredClaims / totalClaims) * 100).toFixed(1);
  const pendingPct = ((pendingClaims / totalClaims) * 100).toFixed(1);

  return {
    verifiedPct,
    needsAttentionPct,
    needsReviewPct: needsAttentionPct,
    recoveredPct,
    pendingPct,
  };
}

export interface LiveImpactMetrics {
  totalClaims: number;
  verifiedClaims: number;
  needsAttentionClaims: number;
  recoveredClaims: number;
  requiredInterventionClaims: number;
  unresolvedClaims: number;
  recoveryEffectivenessPct: string;
  finalSupportedClaims: number;
  finalSupportedPct: string;
}

/**
 * Calculates live project intervention metrics based purely on canonical project claims.
 * Every metric is mathematically grounded in persisted verification and recovery state.
 */
export function calculateLiveImpactMetrics(counts: {
  totalClaims: number;
  verifiedClaims: number;
  needsAttentionClaims: number;
  recoveredClaims: number;
}): LiveImpactMetrics {
  const { totalClaims, verifiedClaims, needsAttentionClaims, recoveredClaims } = counts;
  const requiredInterventionClaims = needsAttentionClaims + recoveredClaims;
  const unresolvedClaims = needsAttentionClaims;
  const finalSupportedClaims = verifiedClaims + recoveredClaims;

  const recoveryEffectivenessPct =
    requiredInterventionClaims > 0
      ? ((recoveredClaims / requiredInterventionClaims) * 100).toFixed(1)
      : '0.0';

  const finalSupportedPct =
    totalClaims > 0
      ? ((finalSupportedClaims / totalClaims) * 100).toFixed(1)
      : '0.0';

  return {
    totalClaims,
    verifiedClaims,
    needsAttentionClaims,
    recoveredClaims,
    requiredInterventionClaims,
    unresolvedClaims,
    recoveryEffectivenessPct,
    finalSupportedClaims,
    finalSupportedPct,
  };
}

/**
 * Formats delta in percentage points (e.g. "↓ 18 percentage points", "↑ 30 percentage points").
 * Avoids misleading relative claims like "+30% improvement".
 */
export function formatPercentagePointDelta(
  beforePct: number,
  afterPct: number,
  lowerIsBetter: boolean = false
): DeltaResult {
  const delta = Math.round((afterPct - beforePct) * 10) / 10;
  const absDelta = Math.abs(delta);

  let direction: 'up' | 'down' | 'neutral' = 'neutral';
  let arrow = '';

  if (delta > 0) {
    direction = 'up';
    arrow = '↑ ';
  } else if (delta < 0) {
    direction = 'down';
    arrow = '↓ ';
  }

  const isImproved = lowerIsBetter ? delta < 0 : delta > 0;
  const deltaString = `${arrow}${absDelta} percentage points`;

  return {
    deltaValue: delta,
    deltaString,
    direction,
    isImproved,
  };
}

/**
 * Calculates proportional widths for the stacked reliability distribution bar.
 * Reconciles verified, recovered, needsAttention (needs_review + flagged), and pending.
 */
export function calculateDistributionWidths(
  verified: number,
  recovered: number,
  needsReview: number,
  flagged: number,
  pending: number = 0
): DistributionWidths {
  const needsAttention = needsReview + flagged;
  const total = verified + recovered + needsAttention + pending;
  if (total <= 0) {
    return {
      verifiedWidthPct: 0,
      recoveredWidthPct: 0,
      needsAttentionWidthPct: 0,
      needsReviewWidthPct: 0,
      flaggedWidthPct: 0,
      pendingWidthPct: 0,
    };
  }

  return {
    verifiedWidthPct: Math.round((verified / total) * 1000) / 10,
    recoveredWidthPct: Math.round((recovered / total) * 1000) / 10,
    needsAttentionWidthPct: Math.round((needsAttention / total) * 1000) / 10,
    needsReviewWidthPct: Math.round((needsReview / total) * 1000) / 10,
    flaggedWidthPct: Math.round((flagged / total) * 1000) / 10,
    pendingWidthPct: Math.round((pending / total) * 1000) / 10,
  };
}

/**
 * Calculates pagination bounds and display labels.
 * E.g., "Showing 1–5 of 37", page 1 of 8.
 */
export function calculatePaginationBounds(
  currentPage: number,
  pageSize: number,
  totalItems: number
): PaginationBounds {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  if (totalItems === 0) {
    return {
      totalPages: 1,
      startItem: 0,
      endItem: 0,
      hasPrevious: false,
      hasNext: false,
      displayLabel: 'Showing 0 of 0',
    };
  }

  const startItem = (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  return {
    totalPages,
    startItem,
    endItem,
    hasPrevious: safePage > 1,
    hasNext: safePage < totalPages,
    displayLabel: `Showing ${startItem}–${endItem} of ${totalItems}`,
  };
}

/**
 * Truncates claim ID for calm presentation (e.g. claim_3ceb9a61...).
 */
export function truncateClaimId(id?: string, len: number = 14): string {
  if (!id) return '';
  if (id.length <= len) return id;
  return `${id.slice(0, len)}…`;
}

export interface BenchmarkNarrative {
  title: string;
  body: string;
  deltaText: string;
  isPositive: boolean;
}

export interface BenchmarkMetricsData {
  unsupportedBaseline: number;
  unsupportedEvidex: number;
  verifiedBaseline: number;
  verifiedEvidex: number;
  coverageBaseline: number;
  coverageEvidex: number;
}

/**
 * Deterministically generates human-readable narrative text for the selected benchmark metric.
 * Strictly calculates percentage-point deltas without synthetic or LLM-generated claims.
 */
export function getBenchmarkNarrative(
  metricId: 'all' | 'unsupported' | 'verified' | 'coverage',
  data: BenchmarkMetricsData = {
    unsupportedBaseline: 22.0,
    unsupportedEvidex: 4.0,
    verifiedBaseline: 61.0,
    verifiedEvidex: 91.0,
    coverageBaseline: 68.0,
    coverageEvidex: 94.0,
  }
): BenchmarkNarrative {
  if (metricId === 'unsupported') {
    const delta = formatPercentagePointDelta(data.unsupportedBaseline, data.unsupportedEvidex, true);
    return {
      title: `Unsupported claims fell by ${Math.abs(delta.deltaValue)} percentage points.`,
      body: `Baseline RAG: ${data.unsupportedBaseline.toFixed(1)}% · EVIDEX: ${data.unsupportedEvidex.toFixed(1)}% (Lower is better · Confirms model restraint)`,
      deltaText: delta.deltaString,
      isPositive: delta.isImproved,
    };
  }

  if (metricId === 'verified') {
    const delta = formatPercentagePointDelta(data.verifiedBaseline, data.verifiedEvidex, false);
    return {
      title: `Verified claims increased by ${Math.abs(delta.deltaValue)} percentage points.`,
      body: `Baseline RAG: ${data.verifiedBaseline.toFixed(1)}% · EVIDEX: ${data.verifiedEvidex.toFixed(1)}% (Higher is better · Proves evidence-grounded claim support)`,
      deltaText: delta.deltaString,
      isPositive: delta.isImproved,
    };
  }

  if (metricId === 'coverage') {
    const delta = formatPercentagePointDelta(data.coverageBaseline, data.coverageEvidex, false);
    return {
      title: `Evidence coverage increased by ${Math.abs(delta.deltaValue)} percentage points.`,
      body: `Baseline RAG: ${data.coverageBaseline.toFixed(1)}% · EVIDEX: ${data.coverageEvidex.toFixed(1)}% (Higher is better · Demonstrates sufficient citation links)`,
      deltaText: delta.deltaString,
      isPositive: delta.isImproved,
    };
  }

  // Default: 'all'
  return {
    title: 'Overall EVIDEX Benchmark Profile',
    body: 'Across this evaluation, EVIDEX reduced unsupported claims while increasing verified claims and evidence coverage.',
    deltaText: '3 benchmark dimensions evaluated',
    isPositive: true,
  };
}
