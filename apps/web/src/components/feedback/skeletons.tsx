import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * AnswerSkeleton
 * Matches the future Ask & Answer view with claim alignment bars and citation placeholders.
 */
export function AnswerSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('space-y-4 p-6 border rounded-lg bg-card/40', className)}
      role="status"
      aria-label="Loading verified answer..."
    >
      <div className="flex items-center justify-between pb-3 border-b border-border/50">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-start gap-3">
          <Skeleton className="h-5 w-1 rounded-full shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Skeleton className="h-5 w-1 rounded-full shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Skeleton className="h-5 w-1 rounded-full shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-border/40 flex items-center gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-5 w-20 rounded-md" />
        <Skeleton className="h-5 w-24 rounded-md" />
      </div>
    </div>
  );
}

/**
 * DocumentRowSkeleton
 * Realistic document library list skeleton with varying title widths, status tags, and metadata.
 */
export function DocumentRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="divide-y divide-border/60 border rounded-lg bg-card/30 overflow-hidden"
      role="status"
      aria-label="Loading documents..."
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between p-4 gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Skeleton className="h-8 w-8 rounded-md shrink-0" />
            <div className="space-y-1.5 flex-1 min-w-0">
              <Skeleton
                className={cn(
                  'h-4',
                  i % 3 === 0 ? 'w-48' : i % 3 === 1 ? 'w-64' : 'w-56'
                )}
              />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-20 hidden sm:block" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * InspectorSkeleton
 * Matches the contextual right-side inspector layout (Claim, Status, Evidence, Source).
 */
export function InspectorSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('p-5 space-y-6 border rounded-lg bg-card/40', className)}
      role="status"
      aria-label="Loading claim inspection details..."
    >
      <div className="flex items-center justify-between pb-3 border-b border-border/50">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-14 w-full rounded-md" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <div className="p-3 border rounded-md bg-secondary/30 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <div className="flex justify-between items-center pt-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-border/40">
        <Skeleton className="h-3 w-20" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/**
 * OverviewSkeleton
 * Matches metric stat cards and recent verification stream.
 */
export function OverviewSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)} role="status" aria-label="Loading overview...">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4 border rounded-lg bg-card/40 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <DocumentRowSkeleton count={3} />
    </div>
  );
}
