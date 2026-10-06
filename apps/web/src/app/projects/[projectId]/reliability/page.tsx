'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  HelpCircle,
  Clock,
  ArrowRight,
  FileText,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Activity,
  Layers,
  Info,
  Play,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import {
  getProjectClaimsPaginated,
  getProjectEvaluations,
  type ProjectClaimItem,
  type Evaluation,
} from '@/lib/conversations-api';
import { StatusBadge } from '@/components/trust/status-badge';
import { EvidexPerformanceGraph } from '@/components/trust/evidex-performance-graph';
import { AskInspector } from '@/components/ask/ask-inspector';
import { cn } from '@/lib/utils';
import type { ProjectMetricsResponse } from '@groundguard/types';

import {
  calculateOverviewPercentages,
  calculatePaginationBounds,
  calculateDistributionWidths,
  truncateClaimId,
} from '@/lib/reliability-helpers';

const PAGE_SIZE = 6;

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ReliabilityPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = (params?.projectId as string) || '';

  // 1. Project Canonical Metrics
  const [metrics, setMetrics] = React.useState<ProjectMetricsResponse | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = React.useState(true);

  // 2. Review Queue Paginated State (Default 5 claims per page)
  const [queueClaims, setQueueClaims] = React.useState<ProjectClaimItem[]>([]);
  const [totalQueueClaims, setTotalQueueClaims] = React.useState(0);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [isLoadingQueue, setIsLoadingQueue] = React.useState(true);

  // Filter mode: 'attention' (needs_review + flagged) | 'recovered' | 'verified' | 'all'
  const [filterMode, setFilterMode] = React.useState<'attention' | 'recovered' | 'verified' | 'all'>('attention');

  // Currently selected claim for Inspector
  const [selectedClaimItem, setSelectedClaimItem] = React.useState<ProjectClaimItem | null>(null);

  // 3. Evaluation Benchmark Runs
  const [evaluations, setEvaluations] = React.useState<Evaluation[]>([]);
  const [isLoadingEvaluations, setIsLoadingEvaluations] = React.useState(true);
  const [isStartingEvaluation, setIsStartingEvaluation] = React.useState(false);

  // Collapsible diagnostics toggle (collapsed by default)
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);

  // Live metrics update timestamp
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  // Derive filter status query array
  const filterStatusParam = React.useMemo(() => {
    switch (filterMode) {
      case 'attention':
        return ['needs_review', 'flagged'];
      case 'recovered':
        return ['recovered'];
      case 'verified':
        return ['verified'];
      case 'all':
      default:
        return undefined;
    }
  }, [filterMode]);

  // Fetch Project Metrics
  const fetchMetrics = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await apiClient.get<ProjectMetricsResponse>(`/v1/projects/${projectId}/metrics`);
      setMetrics(data);
      setLastUpdated(new Date());
    } catch {
      // Graceful fallback
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [projectId]);

  // Fetch Evaluations
  const fetchEvaluations = React.useCallback(async () => {
    if (!projectId) return;
    setIsLoadingEvaluations(true);
    try {
      const data = await getProjectEvaluations(projectId);
      setEvaluations(data);
    } catch {
      // Graceful fallback
    } finally {
      setIsLoadingEvaluations(false);
    }
  }, [projectId]);

  // Fetch Paginated Queue Claims
  const fetchQueueClaims = React.useCallback(
    async (pageToLoad: number, activeFilter: string[] | undefined) => {
      if (!projectId) return;
      setIsLoadingQueue(true);
      try {
        const offset = (pageToLoad - 1) * PAGE_SIZE;
        const res = await getProjectClaimsPaginated(projectId, {
          limit: PAGE_SIZE,
          offset,
          status: activeFilter,
        });

        // Defensive guard: Strictly guarantee at most PAGE_SIZE (5) items are displayed per page
        const pageItems =
          res.claims.length > PAGE_SIZE ? res.claims.slice(0, PAGE_SIZE) : res.claims;

        setQueueClaims(pageItems);
        setTotalQueueClaims(res.total);

        // Auto-select first claim if no claim is selected or current selection is not on this page
        if (pageItems.length > 0) {
          setSelectedClaimItem((prev) => {
            const existsOnPage = prev && pageItems.some((c) => c.claimId === prev.claimId);
            return existsOnPage ? prev : pageItems[0];
          });
        } else {
          setSelectedClaimItem(null);
        }
      } catch {
        setQueueClaims([]);
        setTotalQueueClaims(0);
      } finally {
        setIsLoadingQueue(false);
      }
    },
    [projectId]
  );

  // Initial load
  React.useEffect(() => {
    fetchMetrics();
    fetchEvaluations();
  }, [fetchMetrics, fetchEvaluations]);

  // When filter or page changes, fetch queue
  React.useEffect(() => {
    fetchQueueClaims(currentPage, filterStatusParam);
  }, [fetchQueueClaims, currentPage, filterStatusParam]);

  // Filter change resets to page 1
  const handleFilterChange = (newMode: 'attention' | 'recovered' | 'verified' | 'all') => {
    setFilterMode(newMode);
    setCurrentPage(1);
  };

  // Keyboard navigation through current 5 queue items
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown' && index < queueClaims.length - 1) {
      e.preventDefault();
      setSelectedClaimItem(queueClaims[index + 1]);
    } else if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      setSelectedClaimItem(queueClaims[index - 1]);
    }
  };

  // Trigger evaluation benchmark run
  const handleRunEvaluation = async () => {
    if (!projectId || isStartingEvaluation) return;
    setIsStartingEvaluation(true);
    try {
      await apiClient.post(`/v1/projects/${projectId}/evaluations`, {
        name: `Golden Benchmark Run #${evaluations.length + 1}`,
        dataset: 'golden-benchmark-v1',
      });
      await fetchEvaluations();
      await fetchMetrics();
    } catch {
      // Graceful error handling
    } finally {
      setIsStartingEvaluation(false);
    }
  };

  // Handle claim updated from Inspector
  const handleClaimUpdated = (updatedClaim: ProjectClaimItem) => {
    setSelectedClaimItem(updatedClaim);
    setQueueClaims((prev) =>
      prev.map((item) => (item.claimId === updatedClaim.claimId ? { ...item, ...updatedClaim } : item))
    );
    // Refresh project metrics so 4 cards & distribution bar update in real time
    fetchMetrics();
  };

  // Derived canonical overview metrics
  const totalClaims = metrics?.totalClaims ?? 0;
  const verifiedClaims = metrics?.verifiedClaims ?? 0;
  const needsAttentionClaims = metrics?.flaggedClaims ?? 0; // count(needs_review) + count(flagged)
  const recoveredClaims = metrics?.recoveredClaims ?? 0;
  const pendingClaims = Math.max(0, totalClaims - (verifiedClaims + needsAttentionClaims + recoveredClaims));

  const { verifiedPct, needsAttentionPct, recoveredPct, pendingPct } = calculateOverviewPercentages({
    totalClaims,
    verifiedClaims,
    needsAttentionClaims,
    recoveredClaims,
    pendingClaims,
  });

  const { totalPages, displayLabel } = calculatePaginationBounds(
    currentPage,
    PAGE_SIZE,
    totalQueueClaims
  );

  // Latest completed evaluation for impact comparison
  const latestEvaluation = React.useMemo(() => {
    return evaluations.find((e) => e.status === 'completed') || evaluations[0] || null;
  }, [evaluations]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* ============================================================ */}
        {/* 1. TOP HEADER (CLEAN & MINIMAL)                              */}
        {/* ============================================================ */}
        <header className="pb-6 border-b border-border/50 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Reliability
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Review what EVIDEX verified, repaired, or could not support.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
            <span>
              {lastUpdated
                ? (() => {
                    const diffSecs = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
                    if (diffSecs < 60) return 'Updated just now';
                    const mins = Math.floor(diffSecs / 60);
                    return `Updated ${mins}m ago`;
                  })()
                : 'Updated just now'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                fetchMetrics();
                fetchQueueClaims(currentPage, filterStatusParam);
                fetchEvaluations();
              }}
              className="h-7 px-2.5 text-xs text-foreground hover:bg-muted/50 gap-1.5"
              title="Refresh project reliability data"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoadingMetrics && 'animate-spin')} />
              <span>Refresh</span>
            </Button>
          </div>
        </header>

        {/* ============================================================ */}
        {/* 2. RELIABILITY OVERVIEW (FLATTENED METRIC STRIP)             */}
        {/* ============================================================ */}
        <section aria-label="Reliability overview">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 divide-y sm:divide-y-0 sm:divide-x divide-border/40">
            {/* Verified */}
            <div className="space-y-1 sm:pr-4">
              <div className="text-xs text-muted-foreground font-medium">
                Verified
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                  {isLoadingMetrics ? '—' : verifiedClaims}
                </span>
                {totalClaims > 0 && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    {verifiedPct}%
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/80 leading-normal">
                Supported by project evidence
              </p>
            </div>

            {/* Needs Attention */}
            <div className="space-y-1 pt-4 sm:pt-0 sm:px-4">
              <div className="text-xs text-muted-foreground font-medium">
                Needs attention
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                  {isLoadingMetrics ? '—' : needsAttentionClaims}
                </span>
                {totalClaims > 0 && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    {needsAttentionPct}%
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/80 leading-normal">
                Requires review or unresolved verification
              </p>
            </div>

            {/* Recovered */}
            <div className="space-y-1 pt-4 sm:pt-0 sm:px-4">
              <div className="text-xs text-muted-foreground font-medium">
                Recovered
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                  {isLoadingMetrics ? '—' : recoveredClaims}
                </span>
                {totalClaims > 0 && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    {recoveredPct}%
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/80 leading-normal">
                Repaired and successfully reverified
              </p>
            </div>

            {/* Total Claims */}
            <div className="space-y-1 pt-4 sm:pt-0 sm:pl-4">
              <div className="text-xs text-muted-foreground font-medium">
                Total claims
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                  {isLoadingMetrics ? '—' : totalClaims}
                </span>
                {pendingClaims > 0 && (
                  <span className="text-xs text-muted-foreground font-medium" title={`${pendingClaims} claims pending initial verification`}>
                    ({pendingClaims} pending)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/80 leading-normal">
                Canonical factual claims evaluated
              </p>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 3. SIGNATURE SECTION — EVIDEX PERFORMANCE (BENCHMARK)        */}
        {/* ============================================================ */}
        <EvidexPerformanceGraph
          evaluations={evaluations}
          latestEvaluation={latestEvaluation}
          isStartingEvaluation={isStartingEvaluation}
          onRunEvaluation={handleRunEvaluation}
        />

        {/* ============================================================ */}
        {/* 4. CLAIM HEALTH (STACKED DISTRIBUTION BAR)                   */}
        {/* ============================================================ */}
        <section aria-label="Claim health" className="space-y-2 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">
              Claim health
            </span>
            <span className="text-muted-foreground">
              {totalClaims} claims total
            </span>
          </div>

          {totalClaims === 0 ? (
            <div className="w-full h-2 rounded-full bg-muted/40" />
          ) : (
            <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden flex" role="progressbar" aria-label="Claim health">
              {verifiedClaims > 0 && (
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${(verifiedClaims / totalClaims) * 100}%` }}
                  title={`Verified: ${verifiedClaims} (${verifiedPct}%)`}
                />
              )}
              {recoveredClaims > 0 && (
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${(recoveredClaims / totalClaims) * 100}%` }}
                  title={`Recovered: ${recoveredClaims} (${recoveredPct}%)`}
                />
              )}
              {needsAttentionClaims > 0 && (
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${(needsAttentionClaims / totalClaims) * 100}%` }}
                  title={`Needs attention: ${needsAttentionClaims} (${needsAttentionPct}%)`}
                />
              )}
              {pendingClaims > 0 && (
                <div
                  className="h-full bg-slate-400 dark:bg-slate-500 transition-all"
                  style={{ width: `${(pendingClaims / totalClaims) * 100}%` }}
                  title={`Pending: ${pendingClaims} (${pendingPct}%)`}
                />
              )}
            </div>
          )}

          {/* Compact Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground pt-0.5">
            <div className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-foreground font-medium">Verified:</span>
              <span>{verifiedClaims} ({verifiedPct}%)</span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <span className="text-foreground font-medium">Recovered:</span>
              <span>{recoveredClaims} ({recoveredPct}%)</span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-foreground font-medium">Needs attention:</span>
              <span>{needsAttentionClaims} ({needsAttentionPct}%)</span>
            </div>
            {pendingClaims > 0 && (
              <div className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                <span className="text-foreground font-medium">Pending:</span>
                <span>{pendingClaims} ({pendingPct}%)</span>
              </div>
            )}
          </div>
        </section>

        {/* ============================================================ */}
        {/* 5. REVIEW CLAIMS (CALM TWO-PANE WORKSPACE)                   */}
        {/* ============================================================ */}
        <section aria-label="Review claims" className="space-y-4 pt-6 border-t border-border/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Review claims
            </h2>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 text-xs flex-wrap">
              <button
                type="button"
                onClick={() => handleFilterChange('attention')}
                className={cn(
                  'px-2.5 py-1 rounded-md transition-colors',
                  filterMode === 'attention'
                    ? 'bg-muted text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Needs attention ({needsAttentionClaims})
              </button>
              <button
                type="button"
                onClick={() => handleFilterChange('recovered')}
                className={cn(
                  'px-2.5 py-1 rounded-md transition-colors',
                  filterMode === 'recovered'
                    ? 'bg-muted text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Recovered ({recoveredClaims})
              </button>
              <button
                type="button"
                onClick={() => handleFilterChange('verified')}
                className={cn(
                  'px-2.5 py-1 rounded-md transition-colors',
                  filterMode === 'verified'
                    ? 'bg-muted text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Verified ({verifiedClaims})
              </button>
              <button
                type="button"
                onClick={() => handleFilterChange('all')}
                className={cn(
                  'px-2.5 py-1 rounded-md transition-colors',
                  filterMode === 'all'
                    ? 'bg-muted text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                All ({totalClaims})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ---------------------------------------------------------- */}
            {/* Left Pane (~38% / 5 cols): Flat Queue Rows (6 per page)    */}
            {/* ---------------------------------------------------------- */}
            <div className="lg:col-span-5 rounded-xl border border-border/60 bg-card/25 overflow-hidden">
              {/* Queue Items List: Flat rows with 1px border-b dividers, natural height */}
              <div className="divide-y divide-border/40">
                {isLoadingQueue ? (
                  <div className="p-4 space-y-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="animate-pulse space-y-2">
                        <div className="h-3 bg-muted rounded w-1/3" />
                        <div className="h-3 bg-muted/60 rounded w-full" />
                        <div className="h-2 bg-muted/40 rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : queueClaims.length === 0 ? (
                  <div className="p-8 text-center space-y-2 select-none my-auto">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto stroke-[1.5]" />
                    <h4 className="text-sm font-medium text-foreground">
                      Nothing currently needs review
                    </h4>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                      EVIDEX has no unresolved claims matching this filter.
                    </p>
                    {filterMode !== 'all' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFilterChange('all')}
                        className="h-7 text-xs mt-2"
                      >
                        Inspect all {totalClaims} claims
                      </Button>
                    )}
                  </div>
                ) : (
                  queueClaims.map((claim, idx) => {
                    const isSelected = selectedClaimItem?.claimId === claim.claimId;
                    const primaryEv = claim.evidence?.[0];
                    const docName =
                      (primaryEv?.metadata?.filename as string) ||
                      (primaryEv?.metadata?.documentFilename as string) ||
                      'Project Document';
                    const pageNum = primaryEv?.pageNumber ?? (primaryEv?.metadata?.pageNumber as number | undefined);
                    const evidenceCount = claim.evidence?.length ?? 0;

                    return (
                      <div
                        key={claim.claimId}
                        onClick={() => setSelectedClaimItem(claim)}
                        onKeyDown={(e) => handleKeyDown(e, idx)}
                        className={cn(
                          'p-4 transition-colors cursor-pointer text-left space-y-1.5 select-none relative',
                          isSelected
                            ? 'bg-muted/40 border-l-2 border-primary pl-[14px]'
                            : 'hover:bg-muted/20 border-l-2 border-transparent'
                        )}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                      >
                        {/* Top: Status badge + Claim ID + Relative Time */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <StatusBadge status={claim.status} size="sm" />
                            <span
                              className="text-[11px] font-mono text-muted-foreground/70 truncate"
                              title={claim.claimId}
                            >
                              {truncateClaimId(claim.claimId)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0 font-sans">
                            {formatRelativeTime(claim.createdAt)}
                          </span>
                        </div>

                        {/* Middle: Claim Text (Clamped to 2 lines) */}
                        <p className="text-xs font-normal text-foreground leading-relaxed line-clamp-2 select-text font-sans">
                          {claim.text}
                        </p>

                        {/* Bottom Metadata: Document + Evidence Count */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground/80 font-sans pt-0.5">
                          <span className="truncate">
                            {docName} {pageNum !== undefined && `· p. ${pageNum}`}
                          </span>
                          {evidenceCount > 0 && (
                            <span className="shrink-0 text-[11px]">
                              {evidenceCount} {evidenceCount === 1 ? 'passage' : 'passages'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Stable Desktop Pagination Bar: Directly under row 5 */}
              <div className="p-3 border-t border-border/50 flex items-center justify-between text-xs font-sans text-muted-foreground bg-muted/10">
                <span>{displayLabel}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1 || isLoadingQueue}
                    className="h-7 px-2 text-xs font-sans"
                  >
                    <ChevronLeft className="h-3 w-3 mr-1" />
                    Previous
                  </Button>
                  <span className="text-foreground font-medium px-1">
                    {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages || isLoadingQueue}
                    className="h-7 px-2 text-xs font-sans"
                  >
                    Next
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>

            {/* ---------------------------------------------------------- */}
            {/* Right Pane (~62% / 7 cols): SELECTED CLAIM INSPECTOR       */}
            {/* ---------------------------------------------------------- */}
            <div className="lg:col-span-7 rounded-xl border border-border/60 bg-card/25 overflow-hidden min-w-0 max-w-full">
              <AskInspector
                claim={selectedClaimItem}
                selectedEvidence={selectedClaimItem?.evidence?.[0] || null}
                projectId={projectId}
                generationId={selectedClaimItem?.generationId}
                isOpen={true}
                variant="inline"
                contextTitle={selectedClaimItem?.conversationTitle}
                onOpenAnswer={() => {
                  if (selectedClaimItem?.conversationId) {
                    router.push(`/projects/${projectId}/ask?c=${selectedClaimItem.conversationId}`);
                  }
                }}
                onClaimUpdated={handleClaimUpdated}
              />
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 6. ADVANCED DIAGNOSTICS (COLLAPSIBLE)                        */}
        {/* ============================================================ */}
        <section aria-label="Advanced diagnostics" className="pt-4 border-t border-border/50">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group select-none font-sans"
            aria-expanded={showDiagnostics}
          >
            {showDiagnostics ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <span className="font-semibold">
              Advanced diagnostics
            </span>
            <span className="text-[11px] text-muted-foreground/60">
              ({showDiagnostics ? 'collapse' : 'expand'})
            </span>
          </button>

          {showDiagnostics && (
            <div className="mt-4 p-4 rounded-xl border border-border/50 bg-muted/15 space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {/* Grounding Pass Rate */}
                <div className="p-3 rounded-lg border border-border/40 bg-background/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Grounding rate</span>
                    <span title="Share of generated factual claims supported by project evidence.">
                      <Info className="h-3 w-3 text-muted-foreground/60" />
                    </span>
                  </div>
                  <div className="text-base font-semibold text-foreground font-sans">
                    {metrics?.groundingPassRate !== undefined && totalClaims > 0
                      ? `${(metrics.groundingPassRate * 100).toFixed(1)}%`
                      : '—'}
                  </div>
                </div>

                {/* Contradiction Rate */}
                <div className="p-3 rounded-lg border border-border/40 bg-background/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Contradiction rate</span>
                    <span title="Share of claims conflicting with authoritative project sources.">
                      <Info className="h-3 w-3 text-muted-foreground/60" />
                    </span>
                  </div>
                  <div className="text-base font-semibold text-foreground font-sans">
                    {metrics?.contradictionRate !== undefined && totalClaims > 0
                      ? `${(metrics.contradictionRate * 100).toFixed(1)}%`
                      : '—'}
                  </div>
                </div>

                {/* Recovery Success Rate */}
                <div className="p-3 rounded-lg border border-border/40 bg-background/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Recovery rate</span>
                    <span title="Share of eligible failed claims successfully revised and reverified.">
                      <Info className="h-3 w-3 text-muted-foreground/60" />
                    </span>
                  </div>
                  <div className="text-base font-semibold text-foreground font-sans">
                    {metrics?.recoverySuccessRate !== undefined && (needsAttentionClaims + recoveredClaims) > 0
                      ? `${(metrics.recoverySuccessRate * 100).toFixed(1)}%`
                      : '—'}
                  </div>
                </div>

                {/* Average Latency */}
                <div className="p-3 rounded-lg border border-border/40 bg-background/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Average latency</span>
                    <span title="Mean end-to-end verification and generation latency.">
                      <Info className="h-3 w-3 text-muted-foreground/60" />
                    </span>
                  </div>
                  <div className="text-base font-semibold text-foreground font-sans">
                    {metrics?.averageLatencyMs ? `${Math.round(metrics.averageLatencyMs)}ms` : '—'}
                  </div>
                </div>

                {/* Verifier Model */}
                <div className="p-3 rounded-lg border border-border/40 bg-background/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Verifier model</span>
                    <span title="Domain-adapted cross-encoder with calibrated temperature scaling.">
                      <Info className="h-3 w-3 text-muted-foreground/60" />
                    </span>
                  </div>
                  <div className="text-xs font-mono font-medium text-foreground truncate" title="groundguard-deberta-v1-finetuned">
                    deberta-v1
                  </div>
                </div>

                {/* Recovery Orchestration */}
                <div className="p-3 rounded-lg border border-border/40 bg-background/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Recovery engine</span>
                    <span title="Orchestration graph managing claim revision and reverification loops.">
                      <Info className="h-3 w-3 text-muted-foreground/60" />
                    </span>
                  </div>
                  <div className="text-xs font-mono font-medium text-foreground truncate" title="LangGraph selective recovery">
                    LangGraph
                  </div>
                </div>

                {/* Attempt Limit */}
                <div className="p-3 rounded-lg border border-border/40 bg-background/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Attempt limit</span>
                    <span title="Maximum automated recovery attempts per claim before escalation to review.">
                      <Info className="h-3 w-3 text-muted-foreground/60" />
                    </span>
                  </div>
                  <div className="text-base font-semibold text-foreground font-sans">
                    2
                  </div>
                </div>

                {/* Total Generations */}
                <div className="p-3 rounded-lg border border-border/40 bg-background/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Generations</span>
                    <span title="Total grounded generational answers completed.">
                      <Info className="h-3 w-3 text-muted-foreground/60" />
                    </span>
                  </div>
                  <div className="text-base font-semibold text-foreground font-sans">
                    {metrics?.totalGenerations ?? 0}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
