'use client';

import * as React from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  HelpCircle,
  Clock,
  Layers,
  FileText,
  XCircle,
} from 'lucide-react';
import { deriveTrustSummary, type TrustSummaryData } from '@/lib/trust-utils';
import { cn } from '@/lib/utils';
import type { Claim, GenerationStatus } from '@groundguard/types';

interface TrustSummaryProps {
  claims?: Claim[];
  generationStatus?: GenerationStatus;
  className?: string;
  onClickClaimFilter?: (status: string | null) => void;
  selectedStatusFilter?: string | null;
}

export function TrustSummary({
  claims = [],
  generationStatus = 'completed',
  className,
  onClickClaimFilter,
  selectedStatusFilter,
}: TrustSummaryProps) {
  const summary: TrustSummaryData = React.useMemo(() => {
    return deriveTrustSummary(claims, generationStatus);
  }, [claims, generationStatus]);

  if (summary.totalCount === 0 && !['cancelled', 'failed'].includes(generationStatus || '')) {
    return null;
  }

  const getHeadlineIcon = () => {
    switch (summary.variant) {
      case 'success':
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case 'recovered':
        return <RotateCcw className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />;
      case 'warning':
        return <HelpCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />;
      case 'danger':
        return <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />;
      default:
        if (generationStatus === 'cancelled') {
          return <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
        }
        return <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    }
  };

  const getHeadlineClasses = () => {
    switch (summary.variant) {
      case 'success':
        return 'text-emerald-700 dark:text-emerald-300';
      case 'recovered':
        return 'text-blue-700 dark:text-blue-300';
      case 'warning':
        return 'text-amber-700 dark:text-amber-300';
      case 'danger':
        return 'text-rose-700 dark:text-rose-300';
      default:
        return 'text-foreground';
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-border/60 bg-card/40 p-2.5 sm:p-3 text-xs select-none space-y-1.5',
        className
      )}
      aria-label="Generation Trust Summary"
      role="region"
    >
      {/* Top headline line */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium">
          {getHeadlineIcon()}
          <span className={cn('text-xs font-semibold tracking-tight', getHeadlineClasses())}>
            {summary.headline}
          </span>
          <span className="text-border/80">·</span>
          <span className="text-[11px] font-mono text-muted-foreground">
            {summary.subline}
          </span>
        </div>

        {summary.sourceCount > 0 && (
          <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
            <FileText className="h-3 w-3 shrink-0" />
            <span>
              {summary.sourceCount} {summary.sourceCount === 1 ? 'source' : 'sources'}
            </span>
          </div>
        )}
      </div>

      {/* Interactive claim pills (if claims exist) */}
      {summary.totalCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 border-t border-border/30 text-[11px] font-mono">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            Claims:
          </span>

          {summary.verifiedCount > 0 && (
            <button
              type="button"
              onClick={() => onClickClaimFilter?.(selectedStatusFilter === 'verified' ? null : 'verified')}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors',
                selectedStatusFilter === 'verified'
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/50 font-medium'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15'
              )}
              title="Filter verified claims"
            >
              <CheckCircle2 className="h-2.5 w-2.5" />
              <span>{summary.verifiedCount} verified</span>
            </button>
          )}

          {summary.recoveredCount > 0 && (
            <button
              type="button"
              onClick={() => onClickClaimFilter?.(selectedStatusFilter === 'recovered' ? null : 'recovered')}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors',
                selectedStatusFilter === 'recovered'
                  ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/50 font-medium'
                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/15'
              )}
              title="Filter recovered claims"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              <span>{summary.recoveredCount} recovered</span>
            </button>
          )}

          {summary.flaggedCount > 0 && (
            <button
              type="button"
              onClick={() => onClickClaimFilter?.(selectedStatusFilter === 'flagged' ? null : 'flagged')}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors',
                selectedStatusFilter === 'flagged'
                  ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/50 font-medium'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/15'
              )}
              title="Filter flagged claims"
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              <span>{summary.flaggedCount} flagged</span>
            </button>
          )}

          {summary.reviewCount > 0 && (
            <button
              type="button"
              onClick={() => onClickClaimFilter?.(selectedStatusFilter === 'needs_review' ? null : 'needs_review')}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors',
                selectedStatusFilter === 'needs_review'
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50 font-medium'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15'
              )}
              title="Filter needs-review claims"
            >
              <HelpCircle className="h-2.5 w-2.5" />
              <span>{summary.reviewCount} needs review</span>
            </button>
          )}

          {summary.pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-muted/30 text-muted-foreground border-border/40">
              <Clock className="h-2.5 w-2.5" />
              <span>{summary.pendingCount} pending</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
