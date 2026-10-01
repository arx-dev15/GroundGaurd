'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  X,
  ShieldCheck,
  FileText,
  Activity,
  Layers,
  RotateCcw,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Clock,
  ArrowRight,
  Database,
  Cpu,
  Info,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  SplitSquareVertical,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/trust/status-badge';
import { SelectedClaimHero } from '@/components/trust/selected-claim-hero';
import { useClaimRecoveryAttempts, useRetryClaim } from '@/lib/conversations-query';
import { CLAIM_STATE_CONFIG, formatGroundingScore } from '@/lib/trust-utils';
import { cn } from '@/lib/utils';
import type { Claim, EvidenceItem, RecoveryAttempt } from '@groundguard/types';

export interface AskInspectorProps {
  claim: Claim | null;
  selectedEvidence?: EvidenceItem | null;
  projectId: string;
  generationId?: string;
  isOpen: boolean;
  onClose?: () => void;
  onClaimUpdated?: (updatedClaim: Claim) => void;
  generationMetadata?: Record<string, unknown>;
  variant?: 'drawer' | 'inline';
  contextTitle?: string;
  onOpenAnswer?: () => void;
}

export function AskInspector({
  claim,
  selectedEvidence,
  projectId,
  generationId,
  isOpen,
  onClose,
  onClaimUpdated,
  generationMetadata,
  variant = 'drawer',
  contextTitle,
  onOpenAnswer,
}: AskInspectorProps) {
  const shouldReduceMotion = useReducedMotion();
  const [activeTab, setActiveTab] = React.useState<string>('claim');
  const [retryError, setRetryError] = React.useState<string | null>(null);

  // Fetch real recovery attempts from M3 if claim exists
  const { data: recoveryAttempts = [], refetch: refetchRecoveryAttempts } = useClaimRecoveryAttempts(claim?.claimId);

  // Retry claim mutation
  const retryMutation = useRetryClaim();

  // Handle Escape key to close (drawer mode only)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose && variant === 'drawer') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, variant]);

  // If selected evidence changes or claim changes, switch tab accordingly
  React.useEffect(() => {
    if (selectedEvidence) {
      setActiveTab('evidence');
    }
  }, [selectedEvidence]);

  if (!isOpen || !claim) {
    if (variant === 'inline') {
      return (
        <div className="w-full h-full min-h-[460px] rounded-xl border border-dashed border-border/80 bg-card/30 flex flex-col items-center justify-center p-8 text-center select-none">
          <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center mb-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-1">
            Claim Inspector
          </h4>
          <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
            Select any claim from the review queue to inspect its supporting evidence, NLI verification scores, and recovery history.
          </p>
        </div>
      );
    }
    return null;
  }

  const verification = claim.verification;
  const isRecovered = claim.status === 'recovered' || recoveryAttempts.length > 0;
  const isContradicted = claim.status === 'flagged';
  const isNeedsReview = claim.status === 'needs_review';
  const isEligibleForRetry = isContradicted || isNeedsReview;
  const evidenceList = claim.evidence || [];
  const primaryEvidence = evidenceList[0];

  const handleRetry = async () => {
    if (!claim.claimId || retryMutation.isPending) return;
    setRetryError(null);
    try {
      const res = await retryMutation.mutateAsync(claim.claimId);
      if (res?.claim) {
        onClaimUpdated?.(res.claim);
        refetchRecoveryAttempts();
        setActiveTab('recovery');
      }
    } catch (err: any) {
      setRetryError(err.message || 'Retry failed. Please try again.');
    }
  };

  const isInline = variant === 'inline';

  return (
    <>
      {/* Mobile backdrop overlay for drawer mode only */}
      {!isInline && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-xs z-30 md:hidden animate-in fade-in duration-150"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'flex flex-col overflow-hidden',
          isInline
            ? 'w-full h-full rounded-xl border border-border/80 bg-card/50 shadow-xs'
            : cn(
                'w-full max-w-md md:max-w-none md:w-[380px] lg:w-[420px] shrink-0 border-l border-border/70 bg-card/95 backdrop-blur-sm',
                'h-full shadow-2xl md:shadow-none z-40 md:z-30 transition-all duration-200',
                'fixed inset-y-0 right-0 md:static'
              )
        )}
        aria-label="Claim Inspector"
        role="region"
      >
        {/* 1. Inspector Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/20 select-none">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-foreground truncate">
                Claim Inspector
              </h3>
              <p className="text-[10px] font-mono text-muted-foreground truncate">
                {claim.claimId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <StatusBadge status={claim.status} size="sm" />
            {!isInline && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors ml-1 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Close inspector"
                title="Close inspector (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Optional Question Context Bar */}
        {contextTitle && (
          <div className="px-4 py-1.5 bg-muted/30 border-b border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="truncate pr-2">
              Asked in: <strong className="text-foreground font-medium">{contextTitle}</strong>
            </span>
            {onOpenAnswer && (
              <button
                type="button"
                onClick={onOpenAnswer}
                className="text-[10px] font-mono text-primary hover:underline shrink-0"
              >
                Open answer →
              </button>
            )}
          </div>
        )}

        {/* 2. Tabs Navigation Bar */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-4 pt-2 border-b border-border/50 bg-muted/10">
            <TabsList className="grid grid-cols-5 h-8 p-0.5 bg-muted/50 rounded-lg text-[11px]">
              <TabsTrigger value="claim" className="py-1 px-1.5 text-[11px]">
                Claim
              </TabsTrigger>
              <TabsTrigger value="evidence" className="py-1 px-1.5 text-[11px]">
                Evidence
              </TabsTrigger>
              <TabsTrigger value="verification" className="py-1 px-1.5 text-[11px]">
                Verify
              </TabsTrigger>
              <TabsTrigger
                value="recovery"
                className={cn(
                  'py-1 px-1.5 text-[11px]',
                  isRecovered ? 'text-blue-500 font-medium' : isEligibleForRetry ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                Recovery
              </TabsTrigger>
              <TabsTrigger value="advanced" className="py-1 px-1.5 text-[11px]">
                Trace
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ============================================================ */}
          {/* Tab 1: Claim Overview + Central Editorial Comparison         */}
          {/* ============================================================ */}
          <TabsContent value="claim" className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 m-0 scrollbar-thin">
            <SelectedClaimHero
              claim={claim}
              selectedEvidence={selectedEvidence || primaryEvidence}
              recoveryAttempts={recoveryAttempts}
              projectId={projectId}
              generationId={generationId}
              generationMetadata={generationMetadata}
              onRetry={handleRetry}
              isRetrying={retryMutation.isPending}
              onOpenAnswer={onOpenAnswer}
            />
          </TabsContent>

          {/* ============================================================ */}
          {/* Tab 2: Evidence Lens                                         */}
          {/* ============================================================ */}
          <TabsContent value="evidence" className="flex-1 overflow-y-auto p-4 space-y-3 m-0 scrollbar-thin">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <span>Supporting Evidence Chunks</span>
              <span>{evidenceList.length} {evidenceList.length === 1 ? 'item' : 'items'}</span>
            </div>

            {evidenceList.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg space-y-1">
                <p className="font-medium text-foreground">No supporting evidence</p>
                <p className="text-[11px]">No supporting project evidence was attached to this claim.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {evidenceList.map((ev, i) => {
                  const docId = ev.documentId;
                  const pageNum = ev.pageNumber ?? (ev.metadata?.pageNumber as number | undefined);
                  const filename =
                    (ev.metadata?.filename as string) ||
                    (ev.metadata?.documentFilename as string) ||
                    'Knowledge Document';
                  const knowledgeUrl = docId
                    ? pageNum
                      ? `/projects/${projectId}/knowledge/${docId}?page=${pageNum}`
                      : `/projects/${projectId}/knowledge/${docId}`
                    : null;

                  return (
                    <div
                      key={ev.chunkId || i}
                      className="p-3 rounded-lg border border-border/70 bg-card/60 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                        <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate">{filename}</span>
                        </span>
                        {pageNum !== undefined && (
                          <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/60 border border-border/40 shrink-0">
                            Page {pageNum}
                          </span>
                        )}
                      </div>

                      {ev.heading && (
                        <div className="text-[10px] font-mono text-muted-foreground">
                          Section: <span className="text-foreground">{ev.heading}</span>
                        </div>
                      )}

                      <div className="text-xs text-foreground/90 leading-relaxed italic bg-muted/20 p-2.5 rounded border border-border/30 select-text whitespace-pre-wrap">
                        &ldquo;{ev.text}&rdquo;
                      </div>

                      {knowledgeUrl && (
                        <div className="pt-1 flex items-center justify-end">
                          <Link
                            href={knowledgeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                          >
                            <span>Open in Knowledge Base</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* Tab 3: Verification Details                                  */}
          {/* ============================================================ */}
          <TabsContent value="verification" className="flex-1 overflow-y-auto p-4 space-y-4 m-0 scrollbar-thin">
            <div className="p-3 rounded-lg border border-border/70 bg-card/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Verification Verdict
                </span>
                <StatusBadge status={claim.status} size="sm" />
              </div>

              <p className="text-xs text-foreground leading-relaxed">
                {claim.status === 'verified' && (
                  <>Evidence directly <strong>entails</strong> and confirms the statement in this claim.</>
                )}
                {claim.status === 'recovered' && (
                  <>This claim was autonomously revised to resolve a contradiction and re-verified against evidence.</>
                )}
                {claim.status === 'flagged' && (
                  <>Evidence <strong>contradicts</strong> this statement or failed technical invariant checks.</>
                )}
                {claim.status === 'needs_review' && (
                  <>Evidence is inconclusive or insufficient for complete factual verification.</>
                )}
                {claim.status === 'pending' && (
                  <>Verification is queued or pending inference execution.</>
                )}
              </p>
            </div>

            {verification ? (
              <div className="space-y-3 p-3.5 rounded-lg border border-border/70 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Neural Cross-Encoder
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/60 border border-border/40">
                    {verification.modelVersion || 'DeBERTa-v3'}
                  </span>
                </div>

                <div className="p-2.5 rounded-md bg-background/60 border border-border/50 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Grounding Score:</span>
                  <span className="font-mono text-sm font-bold text-foreground">
                    {formatGroundingScore(verification.groundingScore)}
                  </span>
                </div>

                <div className="space-y-2.5 pt-1 text-xs font-mono">
                  {/* Entailment */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">Entailment</span>
                      <span>{(verification.scores.entailment * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, verification.scores.entailment * 100))}%` }}
                      />
                    </div>
                  </div>

                  {/* Neutral */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-amber-600 dark:text-amber-400 font-medium">Neutral</span>
                      <span>{(verification.scores.neutral * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, verification.scores.neutral * 100))}%` }}
                      />
                    </div>
                  </div>

                  {/* Contradiction */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-rose-600 dark:text-rose-400 font-medium">Contradiction</span>
                      <span>{(verification.scores.contradiction * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, verification.scores.contradiction * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg">
                No cross-encoder scores available for this claim.
              </div>
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* Tab 4: Recovery Playback (Observable Audit Trace)            */}
          {/* ============================================================ */}
          <TabsContent value="recovery" className="flex-1 overflow-y-auto p-4 space-y-4 m-0 scrollbar-thin">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Recovery Playback Audit Trace</span>
              </div>
              {recoveryAttempts.length > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {recoveryAttempts.length} {recoveryAttempts.length === 1 ? 'attempt' : 'attempts'}
                </span>
              )}
            </div>

            {recoveryAttempts.length > 0 ? (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
                {recoveryAttempts.map((attempt, index) => (
                  <div key={attempt.id || index} className="space-y-3 pb-3 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-foreground">
                      <span className="px-1.5 py-0.5 rounded bg-muted/60 border border-border/40">
                        Attempt #{attempt.attemptNumber}
                      </span>
                      <span className="text-muted-foreground capitalize">({attempt.action || 'revise'})</span>
                    </div>

                    {/* 1. Original statement */}
                    <div className="relative space-y-1">
                      <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-muted-foreground border-2 border-background" />
                      <span className="text-[10px] font-mono text-muted-foreground">Original Claim</span>
                      <p className="text-xs text-muted-foreground/80 line-through bg-muted/20 p-2 rounded border border-border/40 select-text">
                        {attempt.originalText}
                      </p>
                    </div>

                    {/* 2. Failure reason */}
                    <div className="relative space-y-1">
                      <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-background" />
                      <span className="text-[10px] font-mono text-rose-600 dark:text-rose-400">
                        Discrepancy Detected ({attempt.failureReason || 'CONTRADICTION'})
                      </span>
                      <p className="text-xs text-foreground bg-rose-500/10 border border-rose-500/20 p-2 rounded">
                        M1 cross-encoder flagged contradiction against project evidence chunks.
                      </p>
                    </div>

                    {/* 3. Candidate revision */}
                    {attempt.candidateText && (
                      <div className="relative space-y-1">
                        <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-background" />
                        <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">
                          Autonomous Revision Candidate
                        </span>
                        <p className="text-xs text-foreground bg-blue-500/10 border border-blue-500/20 p-2 rounded select-text">
                          {attempt.candidateText}
                        </p>
                      </div>
                    )}

                    {/* 4. M1 Reverification outcome */}
                    {attempt.verificationLabel && (
                      <div className="relative space-y-1">
                        <div
                          className={cn(
                            'absolute -left-6 top-1 w-2.5 h-2.5 rounded-full border-2 border-background',
                            attempt.verificationLabel === 'entailment' ? 'bg-emerald-500' : 'bg-amber-500'
                          )}
                        />
                        <span
                          className={cn(
                            'text-[10px] font-mono font-medium',
                            attempt.verificationLabel === 'entailment'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          )}
                        >
                          Re-verification ({attempt.verificationLabel}) · Grounding {formatGroundingScore(attempt.groundingScore ?? undefined)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Final Settled State */}
                <div className="relative space-y-1">
                  <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                    Final Settled State
                  </span>
                  <p className="text-xs text-foreground font-medium bg-emerald-500/10 border border-emerald-500/20 p-2 rounded select-text">
                    {claim.text}
                  </p>
                </div>
              </div>
            ) : isRecovered ? (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
                <div className="relative space-y-1">
                  <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-muted-foreground border-2 border-background" />
                  <span className="text-[10px] font-mono text-muted-foreground">Original Claim</span>
                  <p className="text-xs text-muted-foreground/80 line-through bg-muted/20 p-2 rounded border border-border/40 select-text">
                    {claim.sourceText || 'Original ungrounded candidate statement'}
                  </p>
                </div>

                <div className="relative space-y-1">
                  <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-background" />
                  <span className="text-[10px] font-mono text-rose-600 dark:text-rose-400">Contradiction Flagged</span>
                  <p className="text-xs text-foreground bg-rose-500/10 border border-rose-500/20 p-2 rounded">
                    Dual-stage engine flagged discrepancy with project evidence.
                  </p>
                </div>

                <div className="relative space-y-1">
                  <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-background" />
                  <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">Autonomous Revision</span>
                  <p className="text-xs text-foreground bg-blue-500/10 border border-blue-500/20 p-2 rounded">
                    Revised against authoritative document evidence.
                  </p>
                </div>

                <div className="relative space-y-1">
                  <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                    Recovered Entailment Verified
                  </span>
                  <p className="text-xs text-foreground font-medium bg-emerald-500/10 border border-emerald-500/20 p-2 rounded select-text">
                    {claim.text}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg space-y-3">
                <p>No recovery was required for this claim.</p>
                {isEligibleForRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    disabled={retryMutation.isPending}
                    className="h-7 text-xs gap-1.5"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Request verification retry</span>
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* Tab 5: Technical Trace                                       */}
          {/* ============================================================ */}
          <TabsContent value="advanced" className="flex-1 overflow-y-auto p-4 space-y-3 m-0 scrollbar-thin">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Cpu className="h-3.5 w-3.5 text-primary" />
                <span>Trace & Diagnostic Metadata</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">M3 / M1</span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase">Claim ID</span>
                <div className="truncate text-foreground select-all">{claim.claimId}</div>
              </div>

              {generationId && (
                <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Generation ID</span>
                  <div className="truncate text-foreground select-all">{generationId}</div>
                </div>
              )}

              <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase">Canonical Status</span>
                <div className="text-foreground capitalize">{claim.status}</div>
              </div>

              <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase">Ordinal Index</span>
                <div className="text-foreground">Index #{claim.ordinal ?? 0}</div>
              </div>

              {verification?.modelVersion && (
                <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Verification Model</span>
                  <div className="truncate text-foreground">{verification.modelVersion}</div>
                </div>
              )}

              {verification?.groundingScore !== undefined && (
                <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Grounding Score</span>
                  <div className="text-foreground">{formatGroundingScore(verification.groundingScore)}</div>
                </div>
              )}

              <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase">Evidence Linkage</span>
                <div className="text-foreground">{evidenceList.length} chunk{evidenceList.length === 1 ? '' : 's'} linked</div>
              </div>

              {evidenceList.length > 0 && (
                <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Chunk IDs</span>
                  <div className="space-y-0.5 max-h-24 overflow-y-auto scrollbar-thin">
                    {evidenceList.map((ev, i) => (
                      <div key={ev.chunkId || i} className="text-[11px] text-muted-foreground truncate select-all">
                        {ev.chunkId}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </aside>
    </>
  );
}
