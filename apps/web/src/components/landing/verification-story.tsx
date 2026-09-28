'use client';

import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight, CheckCircle2, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';
import { StatusBadge } from '@/components/trust/status-badge';
import { transitions } from '@/lib/motion';
import { cn } from '@/lib/utils';

export function VerificationStory() {
  const [phase, setPhase] = React.useState<number>(1);
  const shouldReduceMotion = useReducedMotion();

  return (
    <section
      id="verification"
      className="w-full py-28 sm:py-36 px-6 bg-[#f4f6f8] dark:bg-[#151922] text-foreground border-b border-border/70 relative overflow-hidden select-none transition-colors duration-300"
    >
      <div className="max-w-5xl mx-auto flex flex-col items-center">
        {/* Section Header with Spring Pop-In */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={transitions.springPop}
          className="flex flex-col items-center text-center mb-14 space-y-3"
        >
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground px-3 py-1 rounded-full bg-secondary/80 border border-border/60">
            Precision in Action
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground font-sans">
            The Anatomy of a Recovered Claim
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl leading-relaxed">
            Observe how GroundGuard intercepts an erroneous numerical hallucination before response
            delivery and repairs the factual assertion.
          </p>
        </motion.div>

        {/* Phase Controller with Morphing Pill */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92, y: 12 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={transitions.bouncy}
          className="p-1.5 rounded-xl bg-card border border-border/80 shadow-sm flex items-center gap-1 mb-10 max-w-md w-full justify-center relative"
        >
          {[
            { id: 1, label: '1. Candidate Draft' },
            { id: 2, label: '2. Contradiction Intercepted' },
            { id: 3, label: '3. Autonomous Repair' },
          ].map((item) => {
            const isActive = phase === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPhase(item.id)}
                className={cn(
                  'px-3 sm:px-4 py-1.5 text-xs font-medium rounded-lg transition-colors duration-200 relative cursor-pointer z-10 flex-1 text-center',
                  isActive ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-verification-phase"
                    className="absolute inset-0 rounded-lg bg-secondary shadow-xs -z-10"
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  />
                )}
                <span>{item.label}</span>
              </button>
            );
          })}
        </motion.div>

        {/* Transformation Comparison Board */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Left: Evidence Truth Box */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, x: -30, scale: 0.94 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={transitions.springPop}
            whileHover={shouldReduceMotion ? {} : { y: -3, scale: 1.01 }}
            className="p-6 sm:p-7 rounded-2xl border border-border/80 bg-card/90 shadow-sm flex flex-col justify-between transition-all duration-300"
          >
            <div className="space-y-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted-foreground uppercase tracking-wider text-[11px]">
                  Verified Document Slice
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">Annual Report · Page 18</span>
              </div>
              <div className="text-xs sm:text-sm leading-relaxed text-foreground font-serif italic bg-secondary/35 p-4 rounded-xl border border-border/60">
                “...Operating expenses grew{' '}
                <motion.span
                  animate={phase >= 2 ? { scale: [1, 1.15, 1] } : {}}
                  transition={{ duration: 0.35 }}
                  className={cn(
                    'font-sans font-bold px-1.5 py-0.5 rounded transition-colors duration-300 inline-block',
                    phase >= 2
                      ? 'bg-status-verified-bg text-status-verified border border-status-verified-border'
                      : 'text-foreground'
                  )}
                >
                  28.4%
                </motion.span>{' '}
                across regional construction and infrastructure expansion...”
              </div>
            </div>
            <div className="pt-4 border-t border-border/40 text-[11px] font-mono text-muted-foreground flex items-center justify-between">
              <span>Source Status: Immutable Document Chunk</span>
              <span className="text-status-verified flex items-center gap-1 font-semibold">
                <CheckCircle2 className="h-3 w-3" /> Grounded
              </span>
            </div>
          </motion.div>

          {/* Right: Model Output & Morph Box */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, x: 30, scale: 0.94 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={transitions.springPop}
            whileHover={shouldReduceMotion ? {} : { y: -3, scale: 1.01 }}
            className={cn(
              'p-6 sm:p-7 rounded-2xl border transition-all duration-300 flex flex-col justify-between shadow-sm',
              phase === 1 && 'border-border/80 bg-card/90',
              phase === 2 && 'border-status-flagged-border/80 bg-status-flagged-bg/30 shadow-md',
              phase === 3 && 'border-status-recovered-border/80 bg-status-recovered-bg/30 shadow-md'
            )}
          >
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-muted-foreground uppercase tracking-wider text-[11px]">
                  Claim State
                </span>
                <AnimatePresence mode="wait">
                  {phase === 1 && (
                    <motion.div
                      key="badge-1"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                    >
                      <StatusBadge status="pending" size="sm" />
                    </motion.div>
                  )}
                  {phase === 2 && (
                    <motion.div
                      key="badge-2"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                    >
                      <StatusBadge status="flagged" size="sm" />
                    </motion.div>
                  )}
                  {phase === 3 && (
                    <motion.div
                      key="badge-3"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                    >
                      <StatusBadge status="recovered" size="sm" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Dynamic Claim Text Morph with Spring Transitions */}
              <div className="p-4 rounded-xl bg-card border border-border/70 min-h-[110px] flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  {phase === 1 && (
                    <motion.p
                      key="claim-phase-1"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="text-xs sm:text-sm text-foreground leading-relaxed"
                    >
                      “Operating costs increased{' '}
                      <span className="font-bold underline decoration-muted-foreground px-1">42.7%</span>{' '}
                      primarily due to regional facility expansion.”
                    </motion.p>
                  )}

                  {phase === 2 && (
                    <motion.div
                      key="claim-phase-2"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                      className="text-xs sm:text-sm leading-relaxed space-y-2"
                    >
                      <p className="text-foreground">
                        “Operating costs increased{' '}
                        <motion.span
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 0.3 }}
                          className="font-bold px-1.5 py-0.5 rounded bg-status-flagged-bg text-status-flagged line-through border border-status-flagged-border"
                        >
                          42.7%
                        </motion.span>{' '}
                        primarily due to regional facility expansion.”
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-status-flagged font-medium">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>Contradicts source evidence (found 28.4%)</span>
                      </div>
                    </motion.div>
                  )}

                  {phase === 3 && (
                    <motion.div
                      key="claim-phase-3"
                      initial={{ opacity: 0, scale: 0.92, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                      className="text-xs sm:text-sm leading-relaxed space-y-2"
                    >
                      <p className="text-foreground">
                        “Operating costs increased{' '}
                        <motion.span
                          initial={{ scale: 0.8 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                          className="font-bold px-1.5 py-0.5 rounded bg-status-recovered-bg text-status-recovered border border-status-recovered-border font-mono inline-block shadow-xs"
                        >
                          28.4%
                        </motion.span>{' '}
                        primarily due to regional facility expansion.”
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-status-recovered font-medium">
                        <Sparkles className="h-3 w-3 shrink-0" />
                        <span>Autonomously repaired from Annual Report · Page 18</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Bottom State Action & Controls */}
            <div className="pt-4 border-t border-border/40 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                <span>Label:</span>
                <span className="font-semibold text-foreground">
                  {phase === 1 && 'Evaluating...'}
                  {phase === 2 && 'Contradiction intercepted'}
                  {phase === 3 && 'Verified & recovered'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setPhase((p) => (p === 3 ? 1 : p + 1))}
                className="text-xs font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1 cursor-pointer font-sans"
              >
                <span>{phase === 3 ? 'Reset demo' : 'Advance state'}</span>
                {phase === 3 ? (
                  <RefreshCw className="h-3 w-3" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
