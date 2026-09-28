'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, CheckCircle2 } from 'lucide-react';
import { transitions, variants } from '@/lib/motion';
import { cn } from '@/lib/utils';

export function TrustPrinciple() {
  const shouldReduceMotion = useReducedMotion();
  const [hoveredSide, setHoveredSide] = React.useState<'left' | 'right' | null>(null);

  return (
    <section
      id="trust-principle"
      className="w-full py-28 sm:py-36 px-6 bg-[#f7f8fa] dark:bg-[#131720] text-foreground border-y border-border/70 relative overflow-hidden select-none transition-colors duration-300"
    >
      <div className="max-w-5xl mx-auto flex flex-col items-center text-center">
        {/* Eyebrow with lively pop */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9, y: 12 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={transitions.bouncy}
          className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-8 px-3 py-1 rounded-full bg-foreground/[0.05] border border-border/60"
        >
          Foundational Truth
        </motion.div>

        {/* Large Typographic Comparison Columns with spring morph & slide */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center my-6 max-w-4xl">
          {/* Left: Retrieved != Verified */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, x: -40, scale: 0.92 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={transitions.springPop}
            whileHover={shouldReduceMotion ? {} : { y: -4, scale: 1.02 }}
            onMouseEnter={() => setHoveredSide('left')}
            onMouseLeave={() => setHoveredSide(null)}
            className={cn(
              'p-6 sm:p-8 rounded-2xl border transition-all duration-300 flex flex-col items-center md:items-end text-center md:text-right space-y-2 cursor-default',
              hoveredSide === 'left'
                ? 'border-status-flagged/40 bg-card shadow-lg'
                : 'border-border/60 bg-card/60 shadow-xs'
            )}
          >
            <span className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground/90 font-sans">
              RETRIEVED
            </span>
            <motion.span
              animate={hoveredSide === 'left' ? { scale: [1, 1.25, 1], rotate: [0, -10, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="text-2xl sm:text-3xl font-light text-status-flagged font-mono px-2 py-0.5"
            >
              ≠
            </motion.span>
            <span className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground/40 font-sans">
              VERIFIED
            </span>
            <p className="text-xs text-muted-foreground max-w-xs pt-2 leading-relaxed">
              Context in the prompt does not prevent models from straying from facts.
            </p>
          </motion.div>

          {/* Right: Generated != Supported */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, x: 40, scale: 0.92 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={transitions.springPop}
            whileHover={shouldReduceMotion ? {} : { y: -4, scale: 1.02 }}
            onMouseEnter={() => setHoveredSide('right')}
            onMouseLeave={() => setHoveredSide(null)}
            className={cn(
              'p-6 sm:p-8 rounded-2xl border transition-all duration-300 flex flex-col items-center md:items-start text-center md:text-left space-y-2 cursor-default',
              hoveredSide === 'right'
                ? 'border-status-flagged/40 bg-card shadow-lg'
                : 'border-border/60 bg-card/60 shadow-xs'
            )}
          >
            <span className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground/90 font-sans">
              GENERATED
            </span>
            <motion.span
              animate={hoveredSide === 'right' ? { scale: [1, 1.25, 1], rotate: [0, 10, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="text-2xl sm:text-3xl font-light text-status-flagged font-mono px-2 py-0.5"
            >
              ≠
            </motion.span>
            <span className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground/40 font-sans">
              SUPPORTED
            </span>
            <p className="text-xs text-muted-foreground max-w-xs pt-2 leading-relaxed">
              Fluent language models invent persuasive numbers and assertions effortlessly.
            </p>
          </motion.div>
        </div>

        {/* Center Convergence Pipeline with Spring Pop-In */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.88, y: 28 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ ...transitions.bouncy, delay: 0.2 }}
          className="mt-12 pt-8 border-t border-border/70 max-w-xl w-full flex flex-col items-center space-y-5"
        >
          {/* Animated Formula Pill */}
          <motion.div
            whileHover={shouldReduceMotion ? {} : { scale: 1.04 }}
            className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-border/80 bg-card shadow-md text-xs sm:text-sm font-mono text-foreground font-semibold cursor-default transition-all duration-200"
          >
            <span>CLAIM</span>
            <span className="text-muted-foreground font-sans font-normal">+</span>
            <span>EVIDENCE</span>
            <span className="text-muted-foreground font-sans font-normal">→</span>
            <span className="text-status-verified font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> VERIFICATION
            </span>
          </motion.div>

          <div className="space-y-2 pt-2">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground font-sans">
              GroundGuard checks the claim itself.
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              We decompose drafts into isolated propositions, verify them against immutable document
              slices, and surface contradictions before they reach your users.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
