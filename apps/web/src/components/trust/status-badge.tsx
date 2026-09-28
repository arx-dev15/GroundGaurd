import * as React from 'react';
import type { ClaimStatus } from '@groundguard/types';
import { CheckCircle2, AlertTriangle, ShieldCheck, HelpCircle, Clock, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: ClaimStatus;
  showIcon?: boolean;
  size?: 'sm' | 'default';
}

const STATUS_CONFIG: Record<
  ClaimStatus,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  verified: {
    label: 'Verified',
    icon: CheckCircle2,
    className:
      'bg-status-verified-bg text-status-verified-foreground border-status-verified-border',
  },
  recovered: {
    label: 'Recovered',
    icon: RotateCcw,
    className:
      'bg-status-recovered-bg text-status-recovered-foreground border-status-recovered-border',
  },
  flagged: {
    label: 'Flagged',
    icon: AlertTriangle,
    className:
      'bg-status-flagged-bg text-status-flagged-foreground border-status-flagged-border',
  },
  needs_review: {
    label: 'Needs Review',
    icon: HelpCircle,
    className:
      'bg-status-needs_review-bg text-status-needs_review-foreground border-status-needs_review-border',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    className:
      'bg-status-pending-bg text-status-pending-foreground border-status-pending-border',
  },
};

export function StatusBadge({
  status,
  showIcon = true,
  size = 'default',
  className,
  ...props
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium border rounded-full select-none transition-colors font-mono',
        size === 'sm'
          ? 'px-2 py-0.5 text-[11px]'
          : 'px-2.5 py-1 text-xs',
        config.className,
        className
      )}
      role="status"
      aria-label={`Status: ${config.label}`}
      {...props}
    >
      {showIcon && (
        <Icon
          className={cn(
            'shrink-0',
            size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5',
            status === 'pending' && 'animate-spin [animation-duration:3s]'
          )}
          aria-hidden="true"
        />
      )}
      <span>{config.label}</span>
    </span>
  );
}
