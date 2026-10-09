'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** Total time the confirmation is visible before navigation (session is already established when this mounts). */
export const LOGIN_SUCCESS_MS = 900;
export const LOGIN_SUCCESS_REDUCED_MS = 350;

/**
 * Compact post-login confirmation: a green disc scales in, a white check is drawn, a short message appears.
 * Purely presentational — it is mounted only after `login()` resolved, and navigation is driven by the caller's
 * timer, never by animation callbacks (so a failed animation can't block navigation).
 */
export function LoginSuccessOverlay({ name }: { name?: string | null }) {
  const reduce = !!useReducedMotion();
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0.1 : 0.15 }}
      role="status"
      aria-live="assertive"
    >
      <motion.div
        className="flex w-[min(88vw,300px)] flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card px-6 py-7 shadow-2xl"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
      >
        <motion.svg
          width="56"
          height="56"
          viewBox="0 0 56 56"
          aria-hidden="true"
          initial={reduce ? false : { scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 22, delay: reduce ? 0 : 0.05 }}
        >
          <circle cx="28" cy="28" r="28" fill="hsl(var(--status-verified))" />
          <motion.path
            d="M17 29.5l7 7 15-16"
            fill="none"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduce ? 0 : 0.32, ease: [0.65, 0, 0.35, 1], delay: reduce ? 0 : 0.18 }}
          />
        </motion.svg>
        <motion.div
          className="text-center"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: reduce ? 0 : 0.3 }}
        >
          <p className="text-sm font-semibold text-foreground">Signed in{name ? `, ${name}` : ''}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Opening your workspace…</p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
