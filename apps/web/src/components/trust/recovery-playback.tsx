'use client';

import * as React from 'react';
import {
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Shield,
  FileText,
  Clock,
  HelpCircle,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './status-badge';
import { CLAIM_STATE_CONFIG, formatGroundingScore } from '@/lib/trust-utils';
import { cn } from '@/lib/utils';
import type { Claim, RecoveryAttempt } from '@groundguard/types';

interface RecoveryPlaybackProps {
  claim: Claim;
  attempts?: RecoveryAttempt[];
  isRecovering?: boolean;
  onRetry?: () => void;
  className?: string;
}

export function RecoveryPlayback({
  claim,
  attempts = [],
  isRecovering = false,
  onRetry,
  className,
}: RecoveryPlaybackProps) {
  const [selectedAttemptIndex, setSelectedAttemptIndex] = React.useState<number>(0);

  const activeAttempt = attempts[selectedAttemptIndex] || attempts[attempts.length - 1] || null;
  const isRecovered = claim.status === 'recovered';
  const hasAttempts = attempts.length > 0;

  // Derive before and after text from real attempt records
  const originalText = activeAttempt?.originalText || claim.sourceText || claim.text;
  const candidateText = activeAttempt?.candidateText || (isRecovered ? claim.text : null);

  const getFailureLabel = (reason?: string) => {
    switch (reason) {
      case 'CONTRADICTION':
        return 'Contradiction Detected';
      case 'INSUFFICIENT_EVIDENCE':
        return 'Insufficient Evidence';
      case 'TECHNICAL_CONFLICT':
        return 'Technical Conflict';
      case 'ZERO_EVIDENCE':
        return 'No Evidence Found';
      default:
        return 'Verification Conflict';
    }
  };

  return (
    <div className={cn('space-y-4 rounded-xl border border-border/70 bg-card/60 p-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <RotateCcw className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-1.5">
              <span>Recovery Provenance & Playback</span>
              {isRecovered && (
                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30">
                  Recovered
                </Badge>
              )}
            </h4>
            <p className="text-[11px] text-muted-foreground">
              {hasAttempts
                ? `${attempts.length} ${attempts.length === 1 ? 'attempt' : 'attempts'} recorded in audit provenance`
                : 'Automated targeted evidence retrieval and reverification'}
            </p>
          </div>
        </div>

        {attempts.length > 1 && (
          <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg border border-border/50 text-[11px] font-mono">
            {attempts.map((att, idx) => (
              <button
                key={att.id || idx}
                type="button"
                onClick={() => setSelectedAttemptIndex(idx)}
                className={cn(
                  'px-2 py-0.5 rounded transition-colors',
                  selectedAttemptIndex === idx
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Attempt {att.attemptNumber || idx + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Signature Before / After Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* BEFORE CARD */}
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-rose-600 dark:text-rose-400 font-semibold uppercase tracking-wider">
              Before (Original Claim)
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3 w-3" />
              <span>Flagged</span>
            </span>
          </div>
          <p className="text-xs text-foreground/90 font-sans leading-relaxed line-through decoration-rose-500/50">
            {originalText}
          </p>
        </div>

        {/* AFTER CARD */}
        <div
          className={cn(
            'rounded-lg p-3 space-y-1.5 border',
            isRecovered
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-border/60 bg-muted/20'
          )}
        >
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span
              className={cn(
                'font-semibold uppercase tracking-wider',
                isRecovered ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
              )}
            >
              After (Revised Candidate)
            </span>
            {isRecovered ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                <span>Reverified</span>
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">Unresolved</span>
            )}
          </div>
          <p className="text-xs text-foreground font-sans font-medium leading-relaxed">
            {candidateText || (isRecovering ? 'Generating candidate claim...' : 'No candidate approved')}
          </p>
        </div>
      </div>

      {/* 7-Stage Observable Recovery Lifecycle */}
      <div className="space-y-2 pt-1">
        <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span>Observed Recovery Lifecycle</span>
          {activeAttempt?.attemptNumber && (
            <span>Attempt #{activeAttempt.attemptNumber}</span>
          )}
        </div>

        <ol className="relative border-l border-border/70 ml-2 space-y-3 pt-1 text-xs">
          {/* Stage 1: ORIGINAL CLAIM */}
          <li className="ml-4 space-y-0.5">
            <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground" />
            <div className="font-mono text-[10px] uppercase text-muted-foreground">1. Original Claim</div>
            <p className="text-xs text-foreground">{originalText}</p>
          </li>

          {/* Stage 2: FAILURE RESULT */}
          <li className="ml-4 space-y-0.5">
            <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-background bg-rose-500" />
            <div className="font-mono text-[10px] uppercase text-rose-600 dark:text-rose-400">
              2. Failure Diagnosed
            </div>
            <p className="text-xs text-foreground/90">
              {getFailureLabel(activeAttempt?.failureReason)}
              {activeAttempt?.verificationLabel && (
                <span className="ml-1 text-muted-foreground font-mono text-[11px]">
                  ({activeAttempt.verificationLabel})
                </span>
              )}
            </p>
          </li>

          {/* Stage 3: RECOVERY ATTEMPT */}
          <li className="ml-4 space-y-0.5">
            <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-background bg-blue-500" />
            <div className="font-mono text-[10px] uppercase text-blue-600 dark:text-blue-400">
              3. Recovery Activated
            </div>
            <p className="text-xs text-foreground/90">
              Targeted project evidence search executed (Attempt #{activeAttempt?.attemptNumber || 1})
            </p>
          </li>

          {/* Stage 4: RECOVERY EVIDENCE PROVENANCE */}
          <li className="ml-4 space-y-0.5">
            <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-background bg-blue-500" />
            <div className="font-mono text-[10px] uppercase text-blue-600 dark:text-blue-400">
              {activeAttempt?.recoveryEvidence && activeAttempt.recoveryEvidence.length > 0
                ? '4. Recovery-Specific Evidence'
                : '4. Targeted Evidence Search'}
            </div>
            {activeAttempt?.recoveryEvidence && activeAttempt.recoveryEvidence.length > 0 ? (
              <div className="text-xs text-foreground/90 space-y-1">
                <p className="font-mono text-[11px] text-muted-foreground">
                  {activeAttempt.recoveryEvidence.length} targeted chunk{activeAttempt.recoveryEvidence.length > 1 ? 's' : ''} retrieved:
                </p>
                <div className="rounded border border-blue-500/20 bg-blue-500/5 p-2 text-[11px] text-foreground/90 leading-relaxed">
                  &ldquo;{activeAttempt.recoveryEvidence[0].text}&rdquo;
                </div>
              </div>
            ) : (
              <p className="text-xs text-foreground/90 font-mono text-[11px]">
                {claim.evidence && claim.evidence.length > 0
                  ? `${claim.evidence.length} project evidence chunks evaluated`
                  : 'Targeted project document evidence searched'}
              </p>
            )}
          </li>

          {/* Stage 5: CANDIDATE CLAIM */}
          <li className="ml-4 space-y-0.5">
            <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-background bg-purple-500" />
            <div className="font-mono text-[10px] uppercase text-purple-600 dark:text-purple-400">
              5. Recovery Candidate
            </div>
            <p className="text-xs text-foreground font-medium">
              &ldquo;{candidateText || originalText}&rdquo;
            </p>
          </li>

          {/* Stage 6: M1 REVERIFICATION */}
          <li className="ml-4 space-y-0.5">
            <span
              className={cn(
                'absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-background',
                activeAttempt?.verificationLabel === 'entailment' || isRecovered
                  ? 'bg-emerald-500'
                  : 'bg-amber-500'
              )}
            />
            <div className="font-mono text-[10px] uppercase text-muted-foreground flex items-center gap-1.5">
              <span>6. M1 Re-verification</span>
              <span className="text-foreground font-semibold">
                {activeAttempt?.verificationLabel || (isRecovered ? 'entailment' : 'evaluating')}
              </span>
            </div>
            {activeAttempt?.groundingScore != null && (
              <p className="text-[11px] font-mono text-muted-foreground">
                Grounding Score: {formatGroundingScore(activeAttempt.groundingScore)} · Model: {activeAttempt.modelVersion || 'DeBERTa-v3'}
              </p>
            )}
          </li>

          {/* Stage 7: FINAL STATE */}
          <li className="ml-4 space-y-0.5">
            <span
              className={cn(
                'absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-background',
                isRecovered ? 'bg-emerald-500' : 'bg-muted-foreground'
              )}
            />
            <div className="font-mono text-[10px] uppercase text-foreground font-semibold">
              7. Final Settlement
            </div>
            <p className="text-xs text-foreground">
              {isRecovered
                ? 'Claim recovered and verified against project documentation.'
                : 'Claim requires user review (no verified revision substantiated).'}
            </p>
          </li>
        </ol>
      </div>
    </div>
  );
}
