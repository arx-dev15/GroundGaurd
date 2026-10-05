'use client';

import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  FileText,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Play,
  RotateCw,
} from 'lucide-react';
import { StatusBadge } from '@/components/trust/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { transitions } from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface HeroDemoProps {
  initialMode?: 'verify' | 'recover';
  className?: string;
}

type AutoPlayStep = 'idle' | 'retrieving' | 'evidence_resolved' | 'claim_ready' | 'verifying' | 'completed';

export function HeroDemo({
  initialMode = 'verify',
  className,
}: HeroDemoProps) {
  const [mode, setMode] = React.useState<'verify' | 'recover'>(initialMode);
  const [autoStep, setAutoStep] = React.useState<AutoPlayStep>('idle');
  const [hasCompletedAutoPlay, setHasCompletedAutoPlay] = React.useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Run the one-time automatic demo sequence on mount
  React.useEffect(() => {
    if (shouldReduceMotion) {
      setAutoStep('completed');
      setHasCompletedAutoPlay(true);
      return;
    }

    if (hasCompletedAutoPlay) return;

    // Sequence timing: 1. retrieving -> 2. evidence -> 3. claim -> 4. verifying -> 5. completed
    const t1 = setTimeout(() => setAutoStep('retrieving'), 400);
    const t2 = setTimeout(() => setAutoStep('evidence_resolved'), 1200);
    const t3 = setTimeout(() => setAutoStep('claim_ready'), 2000);
    const t4 = setTimeout(() => setAutoStep('verifying'), 2700);
    const t5 = setTimeout(() => {
      setAutoStep('completed');
      setHasCompletedAutoPlay(true);
    }, 3400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [hasCompletedAutoPlay, shouldReduceMotion]);

  const handleReplay = () => {
    setMode('verify');
    setAutoStep('retrieving');
    setTimeout(() => setAutoStep('evidence_resolved'), 800);
    setTimeout(() => setAutoStep('claim_ready'), 1500);
    setTimeout(() => setAutoStep('verifying'), 2100);
    setTimeout(() => setAutoStep('completed'), 2800);
  };

  const isStepAtLeast = (step: AutoPlayStep) => {
    if (autoStep === 'completed' || hasCompletedAutoPlay) return true;
    const order: AutoPlayStep[] = ['idle', 'retrieving', 'evidence_resolved', 'claim_ready', 'verifying', 'completed'];
    return order.indexOf(autoStep) >= order.indexOf(step);
  };

  return (
    <div
      id="hero-demo-section"
      className={cn(
        'w-full max-w-xl mx-auto rounded-xl border border-border/80 bg-card/80 backdrop-blur-md p-5 sm:p-6 shadow-xl shadow-black/5 text-left transition-all duration-200 select-none hover:border-border',
        className
      )}
      role="region"
      aria-label="Interactive EvideX AI verification demonstration"
    >
      {/* Top Header / Mode Switcher */}
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-status-verified animate-subtle-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
            Interactive Product Preview
          </span>
        </div>

        {/* Mode Toggle Pills */}
        <div className="inline-flex items-center gap-1">
          <div className="inline-flex p-0.5 rounded-lg border border-border/70 bg-secondary/50">
            <button
              type="button"
              onClick={() => {
                setMode('verify');
                setAutoStep('completed');
              }}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                mode === 'verify'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Verification
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('recover');
                setAutoStep('completed');
              }}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5',
                mode === 'recover'
                  ? 'bg-card text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span>Recovery</span>
              <span className="h-1.5 w-1.5 rounded-full bg-status-recovered" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleReplay}
            title="Replay verification sequence"
            aria-label="Replay verification sequence"
            className="p-1.5 rounded-md border border-border/60 hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'verify' ? (
          <div className="space-y-3.5">
            {/* Step 1: User Question */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                Inquiry
              </span>
              <p className="text-xs sm:text-sm font-medium text-foreground">
                “What policy applies to project milestone adjustments?”
              </p>
            </div>

            {/* Step 2: Retrieved Evidence Anchor */}
            {autoStep === 'retrieving' ? (
              <div className="p-3.5 rounded-lg bg-secondary/30 border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-44" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ) : isStepAtLeast('evidence_resolved') ? (
              <motion.div
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={transitions.micro}
                className="p-3 rounded-lg bg-secondary/40 border border-border/60 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Operational Guidelines · Section 4.2</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground/80">source / 02</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed italic font-serif">
                  “...Milestone revisions extending beyond fourteen business days require secondary authorization from the operations committee.”
                </p>
              </motion.div>
            ) : null}

            {/* Step 3: Verified Claim */}
            {isStepAtLeast('claim_ready') && (
              <motion.div
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={transitions.normal}
                className="p-3.5 rounded-lg bg-card border border-status-verified-border/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Extracted Grounded Claim
                  </span>
                  {autoStep === 'verifying' ? (
                    <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-status-pending animate-ping" />
                      Checking entailment…
                    </span>
                  ) : (
                    <StatusBadge status="verified" size="sm" />
                  )}
                </div>
                <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
                  Schedule revisions exceeding fourteen business days require formal secondary authorization.
                </p>
                {isStepAtLeast('completed') && (
                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                    <span className="flex items-center gap-1 text-status-verified-foreground font-medium">
                      <ShieldCheck className="h-3 w-3 text-status-verified" />
                      Provenance verified
                    </span>
                    <span>grounding score: 0.98</span>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        ) : (
          <motion.div
            key="recover-mode"
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
            transition={transitions.micro}
            className="space-y-3.5"
          >
            {/* Step 1: User Question */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                Inquiry
              </span>
              <p className="text-xs sm:text-sm font-medium text-foreground">
                “Can team leads approve schedule extensions unconditionally?”
              </p>
            </div>

            {/* Step 2: Intercepted Contradiction */}
            <div className="p-3 rounded-lg bg-status-flagged-bg/60 border border-status-flagged-border/60 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-status-flagged-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Candidate Intercepted Before Delivery</span>
                </div>
                <StatusBadge status="flagged" size="sm" />
              </div>
              <p className="text-xs text-status-flagged-foreground/80 line-through">
                “Team leads may approve schedule extensions of any duration without further signoff.”
              </p>
              <p className="text-[10px] text-status-flagged-foreground/90 font-mono">
                Mismatch: Contradicts Section 4.2 limit on unreviewed extensions
              </p>
            </div>

            {/* Step 3: Autonomous Repaired Claim */}
            <div className="p-3.5 rounded-lg bg-card border border-status-recovered-border/70 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <RotateCcw className="h-3.5 w-3.5 text-status-recovered" />
                  <span>Autonomous Claim Recovery</span>
                </div>
                <StatusBadge status="recovered" size="sm" />
              </div>
              <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
                Leads can approve extensions under 14 days independently; longer extensions require secondary authorization.
              </p>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span className="flex items-center gap-1 text-status-recovered-foreground font-medium">
                  <CheckCircle2 className="h-3 w-3 text-status-recovered" />
                  Repaired via Addendum C · Rev. 2
                </span>
                <span>status: recovered</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
