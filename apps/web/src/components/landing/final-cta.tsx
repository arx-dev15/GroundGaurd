'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Shield, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { transitions } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface FinalCTAProps {
  onGetStarted?: () => void;
  onExploreProduct?: () => void;
}

const CONVERGING_FRAGMENTS = [
  { id: 'f-1', text: 'Page 18 · Sec 3.2', x: -320, y: -80, delay: 0.1 },
  { id: 'f-2', text: 'expenditures grew 28.4%', x: 320, y: -70, delay: 0.2 },
  { id: 'f-3', text: 'Citation [1]', x: -340, y: 50, delay: 0.15 },
  { id: 'f-4', text: 'entailment: 0.982', x: 340, y: 60, delay: 0.25 },
  { id: 'f-5', text: 'sha256:9c41d7e2', x: 0, y: -150, delay: 0.05 },
];

export function FinalCTA({ onGetStarted, onExploreProduct }: FinalCTAProps) {
  const shouldReduceMotion = useReducedMotion();
  const [btnOffset, setBtnOffset] = React.useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (shouldReduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - (rect.left + rect.width / 2)) * 0.18;
    const y = (e.clientY - (rect.top + rect.height / 2)) * 0.18;
    setBtnOffset({ x, y });
  };

  const handleMouseLeave = () => {
    setBtnOffset({ x: 0, y: 0 });
  };

  return (
    <section
      id="final-cta"
      className="w-full py-28 sm:py-36 px-6 border-b border-zinc-800 bg-[#0c0f17] text-white select-none relative overflow-hidden transition-colors duration-300"
    >
      {/* Background radial gradient */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.035)_0%,transparent_70%)]" />

      {/* Converging Quiet Evidence Fragments (Callback to Hero) */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="relative w-full max-w-4xl h-72">
          {CONVERGING_FRAGMENTS.map((frag) => (
            <motion.div
              key={frag.id}
              initial={
                shouldReduceMotion
                  ? false
                  : { opacity: 0, x: frag.x * 1.5, y: frag.y * 1.5, scale: 0.9 }
              }
              whileInView={{
                opacity: 0.5,
                x: frag.x,
                y: frag.y,
                scale: 1,
              }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{
                duration: 1.2,
                delay: frag.delay,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block"
            >
              <span className="font-mono text-[10px] tracking-wide px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-zinc-400 backdrop-blur-xs whitespace-nowrap shadow-sm">
                {frag.text}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto flex flex-col items-center text-center space-y-6 relative z-10">
        {/* DHADHI Central Emblem with Pulsating Glow */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={transitions.bouncy}
          className="mb-2 relative group"
        >
          <div className="h-16 w-16 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center shadow-2xl shadow-cyan-500/20 backdrop-blur-md">
            <svg viewBox="0 0 40 40" fill="none" className="h-9 w-9 text-cyan-400">
              <polygon
                points="20,4 34,12 34,28 20,36 6,28 6,12"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinejoin="round"
                fill="rgba(6,182,212,0.15)"
              />
              <path
                d="M14 14 H21 C24.5 14 27 16.5 27 20 C27 23.5 24.5 26 21 26 H14 Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="20" cy="20" r="2.2" fill="#22d3ee" />
            </svg>
          </div>
          <div className="absolute -inset-2 rounded-2xl bg-cyan-500/20 blur-xl -z-10 group-hover:bg-cyan-500/30 transition-all duration-300" />
        </motion.div>

        <motion.h2
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={transitions.springPop}
          className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white max-w-2xl leading-[1.15]"
        >
          Build AI answers you can actually inspect.
        </motion.h2>

        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ ...transitions.spring, delay: 0.15 }}
          className="text-sm sm:text-base text-zinc-400 max-w-xl leading-relaxed"
        >
          Ground your responses in verifiable evidence, surface conflicts before they propagate,
          and repair failed claims with full lineage traceability.
        </motion.p>

        {/* Buttons with Magnetic Interaction & Spring Pop */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94, y: 16 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ ...transitions.bouncy, delay: 0.25 }}
          className="pt-4 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto"
        >
          <motion.button
            type="button"
            onClick={onGetStarted}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            animate={{ x: btnOffset.x, y: btnOffset.y }}
            whileHover={shouldReduceMotion ? {} : { scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="w-full sm:w-auto h-11 px-7 text-xs sm:text-sm font-semibold rounded-lg bg-white text-zinc-950 hover:bg-zinc-100 transition-colors shadow-lg flex items-center justify-center gap-2 group cursor-pointer"
          >
            <span>Get started</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </motion.button>

          <button
            type="button"
            onClick={onExploreProduct}
            className="w-full sm:w-auto h-11 px-7 text-xs sm:text-sm font-medium rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:text-white hover:bg-zinc-800/80 hover:border-zinc-700 transition-all duration-200 cursor-pointer"
          >
            Explore documentation
          </button>
        </motion.div>
      </div>
    </section>
  );
}
