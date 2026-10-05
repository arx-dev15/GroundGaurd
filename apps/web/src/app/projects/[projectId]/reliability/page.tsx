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
  ExternalLink,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import {
  getProjectClaims,
  getProjectGroundedGenerations,
  type ProjectClaimItem,
  type GroundedGenerationItem,
} from '@/lib/conversations-api';
import { StatusBadge } from '@/components/trust/status-badge';
import { ClaimStateStrip } from '@/components/trust/claim-state-strip';
import { AskInspector } from '@/components/ask/ask-inspector';
import { CLAIM_STATE_CONFIG } from '@/lib/trust-utils';
import { cn } from '@/lib/utils';
import type {
  ProjectMetricsResponse,
  Claim,
} from '@groundguard/types';

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

  // Metrics query
  const [metrics, setMetrics] = React.useState<ProjectMetricsResponse | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = React.useState(true);

  // Canonical Claims & Grounded Generations data
  const [allClaimItems, setAllClaimItems] = React.useState<ProjectClaimItem[]>([]);
  const [groundedGenerations, setGroundedGenerations] = React.useState<GroundedGenerationItem[]>([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = React.useState(true);

  // Review Queue filter state: 'attention' | 'recovered' | 'all'
  const [filterMode, setFilterMode] = React.useState<'attention' | 'recovered' | 'all'>('attention');

  // Currently selected claim for Inspector
  const [selectedClaimItem, setSelectedClaimItem] = React.useState<ProjectClaimItem | null>(null);

  // Collapsible diagnostics toggle
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);

  // 1. Fetch Metrics
  const fetchMetrics = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await apiClient.get<ProjectMetricsResponse>(`/v1/projects/${projectId}/metrics`);
      setMetrics(data);
    } catch {
      // Graceful fallback
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [projectId]);

  // 2. Fetch Canonical Project Claims and Grounded Generations
  const fetchWorkspaceData = React.useCallback(async () => {
    if (!projectId) return;
    setIsLoadingWorkspace(true);
    try {
      const [claims, generations] = await Promise.all([
        getProjectClaims(projectId),
        getProjectGroundedGenerations(projectId),
      ]);

      setAllClaimItems(claims);
      setGroundedGenerations(generations);

      // Auto-select first attention claim, or first recovered, or first claim if none
      const attention = claims.filter(
        (c) => c.status === 'flagged' || c.status === 'needs_review'
      );
      const recovered = claims.filter((c) => c.status === 'recovered');

      if (attention.length > 0) {
        setSelectedClaimItem(attention[0]);
      } else if (recovered.length > 0) {
        setSelectedClaimItem(recovered[0]);
      } else if (claims.length > 0) {
        setSelectedClaimItem(claims[0]);
      }
    } catch {
      // workspace fetch error
    } finally {
      setIsLoadingWorkspace(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    fetchMetrics();
    fetchWorkspaceData();
  }, [fetchMetrics, fetchWorkspaceData]);

  // Canonical groupings derived directly from claims
  const attentionClaimItems = React.useMemo(() => {
    return allClaimItems.filter(
      (c) => c.status === 'flagged' || c.status === 'needs_review'
    );
  }, [allClaimItems]);

  const recoveredClaimItems = React.useMemo(() => {
    return allClaimItems.filter((c) => c.status === 'recovered');
  }, [allClaimItems]);

  const verifiedClaimItems = React.useMemo(() => {
    return allClaimItems.filter((c) => c.status === 'verified');
  }, [allClaimItems]);

  // Items to display based on filter
  const visibleClaimItems = React.useMemo(() => {
    if (filterMode === 'attention') return attentionClaimItems;
    if (filterMode === 'recovered') return recoveredClaimItems;
    return allClaimItems;
  }, [filterMode, attentionClaimItems, recoveredClaimItems, allClaimItems]);

  // Keyboard navigation through visible queue
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown' && index < visibleClaimItems.length - 1) {
      e.preventDefault();
      setSelectedClaimItem(visibleClaimItems[index + 1]);
    } else if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      setSelectedClaimItem(visibleClaimItems[index - 1]);
    }
  };

  const scrollToWorkspace = () => {
    const el = document.getElementById('trust-workspace');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* ============================================================ */}
        {/* 1. TRUST HEADER (Clean orientation, no fake percentage)      */}
        {/* ============================================================ */}
        <div className="border-b border-border/60 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Reliability
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Review what EvideX AI verified, repaired, or could not support against authoritative project documents.
            </p>

            <div className="pt-2 flex items-center gap-3 text-xs font-mono flex-wrap">
              <span className="text-foreground font-semibold">
                {attentionClaimItems.length > 0
                  ? `${attentionClaimItems.length} ${attentionClaimItems.length === 1 ? 'claim needs' : 'claims need'} review`
                  : 'All recent claims verified'}
              </span>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {attentionClaimItems.length} need review
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {verifiedClaimItems.length} verified
              </span>
              <span className="inline-flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                {recoveredClaimItems.length} recovered
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="default"
              size="sm"
              onClick={scrollToWorkspace}
              className="gap-1.5 text-xs font-medium"
            >
              <span>Review claims</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 2. PRIMARY EXPERIENCE: TWO-PANE TRUST REVIEW WORKSPACE      */}
        {/* ============================================================ */}
        <section id="trust-workspace" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>Trust Review Workspace</span>
            </h2>
            <div className="text-[11px] font-mono text-muted-foreground">
              Click any claim to inspect evidence
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[580px] items-stretch">
            {/* ---------------------------------------------------------- */}
            {/* Left Pane (5 cols): REVIEW QUEUE                           */}
            {/* ---------------------------------------------------------- */}
            <div className="lg:col-span-5 flex flex-col rounded-xl border border-border/80 bg-card/40 overflow-hidden shadow-2xs">
              {/* Review Queue Header & Tabs */}
              <div className="p-3 border-b border-border/60 bg-muted/20 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-foreground uppercase font-mono tracking-wider">
                  Review Queue
                </div>

                <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/40 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setFilterMode('attention')}
                    className={cn(
                      'px-2 py-1 rounded-md transition-colors font-medium',
                      filterMode === 'attention'
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Needs attention ({attentionClaimItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('recovered')}
                    className={cn(
                      'px-2 py-1 rounded-md transition-colors font-medium',
                      filterMode === 'recovered'
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Recovered ({recoveredClaimItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={cn(
                      'px-2 py-1 rounded-md transition-colors font-medium',
                      filterMode === 'all'
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    All ({allClaimItems.length})
                  </button>
                </div>
              </div>

              {/* Review Queue Items List */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2 max-h-[620px] scrollbar-thin">
                {isLoadingWorkspace ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse space-y-2 p-3 rounded-lg border border-border/40 bg-muted/20">
                        <div className="h-3 bg-muted rounded w-1/3" />
                        <div className="h-4 bg-muted/60 rounded w-full" />
                        <div className="h-2 bg-muted/40 rounded w-2/3" />
                      </div>
                    ))}
                  </div>
                ) : visibleClaimItems.length === 0 ? (
                  <div className="p-8 text-center space-y-2 select-none">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto stroke-[1.5]" />
                    <h4 className="text-sm font-semibold text-foreground">
                      No claims need review.
                    </h4>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                      EvideX AI has no unresolved claims in the selected scope.
                    </p>
                    {allClaimItems.length > 0 && filterMode !== 'all' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFilterMode('all')}
                        className="h-7 text-xs mt-2"
                      >
                        Inspect all {allClaimItems.length} grounded claims
                      </Button>
                    )}
                  </div>
                ) : (
                  visibleClaimItems.map((claim, idx) => {
                    const isSelected = selectedClaimItem?.claimId === claim.claimId;
                    const primaryEv = claim.evidence?.[0];
                    const docName =
                      (primaryEv?.metadata?.filename as string) ||
                      (primaryEv?.metadata?.documentFilename as string) ||
                      'Project Document';
                    const pageNum = primaryEv?.pageNumber ?? (primaryEv?.metadata?.pageNumber as number | undefined);

                    return (
                      <div
                        key={claim.claimId}
                        onClick={() => setSelectedClaimItem(claim)}
                        onKeyDown={(e) => handleKeyDown(e, idx)}
                        className={cn(
                          'p-3 rounded-lg border transition-all cursor-pointer text-left space-y-2 group',
                          isSelected
                            ? 'border-primary bg-card/90 ring-1 ring-primary/20 shadow-xs'
                            : 'border-border/60 bg-card/30 hover:border-border hover:bg-card/60'
                        )}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                      >
                        {/* Top: Canonical Status + Relative time */}
                        <div className="flex items-center justify-between gap-2">
                          <StatusBadge status={claim.status} size="sm" />
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {formatRelativeTime(claim.createdAt)}
                          </span>
                        </div>

                        {/* Middle: Claim Text */}
                        <p className="text-xs font-normal text-foreground leading-relaxed line-clamp-2 font-sans select-text">
                          {claim.text}
                        </p>

                        {/* Bottom Metadata: Context + Source Document */}
                        <div className="pt-1 flex flex-col gap-1 text-[11px] text-muted-foreground border-t border-border/30">
                          <div className="truncate">
                            Asked in: <span className="text-foreground/90 font-medium">{claim.conversationTitle || 'Conversation'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate flex items-center gap-1 font-mono text-[10px]">
                              <FileText className="h-3 w-3 shrink-0" />
                              <span className="truncate">{docName}</span>
                              {pageNum !== undefined && <span>· p. {pageNum}</span>}
                            </span>

                            {claim.conversationId && (
                              <Link
                                href={`/projects/${projectId}/ask?c=${claim.conversationId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[10px] font-mono text-primary hover:underline flex items-center gap-0.5 shrink-0"
                              >
                                <span>Open</span>
                                <ChevronRight className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ---------------------------------------------------------- */}
            {/* Right Pane (7 cols): INLINE CLAIM INSPECTOR                */}
            {/* ---------------------------------------------------------- */}
            <div className="lg:col-span-7 flex flex-col min-h-[500px]">
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
                onClaimUpdated={(updatedClaim) => {
                  setSelectedClaimItem((prev) =>
                    prev ? { ...prev, ...updatedClaim } : null
                  );
                  setAllClaimItems((prev) =>
                    prev.map((it) =>
                      it.claimId === updatedClaim.claimId
                        ? { ...it, ...updatedClaim }
                        : it
                    )
                  );
                }}
              />
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 3. ANSWER-LEVEL TRUST RECORDS (Grounded Generations Only)   */}
        {/* ============================================================ */}
        <section className="space-y-4 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                Recent Grounded Answers
              </h2>
              <p className="text-xs text-muted-foreground">
                Grounded answers with verified claim state distributions. Non-factual and greeting turns are excluded.
              </p>
            </div>
            <Link
              href={`/projects/${projectId}/ask`}
              className="text-xs font-mono text-primary hover:underline inline-flex items-center gap-1"
            >
              <span>Ask a question</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {isLoadingWorkspace ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="p-4 rounded-xl border border-border/50 bg-card/30 animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted/60 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : groundedGenerations.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed border-border/70 bg-card/20 space-y-2">
              <Clock className="h-6 w-6 text-muted-foreground mx-auto" />
              <p className="text-xs text-muted-foreground">No grounded answers recorded yet.</p>
              <Link
                href={`/projects/${projectId}/ask`}
                className="text-xs text-primary hover:underline font-medium inline-block pt-1"
              >
                Go to Ask tab to start research →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groundedGenerations.map((record) => {
                const statuses = [
                  ...Array(record.claimCounts.verified).fill('verified' as const),
                  ...Array(record.claimCounts.recovered).fill('recovered' as const),
                  ...Array(record.claimCounts.needsReview).fill('needs_review' as const),
                  ...Array(record.claimCounts.flagged).fill('flagged' as const),
                ];

                return (
                  <div
                    key={record.generationId}
                    className="p-4 rounded-xl border border-border/70 bg-card/40 hover:bg-card/70 transition-all space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <h3 className="text-sm font-semibold text-foreground line-clamp-1 font-sans">
                            {record.conversationTitle || 'Untitled conversation'}
                          </h3>
                          <p className="text-xs text-muted-foreground line-clamp-1 italic font-sans">
                            &ldquo;{record.query}&rdquo;
                          </p>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {formatRelativeTime(record.createdAt)}
                        </span>
                      </div>

                      {/* Signature EvideX AI Claim State Strip */}
                      <ClaimStateStrip statuses={statuses} showCounts={true} size="default" />
                    </div>

                    <div className="pt-2 border-t border-border/30 flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span className="truncate pr-2">
                        {record.sources.length > 0
                          ? `Sources: ${record.sources.slice(0, 2).join(' · ')}${record.sources.length > 2 ? ` +${record.sources.length - 2}` : ''}`
                          : 'No sources'}
                      </span>

                      {record.conversationId && (
                        <Link
                          href={`/projects/${projectId}/ask?c=${record.conversationId}`}
                          className="text-primary hover:underline font-semibold flex items-center gap-1 shrink-0"
                        >
                          <span>Open</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>



        {/* ============================================================ */}
        {/* 5. SECONDARY DIAGNOSTICS (Collapsed by default)             */}
        {/* ============================================================ */}
        <section className="pt-4 border-t border-border/50">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors group select-none"
          >
            {showDiagnostics ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <span className="font-semibold uppercase tracking-wider">
              Operational diagnostics
            </span>
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              ({showDiagnostics ? 'hide telemetry' : 'expand telemetry'})
            </span>
          </button>

          {showDiagnostics && (
            <div className="mt-4 p-4 rounded-xl border border-border/60 bg-muted/15 space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-3 rounded-lg border border-border/50 bg-background/60 space-y-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Grounding Pass Rate</span>
                  <div className="text-base font-mono font-bold text-foreground">
                    {metrics?.groundingPassRate !== undefined && metrics.totalClaims > 0
                      ? `${(metrics.groundingPassRate * 100).toFixed(1)}%`
                      : '—'}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-border/50 bg-background/60 space-y-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Contradiction Rate</span>
                  <div className="text-base font-mono font-bold text-foreground">
                    {metrics?.contradictionRate !== undefined && metrics.totalClaims > 0
                      ? `${(metrics.contradictionRate * 100).toFixed(1)}%`
                      : '—'}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-border/50 bg-background/60 space-y-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Recovery Rate</span>
                  <div className="text-base font-mono font-bold text-foreground">
                    {metrics?.recoverySuccessRate !== undefined && metrics.flaggedClaims > 0
                      ? `${(metrics.recoverySuccessRate * 100).toFixed(1)}%`
                      : '—'}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-border/50 bg-background/60 space-y-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Average Latency</span>
                  <div className="text-base font-mono font-bold text-foreground">
                    {metrics?.averageLatencyMs ? `${Math.round(metrics.averageLatencyMs)}ms` : '—'}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-border/50 bg-background/60 space-y-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Verifier Model</span>
                  <div className="text-xs font-mono font-medium text-foreground truncate" title="groundguard-deberta-v1-finetuned">
                    DeBERTa-v1
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-border/50 bg-background/60 space-y-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Generations</span>
                  <div className="text-base font-mono font-bold text-foreground">
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
