'use client';

import * as React from 'react';
import { useReducedMotion } from 'framer-motion';

export const QUESTIONS = [
  'Can I trust this answer?',
  'Where did this claim come from?',
  'What happens when the evidence disagrees?',
  'Can AI correct itself before I rely on it?',
];

interface HeroTypingProps {
  onQuestionChange?: (index: number) => void;
}

export function HeroTyping({ onQuestionChange }: HeroTypingProps) {
  const shouldReduceMotion = useReducedMotion();
  const [questionIndex, setQuestionIndex] = React.useState(0);
  const [displayText, setDisplayText] = React.useState(
    shouldReduceMotion ? QUESTIONS[0] : ''
  );
  const [isDeleting, setIsDeleting] = React.useState(false);

  React.useEffect(() => {
    onQuestionChange?.(questionIndex);
  }, [questionIndex, onQuestionChange]);

  React.useEffect(() => {
    if (shouldReduceMotion) {
      setDisplayText(QUESTIONS[0]);
      return;
    }

    const currentFullText = QUESTIONS[questionIndex];

    if (!isDeleting && displayText === currentFullText) {
      // Pause at full text
      const pauseTimeout = setTimeout(() => {
        setIsDeleting(true);
      }, 1600);
      return () => clearTimeout(pauseTimeout);
    }

    if (isDeleting && displayText === '') {
      // Pause before typing next question
      const nextTimeout = setTimeout(() => {
        setIsDeleting(false);
        setQuestionIndex((prev) => (prev + 1) % QUESTIONS.length);
      }, 280);
      return () => clearTimeout(nextTimeout);
    }

    const delay = isDeleting
      ? 22 // Natural backspacing speed
      : Math.floor(Math.random() * 20) + 38; // Natural typing variation (38-58ms)

    const timer = setTimeout(() => {
      setDisplayText((current) =>
        isDeleting
          ? current.slice(0, -1)
          : currentFullText.slice(0, current.length + 1)
      );
    }, delay);

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, questionIndex, shouldReduceMotion]);

  return (
    <div className="w-full max-w-xl mx-auto select-none" aria-label="Illustrative verification inquiry">
      {/* Screen reader static version */}
      <span className="sr-only">
        Can I trust this answer? GroundGuard traces factual claims to evidence and verifies them.
      </span>

      {/* Visual live typing presentation */}
      <div
        aria-hidden="true"
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-xs sm:text-sm text-muted-foreground shadow-xs transition-colors"
      >
        <span className="text-[11px] uppercase tracking-wider font-mono text-muted-foreground/70 shrink-0 font-medium mr-1 hidden sm:inline">
          Inquiry
        </span>
        <span className="text-muted-foreground/40 hidden sm:inline">·</span>
        <span className="text-foreground/90 font-medium">“{displayText}”</span>
        <span className="inline-block w-[1.5px] h-3.5 bg-foreground/70 animate-subtle-pulse -ml-0.5" />
      </div>
    </div>
  );
}
