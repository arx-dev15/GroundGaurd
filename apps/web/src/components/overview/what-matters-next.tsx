'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import type { SuggestedNextStep } from '@/lib/overview-helpers';
import { SectionHeader } from './workspace-sections';

interface WhatMattersNextProps {
  steps: SuggestedNextStep[];
}

/** Up to three state-aware next actions (from getSuggestedNextSteps). Inactive/post-MVP items are shown disabled. */
export function WhatMattersNext({ steps }: WhatMattersNextProps) {
  const prioritizedSteps = React.useMemo(() => steps.slice(0, 3), [steps]);
  if (prioritizedSteps.length === 0) return null;

  return (
    <section aria-label="What matters next">
      <SectionHeader title="What matters next" meta="Suggested from this project’s current document and verification state" />
      <ol className="divide-y divide-border/40">
        {prioritizedSteps.map((step) => {
          const isPostMvp = step.isPostMvp || step.badge === 'POST-MVP';
          const isInactive = step.isDisabled || isPostMvp || !step.href;

          const body = (
            <>
              <span
                className={
                  isInactive
                    ? 'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 font-mono text-[11px] text-muted-foreground/60'
                    : 'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-[11px] text-foreground'
                }
                aria-hidden="true"
              >
                {step.priorityNumber}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={isInactive ? 'text-sm text-foreground/70' : 'text-sm font-medium text-foreground'}>{step.title}</span>
                  {isPostMvp ? (
                    <span className="rounded-full border border-border/70 px-1.5 py-px text-[10px] text-muted-foreground">Coming later</span>
                  ) : (
                    step.priorityLabel && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">{step.priorityLabel}</span>
                    )
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{step.description}</span>
                {step.whyExplanation && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground/80">
                    <span className="text-muted-foreground">Why: </span>
                    {step.whyExplanation}
                  </span>
                )}
              </span>
              <span className="shrink-0 self-center text-xs">
                {isInactive ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground/70">
                    <Lock className="h-3 w-3" />
                    <span className="hidden sm:inline">{step.statusLabel || 'Coming later'}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    <span className="hidden sm:inline">{step.actionLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </span>
                )}
              </span>
            </>
          );

          return (
            <li key={step.id}>
              {isInactive ? (
                <div aria-disabled="true" className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 opacity-70">
                  {body}
                </div>
              ) : (
                <Link
                  href={step.href!}
                  className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
