'use client';

import * as React from 'react';
import { Check, Circle, FileSearch, FileText, ListChecks, Loader2, PenLine, RotateCcw, ShieldCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Live progress for an in-flight Ask, driven ONLY by real SSE events from M3.
 * No percentages, no estimated completion times, no stage is shown "done" before its event arrives.
 */
import type { AskProgress } from '@/lib/ask-progress';
export { applyAskEvent, initialAskProgress, type AskProgress } from '@/lib/ask-progress';

type StageState = 'pending' | 'active' | 'done';

function Stage({ state, icon: Icon, title, detail }: { state: StageState; icon: React.ElementType; title: string; detail?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-1.5" aria-current={state === 'active' ? 'step' : undefined}>
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
          state === 'done' && 'border-primary/40 bg-primary/10 text-primary',
          state === 'active' && 'border-primary/60 text-primary',
          state === 'pending' && 'border-border text-muted-foreground/50'
        )}
      >
        {state === 'done' ? <Check className="h-3 w-3" /> : state === 'active' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Circle className="h-2 w-2" />}
      </span>
      <div className="min-w-0">
        <div className={cn('flex items-center gap-1.5 text-sm', state === 'pending' ? 'text-muted-foreground' : 'text-foreground font-medium')}>
          <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span>{title}</span>
        </div>
        {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
      </div>
    </li>
  );
}

export function EvidenceAnalysisPanel({ progress, compact = false }: { progress: AskProgress; compact?: boolean }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - progress.submittedAt) / 1000));

  const retrieve: StageState = progress.retrievalCompleted ? 'done' : 'active';
  const draft: StageState = progress.answerCompleted ? 'done' : progress.retrievalCompleted ? 'active' : 'pending';
  const verify: StageState = progress.recoveryStarted ? 'done' : progress.answerCompleted ? 'active' : 'pending';
  const claimDetail =
    progress.claimsSupported + progress.claimsNeedReview > 0
      ? `${progress.claimsSupported} supported · ${progress.claimsNeedReview} need review so far`
      : 'Matching each statement against its cited source';

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm" role="status" aria-live="polite">
      <div className="mb-2 flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>Evidence analysis</span>
        <span className="tabular-nums normal-case tracking-normal">{elapsed}s elapsed</span>
      </div>
      <ol className="divide-y divide-border/30">
        {progress.planning !== 'unknown' && (
          <Stage
            state={progress.planning === 'done' ? 'done' : 'active'}
            icon={ListChecks}
            title="Understanding the question"
            detail={
              progress.planning !== 'done'
                ? 'Planning which evidence to look for'
                : progress.plannerSource === 'deterministic_fast_path'
                  ? 'Direct factual lookup (no planning model call)'
                  : progress.plannerSource === 'fallback'
                    ? 'Planned with built-in rules'
                    : 'Planned with the AI query planner'
            }
          />
        )}
        <Stage
          state={retrieve}
          icon={FileSearch}
          title="Finding relevant passages"
          detail={
            progress.retrievalCompleted
              ? typeof progress.evidenceCount === 'number'
                ? `${progress.evidenceCount} ${progress.evidenceCount === 1 ? 'passage' : 'passages'} retrieved from READY project documents`
                : 'Passages retrieved'
              : 'Searching indexed project evidence'
          }
        />
        <Stage state={draft} icon={PenLine} title="Writing a grounded draft" detail="Draft is provisional until its claims are checked" />
        <Stage state={verify} icon={ShieldCheck} title="Checking individual claims" detail={verify === 'pending' ? undefined : claimDetail} />
        {progress.recoveryStarted && (
          <Stage
            state={progress.recoveryCompleted ? 'done' : 'active'}
            icon={RotateCcw}
            title="Re-checking unresolved claims"
            detail={
              progress.recoveryStopReason === 'time_budget'
                ? 'Stopped at the time limit — unresolved claims stay marked Needs review'
                : progress.recoveryStopReason === 'attempt_budget'
                  ? 'Stopped at the attempt limit — unresolved claims stay marked Needs review'
                  : 'Searching for additional supporting evidence (bounded attempts)'
            }
          />
        )}
      </ol>
      {!compact && !progress.retrievalCompleted && (
        <div className="mt-3 space-y-2" aria-hidden="true">
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}
      {progress.sources.length > 0 && (
        <div className="mt-3 border-t border-border/40 pt-3">
          <div className="mb-1.5 text-[11px] text-muted-foreground">
            Retrieved passages — candidates being used for the answer, not yet verified citations
          </div>
          <ul className={cn('space-y-1.5', compact && 'max-h-28 overflow-y-auto pr-1')}>
            {progress.sources.map((s) => (
              <li key={s.chunkId} className="rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5">
                <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
                  <FileText className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="truncate">{s.documentName}</span>
                  {typeof s.pageNumber === 'number' && <span className="shrink-0 text-muted-foreground">· p. {s.pageNumber}</span>}
                </div>
                {!compact && s.excerpt && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.excerpt}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!compact && progress.retrievalCompleted && progress.sources.length === 0 && !progress.answerStarted && (
        <p className="mt-3 text-xs text-muted-foreground">Source details and citations appear with the answer.</p>
      )}
    </div>
  );
}
