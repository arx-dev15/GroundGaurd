'use client';

import * as React from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset?: () => void;
  title?: string;
  description?: string;
}

/**
 * Calm, professional error fallback.
 * User copy is reassuring and clear; technical exception details are collapsed by default.
 */
export function ErrorFallback({
  error,
  reset,
  title = 'Something unexpected occurred',
  description = 'We encountered an error while processing this view. Your saved data is intact.',
}: ErrorFallbackProps) {
  const [showTechnicalDetails, setShowTechnicalDetails] = React.useState(false);

  return (
    <div
      className="p-8 max-w-lg mx-auto my-12 border border-border/80 rounded-lg bg-card/60 shadow-sm text-center"
      role="alert"
    >
      <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-status-flagged-bg border border-status-flagged-border text-status-flagged-foreground mb-4">
        <AlertTriangle className="h-5 w-5" />
      </div>

      <h2 className="text-base font-semibold text-foreground mb-1.5">{title}</h2>
      <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
        {description}
      </p>

      {reset && (
        <div className="flex items-center justify-center gap-3 mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => reset()}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      )}

      <div className="border-t border-border/60 pt-4 text-left">
        <button
          type="button"
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          {showTechnicalDetails ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <span>Technical diagnostic details</span>
        </button>

        {showTechnicalDetails && (
          <div className="mt-2 p-3 bg-secondary/50 rounded border border-border/50 text-[11px] font-mono text-muted-foreground overflow-x-auto space-y-1">
            <p className="text-status-flagged-foreground font-semibold">
              {error.name}: {error.message}
            </p>
            {error.digest && <p>Digest: {error.digest}</p>}
            {error.stack && (
              <pre className="text-[10px] opacity-80 whitespace-pre-wrap pt-2 leading-tight">
                {error.stack}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
