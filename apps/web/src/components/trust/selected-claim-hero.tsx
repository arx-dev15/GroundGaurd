'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  RotateCcw,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Layers,
  Cpu,
  ArrowRight,
  Info,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './status-badge';
import { RecoveryPlayback } from './recovery-playback';
import { parseComparisonSegments } from '@/lib/highlight-utils';
import { CLAIM_STATE_CONFIG, formatGroundingScore } from '@/lib/trust-utils';
import { cn } from '@/lib/utils';
import type { Claim, EvidenceItem, RecoveryAttempt } from '@groundguard/types';

interface SelectedClaimHeroProps {
  claim: Claim;
  selectedEvidence?: EvidenceItem | null;
  recoveryAttempts?: RecoveryAttempt[];
  projectId: string;
  generationId?: string;
  generationMetadata?: Record<string, unknown>;
  onRetry?: () => void;
  isRetrying?: boolean;
  onOpenSource?: (docId: string, page?: number) => void;
  onOpenAnswer?: () => void;
  className?: string;
}

export function SelectedClaimHero({
  claim,
  selectedEvidence,
  recoveryAttempts = [],
  projectId,
  generationId,
  generationMetadata,
  onRetry,
  isRetrying = false,
  onOpenSource,
  onOpenAnswer,
  className,
}: SelectedClaimHeroProps) {
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showRecovery, setShowRecovery] = React.useState(
    claim.status === 'recovered' || recoveryAttempts.length > 0
  );

  const status = claim.status || 'pending';
  const config = CLAIM_STATE_CONFIG[status] || CLAIM_STATE_CONFIG.pending;
  const isContradiction = status === 'flagged';
  const isRecovered = status === 'recovered';

  // Primary evidence item to compare against
  const primaryEvidence = selectedEvidence || (claim.evidence && claim.evidence[0]) || null;
  const evidenceText = primaryEvidence?.text || '';
  const claimText = claim.text || '';

  // Deterministically highlight matching/conflicting tokens
  const claimSegments = React.useMemo(() => {
    return parseComparisonSegments(claimText, evidenceText, isContradiction);
  }, [claimText, evidenceText, isContradiction]);

  const evidenceSegments = React.useMemo(() => {
    return parseComparisonSegments(evidenceText, claimText, isContradiction);
  }, [evidenceText, claimText, isContradiction]);

  // Deterministic user-facing verification explanation
  const getVerificationExplanation = () => {
    switch (status) {
      case 'verified':
        return 'Project evidence supports this claim.';
      case 'flagged':
        return 'Project evidence conflicts with this claim.';
      case 'needs_review':
        return 'GroundGuard could not find enough evidence to verify this claim.';
      case 'recovered':
        return 'GroundGuard revised this claim and verified the revision against project evidence.';
      default:
        return 'Checking claim against project evidence...';
    }
  };

  const docName =
    primaryEvidence?.documentId ||
    (primaryEvidence as any)?.filename ||
    'Project Document';
  const pageNumber = primaryEvidence?.pageNumber;

  return (
    <div className={cn('space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5 select-none shadow-xs', className)}>
      {/* Top Meta Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <StatusBadge status={status} size="default" showIcon={true} />
          {claim.ordinal != null && (
            <span className="text-[11px] font-mono text-muted-foreground">
              Claim #{claim.ordinal + 1}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onOpenAnswer && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenAnswer}
              className="h-7 text-xs gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="h-3 w-3" />
              <span>View in Answer</span>
            </Button>
          )}

          {primaryEvidence?.documentId && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 px-2.5 font-sans"
            >
              <Link href={`/projects/${projectId}/knowledge/${primaryEvidence.documentId}`}>
                <ExternalLink className="h-3 w-3" />
                <span>Open Source</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Hero Comparison: CLAIM ↕ EVIDENCE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: VERIFIED DOCUMENT SLICE */}
        <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2 flex flex-col justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="flex items-center gap-1.5 font-semibold text-muted-foreground uppercase tracking-wider">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>Verified Document Slice</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-sans">
                Grounded
              </span>
            </div>

            <div className="text-xs font-medium text-foreground truncate">
              {docName} {pageNumber ? `· Page ${pageNumber}` : ''}
            </div>

            <div className="text-xs sm:text-sm text-foreground/90 font-sans leading-relaxed pt-1 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
              {evidenceText ? (
                <>
                  &ldquo;
                  {evidenceSegments.map((seg, i) => (
                    <span
                      key={i}
                      className={cn(
                        seg.isMatch && 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 font-semibold px-1 py-0.5 rounded',
                        seg.isConflict && 'bg-rose-500/20 text-rose-800 dark:text-rose-200 font-semibold px-1 py-0.5 rounded underline decoration-rose-500'
                      )}
                    >
                      {seg.text}
                    </span>
                  ))}
                  &rdquo;
                </>
              ) : (
                <span className="text-muted-foreground italic">
                  No direct evidence chunk linked to this claim.
                </span>
              )}
            </div>
          </div>

          {primaryEvidence?.chunkId && (
            <div className="pt-2 text-[10px] font-mono text-muted-foreground/80 border-t border-border/30">
              Chunk ID: {primaryEvidence.chunkId}
            </div>
          )}
        </div>

        {/* RIGHT: CLAIM */}
        <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 flex flex-col justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="flex items-center gap-1.5 font-semibold text-muted-foreground uppercase tracking-wider">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>Claim</span>
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {status === 'pending' ? 'Verifying...' : 'Evaluated'}
              </span>
            </div>

            <div className="text-xs sm:text-sm text-foreground font-sans font-medium leading-relaxed pt-1">
              {claimSegments.map((seg, i) => (
                <span
                  key={i}
                  className={cn(
                    seg.isMatch && 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 font-semibold px-1 py-0.5 rounded',
                    seg.isConflict && 'bg-rose-500/20 text-rose-800 dark:text-rose-200 font-semibold px-1 py-0.5 rounded underline decoration-rose-500'
                  )}
                >
                  {seg.text}
                </span>
              ))}
            </div>
          </div>

          {/* Verification Explanation */}
          <div className="pt-2 border-t border-border/30 flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-sans">
              {getVerificationExplanation()}
            </span>
            {claim.verification?.groundingScore != null && (
              <span className="font-mono text-[11px] text-muted-foreground font-semibold">
                Score: {formatGroundingScore(claim.verification.groundingScore)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM: VERIFICATION RESULT BANNER */}
      <div
        className={cn(
          'p-3 rounded-lg border flex items-center justify-between text-xs font-sans transition-colors',
          status === 'verified' && 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200',
          status === 'recovered' && 'bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-200',
          status === 'flagged' && 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200',
          status === 'needs_review' && 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200',
          status === 'pending' && 'bg-muted/40 border-border/60 text-muted-foreground'
        )}
      >
        <div className="flex items-center gap-2">
          {status === 'verified' && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
          {status === 'recovered' && <RotateCcw className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />}
          {status === 'flagged' && <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />}
          {status === 'needs_review' && <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />}
          {status === 'pending' && <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
          <span className="font-medium text-xs sm:text-sm">
            {status === 'verified' && 'Supported · Document evidence verifies this statement'}
            {status === 'recovered' && 'Recovered · Revised statement verified against project documentation'}
            {status === 'flagged' && 'Contradiction · Statement conflicts with project documentation'}
            {status === 'needs_review' && 'Needs Review · Insufficient documentation to substantiate claim'}
            {status === 'pending' && 'Awaiting verification by GroundGuard M1 model'}
          </span>
        </div>

        {/* Retry button if flagged or needs review */}
        {(status === 'flagged' || status === 'needs_review') && onRetry && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={isRetrying}
            className="h-7 text-xs gap-1.5 border-current hover:bg-background/40"
          >
            {isRetrying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            <span>Retry Recovery</span>
          </Button>
        )}
      </div>

      {/* Expandable Recovery Section */}
      {(isRecovered || recoveryAttempts.length > 0 || status === 'flagged') && (
        <div className="border border-border/60 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowRecovery(!showRecovery)}
            className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 text-xs font-semibold text-foreground transition-colors"
          >
            <span className="flex items-center gap-2">
              <RotateCcw className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>Recovery Provenance & Playback ({recoveryAttempts.length} attempts)</span>
            </span>
            {showRecovery ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {showRecovery && (
            <div className="p-3 border-t border-border/40">
              <RecoveryPlayback
                claim={claim}
                attempts={recoveryAttempts}
                isRecovering={isRetrying}
                onRetry={onRetry}
              />
            </div>
          )}
        </div>
      )}

      {/* Expandable Advanced Technical Details */}
      <div className="border border-border/60 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 text-xs font-semibold text-foreground transition-colors"
        >
          <span className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Advanced Technical Details & NLI Scores</span>
          </span>
          {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {showAdvanced && (
          <div className="p-4 border-t border-border/40 space-y-3 text-xs font-mono">
            {/* Note on NLI scores */}
            <div className="p-2.5 rounded bg-muted/40 border border-border/40 flex items-start gap-2 text-[11px] text-muted-foreground font-sans leading-relaxed">
              <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                NLI scores describe alignment between claim and evidence. They are not truth probabilities.
              </span>
            </div>

            {/* Score Bars */}
            {claim.verification?.scores && (
              <div className="space-y-2 pt-1 font-sans">
                <div className="text-[11px] font-mono uppercase text-muted-foreground">
                  DeBERTa-v3 Cross-Encoder Distribution
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">Entailment</span>
                    <span className="font-mono text-[11px]">
                      {(claim.verification.scores.entailment * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${claim.verification.scores.entailment * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-amber-700 dark:text-amber-400 font-medium">Neutral</span>
                    <span className="font-mono text-[11px]">
                      {(claim.verification.scores.neutral * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${claim.verification.scores.neutral * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-rose-700 dark:text-rose-400 font-medium">Contradiction</span>
                    <span className="font-mono text-[11px]">
                      {(claim.verification.scores.contradiction * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full"
                      style={{ width: `${claim.verification.scores.contradiction * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Identifiers */}
            <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-muted-foreground">Model Version:</span>
                <p className="text-foreground truncate">
                  {claim.verification?.modelVersion || 'groundguard-deberta-v1-finetuned'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">M1 Label:</span>
                <p className="text-foreground uppercase">
                  {claim.verification?.label || status}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Claim ID:</span>
                <p className="text-foreground select-all break-all">{claim.claimId}</p>
              </div>
              {generationId && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Generation ID:</span>
                  <p className="text-foreground select-all break-all">{generationId}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
