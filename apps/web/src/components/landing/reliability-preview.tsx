'use client';

import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Terminal, ChevronDown, CheckCircle2, ShieldCheck, Activity, Cpu } from 'lucide-react';
import { transitions } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface TraceStep {
  step: string;
  name: string;
  op: string;
  latency: string;
  summary: string;
  details: {
    label: string;
    value: string;
    isMono?: boolean;
  }[];
}

const TRACE_STEPS: TraceStep[] = [
  {
    step: '01',
    name: 'Retrieval',
    op: 'retrieval.hybrid_fuse',
    latency: '42ms',
    summary: '14 candidates fused via reciprocal rank fusion across semantic & lexical indices',
    details: [
      { label: 'Route Strategy', value: 'Dense vector (cosine) + Lexical (BM25)' },
      { label: 'Index Partition', value: 'scope_alpha_v1', isMono: true },
      { label: 'Fused Candidates', value: '14 raw chunks evaluated' },
      { label: 'Context Bound', value: 'Top 4 passages passed to extraction' },
    ],
  },
  {
    step: '02',
    name: 'Extraction',
    op: 'claims.extract_propositions',
    latency: '26ms',
    summary: 'Atomic claim decomposition into 2 isolated testable assertions',
    details: [
      { label: 'Method', value: 'Syntactic boundary segmentation' },
      { label: 'Atomic Propositions', value: '2 factual assertions extracted' },
      { label: 'Disambiguation', value: 'Resolved contextual pronouns to named entities' },
      { label: 'Claim Hash', value: 'clm_9c41d7e2', isMono: true },
    ],
  },
  {
    step: '03',
    name: 'Verification',
    op: 'nli.verify_entailment',
    latency: '38ms',
    summary: 'Premise-hypothesis entailment validation against source citation chunks',
    details: [
      { label: 'Verification Model', value: 'evidex-deberta-v1', isMono: true },
      { label: 'Entailment Score', value: '0.982 (threshold: 0.850)', isMono: true },
      { label: 'Contradiction Probability', value: '0.012', isMono: true },
      { label: 'Neutral Probability', value: '0.006', isMono: true },
      { label: 'Evidence References', value: 'Annual_Operating_Report_2025.pdf · Page 18' },
    ],
  },
  {
    step: '04',
    name: 'Delivery',
    op: 'pipeline.deliver_response',
    latency: '12ms',
    summary: 'Payload finalized with inline citation anchors and verifiable provenance metadata',
    details: [
      { label: 'Verification Status', value: 'Fully grounded with certified lineage' },
      { label: 'Anchored Citations', value: '[1] mapped to source slice sha256:9c41d7e2', isMono: true },
      { label: 'Response Integrity', value: 'Checked against ungrounded hallucinations' },
      { label: 'Telemetry Export', value: 'OTel span exported (content-minimized)' },
    ],
  },
];

export function ReliabilityPreview() {
  const [expandedStep, setExpandedStep] = React.useState<string | null>('03');
  const shouldReduceMotion = useReducedMotion();

  return (
    <section
      id="reliability"
      className="w-full py-28 sm:py-36 px-6 bg-[#0a0c10] border-b border-border/80 text-foreground select-none transition-colors duration-300"
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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/[0.08] text-white/90">
            <span>Observability & Tracing</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white">
            Every Decision Leaves an Auditable Trace
          </h2>
          <p className="text-base text-zinc-400 max-w-xl leading-relaxed">
            Inspect each stage of the verification lifecycle. From hybrid retrieval to atomic
            claim decomposition and neural entailment scores.
          </p>
        </motion.div>

        {/* Trace Waterfall Card with Spring Pop */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={transitions.springPop}
          className="max-w-4xl mx-auto rounded-2xl border border-zinc-800 bg-[#0e1117] p-6 sm:p-8 shadow-2xl space-y-6"
        >
          {/* Card Top Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-3">
            <div className="flex items-center gap-2.5">
              <Terminal className="h-4 w-4 text-zinc-400" />
              <span className="text-xs font-mono font-medium text-zinc-200">
                Execution Trace · req_8f1902c
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                Illustrative trace
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
              <span>
                Total: <strong className="text-zinc-200">118ms</strong>
              </span>
              <span>
                Model: <strong className="text-zinc-200">evidex-deberta-v1</strong>
              </span>
            </div>
          </div>

          {/* Interactive Steps List with Sequential Spring Pops */}
          <div className="space-y-2.5">
            {TRACE_STEPS.map((step, idx) => {
              const isExpanded = expandedStep === step.step;

              return (
                <motion.div
                  key={step.step}
                  initial={shouldReduceMotion ? false : { opacity: 0, x: -16, scale: 0.96 }}
                  whileInView={{ opacity: 1, x: 0, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    ...transitions.bouncy,
                    delay: idx * 0.08,
                  }}
                  whileHover={shouldReduceMotion ? {} : { x: 4 }}
                  className={cn(
                    'rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer',
                    isExpanded
                      ? 'border-zinc-700 bg-zinc-900/90 shadow-md'
                      : 'border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-900/60'
                  )}
                >
                  {/* Collapsed Bar / Trigger */}
                  <button
                    type="button"
                    onClick={() => setExpandedStep(isExpanded ? null : step.step)}
                    className="w-full p-3.5 sm:p-4 text-left flex items-center justify-between gap-3 focus:outline-none cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-md bg-zinc-800 text-zinc-300 text-xs font-mono font-semibold flex items-center justify-center shrink-0">
                        {step.step}
                      </span>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2.5 truncate">
                        <span className="text-xs font-semibold text-white tracking-tight">
                          {step.name}
                        </span>
                        <span className="text-xs font-mono text-zinc-400 truncate">
                          {step.op}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono text-zinc-400">{step.latency}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-800/60 text-emerald-400 text-[10px] font-mono font-medium">
                        OK
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-zinc-400 transition-transform duration-200',
                          isExpanded && 'rotate-180 text-zinc-200'
                        )}
                      />
                    </div>
                  </button>

                  {/* Summary preview on medium screens */}
                  {!isExpanded && (
                    <div className="px-4 pb-3 -mt-1 text-xs text-zinc-400 truncate pl-12 hidden sm:block">
                      {step.summary}
                    </div>
                  )}

                  {/* Expanded Detail Panel with Smooth Physics Accordion */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="px-4 pb-4 pt-1 border-t border-zinc-800/80 bg-black/40"
                      >
                        <p className="text-xs text-zinc-300 mb-3 pt-2">{step.summary}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {step.details.map((d) => (
                            <div
                              key={d.label}
                              className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 flex flex-col justify-between shadow-xs"
                            >
                              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                                {d.label}
                              </span>
                              <span
                                className={cn(
                                  'font-medium text-zinc-200 mt-1',
                                  d.isMono && 'font-mono text-[11px]'
                                )}
                              >
                                {d.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          {/* Truthful Telemetry Characteristics with Staggered Pop */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-zinc-800 text-center">
            {[
              { title: '2 Assertions', subtitle: 'Decomposed in Example', isMono: false },
              { title: 'evidex-deberta-v1', subtitle: 'Verification Model', isMono: true },
              { title: 'Page & Slice', subtitle: 'Coordinate Anchors', isMono: true, highlight: true },
              { title: 'OpenTelemetry', subtitle: 'Span Compatibility', isMono: true },
            ].map((metric, idx) => (
              <motion.div
                key={metric.title}
                initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{
                  ...transitions.bouncy,
                  delay: 0.25 + idx * 0.05,
                }}
                className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800/70 space-y-1"
              >
                <div
                  className={cn(
                    'text-xs font-semibold',
                    metric.highlight ? 'text-emerald-400' : 'text-zinc-200',
                    metric.isMono && 'font-mono text-[11px]'
                  )}
                >
                  {metric.title}
                </div>
                <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  {metric.subtitle}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
