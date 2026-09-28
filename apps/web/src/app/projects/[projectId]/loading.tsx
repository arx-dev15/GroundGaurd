import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Page Header Skeleton */}
      <div className="space-y-2 pb-4 border-b border-border/50">
        <Skeleton className="h-6 w-48 rounded" />
        <Skeleton className="h-4 w-96 max-w-full rounded" />
      </div>

      {/* Grid of Skeleton Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border border-border/60 bg-card/40 space-y-3">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-8 w-20 rounded" />
          <Skeleton className="h-3 w-40 rounded" />
        </div>
        <div className="p-4 rounded-lg border border-border/60 bg-card/40 space-y-3">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-8 w-20 rounded" />
          <Skeleton className="h-3 w-40 rounded" />
        </div>
        <div className="p-4 rounded-lg border border-border/60 bg-card/40 space-y-3">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-8 w-20 rounded" />
          <Skeleton className="h-3 w-40 rounded" />
        </div>
      </div>

      {/* Main Workspace Skeleton */}
      <div className="p-6 rounded-lg border border-border/60 bg-card/30 space-y-4">
        <Skeleton className="h-4 w-36 rounded" />
        <div className="space-y-2.5">
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
        </div>
      </div>
    </div>
  );
}
