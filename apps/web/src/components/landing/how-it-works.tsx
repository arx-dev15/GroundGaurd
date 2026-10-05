'use client';

import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Search,
  Scissors,
  CheckCircle2,
  RotateCcw,
  Send,
  FileText,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { StatusBadge } from '@/components/trust/status-badge';
import { transitions } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface PipelineStage {
  id: number;
  label: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
}

const STAGES: PipelineStage[] = [
  {
    id: 1,
    label: 'Retrieve',
    tagline: 'Multi-Path Evidence Convergence',
    description:
      'Queries trigger parallel retrieval across dense semantic embeddings and exact lexical references to assemble candidate evidence slices.',
    icon: Search,
  },
  {
    id: 2,
    label: 'Extract',
    tagline: 'Atomic Proposition Segmentation',
    description:
      'Rather than grading ambiguous paragraphs, EvideX AI extracts individual factual claims with explicit subject-predicate bounds.',
    icon: Scissors,
  },
  {
    id: 3,
    label: 'Verify',
    tagline: 'Cross-Attention NLI Entailment Test',
    description:
      'Each isolated claim is tested independently for entailment, neutral drift, or contradiction against its matched evidence text.',
    icon: CheckCircle2,
  },
  {
    id: 4,
    label: 'Recover',
    tagline: 'In-Flight Correction & Re-grounding',
    description:
      'When an extracted claim contradicts the source text, it is intercepted before delivery and re-grounded against verified evidence.',
    icon: RotateCcw,
  },
  {
    id: 5,
    label: 'Deliver',
    tagline: 'Grounded Output with Provenance Lineage',
    description:
      'The client receives a clean, readable response where every factual statement links directly to an inspectable document page.',
    icon: Send,
  },
];

export function HowItWorks() {
  const [activeStageId, setActiveStageId] = React.useState<number>(1);
  const shouldReduceMotion = useReducedMotion();

  const currentStage = STAGES.find((s) => s.id === activeStageId) || STAGES[0];

  return (
    <section
      id="how-it-works"
      className="w-full py-28 sm:py-36 px-6 border-b border-border/60 bg-background select-none transition-colors duration-300"
    >
      <div className="max-w-6xl mx-auto">
        {/* Section Header with spring pop-in */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={transitions.springPop}
          className="flex flex-col items-center text-center mb-16 space-y-3"
        >
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground px-3 py-1 rounded-full bg-secondary/80 border border-border/60">
            Pipeline Architecture
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground font-sans">
            How EvideX AI Works
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl leading-relaxed">
            From raw query to verified answer: an autonomous verification loop inspecting every atomic claim.
          </p>
        </motion.div>

        {/* 2-Column Sticky Pipeline Story */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Column: Sticky Stage Selector with Layout Morphing */}
          <div className="lg:col-span-5 space-y-2.5 lg:sticky lg:top-24">
            {STAGES.map((stage) => {
              const Icon = stage.icon;
              const isActive = stage.id === activeStageId;

              return (
                <motion.button
                  key={stage.id}
                  type="button"
                  onClick={() => setActiveStageId(stage.id)}
                  onMouseEnter={() => setActiveStageId(stage.id)}
                  whileHover={shouldReduceMotion ? {} : { x: 4 }}
                  className={cn(
                    'w-full text-left p-4 rounded-xl transition-all duration-200 flex items-start gap-4 cursor-pointer group relative',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {/* Morphing active indicator background */}
                  {isActive && (
                    <motion.div
                      layoutId="active-stage-indicator"
                      className="absolute inset-0 rounded-xl bg-card border border-border/80 shadow-md -z-10"
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    />
                  )}

                  <div
                    className={cn(
                      'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                      isActive
                        ? 'bg-foreground text-background shadow-xs'
                        : 'bg-secondary text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/70">
                        0{stage.id}
                      </span>
                      <h3
                        className={cn(
                          'text-sm font-semibold truncate font-sans',
                          isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
                        )}
                      >
                        {stage.label}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {stage.description}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Right Column: Dynamic Material Transforming Canvas */}
          <div className="lg:col-span-7">
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={transitions.springPop}
              className="rounded-2xl border border-border/80 bg-card/85 backdrop-blur-md p-6 sm:p-8 shadow-xl shadow-black/5 min-h-[440px] flex flex-col justify-between relative overflow-hidden"
            >
              {/* Stage Header */}
              <div className="flex items-center justify-between pb-4 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Stage 0{currentStage.id} Output
                  </span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-xs font-semibold text-foreground font-sans">
                    {currentStage.tagline}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-status-verified animate-subtle-pulse" />
                  <span>Pipeline active</span>
                </div>
              </div>

              {/* Dynamic Transforming Pipeline Visual with physics morph */}
              <div className="my-6 flex-1 flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  {/* STAGE 1: Evidence Convergence */}
                  {currentStage.id === 1 && (
                    <motion.div
                      key="stage-1"
                      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.92, y: 14, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                      exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.94, y: -10, filter: 'blur(4px)' }}
                      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                      className="space-y-4"
                    >
                      <div className="text-xs text-muted-foreground">
                        Candidate chunks converging from hybrid dense and lexical index:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <motion.div
                          whileHover={{ y: -2 }}
                          className="p-3.5 rounded-xl bg-secondary/40 border border-border/70 space-y-1.5 shadow-xs"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Annual Report 2025 · p. 18</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground italic font-serif">
                            “...operating expenses increased 28.4%...”
                          </p>
                        </motion.div>
                        <motion.div
                          whileHover={{ y: -2 }}
                          className="p-3.5 rounded-xl bg-secondary/40 border border-border/70 space-y-1.5 shadow-xs"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Operational Guidelines · p. 42</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground italic font-serif">
                            “...revisions over 14 days require approval...”
                          </p>
                        </motion.div>
                      </div>
                      <div className="text-center pt-2">
                        <span className="text-[11px] font-mono text-muted-foreground px-3 py-1 rounded-full bg-secondary/60 border border-border/60">
                          2 high-confidence slices converged
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {/* STAGE 2: Claim Proposition Extraction */}
                  {currentStage.id === 2 && (
                    <motion.div
                      key="stage-2"
                      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.92, y: 14, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                      exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.94, y: -10, filter: 'blur(4px)' }}
                      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                      className="space-y-4"
                    >
                      <div className="text-xs text-muted-foreground">
                        Model response decomposed into bounded atomic propositions:
                      </div>
                      <div className="space-y-2.5">
                        <motion.div
                          whileHover={{ y: -2 }}
                          className="p-3.5 rounded-xl bg-card border border-border/80 flex items-start justify-between gap-3 shadow-xs"
                        >
                          <div>
                            <span className="text-[10px] font-mono uppercase text-muted-foreground block mb-0.5">
                              Claim Proposition 01
                            </span>
                            <p className="text-xs font-medium text-foreground">
                              “Operating costs increased 28.4% due to facility expansion.”
                            </p>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                            Bounded
                          </span>
                        </motion.div>

                        <motion.div
                          whileHover={{ y: -2 }}
                          className="p-3.5 rounded-xl bg-card border border-border/80 flex items-start justify-between gap-3 shadow-xs"
                        >
                          <div>
                            <span className="text-[10px] font-mono uppercase text-muted-foreground block mb-0.5">
                              Claim Proposition 02
                            </span>
                            <p className="text-xs font-medium text-foreground">
                              “Schedule extensions over 14 days require secondary authorization.”
                            </p>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                            Bounded
                          </span>
                        </motion.div>
                      </div>
                    </motion.div>
                  )}

                  {/* STAGE 3: NLI Verification */}
                  {currentStage.id === 3 && (
                    <motion.div
                      key="stage-3"
                      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.92, y: 14, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                      exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.94, y: -10, filter: 'blur(4px)' }}
                      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                      className="space-y-4"
                    >
                      <div className="text-xs text-muted-foreground">
                        Neural Natural Language Inference evaluates claim against matched chunk:
                      </div>
                      <div className="p-4 rounded-xl bg-card border border-status-verified-border/70 space-y-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">
                            Claim 01 Entailment Test
                          </span>
                          <StatusBadge status="verified" size="sm" />
                        </div>
                        <p className="text-xs text-foreground/90 font-medium">
                          “Operating costs increased 28.4% due to facility expansion.”
                        </p>
                        <div className="p-2.5 rounded bg-secondary/40 text-[11px] font-serif italic text-muted-foreground border border-border/50">
                          Matched Chunk: “...operating expenses increased 28.4% primarily due to regional facility expansion...”
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/40">
                          <span>Inference Latency: 38ms</span>
                          <span className="text-status-verified font-medium">Entailment: 0.982</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* STAGE 4: Recovery & Repair */}
                  {currentStage.id === 4 && (
                    <motion.div
                      key="stage-4"
                      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.92, y: 14, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                      exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.94, y: -10, filter: 'blur(4px)' }}
                      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                      className="space-y-3.5"
                    >
                      <div className="text-xs text-muted-foreground">
                        Contradiction intercepted and autonomously repaired:
                      </div>
                      <div className="p-3.5 rounded-xl bg-status-flagged-bg/50 border border-status-flagged-border/60 text-xs text-status-flagged-foreground space-y-1">
                        <div className="flex items-center justify-between font-semibold">
                          <span>Intercepted Erroneous Metric (42.7%)</span>
                          <StatusBadge status="flagged" size="sm" />
                        </div>
                        <p className="line-through text-status-flagged-foreground/80">
                          “Operating costs increased 42.7% due to facility expansion.”
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-card border border-status-recovered-border/80 space-y-1.5 shadow-sm">
                        <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                          <span>Repaired & Re-Grounded Output</span>
                          <StatusBadge status="recovered" size="sm" />
                        </div>
                        <p className="text-xs text-foreground/90 font-medium">
                          “Operating costs increased 28.4% primarily due to regional facility expansion.”
                        </p>
                        <span className="text-[10px] font-mono text-muted-foreground block pt-1">
                          Repaired via Annual Report 2025 · Page 18
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {/* STAGE 5: Delivery */}
                  {currentStage.id === 5 && (
                    <motion.div
                      key="stage-5"
                      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.92, y: 14, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                      exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.94, y: -10, filter: 'blur(4px)' }}
                      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                      className="space-y-4"
                    >
                      <div className="text-xs text-muted-foreground">
                        Traceable, audit-ready answer delivered to the user:
                      </div>
                      <div className="p-4 rounded-xl bg-card border border-border/80 space-y-3 shadow-md">
                        <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-sans">
                          Operating costs increased 28.4% primarily due to facility expansion{' '}
                          <span className="inline-flex px-1.5 py-0.5 rounded bg-secondary border border-border/80 text-[10px] font-mono text-muted-foreground">
                            [1] p. 18
                          </span>
                          . Milestone modifications exceeding 14 days require secondary authorization{' '}
                          <span className="inline-flex px-1.5 py-0.5 rounded bg-secondary border border-border/80 text-[10px] font-mono text-muted-foreground">
                            [2] p. 42
                          </span>
                          .
                        </p>
                        <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                          <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-status-verified" />
                            All claims verified against source
                          </span>
                          <StatusBadge status="verified" size="sm" />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Stage Progress Bar Footer */}
              <div className="pt-4 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-sans">
                  {currentStage.tagline}
                </span>
                <div className="flex items-center gap-1.5">
                  {STAGES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-label={`Jump to stage 0${s.id}: ${s.label}`}
                      onClick={() => setActiveStageId(s.id)}
                      className={cn(
                        'h-1.5 rounded-full cursor-pointer transition-all duration-200',
                        s.id === activeStageId
                          ? 'w-6 bg-foreground'
                          : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60'
                      )}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
