'use client';

import * as React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  HelpCircle,
  Clock,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Claim, ClaimStatus } from '@groundguard/types';

interface GroundingRailProps {
  claims: Claim[];
  selectedClaimId?: string | null;
  hoveredClaimId?: string | null;
  onSelectClaim: (claim: Claim) => void;
  onHoverClaim?: (claimId: string | null) => void;
  isEvidenceLens?: boolean;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
}

const RAIL_STATUS_MAP: Record<
  ClaimStatus,
  {
    label: string;
    friendlyLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    dotClass: string;
    borderClass: string;
  }
> = {
  verified: {
    label: 'Verified Claim',
    friendlyLabel: 'Verified',
    icon: CheckCircle2,
    dotClass: 'bg-emerald-500 text-emerald-50 border-emerald-600 dark:bg-emerald-600 dark:border-emerald-500',
    borderClass: 'border-emerald-500/30 dark:border-emerald-500/40',
  },
  recovered: {
    label: 'Recovered Claim',
    friendlyLabel: 'Recovered',
    icon: RotateCcw,
    dotClass: 'bg-blue-500 text-blue-50 border-blue-600 dark:bg-blue-600 dark:border-blue-500',
    borderClass: 'border-blue-500/30 dark:border-blue-500/40',
  },
  flagged: {
    label: 'Contradicted Claim',
    friendlyLabel: 'Contradicted',
    icon: AlertTriangle,
    dotClass: 'bg-rose-500 text-rose-50 border-rose-600 dark:bg-rose-600 dark:border-rose-500',
    borderClass: 'border-rose-500/30 dark:border-rose-500/40',
  },
  needs_review: {
    label: 'Needs Review',
    friendlyLabel: 'Needs Review',
    icon: HelpCircle,
    dotClass: 'bg-amber-500 text-amber-50 border-amber-600 dark:bg-amber-600 dark:border-amber-500',
    borderClass: 'border-amber-500/30 dark:border-amber-500/40',
  },
  pending: {
    label: 'Pending Verification',
    friendlyLabel: 'Pending',
    icon: Clock,
    dotClass: 'bg-muted-foreground text-background border-border',
    borderClass: 'border-border/40',
  },
};

export function GroundingRail({
  claims,
  selectedClaimId,
  hoveredClaimId,
  onSelectClaim,
  onHoverClaim,
  isEvidenceLens = false,
  className,
  orientation = 'vertical',
}: GroundingRailProps) {
  if (!claims || claims.length === 0) return null;

  const isVertical = orientation === 'vertical';

  return (
    <nav
      className={cn(
        'select-none relative',
        isVertical ? 'flex flex-col items-center py-2' : 'flex flex-row items-center gap-1.5 py-1',
        className
      )}
      aria-label="Grounding Verification Rail"
    >
      {/* Connector guide line in vertical mode */}
      {isVertical && (
        <div
          className="absolute top-3 bottom-3 w-px bg-border/40"
          aria-hidden="true"
        />
      )}

      <TooltipProvider delayDuration={100}>
        <div
          className={cn(
            'relative z-10',
            isVertical ? 'flex flex-col gap-3' : 'flex flex-row gap-1.5'
          )}
          role="group"
          aria-label="Claim status indicators"
        >
          {claims.map((claim, index) => {
            const config = RAIL_STATUS_MAP[claim.status] || RAIL_STATUS_MAP.pending;
            const Icon = config.icon;
            const isSelected = selectedClaimId === claim.claimId;
            const isHovered = hoveredClaimId === claim.claimId;

            return (
              <Tooltip key={claim.claimId || index}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSelectClaim(claim)}
                    onMouseEnter={() => onHoverClaim?.(claim.claimId)}
                    onMouseLeave={() => onHoverClaim?.(null)}
                    onFocus={() => onHoverClaim?.(claim.claimId)}
                    onBlur={() => onHoverClaim?.(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectClaim(claim);
                      }
                    }}
                    className={cn(
                      'group relative flex items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                      isSelected
                        ? 'scale-110 shadow-sm ring-2 ring-primary ring-offset-1 ring-offset-background'
                        : isHovered
                        ? 'scale-105 ring-1 ring-primary/60'
                        : 'hover:scale-105',
                      isEvidenceLens ? 'p-1' : 'p-0.5'
                    )}
                    aria-label={`Claim ${index + 1}: ${config.label}. Click to inspect evidence.`}
                    aria-pressed={isSelected}
                  >
                    <div
                      className={cn(
                        'w-4 h-4 rounded-full flex items-center justify-center border transition-colors shadow-2xs',
                        config.dotClass
                      )}
                    >
                      <Icon className="w-2.5 h-2.5 shrink-0 stroke-[2.5]" aria-hidden="true" />
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side={isVertical ? 'left' : 'top'}
                  align="center"
                  className="p-2 text-xs bg-popover/95 border border-border shadow-md max-w-xs space-y-1 z-50 text-popover-foreground"
                >
                  <div className="flex items-center gap-1.5 font-medium text-[11px]">
                    <span className="font-mono text-muted-foreground">Claim #{index + 1}</span>
                    <span className="text-foreground">· {config.friendlyLabel}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                    {claim.text}
                  </p>
                  <div className="text-[9px] text-primary font-mono pt-0.5">
                    Click to open Inspector
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </nav>
  );
}
