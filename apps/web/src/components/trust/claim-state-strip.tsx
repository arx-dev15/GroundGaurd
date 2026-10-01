import * as React from 'react';
import type { Claim, ClaimStatus } from '@groundguard/types';
import { cn } from '@/lib/utils';
import { Check, RotateCcw, AlertTriangle, HelpCircle, Loader2 } from 'lucide-react';

interface ClaimStateStripProps {
  claims?: Claim[];
  statuses?: ClaimStatus[];
  showCounts?: boolean;
  size?: 'sm' | 'default' | 'lg';
  maxVisible?: number;
  className?: string;
  onClaimClick?: (index: number, claim?: Claim) => void;
}

const STATE_ICONS: Record<
  ClaimStatus,
  {
    icon: React.ComponentType<{ className?: string }>;
    dotColor: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
    label: string;
    symbol: string;
  }
> = {
  verified: {
    icon: Check,
    dotColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-500/15',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    borderColor: 'border-emerald-500/30',
    label: 'Verified',
    symbol: '●',
  },
  recovered: {
    icon: RotateCcw,
    dotColor: 'bg-blue-500',
    bgColor: 'bg-blue-500/15',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-500/30',
    label: 'Recovered',
    symbol: '●',
  },
  flagged: {
    icon: AlertTriangle,
    dotColor: 'bg-rose-500',
    bgColor: 'bg-rose-500/15',
    textColor: 'text-rose-700 dark:text-rose-300',
    borderColor: 'border-rose-500/30',
    label: 'Contradicted',
    symbol: '⚠',
  },
  needs_review: {
    icon: HelpCircle,
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-500/15',
    textColor: 'text-amber-700 dark:text-amber-300',
    borderColor: 'border-amber-500/30',
    label: 'Needs review',
    symbol: '?',
  },
  pending: {
    icon: Loader2,
    dotColor: 'bg-muted-foreground/50',
    bgColor: 'bg-muted/40',
    textColor: 'text-muted-foreground',
    borderColor: 'border-border/60',
    label: 'Pending',
    symbol: '○',
  },
};

export function ClaimStateStrip({
  claims,
  statuses,
  showCounts = false,
  size = 'default',
  maxVisible = 12,
  className,
  onClaimClick,
}: ClaimStateStripProps) {
  const claimList: Array<{ status: ClaimStatus; claim?: Claim; index: number }> = React.useMemo(() => {
    if (claims && claims.length > 0) {
      return claims.map((c, i) => ({ status: c.status, claim: c, index: i }));
    }
    if (statuses && statuses.length > 0) {
      return statuses.map((s, i) => ({ status: s, index: i }));
    }
    return [];
  }, [claims, statuses]);

  if (claimList.length === 0) {
    return null;
  }

  const counts = claimList.reduce(
    (acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    },
    {} as Record<ClaimStatus, number>
  );

  const visibleItems = claimList.slice(0, maxVisible);
  const remainingCount = claimList.length - maxVisible;

  const dotSize =
    size === 'sm'
      ? 'w-2 h-2'
      : size === 'lg'
      ? 'w-3 h-3'
      : 'w-2.5 h-2.5';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Dot / Pill Strip */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {visibleItems.map(({ status, claim, index }) => {
          const cfg = STATE_ICONS[status] || STATE_ICONS.pending;
          const isClickable = Boolean(onClaimClick);

          return (
            <button
              key={claim?.claimId || `claim-${index}`}
              type="button"
              disabled={!isClickable}
              onClick={() => onClaimClick?.(index, claim)}
              title={`${cfg.label}: ${claim?.text ? `"${claim.text}"` : `Claim ${index + 1}`}`}
              className={cn(
                'group relative flex items-center justify-center rounded-full transition-transform',
                dotSize,
                cfg.dotColor,
                isClickable && 'hover:scale-125 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-ring'
              )}
              aria-label={`Claim ${index + 1}: ${cfg.label}`}
            >
              <span className="sr-only">{cfg.label}</span>
            </button>
          );
        })}

        {remainingCount > 0 && (
          <span className="text-[10px] text-muted-foreground font-mono font-medium pl-0.5">
            +{remainingCount}
          </span>
        )}
      </div>

      {/* Aggregate Counts Legend */}
      {showCounts && (
        <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground font-mono flex-wrap">
          {counts.verified ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              {counts.verified} verified
            </span>
          ) : null}
          {counts.recovered ? (
            <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
              {counts.recovered} recovered
            </span>
          ) : null}
          {counts.needs_review ? (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
              {counts.needs_review} need review
            </span>
          ) : null}
          {counts.flagged ? (
            <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
              {counts.flagged} contradicted
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
