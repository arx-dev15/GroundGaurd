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
  onSelectClaim: (claim: Claim) => void;
  isEvidenceLens?: boolean;
  className?: string;
}

const RAIL_STATUS_MAP: Record<
  ClaimStatus,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    dotClass: string;
    borderClass: string;
  }
> = {
  verified: {
    label: 'Verified Claim',
    icon: CheckCircle2,
    dotClass: 'bg-emerald-500 text-emerald-50 border-emerald-600 dark:bg-emerald-600 dark:border-emerald-500',
    borderClass: 'border-emerald-500/30 dark:border-emerald-500/40',
  },
  recovered: {
    label: 'Recovered Claim',
    icon: RotateCcw,
    dotClass: 'bg-blue-500 text-blue-50 border-blue-600 dark:bg-blue-600 dark:border-blue-500',
    borderClass: 'border-blue-500/30 dark:border-blue-500/40',
  },
  flagged: {
    label: 'Flagged Contradiction',
    icon: AlertTriangle,
    dotClass: 'bg-rose-500 text-rose-50 border-rose-600 dark:bg-rose-600 dark:border-rose-500',
    borderClass: 'border-rose-500/30 dark:border-rose-500/40',
  },
  needs_review: {
    label: 'Needs Review',
    icon: HelpCircle,
    dotClass: 'bg-amber-500 text-amber-50 border-amber-600 dark:bg-amber-600 dark:border-amber-500',
    borderClass: 'border-amber-500/30 dark:border-amber-500/40',
  },
  pending: {
    label: 'Pending Verification',
    icon: Clock,
    dotClass: 'bg-muted-foreground text-background border-border',
    borderClass: 'border-border/40',
  },
};

export function GroundingRail({
  claims,
  selectedClaimId,
  onSelectClaim,
  isEvidenceLens = false,
  className,
}: GroundingRailProps) {
  if (!claims || claims.length === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-col items-center py-2 select-none relative',
        className
      )}
      aria-label="Grounding Rail"
    >
      {/* Subtle vertical connector guide line */}
      <div className="absolute top-3 bottom-3 w-px bg-border/40" />

      <TooltipProvider delayDuration={150}>
        <div className="flex flex-col gap-3 relative z-10">
          {claims.map((claim, index) => {
            const config = RAIL_STATUS_MAP[claim.status] || RAIL_STATUS_MAP.pending;
            const Icon = config.icon;
            const isSelected = selectedClaimId === claim.claimId;

            return (
              <Tooltip key={claim.claimId || index}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSelectClaim(claim)}
                    className={cn(
                      'group relative flex items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      isSelected ? 'scale-110 shadow-sm ring-1 ring-primary/60' : 'hover:scale-105',
                      isEvidenceLens ? 'p-1' : 'p-0.5'
                    )}
                    aria-label={`Claim ${index + 1}: ${config.label}`}
                  >
                    <div
                      className={cn(
                        'w-4 h-4 rounded-full flex items-center justify-center border transition-colors shadow-2xs',
                        config.dotClass,
                        isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                      )}
                    >
                      <Icon className="w-2.5 h-2.5 shrink-0 stroke-[2.5]" />
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="left"
                  align="center"
                  className="p-2 text-xs bg-popover/95 border border-border shadow-md max-w-xs space-y-1 z-50 text-popover-foreground"
                >
                  <div className="flex items-center gap-1.5 font-medium text-[11px]">
                    <span className="font-mono text-muted-foreground">Claim #{index + 1}</span>
                    <span className="text-foreground">· {config.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                    {claim.text}
                  </p>
                  <div className="text-[9px] text-primary/80 font-mono pt-0.5">
                    Click to open Inspector
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
