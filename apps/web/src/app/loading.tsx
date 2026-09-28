import { OverviewSkeleton } from '@/components/feedback/skeletons';

export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border/60">
        <div className="space-y-1">
          <div className="h-6 w-48 rounded bg-muted/60 animate-subtle-pulse" />
          <div className="h-4 w-72 rounded bg-muted/40 animate-subtle-pulse" />
        </div>
      </div>
      <OverviewSkeleton />
    </div>
  );
}
