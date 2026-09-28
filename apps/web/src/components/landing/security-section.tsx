'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck, HardDrive, Shield, Lock, KeyRound, AlertCircle, Ban } from 'lucide-react';
import { transitions } from '@/lib/motion';
import { cn } from '@/lib/utils';

const SECURITY_PILLARS = [
  {
    title: 'Project-Scoped Retrieval',
    description:
      'Queries execute strictly against index partitions keyed to the active project context, preventing cross-workspace context blending.',
    icon: HardDrive,
  },
  {
    title: 'Minimal Evidence Disclosure',
    description:
      'Only the specific evidence sentences needed for NLI verification are passed to validation stages, minimizing unnecessary context exposure.',
    icon: Shield,
  },
  {
    title: 'Controlled Processing',
    description:
      'Inference operations run within sandboxed validation stages, scoped to the session and bounded by project-level access controls.',
    icon: Lock,
  },
  {
    title: 'Content-Minimized Telemetry',
    description:
      'Operational logs record model latency, claim counts, and entailment scores while scrubbing raw source text from system diagnostics.',
    icon: KeyRound,
  },
];

export function SecuritySection() {
  const [crossAttempt, setCrossAttempt] = React.useState<boolean>(false);
  const shouldReduceMotion = useReducedMotion();

  return (
    <section
      id="security"
      className="w-full py-28 sm:py-36 px-6 border-b border-border/70 bg-background select-none transition-colors duration-300"
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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-foreground/[0.06] text-foreground/80 dark:bg-foreground/[0.08] dark:text-foreground/90">
            <span>Project Boundary Architecture</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            Project-Scoped by Design
          </h2>
          <p className="text-base text-muted-foreground max-w-xl leading-relaxed">
            Enterprise verification demands disciplined isolation. Evidence, claims, and inference
            remain strictly bounded within the project context that owns them.
          </p>
        </motion.div>

        {/* Boundary Diagram with Spring Pop */}
        <div className="max-w-4xl mx-auto mb-16">
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={transitions.springPop}
            className="p-6 sm:p-8 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm shadow-xl relative overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
              {/* Project A Box (5 cols) */}
              <motion.div
                whileHover={shouldReduceMotion ? {} : { y: -2 }}
                className="md:col-span-5 p-5 rounded-xl border border-border/80 bg-background/80 space-y-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-status-verified" />
                    <span className="text-xs font-semibold text-foreground tracking-tight">
                      Project Alpha
                    </span>
                  </div>
                  <span className="text-[10px] font-mono uppercase text-muted-foreground px-2 py-0.5 rounded bg-muted">
                    scope: alpha
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-card border border-border/60 flex items-center justify-between">
                    <span className="text-muted-foreground">Documents</span>
                    <span className="font-medium text-foreground">Finance & CapEx</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card border border-border/60 flex items-center justify-between">
                    <span className="text-muted-foreground">Evidence</span>
                    <span className="font-medium text-foreground">18 verified extracts</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card border border-border/60 flex items-center justify-between">
                    <span className="text-muted-foreground">Claims</span>
                    <span className="font-medium text-foreground">Audited assertions</span>
                  </div>
                </div>

                <button
                  type="button"
                  onMouseEnter={() => setCrossAttempt(true)}
                  onMouseLeave={() => setCrossAttempt(false)}
                  onClick={() => setCrossAttempt((v) => !v)}
                  className="w-full text-center py-2 text-xs font-medium rounded-lg border border-dashed border-border/80 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all duration-200 cursor-pointer"
                >
                  {crossAttempt ? 'Simulating query probe...' : 'Hover to simulate cross-query'}
                </button>
              </motion.div>

              {/* Vertical Boundary Wall (1 col) with pulsating alert */}
              <div className="md:col-span-1 flex flex-col items-center justify-center py-4 relative">
                <motion.div
                  animate={
                    crossAttempt
                      ? {
                          boxShadow: '0 0 20px rgba(239,68,68,0.6)',
                          backgroundColor: 'rgba(239,68,68,1)',
                          scale: [1, 1.2, 1],
                        }
                      : {}
                  }
                  transition={{ duration: 0.3 }}
                  className={cn(
                    'w-1.5 md:h-56 rounded-full transition-colors duration-300',
                    crossAttempt ? 'bg-status-flagged' : 'bg-border/90'
                  )}
                />
                <motion.div
                  animate={crossAttempt ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full text-[10px] font-mono tracking-wider uppercase whitespace-nowrap transition-all duration-200 border shadow-xs flex items-center gap-1',
                    crossAttempt
                      ? 'bg-status-flagged-bg text-status-flagged border-status-flagged-border shadow-red-500/20'
                      : 'bg-card text-muted-foreground border-border/80'
                  )}
                >
                  {crossAttempt && <Ban className="h-3 w-3" />}
                  <span>{crossAttempt ? 'Blocked' : 'Boundary'}</span>
                </motion.div>
              </div>

              {/* Project B Box (5 cols) */}
              <motion.div
                whileHover={shouldReduceMotion ? {} : { y: -2 }}
                className="md:col-span-5 p-5 rounded-xl border border-border/80 bg-background/80 space-y-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-status-verified" />
                    <span className="text-xs font-semibold text-foreground tracking-tight">
                      Project Beta
                    </span>
                  </div>
                  <span className="text-[10px] font-mono uppercase text-muted-foreground px-2 py-0.5 rounded bg-muted">
                    scope: beta
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-card border border-border/60 flex items-center justify-between">
                    <span className="text-muted-foreground">Documents</span>
                    <span className="font-medium text-foreground">Engineering Specs</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card border border-border/60 flex items-center justify-between">
                    <span className="text-muted-foreground">Evidence</span>
                    <span className="font-medium text-foreground">42 verified extracts</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card border border-border/60 flex items-center justify-between">
                    <span className="text-muted-foreground">Claims</span>
                    <span className="font-medium text-foreground">API constraints</span>
                  </div>
                </div>

                <div className="text-center py-2 text-xs text-muted-foreground font-mono">
                  Separate vector partition
                </div>
              </motion.div>
            </div>

            {/* Boundary Notification Bar */}
            <div className="mt-6 pt-4 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                {crossAttempt ? (
                  <AlertCircle className="h-4 w-4 text-status-flagged shrink-0" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-status-verified shrink-0" />
                )}
                <span>
                  {crossAttempt
                    ? 'Cross-scope retrieval rejected at partition boundary before vector traversal.'
                    : 'Every vector and lexical query is strictly bound to its verified workspace context.'}
                </span>
              </div>
              <span className="font-mono text-[11px] text-foreground/80 shrink-0">
                Partition isolation enforced
              </span>
            </div>
          </motion.div>
        </div>

        {/* 4 Architectural Pillars with Staggered Spring Pop & Hover Lift */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {SECURITY_PILLARS.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <motion.div
                key={pillar.title}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 24, scale: 0.94 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{
                  ...transitions.bouncy,
                  delay: idx * 0.08,
                }}
                whileHover={shouldReduceMotion ? {} : { y: -4, scale: 1.02 }}
                className="p-6 rounded-2xl border border-border/70 bg-card/40 hover:bg-card/80 transition-all duration-300 space-y-3 cursor-default shadow-xs"
              >
                <div className="h-9 w-9 rounded-xl bg-foreground/5 border border-border/70 text-foreground flex items-center justify-center shadow-2xs">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-foreground tracking-tight font-sans">
                  {pillar.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {pillar.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
