'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { FileText, ArrowDown, ExternalLink, Hash, CheckCircle2 } from 'lucide-react';
import { transitions } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface LineageTrace {
  id: string;
  claim: string;
  citation: string;
  documentTitle: string;
  page: number;
  section: string;
  docType: string;
  sourceHash: string;
  evidenceSnippet: string;
  highlightPhrase: string;
}

const LINEAGE_EXAMPLES: LineageTrace[] = [
  {
    id: 'trace-1',
    claim: 'Operating costs increased 28.4% across Q3 primarily due to regional facility expansion.',
    citation: '[1]',
    documentTitle: 'Annual_Operating_Report_2025.pdf',
    page: 18,
    section: 'Section 3.2 — Capital Outlays',
    docType: 'PDF · OCR Verified',
    sourceHash: 'sha256:9c41d7e2',
    evidenceSnippet:
      'Total regional operating expenditures grew 28.4% across the third quarter, concentrated primarily within new facility construction and regional infrastructure commissioning.',
    highlightPhrase: 'operating expenditures grew 28.4% across the third quarter',
  },
  {
    id: 'trace-2',
    claim: 'Milestone revisions exceeding 14 business days require secondary governance committee approval.',
    citation: '[2]',
    documentTitle: 'Operations_Governance_Policy_v4.pdf',
    page: 42,
    section: 'Clause 6.1 — Project Governance',
    docType: 'PDF · Structured Text',
    sourceHash: 'sha256:3a7b8e1f',
    evidenceSnippet:
      'Schedule extensions or milestone modifications that exceed fourteen (14) consecutive business days must be accompanied by secondary approval from the governing committee prior to release.',
    highlightPhrase: 'exceed fourteen (14) consecutive business days must be accompanied by secondary approval',
  },
];

export function ProvenanceSection() {
  const [activeTraceId, setActiveTraceId] = React.useState<string>('trace-1');
  const [activeStep, setActiveStep] = React.useState<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const trace = LINEAGE_EXAMPLES.find((t) => t.id === activeTraceId) || LINEAGE_EXAMPLES[0];

  const steps = [
    {
      index: 1,
      name: 'Generated Claim',
      label: 'Claim',
      badge: 'Statement',
      content: trace.claim,
      isMono: false,
    },
    {
      index: 2,
      name: 'Source Citation',
      label: 'Citation',
      badge: trace.citation,
      content: `Direct pointer anchored to source index ${trace.citation}`,
      isMono: true,
    },
    {
      index: 3,
      name: 'Original Artifact',
      label: 'Document',
      badge: trace.docType,
      content: trace.documentTitle,
      isMono: false,
    },
    {
      index: 4,
      name: 'Physical Coordinates',
      label: 'Coordinate',
      badge: `Page ${trace.page}`,
      content: `${trace.section} · ${trace.sourceHash}`,
      isMono: true,
    },
    {
      index: 5,
      name: 'Certified Evidence Slice',
      label: 'Evidence',
      badge: 'Grounded Passage',
      content: trace.evidenceSnippet,
      isMono: false,
      isEvidence: true,
    },
  ];

  return (
    <section
      id="provenance"
      className="w-full py-28 sm:py-36 px-6 bg-[#f7f8fa] dark:bg-[#12161f] border-y border-border/70 transition-colors duration-300"
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
            <span>Direct Provenance</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            Every Claim Has an Address
          </h2>
          <p className="text-base text-muted-foreground max-w-xl leading-relaxed">
            In GroundGuard, statements are never orphaned strings. Follow the verifiable chain
            from response word to original page, coordinate, and highlighted sentence.
          </p>
        </motion.div>

        {/* Example Switcher with Layout Morphing */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-12">
          {LINEAGE_EXAMPLES.map((item) => {
            const isActive = activeTraceId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTraceId(item.id);
                  setActiveStep(null);
                }}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200 border flex items-center gap-2 relative cursor-pointer',
                  isActive
                    ? 'border-foreground/30 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-card/70'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-provenance-pill"
                    className="absolute inset-0 rounded-xl bg-card border border-foreground/20 shadow-sm -z-10"
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  />
                )}
                <span className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded bg-muted text-foreground">
                  {item.citation}
                </span>
                <span className="truncate max-w-[200px] sm:max-w-xs">{item.documentTitle}</span>
              </button>
            );
          })}
        </div>

        {/* Interactive Lineage Architecture: Two-column presentation */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Interactive Step Lineage (7 cols) with sequential pop-ins */}
          <div className="lg:col-span-7 space-y-4">
            {steps.map((step, idx) => {
              const isLast = idx === steps.length - 1;
              const isHovered = activeStep === step.index;
              const isRelatedToEvidence =
                (activeStep === 1 || activeStep === 2 || activeStep === 4) && step.index === 5;

              return (
                <div key={step.index} className="relative group">
                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, x: -24, scale: 0.94 }}
                    whileInView={{ opacity: 1, x: 0, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      ...transitions.bouncy,
                      delay: idx * 0.08,
                    }}
                    whileHover={shouldReduceMotion ? {} : { x: 4, scale: 1.01 }}
                    onMouseEnter={() => setActiveStep(step.index)}
                    onMouseLeave={() => setActiveStep(null)}
                    className={cn(
                      'p-4 sm:p-5 rounded-xl border transition-all duration-200 cursor-pointer relative',
                      isHovered
                        ? 'border-foreground/50 bg-card shadow-md -translate-y-0.5'
                        : isRelatedToEvidence
                        ? 'border-foreground/30 bg-card/90 shadow-sm'
                        : 'border-border/70 bg-card/60 hover:bg-card/90'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-foreground/10 text-foreground text-[11px] font-mono font-bold flex items-center justify-center">
                          {step.index}
                        </span>
                        <span className="text-xs font-semibold text-foreground tracking-tight">
                          {step.name}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded font-mono',
                          step.index === 5
                            ? 'bg-status-verified-bg text-status-verified border border-status-verified-border'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {step.badge}
                      </span>
                    </div>

                    <div
                      className={cn(
                        'text-xs sm:text-sm text-foreground/90 leading-relaxed',
                        step.isMono ? 'font-mono text-xs text-muted-foreground' : '',
                        step.isEvidence ? 'font-serif italic text-foreground' : ''
                      )}
                    >
                      {step.isEvidence ? `“${step.content}”` : step.content}
                    </div>
                  </motion.div>

                  {!isLast && (
                    <div className="flex justify-start pl-6 py-1.5">
                      <div className="flex items-center gap-2 text-muted-foreground/60">
                        <ArrowDown className="h-3.5 w-3.5 animate-pulse" />
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">
                          {idx === 0
                            ? 'Resolves citation'
                            : idx === 1
                            ? 'Indexed in document'
                            : idx === 2
                            ? 'Located at page slice'
                            : 'Extracted grounded chunk'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Column: Grounded Document View (5 cols) with Spring Reveal */}
          <div className="lg:col-span-5 sticky top-28 space-y-4">
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={transitions.springPop}
              whileHover={shouldReduceMotion ? {} : { y: -3, scale: 1.01 }}
              className="p-6 rounded-2xl border border-border/80 bg-card/90 backdrop-blur-sm shadow-md space-y-5 transition-all duration-300"
            >
              {/* Document Header */}
              <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-foreground/5 border border-border/80">
                    <FileText className="h-5 w-5 text-foreground/80" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground tracking-tight truncate max-w-[200px]">
                      {trace.documentTitle}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground mt-0.5">
                      <span>Page {trace.page}</span>
                      <span>·</span>
                      <span>{trace.section}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground bg-muted/60 px-2 py-1 rounded">
                  <Hash className="h-3 w-3" />
                  <span>{trace.sourceHash.slice(0, 15)}</span>
                </div>
              </div>

              {/* Simulated Document Page with Real Highlight */}
              <div className="p-4 rounded-xl bg-background/80 border border-border/60 font-serif text-xs leading-relaxed space-y-3 relative overflow-hidden">
                <div className="text-[10px] font-mono text-muted-foreground/70 border-b border-border/40 pb-1.5 flex justify-between">
                  <span>FACILITY & CAPITAL AUDIT — PAGE {trace.page}</span>
                  <span>CONFIDENTIAL / AUDITED</span>
                </div>

                <p className="text-muted-foreground/80 text-[11px] leading-relaxed">
                  During the recent infrastructure review conducted by regional operations,
                  baseline capital outlays were evaluated across all active construction corridors.
                </p>

                {/* Highlighted Provenance Paragraph */}
                <motion.div
                  animate={
                    activeStep === 5 || activeStep === 1 || activeStep === 2
                      ? { scale: [1, 1.02, 1] }
                      : {}
                  }
                  transition={{ duration: 0.3 }}
                  className={cn(
                    'p-2.5 rounded-lg transition-all duration-300 border',
                    activeStep === 5 || activeStep === 1 || activeStep === 2
                      ? 'bg-status-verified-bg/70 border-status-verified-border text-foreground shadow-sm'
                      : 'bg-foreground/[0.04] border-foreground/10 text-foreground/90'
                  )}
                >
                  <p className="font-medium text-xs leading-normal">
                    “{trace.evidenceSnippet}”
                  </p>
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground pt-2">
                    <span className="text-status-verified flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="h-3 w-3" /> Anchored Grounding Passage
                    </span>
                    <span>Citation {trace.citation}</span>
                  </div>
                </motion.div>

                <p className="text-muted-foreground/80 text-[11px] leading-relaxed">
                  Subsequent schedule revisions will be filed following the Q4 closeout meeting
                  scheduled with the governing board.
                </p>
              </div>

              {/* Integrity Metric Footer */}
              <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-status-verified" />
                  <span className="font-medium text-foreground">Direct Lineage Validated</span>
                </span>
                <span className="font-mono text-[10px]">No orphaned inference</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
