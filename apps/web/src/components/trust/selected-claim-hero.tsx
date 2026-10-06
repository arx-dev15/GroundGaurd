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
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Info,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './status-badge';
import { RecoveryPlayback } from './recovery-playback';
import { parseComparisonSegments } from '@/lib/highlight-utils';
import { CLAIM_STATE_CONFIG } from '@/lib/trust-utils';
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
  layoutMode?: 'stacked' | 'side-by-side' | 'auto';
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
  layoutMode = 'stacked',
  onOpenSource,
  onOpenAnswer,
  className,
}: SelectedClaimHeroProps) {
  const [showFullEvidence, setShowFullEvidence] = React.useState(false);
  const status = claim.status || 'pending';
  const isContradiction = status === 'flagged';
  const isRecovered = status === 'recovered';
  const isEligibleForRetry = status === 'flagged' || status === 'needs_review';

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

  // Deterministic user-facing verification explanation (fully readable, no ellipsis)
  const getVerificationExplanation = () => {
    switch (status) {
      case 'verified':
        return 'Project evidence supports this claim.';
      case 'flagged':
        return 'Project evidence conflicts with this claim.';
      case 'needs_review':
        return 'EVIDEX could not find enough evidence to verify this claim.';
      case 'recovered':
        return 'Repaired and successfully reverified against project evidence.';
      default:
        return 'Evaluating claim against project evidence...';
    }
  };

  const docName =
    (primaryEvidence as any)?.filename ||
    (primaryEvidence as any)?.metadata?.filename ||
    primaryEvidence?.documentId ||
    'Project Document';
  const pageNumber = primaryEvidence?.pageNumber ?? (primaryEvidence as any)?.metadata?.pageNumber;
  const modelVersion = claim.verification?.modelVersion || 'groundguard-deberta-v1-finetuned';

  const isLongEvidence = evidenceText.length > 380;
  const displayedEvidenceSegments = React.useMemo(() => {
    if (!isLongEvidence || showFullEvidence) return evidenceSegments;
    let count = 0;
    const truncated: typeof evidenceSegments = [];
    for (const seg of evidenceSegments) {
      if (count + seg.text.length <= 350) {
        truncated.push(seg);
        count += seg.text.length;
      } else {
        const remaining = 350 - count;
        if (remaining > 0) {
          truncated.push({ ...seg, text: seg.text.slice(0, remaining) + '…' });
        }
        break;
      }
    }
    return truncated;
  }, [evidenceSegments, isLongEvidence, showFullEvidence]);

  return (
    <div className={cn('space-y-6 select-none font-sans w-full max-w-full overflow-x-hidden min-w-0', className)}>
      {/* ============================================================ */}
      {/* 1. Status Explanation & Secondary Actions (Sections 9 & 10)  */}
      {/* ============================================================ */}
      <div className="space-y-2 pb-3 border-b border-border/40">
        {/* Full readable explanation - never truncated */}
        <p className="text-xs text-foreground font-medium leading-relaxed break-words">
          {getVerificationExplanation()}
        </p>

        {/* Quiet metadata & action row (Section 8: low contrast, doesn't compete with explanation) */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground/80 pt-0.5">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            {claim.ordinal != null && (
              <span className="font-sans text-muted-foreground/70 shrink-0">
                Claim #{claim.ordinal + 1}
              </span>
            )}
            {primaryEvidence?.documentId && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <Link
                  href={`/projects/${projectId}/knowledge/${primaryEvidence.documentId}`}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 truncate transition-colors"
                >
                  <span>Source document</span>
                  <span className="text-[10px] opacity-70">↗</span>
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenAnswer && (
              <button
                type="button"
                onClick={onOpenAnswer}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors text-[11px] hover:underline"
                title="View in conversation"
              >
                <span>In answer</span>
                <span className="text-[10px] opacity-70">→</span>
              </button>
            )}

            {isEligibleForRetry && onRetry && recoveryAttempts.length < 2 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onRetry}
                disabled={isRetrying}
                className="h-5 text-[11px] gap-1 px-1.5 text-muted-foreground hover:text-foreground"
              >
                {isRetrying ? (
                  <>
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    <span>Recovering...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-2.5 w-2.5" />
                    <span>Retry</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. Full-Width Claim Section                                  */}
      {/* ============================================================ */}
      <section aria-label="Claim text" className="space-y-1.5">
        <div className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase">
          Claim
        </div>

        <div className="text-sm text-foreground font-normal leading-relaxed select-text break-words">
          {claimSegments.map((seg, i) => (
            <span
              key={i}
              className={cn(
                seg.isMatch && 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-medium px-1 py-0.5 rounded',
                seg.isConflict && 'bg-rose-500/15 text-rose-800 dark:text-rose-300 font-medium px-1 py-0.5 rounded underline decoration-rose-500'
              )}
            >
              {seg.text}
            </span>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. Supporting Evidence Hierarchy (Sections 11 & 12)          */}
      {/* ============================================================ */}
      <section aria-label="Supporting evidence" className="space-y-2 pt-2 border-t border-border/40">
        <div className="flex items-center justify-between text-xs gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase">
            Supporting evidence
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {docName} {pageNumber ? `· Page ${pageNumber}` : ''}
          </span>
        </div>

        {/* Evidence text with natural line height and quote border */}
        <div className="text-sm text-foreground/90 leading-relaxed select-text pl-3 border-l-2 border-border/70 italic font-serif break-words">
          {evidenceText ? (
            <>
              &ldquo;
              {displayedEvidenceSegments.map((seg, i) => (
                <span
                  key={i}
                  className={cn(
                    'font-sans not-italic',
                    seg.isMatch && 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-medium px-1 py-0.5 rounded',
                    seg.isConflict && 'bg-rose-500/15 text-rose-800 dark:text-rose-300 font-medium px-1 py-0.5 rounded underline decoration-rose-500'
                  )}
                >
                  {seg.text}
                </span>
              ))}
              &rdquo;
            </>
          ) : (
            <span className="text-muted-foreground italic font-sans not-italic text-xs">
              No supporting evidence passage is attached to this claim.
            </span>
          )}
        </div>

        {isLongEvidence && (
          <button
            type="button"
            onClick={() => setShowFullEvidence(!showFullEvidence)}
            className="text-xs text-primary hover:underline font-sans font-medium pt-0.5"
          >
            {showFullEvidence ? 'Show excerpt' : 'Show full passage'}
          </button>
        )}

        {/* Lower contrast technical identifier */}
        {primaryEvidence?.chunkId && (
          <div className="text-[11px] font-mono text-muted-foreground/60 pt-0.5 truncate max-w-full" title={primaryEvidence.chunkId}>
            Chunk: {primaryEvidence.chunkId}
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* 4. Verification Signals (Section 13)                          */}
      {/* ============================================================ */}
      {claim.verification?.scores && (
        <section aria-label="Verification signals" className="space-y-3 pt-3 border-t border-border/40">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase shrink-0">
              Verification signals
            </span>
            <span
              className="font-mono text-[11px] text-muted-foreground/70 truncate max-w-[200px]"
              title={modelVersion}
            >
              {modelVersion}
            </span>
          </div>

          <div className="space-y-2 pt-1 font-sans">
            {/* Entailment */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground font-medium">Entailment</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {(claim.verification.scores.entailment * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, claim.verification.scores.entailment * 100))}%` }}
                />
              </div>
            </div>

            {/* Neutral */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground font-medium">Neutral</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {(claim.verification.scores.neutral * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, claim.verification.scores.neutral * 100))}%` }}
                />
              </div>
            </div>

            {/* Contradiction */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground font-medium">Contradiction</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {(claim.verification.scores.contradiction * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, claim.verification.scores.contradiction * 100))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Exact required disclaimer */}
          <p className="text-[11px] text-muted-foreground/80 leading-normal pt-1 flex items-center gap-1.5">
            <Info className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            <span>Model signal distribution — not a truth probability.</span>
          </p>
        </section>
      )}

      {/* ============================================================ */}
      {/* 5. Compact Recovery Summary (Section 10)                     */}
      {/* ============================================================ */}
      {status === 'recovered' ? (
        <section aria-label="Recovery summary" className="pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
          <span className="text-foreground/90 font-medium">
            Recovered and successfully reverified
          </span>
          <span className="text-[11px] text-muted-foreground font-mono">
            Verified revision active
          </span>
        </section>
      ) : (status === 'needs_review' || status === 'flagged') && recoveryAttempts.length >= 2 ? (
        <section aria-label="Recovery summary" className="pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            Recovery attempts exhausted
          </span>
          <span className="text-[11px] text-muted-foreground font-mono">
            Human review required
          </span>
        </section>
      ) : null}
    </div>
  );
}
