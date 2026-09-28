'use client';

import * as React from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { FRAGMENTS, type EvidenceFragment } from '@/components/landing/evidence-field';

interface EvidenceProbeProps {
  containerRef: React.RefObject<HTMLElement | null>;
}

type ProbeState = 'idle' | 'found' | 'linked';

interface LockedTarget {
  fragment: EvidenceFragment;
  x: number; // pixel coords relative to container
  y: number;
  related?: {
    fragment: EvidenceFragment;
    x: number;
    y: number;
  };
}

export function EvidenceProbe({ containerRef }: EvidenceProbeProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isSupported, setIsSupported] = React.useState(false);
  const [isTablet, setIsTablet] = React.useState(false);

  // Position of actual pointer inside container
  const cursorX = useMotionValue(-1000);
  const cursorY = useMotionValue(-1000);

  // Target position for the probe (tensions toward fragment when in lock proximity)
  const targetX = useMotionValue(-1000);
  const targetY = useMotionValue(-1000);

  // Spring physics from specifications:
  // stiffness ~220, damping ~28, mass ~0.25
  // Produces subtle 10-18px lag behind native cursor
  const springConfig = React.useMemo(() => ({ stiffness: 220, damping: 28, mass: 0.25 }), []);
  const probeX = useSpring(targetX, springConfig);
  const probeY = useSpring(targetY, springConfig);

  // Discrete state for probe reticle mode and locked target
  const [probeState, setProbeState] = React.useState<ProbeState>('idle');
  const [lockedTarget, setLockedTarget] = React.useState<LockedTarget | null>(null);
  const [isVisible, setIsVisible] = React.useState(false);

  // Direct SVG line references for zero-re-render attribute updates
  const trailingTraceRef = React.useRef<SVGLineElement>(null);
  const tetherLineRef = React.useRef<SVGLineElement>(null);
  const lockedTargetRef = React.useRef<LockedTarget | null>(null);

  // Check hardware capability: fine pointer (mouse/trackpad/stylus) + non-mobile
  React.useEffect(() => {
    const fineQuery = window.matchMedia('(pointer: fine)');
    const checkSupport = () => {
      const hasFinePointer = fineQuery.matches;
      const isMobileWidth = window.innerWidth < 640;
      setIsSupported(hasFinePointer && !isMobileWidth);
      setIsTablet(window.innerWidth >= 640 && window.innerWidth < 1024);
    };

    checkSupport();
    fineQuery.addEventListener('change', checkSupport);
    window.addEventListener('resize', checkSupport);
    return () => {
      fineQuery.removeEventListener('change', checkSupport);
      window.removeEventListener('resize', checkSupport);
    };
  }, []);

  // Update SVG line coordinates directly through Framer Motion change subscriptions
  React.useEffect(() => {
    if (shouldReduceMotion || !isSupported) return;

    const updateLines = () => {
      const curX = cursorX.get();
      const curY = cursorY.get();
      const prbX = probeX.get();
      const prbY = probeY.get();

      // Trailing trace line between native cursor and spring-lagged probe
      if (trailingTraceRef.current) {
        trailingTraceRef.current.setAttribute('x1', curX.toFixed(1));
        trailingTraceRef.current.setAttribute('y1', curY.toFixed(1));
        trailingTraceRef.current.setAttribute('x2', prbX.toFixed(1));
        trailingTraceRef.current.setAttribute('y2', prbY.toFixed(1));
      }

      // Tether line between probe and locked evidence fragment
      if (tetherLineRef.current && lockedTargetRef.current) {
        tetherLineRef.current.setAttribute('x1', prbX.toFixed(1));
        tetherLineRef.current.setAttribute('y1', prbY.toFixed(1));
        tetherLineRef.current.setAttribute('x2', lockedTargetRef.current.x.toFixed(1));
        tetherLineRef.current.setAttribute('y2', lockedTargetRef.current.y.toFixed(1));
      }
    };

    const unsubX = probeX.on('change', updateLines);
    const unsubY = probeY.on('change', updateLines);

    return () => {
      unsubX();
      unsubY();
    };
  }, [shouldReduceMotion, isSupported, probeX, probeY, cursorX, cursorY]);

  // Pointer tracking & proximity calculation
  React.useEffect(() => {
    if (shouldReduceMotion || !isSupported) return;

    const container = containerRef.current;
    if (!container) return;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const inBounds =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (!inBounds) {
        if (isVisible) {
          setIsVisible(false);
          setProbeState('idle');
          setLockedTarget(null);
          lockedTargetRef.current = null;
        }
        return;
      }

      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      cursorX.set(px);
      cursorY.set(py);

      if (!isVisible) {
        setIsVisible(true);
      }

      // Filter visible fragments based on responsive viewport
      const width = window.innerWidth;
      const visibleFragments = FRAGMENTS.filter((f) => {
        if (f.visibility === 'all') return true;
        if (f.visibility === 'tablet') return width >= 640;
        if (f.visibility === 'desktop') return width >= 1024;
        return true;
      });

      // Lock radius: 135px desktop, 85px tablet
      const lockRadius = isTablet ? 85 : 135;
      let nearest: EvidenceFragment | null = null;
      let minDist = Infinity;
      let nearestX = 0;
      let nearestY = 0;

      for (const f of visibleFragments) {
        const fx = (f.x / 100) * rect.width;
        const fy = (f.y / 100) * rect.height;
        const d = Math.hypot(px - fx, py - fy);
        if (d < minDist) {
          minDist = d;
          nearest = f;
          nearestX = fx;
          nearestY = fy;
        }
      }

      if (nearest && minDist < lockRadius) {
        // Subtle magnetic pull toward the nearest fragment
        const pullFactor = Math.pow(1 - minDist / lockRadius, 2) * 0.22;
        targetX.set(px + (nearestX - px) * pullFactor);
        targetY.set(py + (nearestY - py) * pullFactor);

        // Check if nearest fragment has a relationship edge
        const related =
          FRAGMENTS.find((f) => f.id === nearest!.connectsTo) ||
          FRAGMENTS.find((f) => f.connectsTo === nearest!.id);

        const nextState: ProbeState = related ? 'linked' : 'found';

        if (lockedTargetRef.current?.fragment.id !== nearest.id) {
          const targetData: LockedTarget = {
            fragment: nearest,
            x: nearestX,
            y: nearestY,
            related: related
              ? {
                  fragment: related,
                  x: (related.x / 100) * rect.width,
                  y: (related.y / 100) * rect.height,
                }
              : undefined,
          };
          lockedTargetRef.current = targetData;
          setLockedTarget(targetData);
          setProbeState(nextState);
        }
      } else {
        // Free roaming: follow pointer directly
        targetX.set(px);
        targetY.set(py);

        if (lockedTargetRef.current !== null) {
          lockedTargetRef.current = null;
          setLockedTarget(null);
          setProbeState('idle');
        }
      }
    };

    const handlePointerLeave = () => {
      setIsVisible(false);
      setProbeState('idle');
      setLockedTarget(null);
      lockedTargetRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    container.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [
    shouldReduceMotion,
    isSupported,
    isTablet,
    isVisible,
    containerRef,
    cursorX,
    cursorY,
    targetX,
    targetY,
  ]);

  if (shouldReduceMotion || !isSupported) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden select-none z-20"
    >
      {/* Dynamic SVG layer for trailing trace & tethers */}
      <svg className="absolute inset-0 w-full h-full">
        {/* 1. Trailing trace segment (cursor ───── probe) */}
        <line
          ref={trailingTraceRef}
          stroke="currentColor"
          strokeWidth="0.8"
          strokeDasharray="2 3"
          className={cn(
            'text-muted-foreground/35 transition-opacity duration-200',
            isVisible && probeState === 'idle' ? 'opacity-100' : 'opacity-0'
          )}
        />

        {/* 2. Temporary verification tether (probe ───── fragment) */}
        <line
          ref={tetherLineRef}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 2"
          className={cn(
            'text-foreground/50 transition-opacity duration-200',
            isVisible && lockedTarget ? 'opacity-100' : 'opacity-0'
          )}
        />

        {/* 3. Evidence Anchor & Linked Relationship Line */}
        {lockedTarget && (
          <g className="transition-opacity duration-200">
            {/* Target fragment anchor point */}
            <circle
              cx={lockedTarget.x}
              cy={lockedTarget.y}
              r="2.5"
              fill="currentColor"
              className="text-foreground/70"
            />

            {/* Relationship edge to linked fragment */}
            {lockedTarget.related && (
              <g className="animate-in fade-in duration-300">
                <line
                  x1={lockedTarget.x}
                  y1={lockedTarget.y}
                  x2={lockedTarget.related.x}
                  y2={lockedTarget.related.y}
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                  className="text-foreground/50"
                />
                <circle
                  cx={lockedTarget.related.x}
                  cy={lockedTarget.related.y}
                  r="2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-foreground/60"
                />
              </g>
            )}
          </g>
        )}
      </svg>

      {/* Lagging Focus Reticle */}
      <motion.div
        style={{
          x: probeX,
          y: probeY,
          translateX: '-50%',
          translateY: '-50%',
        }}
        className={cn(
          'pointer-events-none absolute top-0 left-0 transition-opacity duration-200',
          isVisible ? 'opacity-100' : 'opacity-0'
        )}
      >
        <motion.div
          animate={{
            scale: probeState === 'idle' ? 1 : probeState === 'found' ? 0.84 : 0.88,
          }}
          transition={{ type: 'spring', stiffness: 350, damping: 26 }}
          className={cn(
            'relative flex items-center justify-center w-5 h-5 text-muted-foreground/60 transition-colors duration-200',
            probeState !== 'idle' && 'text-foreground'
          )}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="overflow-visible"
          >
            {/* Corner brackets: ⌜ ⌝ ⌞ ⌟ */}
            {/* Top-Left */}
            <path
              d="M 2 6 L 2 2 L 6 2"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Top-Right */}
            <path
              d="M 14 2 L 18 2 L 18 6"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Bottom-Right */}
            <path
              d="M 18 14 L 18 18 L 14 18"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Bottom-Left */}
            <path
              d="M 6 18 L 2 18 L 2 14"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Found: Center Dot */}
            {probeState !== 'idle' && (
              <circle
                cx="10"
                cy="10"
                r="1.6"
                fill="currentColor"
                className="transition-transform duration-150 animate-in zoom-in-50"
              />
            )}

            {/* Linked: Crosshair ticks indicating verified edge */}
            {probeState === 'linked' && (
              <g
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                className="animate-in fade-in zoom-in-75 duration-150"
              >
                <line x1="10" y1="5.5" x2="10" y2="7.5" />
                <line x1="10" y1="12.5" x2="10" y2="14.5" />
                <line x1="5.5" y1="10" x2="7.5" y2="10" />
                <line x1="12.5" y1="10" x2="14.5" y2="10" />
              </g>
            )}
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}
