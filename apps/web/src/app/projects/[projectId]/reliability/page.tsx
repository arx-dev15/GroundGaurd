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
  listConversations,
  listMessages,
  getGenerationClaims,
  getClaimRecoveryAttempts,
} from '@/lib/conversations-api';
import { StatusBadge } from '@/components/trust/status-badge';
import { ClaimStateStrip } from '@/components/trust/claim-state-strip';
import { AskInspector } from '@/components/ask/ask-inspector';
import { CLAIM_STATE_CONFIG } from '@/lib/trust-utils';
import { cn } from '@/lib/utils';
import type {
  ProjectMetricsResponse,
  Conversation,
  Message,
  Claim,
  RecoveryAttempt,
} from '@groundguard/types';

interface HydratedClaimItem {
  claim: Claim;
  conversationId: string;
  conversationTitle: string;
  generationId: string;
  createdAt?: string;
  siblingClaims: Claim[];
}

interface AnswerTrustRecord {
  conversation: Conversation;
  generationId?: string;
  claims: Claim[];
  sources: string[];
  createdAt?: string;
}

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

  // Conversations & Claims data
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [allClaimItems, setAllClaimItems] = React.useState<HydratedClaimItem[]>([]);
  const [answerRecords, setAnswerRecords] = React.useState<AnswerTrustRecord[]>([]);
  const [recoveredClaimItems, setRecoveredClaimItems] = React.useState<HydratedClaimItem[]>([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = React.useState(true);

  // Review Queue filter state: 'attention' | 'all'
  const [filterMode, setFilterMode] = React.useState<'attention' | 'all'>('attention');

  // Currently selected claim for Inspector
  const [selectedClaimItem, setSelectedClaimItem] = React.useState<HydratedClaimItem | null>(null);

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

  // 2. Fetch Conversations, Messages, and Claims
  const fetchWorkspaceData = React.useCallback(async () => {
    if (!projectId) return;
    setIsLoadingWorkspace(true);
    try {
      const convList = await listConversations(projectId);
      setConversations(convList);

      // Hydrate recent conversations (bounded to max 6)
      const recentConvs = convList.slice(0, 6);
      const items: HydratedClaimItem[] = [];
      const records: AnswerTrustRecord[] = [];

      for (const conv of recentConvs) {
        try {
          const msgs = await listMessages(projectId, conv.id);
          const assistantMsg = [...msgs].reverse().find((m) => m.role === 'assistant' && m.generationId);
          if (assistantMsg && assistantMsg.generationId) {
            const claims = await getGenerationClaims(assistantMsg.generationId);

            // Collect unique source documents
            const uniqueSources = new Set<string>();
            for (const c of claims) {
              for (const ev of c.evidence || []) {
                const src =
                  (ev.metadata?.filename as string) ||
                  (ev.metadata?.documentFilename as string) ||
                  ev.documentId;
                if (src) uniqueSources.add(src);
              }
            }

            records.push({
              conversation: conv,
              generationId: assistantMsg.generationId,
              claims,
              sources: Array.from(uniqueSources),
              createdAt: assistantMsg.createdAt,
            });

            for (const c of claims) {
              items.push({
                claim: c,
                conversationId: conv.id,
                conversationTitle: conv.title || 'Untitled conversation',
                generationId: assistantMsg.generationId,
                createdAt: assistantMsg.createdAt,
                siblingClaims: claims,
              });
            }
          }
        } catch {
          // ignore single conversation fetch failure
        }
      }

      setAllClaimItems(items);
      setAnswerRecords(records);

      const recovered = items.filter((item) => item.claim.status === 'recovered');
      setRecoveredClaimItems(recovered);

      // Auto-select first attention claim, or first claim if none
      const attention = items.filter(
        (item) => item.claim.status === 'flagged' || item.claim.status === 'needs_review'
      );
      if (attention.length > 0) {
        setSelectedClaimItem(attention[0]);
      } else if (items.length > 0) {
        setSelectedClaimItem(items[0]);
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

  // Attention claims: flagged (contradicted) or needs_review
  const attentionClaimItems = React.useMemo(() => {
    return allClaimItems.filter(
      (item) => item.claim.status === 'flagged' || item.claim.status === 'needs_review'
    );
  }, [allClaimItems]);

  const verifiedClaimItems = React.useMemo(() => {
    return allClaimItems.filter((item) => item.claim.status === 'verified');
  }, [allClaimItems]);

  // Items to display based on filter
  const visibleClaimItems = filterMode === 'attention' ? attentionClaimItems : allClaimItems;

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
              Review what GroundGuard verified, repaired, or could not support against authoritative project documents.
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
                      No claims require attention
                    </h4>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                      All verified factual statements are supported by project documents.
                    </p>
                    {allClaimItems.length > 0 && filterMode === 'attention' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFilterMode('all')}
                        className="h-7 text-xs mt-2"
                      >
                        Inspect all verified claims
                      </Button>
                    )}
                  </div>
                ) : (
                  visibleClaimItems.map((item) => {
                    const isSelected = selectedClaimItem?.claim.claimId === item.claim.claimId;
                    const claim = item.claim;
                    const primaryEv = claim.evidence?.[0];
                    const docName =
                      (primaryEv?.metadata?.filename as string) ||
                      (primaryEv?.metadata?.documentFilename as string) ||
                      'Project Document';
                    const pageNum = primaryEv?.pageNumber ?? (primaryEv?.metadata?.pageNumber as number | undefined);

                    return (
                      <div
                        key={claim.claimId}
                        onClick={() => setSelectedClaimItem(item)}
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
                            {formatRelativeTime(item.createdAt)}
                          </span>
                        </div>

                        {/* Middle: Claim Text */}
                        <p className="text-xs font-normal text-foreground leading-relaxed line-clamp-2 font-sans select-text">
                          {claim.text}
                        </p>

                        {/* Bottom Metadata: Context + Source Document */}
                        <div className="pt-1 flex flex-col gap-1 text-[11px] text-muted-foreground border-t border-border/30">
                          <div className="truncate">
                            Asked in: <span className="text-foreground/90 font-medium">{item.conversationTitle}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate flex items-center gap-1 font-mono text-[10px]">
                              <FileText className="h-3 w-3 shrink-0" />
                              <span className="truncate">{docName}</span>
                              {pageNum !== undefined && <span>· p. {pageNum}</span>}
                            </span>

                            <Link
                              href={`/projects/${projectId}/ask?c=${item.conversationId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] font-mono text-primary hover:underline flex items-center gap-0.5 shrink-0"
                            >
                              <span>Open</span>
                              <ChevronRight className="h-3 w-3" />
                            </Link>
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
                claim={selectedClaimItem ? selectedClaimItem.claim : null}
                selectedEvidence={selectedClaimItem?.claim.evidence?.[0] || null}
                projectId={projectId}
                generationId={selectedClaimItem?.generationId}
                isOpen={true}
                variant="inline"
                contextTitle={selectedClaimItem?.conversationTitle}
                onOpenAnswer={() => {
                  if (selectedClaimItem) {
                    router.push(`/projects/${projectId}/ask?c=${selectedClaimItem.conversationId}`);
                  }
                }}
                onClaimUpdated={(updatedClaim) => {
                  setSelectedClaimItem((prev) =>
                    prev ? { ...prev, claim: updatedClaim } : null
                  );
                  setAllClaimItems((prev) =>
                    prev.map((it) =>
                      it.claim.claimId === updatedClaim.claimId
                        ? { ...it, claim: updatedClaim }
                        : it
                    )
                  );
                }}
              />
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 3. ANSWER-LEVEL TRUST RECORDS (With ClaimStateStrip)        */}
        {/* ============================================================ */}
        <section className="space-y-4 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                Recent Answers
              </h2>
              <p className="text-xs text-muted-foreground">
                Audited answers with verified claim state distributions.
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
          ) : answerRecords.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed border-border/70 bg-card/20 space-y-2">
              <Clock className="h-6 w-6 text-muted-foreground mx-auto" />
              <p className="text-xs text-muted-foreground">No recent answers recorded yet.</p>
              <Link
                href={`/projects/${projectId}/ask`}
                className="text-xs text-primary hover:underline font-medium inline-block pt-1"
              >
                Go to Ask tab to start research →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {answerRecords.map((record) => {
                const verified = record.claims.filter((c) => c.status === 'verified').length;
                const recovered = record.claims.filter((c) => c.status === 'recovered').length;
                const review = record.claims.filter(
                  (c) => c.status === 'needs_review' || c.status === 'flagged'
                ).length;

                return (
                  <div
                    key={record.conversation.id}
                    className="p-4 rounded-xl border border-border/70 bg-card/40 hover:bg-card/70 transition-all space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-foreground line-clamp-1 font-sans">
                          {record.conversation.title || 'Untitled conversation'}
                        </h3>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {formatRelativeTime(record.createdAt)}
                        </span>
                      </div>

                      {/* Signature GroundGuard Claim State Strip */}
                      <ClaimStateStrip claims={record.claims} showCounts={true} size="default" />
                    </div>

                    <div className="pt-2 border-t border-border/30 flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span className="truncate pr-2">
                        {record.sources.length > 0
                          ? `Sources: ${record.sources.slice(0, 2).join(' · ')}${record.sources.length > 2 ? ` +${record.sources.length - 2}` : ''}`
                          : 'No sources'}
                      </span>

                      <Link
                        href={`/projects/${projectId}/ask?c=${record.conversation.id}`}
                        className="text-primary hover:underline font-semibold flex items-center gap-1 shrink-0"
                      >
                        <span>Open</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ============================================================ */}
        {/* 4. RECOVERY SECTION (Signature playback or subtle empty)    */}
        {/* ============================================================ */}
        <section className="space-y-3 pt-4 border-t border-border/50">
          <div className="space-y-0.5">
            <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <RotateCcw className="h-3.5 w-3.5 text-blue-500" />
              <span>Recovery Activity</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Autonomous repair and re-verification of contradictory claims.
            </p>
          </div>

          {recoveredClaimItems.length > 0 ? (
            <div className="space-y-3">
              {recoveredClaimItems.map((item) => (
                <div
                  key={item.claim.claimId}
                  className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Claim Recovered</span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedClaimItem(item);
                        scrollToWorkspace();
                      }}
                      className="h-6 text-[11px] gap-1 px-2 border-blue-500/40"
                    >
                      <span>Inspect audit trace</span>
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Visual playback trail */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-center text-[11px] font-mono">
                    <div className="p-2 rounded bg-background/60 border border-border/40">
                      <div className="text-[10px] text-muted-foreground">1. Original</div>
                      <div className="text-muted-foreground truncate">{item.claim.sourceText || 'Original claim'}</div>
                    </div>
                    <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">
                      <div className="text-[10px]">2. Contradiction</div>
                      <div className="truncate">Flagged by M1</div>
                    </div>
                    <div className="p-2 rounded bg-background/60 border border-border/40">
                      <div className="text-[10px] text-muted-foreground">3. New Evidence</div>
                      <div className="text-foreground truncate">Authoritative chunk</div>
                    </div>
                    <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
                      <div className="text-[10px]">4. Revised</div>
                      <div className="truncate font-medium">{item.claim.text}</div>
                    </div>
                    <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                      <div className="text-[10px]">5. Reverified</div>
                      <div className="truncate font-bold">✓ Entailment</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-2 text-xs text-muted-foreground italic">
              No recovery activity yet. When GroundGuard repairs a failed claim, its verification trail will appear here.
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
