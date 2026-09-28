'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EvidenceField } from '@/components/landing/evidence-field';
import { EvidenceProbe } from '@/components/landing/evidence-probe';
import { HeroTyping } from '@/components/landing/hero-typing';
import { HeroDemo } from '@/components/landing/hero-demo';
import { transitions } from '@/lib/motion';

interface HeroProps {
  onGetStarted?: () => void;
}

export function Hero({ onGetStarted }: HeroProps) {
  const heroRef = React.useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [activeQuestionIndex, setActiveQuestionIndex] = React.useState(0);
  const [ctaOffset, setCtaOffset] = React.useState({ x: 0, y: 0 });

  const handleCtaMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (shouldReduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // Subtle magnetic response: max 3px movement toward pointer
    setCtaOffset({ x: x * 0.14, y: y * 0.14 });
  };

  const handleCtaMouseLeave = () => {
    setCtaOffset({ x: 0, y: 0 });
  };

  const handleSeeHowItWorks = () => {
    const section = document.getElementById('how-it-works');
    section?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleGetStartedClick = () => {
    if (onGetStarted) {
      onGetStarted();
    } else {
      const demoEl = document.getElementById('hero-demo-section');
      demoEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <section
      ref={heroRef}
      className="relative w-full overflow-hidden flex flex-col justify-center min-h-[calc(100vh-4rem)] pt-6 sm:pt-10 pb-16 lg:pb-24 border-b border-border/40 bg-background"
    >
      {/* Layered Cursor-Reactive Evidence Field */}
      <EvidenceField activeInquiryIndex={activeQuestionIndex} />

      {/* Verification Evidence Probe (Hero Only) */}
      <EvidenceProbe containerRef={heroRef} />

      {/* Hero Content Container */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Left Column: Primary Content */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left">
            {/* Eyebrow */}
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ ...transitions.bouncy, delay: 0.05 }}
              className="mb-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border/70 bg-card/70 backdrop-blur-md text-[11px] font-mono uppercase tracking-wider text-muted-foreground select-none shadow-xs"
            >
              <span className="h-2 w-2 rounded-full bg-status-verified animate-subtle-pulse" />
              <span>Evidence-Grounded Reliability</span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ ...transitions.springPop, delay: 0.12 }}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.25rem] font-bold tracking-tight text-foreground leading-[1.12] max-w-xl font-sans"
            >
              AI answers you can actually verify.
            </motion.h1>

            {/* Supporting Copy */}
            <motion.p
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...transitions.spring, delay: 0.18 }}
              className="mt-4 mb-6 text-sm sm:text-base text-muted-foreground max-w-lg leading-relaxed font-normal"
            >
              GroundGuard traces factual claims to evidence, surfaces conflicts, and can repair failed claims before you rely on them.
            </motion.p>

            {/* Primary & Secondary Actions */}
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ ...transitions.bouncy, delay: 0.24 }}
              className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto"
            >
              <Button
                size="lg"
                onClick={handleGetStartedClick}
                onMouseMove={handleCtaMouseMove}
                onMouseLeave={handleCtaMouseLeave}
                style={{
                  transform: `translate(${ctaOffset.x}px, ${ctaOffset.y}px)`,
                  transition: 'transform 0.12s ease-out',
                }}
                className="group w-full sm:w-auto text-xs sm:text-sm font-semibold h-11 px-6 gap-2 shadow-md cursor-pointer"
              >
                <span>Get started</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 duration-150" />
              </Button>

              <Button
                variant="outline"
                size="lg"
                onClick={handleSeeHowItWorks}
                className="w-full sm:w-auto text-xs sm:text-sm text-foreground font-medium h-11 px-6 border-border/80 hover:bg-secondary/60 transition-all duration-200 cursor-pointer"
              >
                See how it works
              </Button>
            </motion.div>

            {/* Live Typing Inquiry Strip */}
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...transitions.springPop, delay: 0.32 }}
              className="mt-8 w-full max-w-md lg:max-w-none flex justify-center lg:justify-start"
            >
              <HeroTyping onQuestionChange={setActiveQuestionIndex} />
            </motion.div>
          </div>

          {/* Right Column: Immediately Visible Product Demo */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ ...transitions.springPop, delay: 0.2 }}
            className="lg:col-span-5 w-full"
          >
            <HeroDemo />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
