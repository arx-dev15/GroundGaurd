'use client';

import * as React from 'react';
import { ErrorFallback } from '@/components/feedback/error-boundary';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Log exception to console in development
    console.error('Unhandled route error in GroundGuard web:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <ErrorFallback
        error={error}
        reset={reset}
        title="Application error"
        description="The application encountered an unexpected state. You can safely retry this operation without losing your workspace state."
      />
    </div>
  );
}
