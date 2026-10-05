'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  X,
  ShieldCheck,
  FileText,
  Activity,
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
  ChevronRight,
  Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/trust/status-badge';
import { SelectedClaimHero } from '@/components/trust/selected-claim-hero';
import { PDFSourceViewer, type CitationItem } from '@/components/source/pdf-source-viewer';
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
  initialTab?: string;
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
  initialTab,
}: AskInspectorProps) {
  const [activeTab, setActiveTab] = React.useState<string>(initialTab || 'claim');
  const [selectedAttemptIndex, setSelectedAttemptIndex] = React.useState<number>(0);
  const [selectedEvidenceIndex, setSelectedEvidenceIndex] = React.useState<number>(0);
  const [retryError, setRetryError] = React.useState<string | null>(null);

  // Fetch real recovery attempts from M3 if claim exists
  const { data: recoveryAttempts = [], refetch: refetchRecoveryAttempts } = useClaimRecoveryAttempts(claim?.claimId);
  const activeAttempt = recoveryAttempts[selectedAttemptIndex] || recoveryAttempts[recoveryAttempts.length - 1] || null;

  // Synchronize initialTab when provided
  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Default to latest attempt when attempts update
  React.useEffect(() => {
    if (recoveryAttempts.length > 0) {
      setSelectedAttemptIndex(recoveryAttempts.length - 1);
    }
  }, [recoveryAttempts.length]);

  // Reset selected evidence index when claim changes
  React.useEffect(() => {
    setSelectedEvidenceIndex(0);
    if (claim && !initialTab) {
      setActiveTab('claim');
    }
  }, [claim?.claimId]);

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

  // Determine current active evidence item based on selected citation index
  const currentEvidence = evidenceList[selectedEvidenceIndex] || selectedEvidence || evidenceList[0] || null;

  // Format citations array for PDF viewer
  const citations: CitationItem[] = evidenceList.map((ev, i) => ({
    index: i + 1,
    documentId: ev.documentId,
    pageNumber: ev.pageNumber ?? (ev.metadata?.pageNumber as number | undefined),
    text: ev.text,
    chunkId: ev.chunkId,
  }));

  const handleRetry = async () => {
    if (!claim.claimId || retryMutation.isPending || recoveryAttempts.length >= 2) return;
    setRetryError(null);
    try {
      const res = await retryMutation.mutateAsync(claim.claimId);
      if (res?.claim) {
        onClaimUpdated?.(res.claim);
        const refetched = await refetchRecoveryAttempts();
        const updatedList = refetched.data || res.recoveryAttempts || [];
        if (updatedList.length > 0) {
          setSelectedAttemptIndex(updatedList.length - 1);
        }
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
                'w-full max-w-md md:max-w-none md:w-[420px] lg:w-[460px] shrink-0 border-l border-border/70 bg-card/95 backdrop-blur-sm',
                'h-full shadow-2xl md:shadow-none z-40 md:z-30 transition-all duration-200',
                'fixed inset-y-0 right-0 md:static'
              )
        )}
        aria-label="Claim Inspector"
        role="region"
      >
        {/* 1. Inspector Sticky Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/20 select-none shrink-0">
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
          <div className="px-4 py-1.5 bg-muted/30 border-b border-border/40 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
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
          <div className="px-4 pt-2 border-b border-border/50 bg-muted/10 shrink-0">
            <TabsList className="grid grid-cols-4 h-8 p-0.5 bg-muted/50 rounded-lg text-[11px]">
              <TabsTrigger value="source" className="py-1 px-1.5 text-[11px] flex items-center gap-1">
                <FileText className="h-3 w-3" />
                <span>Source PDF</span>
              </TabsTrigger>
              <TabsTrigger value="claim" className="py-1 px-1.5 text-[11px] flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                <span>Verification</span>
              </TabsTrigger>
              <TabsTrigger
                value="recovery"
                className={cn(
                  'py-1 px-1.5 text-[11px] flex items-center gap-1',
                  isRecovered ? 'text-blue-500 font-medium' : isEligibleForRetry ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                <RotateCcw className="h-3 w-3" />
                <span>Recovery</span>
                {recoveryAttempts.length > 0 && (
                  <span className="text-[9px] px-1 py-0.2 rounded-full bg-muted font-mono">{recoveryAttempts.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="advanced" className="py-1 px-1.5 text-[11px] flex items-center gap-1">
                <Activity className="h-3 w-3" />
                <span>Diagnostics</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ============================================================ */}
          {/* Tab 1: Contextual PDF Source Viewer with Evidence Highlighting*/}
          {/* ============================================================ */}
          <TabsContent value="source" className="flex-1 overflow-hidden p-2 m-0 flex flex-col">
            <PDFSourceViewer
              documentId={currentEvidence?.documentId}
              documentFilename={
                (currentEvidence?.metadata?.filename as string) ||
                (currentEvidence?.metadata?.documentFilename as string) ||
                'Project Document'
              }
              pageNumber={
                currentEvidence?.pageNumber ??
                (currentEvidence?.metadata?.pageNumber as number | undefined) ??
                1
              }
              highlightedExcerpt={currentEvidence?.text}
              citations={citations}
              activeCitationIndex={selectedEvidenceIndex}
              onSelectCitation={(idx) => setSelectedEvidenceIndex(idx)}
              onClose={onClose}
              className="h-full border-0 shadow-none"
            />
          </TabsContent>

          {/* ============================================================ */}
          {/* Tab 2: Verification (Top-aligned Claim ↔ Evidence Overview)   */}
          {/* ============================================================ */}
          <TabsContent value="claim" className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 m-0 scrollbar-thin">
            <SelectedClaimHero
              claim={claim}
              selectedEvidence={currentEvidence}
              recoveryAttempts={recoveryAttempts}
              projectId={projectId}
              generationId={generationId}
              generationMetadata={generationMetadata}
              layoutMode={variant === 'drawer' ? 'stacked' : 'side-by-side'}
              onRetry={handleRetry}
              isRetrying={retryMutation.isPending}
              onOpenAnswer={onOpenAnswer}
            />
          </TabsContent>

          {/* ============================================================ */}
          {/* Tab 3: Recovery Provenance & Playback                         */}
          {/* ============================================================ */}
          <TabsContent value="recovery" className="flex-1 overflow-y-auto p-4 space-y-4 m-0 scrollbar-thin">
            {/* Header with Title and Budget Indicator */}
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Recovery Provenance & Playback</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">
                {recoveryAttempts.length} / 2 attempts used
              </span>
            </div>

            {/* 1. Original Statement & Flag Reason */}
            <div className="space-y-2 p-3 rounded-lg border border-border/60 bg-muted/20">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Original Claim
              </div>
              <p className="text-xs text-foreground font-medium leading-relaxed select-text">
                {activeAttempt?.originalText || claim.sourceText || claim.text}
              </p>
              <div className="pt-1 flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 font-mono">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Why it was flagged: {activeAttempt?.failureReason || (claim.status === 'flagged' ? 'CONTRADICTION' : 'INSUFFICIENT_EVIDENCE')}</span>
              </div>
            </div>

            {/* 2. Attempt Selector Pills */}
            {recoveryAttempts.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Attempts History
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {recoveryAttempts.map((att, idx) => {
                    const isSelected = selectedAttemptIndex === idx;
                    const isAttRecovered = att.verificationLabel === 'entailment';
                    return (
                      <button
                        key={att.id || idx}
                        type="button"
                        onClick={() => setSelectedAttemptIndex(idx)}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-mono transition-all border text-left flex items-center gap-1.5',
                          isSelected
                            ? 'bg-primary/10 border-primary text-primary font-semibold ring-1 ring-primary/30'
                            : 'bg-card border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40'
                        )}
                      >
                        <span>Attempt #{att.attemptNumber}</span>
                        {isAttRecovered ? (
                          <span className="text-emerald-500 font-bold">✓ Recovered</span>
                        ) : att.candidateText ? (
                          <span className="text-muted-foreground">Revision</span>
                        ) : (
                          <span className="text-amber-500 font-medium">Abstain</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. SELECTED ATTEMPT DETAIL */}
            {activeAttempt ? (
              <div className="space-y-3 p-3.5 rounded-lg border border-border/70 bg-card/50">
                <div className="flex items-center justify-between text-[11px] font-mono border-b border-border/40 pb-2">
                  <span className="font-semibold text-foreground">
                    Selected Attempt: #{activeAttempt.attemptNumber}
                  </span>
                  <span className="text-muted-foreground capitalize">
                    Action: {activeAttempt.action || 'abstain'}
                  </span>
                </div>

                {/* Evidence Used */}
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">
                    Recovery Evidence Retrieved
                  </div>
                  {activeAttempt.recoveryEvidence && activeAttempt.recoveryEvidence.length > 0 ? (
                    <div className="p-2 rounded bg-muted/30 border border-border/40 text-xs italic text-foreground/90 max-h-32 overflow-y-auto leading-relaxed select-text">
                      &ldquo;{activeAttempt.recoveryEvidence.map((e: any) => e.text).join(' ')}&rdquo;
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No targeted recovery evidence was found in project documents.
                    </p>
                  )}
                </div>

                {/* Candidate Revision */}
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">
                    Candidate Revision
                  </div>
                  {activeAttempt.candidateText ? (
                    <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-xs text-foreground font-medium select-text">
                      {activeAttempt.candidateText}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No candidate revision was produced.
                    </p>
                  )}
                </div>

                {/* M1 Reverification */}
                <div className="space-y-1 pt-1">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">
                    M1 Neural Reverification
                  </div>
                  {activeAttempt.verificationLabel ? (
                    <div className="p-2 rounded bg-muted/40 border border-border/50 flex items-center justify-between text-xs font-mono">
                      <span className={activeAttempt.verificationLabel === 'entailment' ? 'text-emerald-600 font-semibold' : 'text-amber-600'}>
                        Result: {activeAttempt.verificationLabel}
                      </span>
                      {activeAttempt.groundingScore !== undefined && activeAttempt.groundingScore !== null && (
                        <span className="text-muted-foreground">
                          Grounding: {formatGroundingScore(activeAttempt.groundingScore)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Reverification was not executed for this attempt.
                    </p>
                  )}
                </div>

                {/* Terminal Status */}
                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Settled State:</span>
                  <span className={cn('font-semibold', activeAttempt.verificationLabel === 'entailment' ? 'text-emerald-600' : 'text-amber-600')}>
                    {activeAttempt.verificationLabel === 'entailment' ? 'RECOVERED ✓' : 'UNRESOLVED (Needs Review)'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg">
                No recovery attempts recorded for this claim.
              </div>
            )}

            {/* Retry Button with Limit Enforcement */}
            {isEligibleForRetry && (
              <div className="pt-2 border-t border-border/40 space-y-2">
                <Button
                  onClick={handleRetry}
                  disabled={recoveryAttempts.length >= 2 || retryMutation.isPending}
                  className="w-full h-8 text-xs gap-1.5"
                  variant={recoveryAttempts.length >= 2 ? 'outline' : 'default'}
                >
                  {retryMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Recovering...</span>
                    </>
                  ) : recoveryAttempts.length >= 2 ? (
                    <span>Recovery attempt limit reached (2/2)</span>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Retry Recovery</span>
                    </>
                  )}
                </Button>
                {retryError && (
                  <p className="text-xs text-destructive text-center">{retryError}</p>
                )}
              </div>
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* Tab 4: Diagnostics (Real Persisted Technical Telemetry)      */}
          {/* ============================================================ */}
          <TabsContent value="advanced" className="flex-1 overflow-y-auto p-4 space-y-4 m-0 scrollbar-thin">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Cpu className="h-3.5 w-3.5 text-primary" />
                <span>Verification & System Diagnostics</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">M1 / M2 / M3</span>
            </div>

            {/* 1. M1 Neural NLI Signal Meters */}
            <div className="p-3.5 rounded-lg border border-border/70 bg-card/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                  M1 Neural NLI Signals
                </span>
                <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/60 border border-border/40">
                  {verification?.modelVersion || 'groundguard-deberta-v1'}
                </span>
              </div>

              {/* Truth-probability disclaimer (Section 12) */}
              <div className="p-2 rounded bg-muted/30 border border-border/40 text-[11px] text-muted-foreground font-sans flex items-start gap-1.5 leading-relaxed">
                <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <span>Model signal distribution — not a truth probability.</span>
              </div>

              {verification?.scores ? (
                <div className="space-y-2.5 font-mono text-xs">
                  {/* Entailment Meter */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">Entailment</span>
                      <span>{(verification.scores.entailment * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, verification.scores.entailment * 100))}%` }}
                      />
                    </div>
                  </div>

                  {/* Neutral Meter */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-amber-600 dark:text-amber-400 font-medium">Neutral</span>
                      <span>{(verification.scores.neutral * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, verification.scores.neutral * 100))}%` }}
                      />
                    </div>
                  </div>

                  {/* Contradiction Meter */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-rose-600 dark:text-rose-400 font-medium">Contradiction</span>
                      <span>{(verification.scores.contradiction * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, verification.scores.contradiction * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Raw NLI score distribution is not available for this claim.
                </p>
              )}
            </div>

            {/* 2. Recovery Attempt Budget Meter (Section 14, 16) */}
            <div className="p-3.5 rounded-lg border border-border/70 bg-card/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                  Recovery Attempt Budget
                </span>
                <span className="font-mono text-xs font-semibold text-foreground">
                  {recoveryAttempts.length} / 2 consumed
                </span>
              </div>

              {/* 2-segment visual meter */}
              <div className="grid grid-cols-2 gap-2">
                <div
                  className={cn(
                    'p-2 rounded border text-center font-mono text-[11px] transition-colors',
                    recoveryAttempts.length >= 1
                      ? 'bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300 font-medium'
                      : 'bg-muted/30 border-border/40 text-muted-foreground'
                  )}
                >
                  Attempt 1: {recoveryAttempts.length >= 1 ? 'Executed' : 'Available'}
                </div>
                <div
                  className={cn(
                    'p-2 rounded border text-center font-mono text-[11px] transition-colors',
                    recoveryAttempts.length >= 2
                      ? 'bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300 font-medium'
                      : 'bg-muted/30 border-border/40 text-muted-foreground'
                  )}
                >
                  Attempt 2: {recoveryAttempts.length >= 2 ? 'Executed' : 'Available'}
                </div>
              </div>

              {activeAttempt && (
                <div className="pt-2 border-t border-border/40 text-xs font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recovery Model:</span>
                    <span className="text-foreground">{activeAttempt.recoveryModelVersion || 'gemini/gemini-flash-lite-latest'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Candidate Produced:</span>
                    <span className="text-foreground">{activeAttempt.candidateText ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recovery Evidence Count:</span>
                    <span className="text-foreground">{activeAttempt.recoveryEvidence?.length || 0} chunks</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reverification Label:</span>
                    <span className="text-foreground capitalize">{activeAttempt.verificationLabel || 'None'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Evidence Metadata (Section 13) */}
            <div className="p-3.5 rounded-lg border border-border/70 bg-card/60 space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                Evidence Linkage Metadata
              </span>

              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Attached Chunks:</span>
                  <span className="text-foreground">{evidenceList.length}</span>
                </div>
                {currentEvidence?.documentId && (
                  <div className="flex justify-between truncate">
                    <span className="text-muted-foreground">Document:</span>
                    <span className="text-foreground truncate max-w-[200px]" title={currentEvidence.documentId}>
                      {(currentEvidence.metadata?.filename as string) || currentEvidence.documentId}
                    </span>
                  </div>
                )}
                {currentEvidence?.pageNumber !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Page:</span>
                    <span className="text-foreground">Page {currentEvidence.pageNumber}</span>
                  </div>
                )}
                {currentEvidence?.chunkId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Chunk ID:</span>
                    <span className="text-foreground truncate max-w-[180px] select-all">{currentEvidence.chunkId}</span>
                  </div>
                )}
                {/* Rerank score ONLY if actually persisted in metadata (Section 13) */}
                {currentEvidence?.metadata?.score !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rerank Score:</span>
                    <span className="text-foreground font-semibold">{Number(currentEvidence.metadata.score).toFixed(4)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Compact Real Claim Lifecycle Timeline (Section 15, 16) */}
            <div className="p-3.5 rounded-lg border border-border/70 bg-card/60 space-y-2.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                Claim Lifecycle Stages
              </span>

              <div className="space-y-2 text-xs font-mono pl-2 border-l border-border/60">
                {/* Stage 1: Generated */}
                <div className="relative pl-3">
                  <div className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-primary" />
                  <span className="font-semibold text-foreground">1. Generated</span>
                  <p className="text-[11px] text-muted-foreground font-sans">
                    Extracted from model response via claim decomposition.
                  </p>
                </div>

                {/* Stage 2: Initial Verification */}
                <div className="relative pl-3">
                  <div className={cn(
                    'absolute -left-[17px] top-1 h-2 w-2 rounded-full',
                    claim.status === 'verified' ? 'bg-emerald-500' : claim.status === 'flagged' ? 'bg-rose-500' : 'bg-amber-500'
                  )} />
                  <span className="font-semibold text-foreground">2. Initial Verification</span>
                  <p className="text-[11px] text-muted-foreground font-sans">
                    Verdict: <strong className="capitalize">{claim.status}</strong> via DeBERTa-v1 NLI cross-encoder.
                  </p>
                </div>

                {/* Stage 3: Recovery Attempt #1 (if occurred) */}
                {recoveryAttempts.length >= 1 && (
                  <div className="relative pl-3">
                    <div className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-blue-500" />
                    <span className="font-semibold text-foreground">3. Recovery Attempt #1</span>
                    <p className="text-[11px] text-muted-foreground font-sans">
                      Action: {recoveryAttempts[0].action || 'abstain'} · Reverification: {recoveryAttempts[0].verificationLabel || 'unverified'}
                    </p>
                  </div>
                )}

                {/* Stage 4: Recovery Attempt #2 (if occurred) */}
                {recoveryAttempts.length >= 2 && (
                  <div className="relative pl-3">
                    <div className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-blue-500" />
                    <span className="font-semibold text-foreground">4. Recovery Attempt #2</span>
                    <p className="text-[11px] text-muted-foreground font-sans">
                      Action: {recoveryAttempts[1].action || 'abstain'} · Reverification: {recoveryAttempts[1].verificationLabel || 'unverified'}
                    </p>
                  </div>
                )}

                {/* Terminal Stage: Settled Status */}
                <div className="relative pl-3">
                  <div className={cn(
                    'absolute -left-[17px] top-1 h-2 w-2 rounded-full',
                    claim.status === 'verified' || claim.status === 'recovered' ? 'bg-emerald-500' : 'bg-amber-500'
                  )} />
                  <span className="font-semibold text-foreground">Terminal: {claim.status.toUpperCase()}</span>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </aside>
    </>
  );
}
