'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Compass, Lock } from 'lucide-react';
import type { SuggestedNextStep } from '@/lib/overview-helpers';

interface WhatMattersNextProps {
  steps: SuggestedNextStep[];
}

export function WhatMattersNext({ steps }: WhatMattersNextProps) {
  const router = useRouter();
  const prioritizedSteps = React.useMemo(() => steps.slice(0, 3), [steps]);

  if (prioritizedSteps.length === 0) return null;

  return (
    <div className="space-y-4 pt-2 select-none" role="region" aria-label="What matters next">
      {/* Editorial Section Title */}
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
            What matters next
          </h2>
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          State-aware prioritization
        </span>
      </div>

      {/* Prioritized Action Decisions */}
      <div className="divide-y divide-border/25">
        {prioritizedSteps.map((step) => {
          const isPostMvp = step.isPostMvp || step.badge === 'POST-MVP';
          const isInactive = step.isDisabled || isPostMvp || !step.href;

          if (isInactive) {
            return (
              <div
                key={step.id}
                role="group"
                aria-disabled="true"
                className="py-4 px-3 -mx-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 opacity-55 cursor-not-allowed select-none transition-none"
              >
                <div className="flex items-start gap-4 min-w-0">
                  <div className="h-8 w-8 rounded-full border border-border/40 bg-muted/20 flex items-center justify-center font-mono text-sm font-medium text-muted-foreground/60 shrink-0 mt-0.5">
                    {step.priorityNumber}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm sm:text-base font-medium text-foreground/85">
                        {step.title}
                      </span>
                      {isPostMvp ? (
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-muted-foreground/90 font-semibold">
                          POST-MVP
                        </span>
                      ) : (
                        step.priorityLabel && (
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
                            · {step.priorityLabel}
                          </span>
                        )
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground/85 leading-relaxed">
                      {step.description}
                    </p>
                    {step.whyExplanation && (
                      <p className="text-xs text-muted-foreground/75 flex items-baseline gap-1.5 pt-0.5">
                        <span className="font-medium text-muted-foreground/90">Why:</span>
                        <span>{step.whyExplanation}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-mono text-muted-foreground/70 shrink-0 self-start sm:self-center pl-12 sm:pl-0">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span>{step.statusLabel || 'Coming later'}</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={step.id}
              onClick={() => step.href && router.push(step.href)}
              className="group py-4 px-3 -mx-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-card/50 transition-all duration-150 cursor-pointer"
            >
              <div className="flex items-start gap-4 min-w-0">
                <div className="h-8 w-8 rounded-full border border-primary/30 bg-primary/10 flex items-center justify-center font-mono text-sm font-bold text-primary shrink-0 mt-0.5">
                  {step.priorityNumber}
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm sm:text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                      {step.title}
                    </span>
                    {step.priorityLabel && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80">
                        · {step.priorityLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                  {step.whyExplanation && (
                    <p className="text-xs text-muted-foreground/85 flex items-baseline gap-1.5 pt-0.5">
                      <span className="font-medium text-foreground/75">Why:</span>
                      <span>{step.whyExplanation}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-primary shrink-0 self-start sm:self-center pl-12 sm:pl-0 group-hover:underline">
                <span>{step.actionLabel}</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1.5" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
