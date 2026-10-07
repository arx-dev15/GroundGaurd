'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Compass,
  AlertTriangle,
  UploadCloud,
  MessageSquareCode,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SuggestedNextStep } from '@/lib/overview-helpers';

interface SuggestedNextStepsProps {
  steps: SuggestedNextStep[];
}

export function SuggestedNextSteps({ steps }: SuggestedNextStepsProps) {
  const router = useRouter();

  if (steps.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
          <Compass className="h-3.5 w-3.5 text-primary" />
          <span>Suggested Next Steps</span>
        </h2>
        <span className="text-[11px] text-muted-foreground font-mono">
          State-Guided Recommendations
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {steps.map((step) => (
          <div
            key={step.id}
            onClick={() => step.href && router.push(step.href)}
            className="group relative flex flex-col justify-between p-4 rounded-xl border border-border/70 bg-card/40 hover:bg-card/70 hover:border-primary/30 transition-all cursor-pointer backdrop-blur-xs shadow-xs"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  {step.title}
                </span>
                {step.badge && (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono py-0 px-1.5 border-status-needs-review/40 text-status-needs-review bg-status-needs-review/5"
                  >
                    {step.badge}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </div>

            <div className="pt-3 mt-2 border-t border-border/40 flex items-center justify-between text-xs font-medium text-primary">
              <span>{step.actionLabel}</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
