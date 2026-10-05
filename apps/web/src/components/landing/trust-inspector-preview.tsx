'use client';

import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Sliders,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Layers,
  Sparkles,
  Bookmark,
  X,
} from 'lucide-react';
import { StatusBadge } from '@/components/trust/status-badge';
import { Button } from '@/components/ui/button';
import { transitions } from '@/lib/motion';
import { cn } from '@/lib/utils';

export function TrustInspectorPreview() {
  const [inspectorOpen, setInspectorOpen] = React.useState<boolean>(true);
  const [showAdvanced, setShowAdvanced] = React.useState<boolean>(false);
  const [citationHovered, setCitationHovered] = React.useState<boolean>(false);
  const shouldReduceMotion = useReducedMotion();

  return (
    <section
      id="inspector"
      className="w-full py-28 sm:py-36 px-6 border-b border-border/60 bg-background select-none transition-colors duration-300"
    >
      <div className="max-w-6xl mx-auto">
        {/* Section Header with Spring Pop-In */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={transitions.springPop}
          className="flex flex-col items-center text-center mb-16 space-y-3"
        >
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground px-3 py-1 rounded-full bg-secondary/80 border border-border/60">
            Progressive Disclosure
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground font-sans">
            Trust Without Cognitive Complexity
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl leading-relaxed">
            Normal users get clean, readable answers with verifiable citations. Reviewers and
            developers slide out the inspector to examine deep NLI distributions on demand.
          </p>
        </motion.div>

        {/* Dynamic Progressive Inspector Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-5xl mx-auto">
          {/* Main Answer Card (expands or shares space with inspector) */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 24, scale: 0.96 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={transitions.springPop}
            className={cn(
              'rounded-2xl border border-border/80 bg-card/85 backdrop-blur-md p-6 sm:p-8 shadow-lg shadow-black/5 transition-all duration-300 flex flex-col justify-between min-h-[380px]',
              inspectorOpen ? 'lg:col-span-7' : 'lg:col-span-12'
            )}
          >
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Grounded Response
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status="verified" size="sm" />
                  {!inspectorOpen && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInspectorOpen(true)}
                      className="text-xs h-7 px-2.5 gap-1.5 cursor-pointer hover:bg-secondary/60"
                    >
                      <Sliders className="h-3 w-3" />
                      <span>Inspect</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Answer Text with Interactive Claim Chips */}
              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground font-sans">
                  Regional Operating Expenditure Analysis
                </h3>
                <p className="text-sm text-foreground/90 leading-relaxed font-sans">
                  Operating costs increased 28.4% primarily due to regional facility expansion{' '}
                  {/* Interactive Citation with Hover Preview */}
                  <span
                    className="relative inline-block"
                    onMouseEnter={() => setCitationHovered(true)}
                    onMouseLeave={() => setCitationHovered(false)}
                  >
                    <motion.button
                      type="button"
                      whileHover={shouldReduceMotion ? {} : { scale: 1.15 }}
                      onClick={() => setInspectorOpen(true)}
                      className="inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-secondary text-[11px] font-mono text-muted-foreground cursor-pointer hover:border-foreground/50 transition-colors"
                    >
                      [1]
                    </motion.button>

                    {/* Floating Source Citation Popover with Spring Pop */}
                    <AnimatePresence>
                      {citationHovered && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.92, y: 6 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.92, y: 6 }}
                          transition={transitions.bouncy}
                          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3.5 rounded-xl border border-border bg-popover shadow-2xl text-left z-30"
                        >
                          <div className="text-[11px] font-semibold text-foreground flex items-center gap-1.5 mb-1 font-mono">
                            <Bookmark className="h-3 w-3 text-status-verified" />
                            <span>Annual Report 2025 · Page 18</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-serif italic line-clamp-2 leading-relaxed">
                            “...operating expenses increased 28.4% primarily due to regional facility expansion...”
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </span>
                  . Capital reserves were re-allocated according to established limits{' '}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-secondary text-[11px] font-mono text-muted-foreground cursor-pointer">
                    [2]
                  </span>
                  .
                </p>
              </div>
            </div>

            {/* Click to inspect prompt */}
            <div className="pt-6 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-status-verified" />
                2 of 2 claims verified against immutable sources
              </span>
              {!inspectorOpen && (
                <button
                  type="button"
                  onClick={() => setInspectorOpen(true)}
                  className="font-medium text-foreground hover:underline flex items-center gap-1 cursor-pointer font-sans"
                >
                  <span>Inspect claim details</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </motion.div>

          {/* Right Column: Slide-In Contextual Inspector with Spring Pop */}
          <AnimatePresence>
            {inspectorOpen && (
              <motion.div
                initial={shouldReduceMotion ? undefined : { opacity: 0, x: 30, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, x: 30, scale: 0.95 }}
                transition={transitions.springPop}
                className="lg:col-span-5 rounded-2xl border border-border/80 bg-card p-6 shadow-xl space-y-5"
              >
                {/* Inspector Header */}
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-foreground/80" />
                    <span className="text-xs font-semibold text-foreground font-sans">
                      Contextual Inspector
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectorOpen(false)}
                    aria-label="Close inspector"
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Inspectable Claim & Evidence Passage */}
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Active Claim
                    </span>
                    <p className="text-xs font-medium text-foreground p-3 rounded-xl bg-secondary/30 border border-border/60 leading-relaxed font-sans">
                      “Operating costs increased 28.4% primarily due to regional facility expansion.”
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Anchored Source Evidence
                    </span>
                    <div className="p-3.5 rounded-xl bg-status-verified-bg/40 border border-status-verified-border/60 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="font-semibold text-foreground">Annual Report 2025 · Page 18</span>
                        <StatusBadge status="verified" size="sm" />
                      </div>
                      <p className="text-[11px] text-muted-foreground font-serif italic leading-relaxed">
                        “...operating expenses increased 28.4% primarily due to regional facility expansion...”
                      </p>
                    </div>
                  </div>
                </div>

                {/* Collapsible Advanced Technical Details with Physics Expand */}
                <div className="border-t border-border/60 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors font-sans py-1 cursor-pointer"
                  >
                    <span>Advanced Technical Details</span>
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 transition-transform duration-200',
                        showAdvanced && 'rotate-180'
                      )}
                    />
                  </button>

                  <AnimatePresence>
                    {showAdvanced && (
                      <motion.div
                        initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-2 pt-3 font-mono text-[11px]"
                      >
                        <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/50">
                          <span className="text-muted-foreground">Entailment Probability</span>
                          <span className="text-status-verified font-bold">0.982</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/50">
                          <span className="text-muted-foreground">Contradiction Probability</span>
                          <span className="text-foreground">0.012</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/50">
                          <span className="text-muted-foreground">Verification Model</span>
                          <span className="text-foreground">groundguard-deberta-v1-finetuned</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/50">
                          <span className="text-muted-foreground">Verification Latency</span>
                          <span className="text-foreground">38ms</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
