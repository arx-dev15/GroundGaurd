import type { Transition, Variants } from 'framer-motion';

/**
 * EvideX AI Motion Foundation
 * Enhanced with scroll-triggered pop-up, morphing, and lively spring physics.
 */

export const MOTION_DURATIONS = {
  micro: 0.15,
  normal: 0.22,
  state: 0.32,
  panel: 0.26,
  reveal: 0.45,
} as const;

export const MOTION_EASINGS = {
  standard: [0.16, 1, 0.3, 1] as const,
  enter: [0.0, 0.0, 0.2, 1] as const,
  exit: [0.4, 0.0, 1, 1] as const,
  panel: [0.32, 0.72, 0, 1] as const,
  bounce: [0.34, 1.56, 0.64, 1] as const,
};

export const transitions = {
  micro: {
    duration: MOTION_DURATIONS.micro,
    ease: MOTION_EASINGS.standard,
  } satisfies Transition,

  normal: {
    duration: MOTION_DURATIONS.normal,
    ease: MOTION_EASINGS.standard,
  } satisfies Transition,

  state: {
    duration: MOTION_DURATIONS.state,
    ease: MOTION_EASINGS.standard,
  } satisfies Transition,

  panel: {
    duration: MOTION_DURATIONS.panel,
    ease: MOTION_EASINGS.panel,
  } satisfies Transition,

  spring: {
    type: 'spring',
    stiffness: 340,
    damping: 24,
    mass: 0.8,
  } satisfies Transition,

  springPop: {
    type: 'spring',
    stiffness: 280,
    damping: 20,
    mass: 0.7,
  } satisfies Transition,

  bouncy: {
    type: 'spring',
    stiffness: 380,
    damping: 18,
  } satisfies Transition,

  reduced: {
    duration: 0.01,
  } satisfies Transition,
};

export const variants = {
  fadeIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: transitions.normal },
    exit: { opacity: 0, transition: transitions.micro },
  } satisfies Variants,

  fadeSlideUp: {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: transitions.normal },
    exit: { opacity: 0, y: 8, transition: transitions.micro },
  } satisfies Variants,

  popIn: {
    hidden: { opacity: 0, scale: 0.94, y: 24 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: transitions.springPop,
    },
  } satisfies Variants,

  popInSm: {
    hidden: { opacity: 0, scale: 0.92, y: 12 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: transitions.bouncy,
    },
  } satisfies Variants,

  scaleIn: {
    hidden: { opacity: 0, scale: 0.86 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: transitions.springPop,
    },
  } satisfies Variants,

  panelSlideRight: {
    hidden: { x: '100%', opacity: 0 },
    visible: { x: 0, opacity: 1, transition: transitions.panel },
    exit: { x: '100%', opacity: 0, transition: transitions.panel },
  } satisfies Variants,

  staggerContainer: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.04,
      },
    },
  } satisfies Variants,
};
