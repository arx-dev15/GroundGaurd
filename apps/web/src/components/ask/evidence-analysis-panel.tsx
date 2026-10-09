'use client';

import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, FileSearch, FileText, ListChecks, PenLine, RotateCcw, ShieldCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Live progress for an in-flight Ask, driven ONLY by real SSE events from M3 (see lib/ask-progress.ts).
 * No percentages, no estimated completion times, no stage is shown finished before its event arrives, and no
 * stage completion is styled as a verification verdict (stage checks are neutral, never green).
 */
import type { AskProgress } from '@/lib/ask-progress';
export { applyAskEvent, initialAskProgress, type AskProgress } from '@/lib/ask-progress';

type StageState = 'pending' | 'active' | 'done';

function StageIndicator({ state, reduce }: { state: StageState; reduce: boolean }) {
  return (
    <span
      className={cn(
        'relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300',
        state === 'done' && 'border-foreground/25 bg-foreground/[0.06] text-foreground',
        state === 'active' && 'border-foreground/40 text-foreground',
        state === 'pending' && 'border-border text-muted-foreground/40'
      )}
      aria-hidden="true"
    >
      {state === 'active' && !reduce && (
        <motion.span
          className="absolute inset-0 rounded-full border border-foreground/30"
          animate={{ scale: [1, 1.45], opacity: [0.55, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <AnimatePresence mode="wait" initial={false}>
        {state === 'done' ? (
          <motion.span
            key="done"
            initial={reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 28 }}
          >
            <Check className="h-3 w-3" strokeWidth={2.5} />
          </motion.span>
        ) : state === 'active' ? (
          <motion.span key="active" className="h-1.5 w-1.5 rounded-full bg-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
        ) : (
          <motion.span key="pending" className="h-1 w-1 rounded-full bg-current" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
        )}
      </AnimatePresence>
    </span>
  );
}

function Stage({
  state,
  icon: Icon,
  title,
  detail,
  reduce,
}: {
  state: StageState;
  icon: React.ElementType;
  title: string;
  detail?: React.ReactNode;
  reduce: boolean;
}) {
  return (
    <motion.li
      layout={!reduce}
      className="flex items-start gap-3 py-2"
      aria-current={state === 'active' ? 'step' : undefined}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <StageIndicator state={state} reduce={reduce} />
      <div className="min-w-0 flex-1">
        <div className={cn('flex items-center gap-1.5 text-sm transition-colors', state === 'pending' ? 'text-muted-foreground' : 'text-foreground')}>
          <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className={cn(state === 'active' && 'font-medium')}>{title}</span>
          <span className="sr-only">{state === 'done' ? '(finished)' : state === 'active' ? '(in progress)' : '(waiting)'}</span>
        </div>
        <AnimatePresence initial={false} mode="wait">
          {detail && (
            <motion.div
              key={typeof detail === 'string' ? detail : state}
              className="mt-0.5 text-xs text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {detail}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

export function EvidenceAnalysisPanel({ progress, compact = false }: { progress: AskProgress; compact?: boolean }) {
  const reduce = !!useReducedMotion();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - progress.submittedAt) / 1000));

  const retrieve: StageState = progress.retrievalCompleted ? 'done' : 'active';
  const draft: StageState = progress.answerCompleted ? 'done' : progress.retrievalCompleted ? 'active' : 'pending';
  const verify: StageState = progress.recoveryStarted ? 'done' : progress.answerCompleted ? 'active' : 'pending';
  const checked = progress.claimsSupported + progress.claimsNeedReview;

  const claimDetail =
    checked > 0 ? (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="tabular-nums">
          {checked} {checked === 1 ? 'claim' : 'claims'} checked so far
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--status-verified))]" aria-hidden="true" />
          {progress.claimsSupported} supported
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--status-needs-review))]" aria-hidden="true" />
          {progress.claimsNeedReview} need review
        </span>
      </span>
    ) : (
      'Matching each statement against its cited source'
    );

  return (
    <motion.div
      className="rounded-xl border border-border/60 bg-card/40 p-4"
      role="status"
      aria-live="polite"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Evidence analysis</span>
        <span className="tabular-nums normal-case tracking-normal font-normal" aria-label={`${elapsed} seconds elapsed`}>
          {elapsed}s
        </span>
      </div>
      <ol className="divide-y divide-border/30">
        {progress.planning !== 'unknown' && (
          <Stage
            reduce={reduce}
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
          reduce={reduce}
          state={retrieve}
          icon={FileSearch}
          title="Finding relevant passages"
          detail={
            progress.retrievalCompleted
              ? typeof progress.evidenceCount === 'number'
                ? `${progress.evidenceCount} ${progress.evidenceCount === 1 ? 'passage' : 'passages'} retrieved from ready project documents`
                : 'Passages retrieved'
              : 'Searching indexed project evidence'
          }
        />
        <Stage reduce={reduce} state={draft} icon={PenLine} title="Writing a grounded draft" detail="The draft stays provisional until its claims are checked" />
        <Stage reduce={reduce} state={verify} icon={ShieldCheck} title="Checking individual claims" detail={verify === 'pending' ? undefined : claimDetail} />
        {progress.recoveryStarted && (
          <Stage
            reduce={reduce}
            state={progress.recoveryCompleted ? 'done' : 'active'}
            icon={RotateCcw}
            title="Re-checking unresolved claims"
            detail={
              progress.recoveryStopReason === 'time_budget'
                ? 'Stopped at the time limit — unresolved claims stay marked Needs review'
                : progress.recoveryStopReason === 'attempt_budget'
                  ? 'Stopped at the attempt limit — unresolved claims stay marked Needs review'
                  : progress.recoveryStopReason === 'cancelled'
                    ? 'Stopped because the request was cancelled'
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
          <div className="mb-2 text-[11px] text-muted-foreground">
            Retrieved passages — candidates for the answer, not yet verified citations
          </div>
          <ul className={cn('space-y-1.5', compact && 'max-h-28 overflow-y-auto pr-1 scrollbar-thin')}>
            {progress.sources.map((s, i) => (
              <motion.li
                key={s.chunkId}
                className="rounded-lg border border-border/40 bg-background/50 px-3 py-2"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: reduce ? 0 : Math.min(i, 5) * 0.05 }}
              >
                <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
                  <FileText className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="truncate" title={s.documentName}>
                    {s.documentName}
                  </span>
                  {typeof s.pageNumber === 'number' && <span className="shrink-0 font-normal text-muted-foreground">· p. {s.pageNumber}</span>}
                </div>
                {!compact && s.excerpt && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{s.excerpt}</p>}
              </motion.li>
            ))}
          </ul>
        </div>
      )}
      {!compact && progress.retrievalCompleted && progress.sources.length === 0 && !progress.answerStarted && (
        <p className="mt-3 text-xs text-muted-foreground">Source details and citations appear with the answer.</p>
      )}
    </motion.div>
  );
}
