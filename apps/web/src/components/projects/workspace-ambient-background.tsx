'use client';

import * as React from 'react';

/**
 * WorkspaceAmbientBackground
 * 
 * Re-engineered full-page atmospheric depth system for EVIDEX:
 * - 4 distinct, soft ambient blooms (Top-Left, Top-Right, Middle-Left, Bottom-Right)
 * - Removed weak visual dust / specks / random crosshairs
 * - Spatially intentional evidence motifs (6-8 larger soft nodes + faint connecting lines)
 * - 3 floating translucent evidence capsules / blur forms
 * - Gentle 2-5px slow drift (20-30s cycle) with strict prefers-reduced-motion fallback
 * - Subtle cursor parallax (max 2-3px displacement) throttled via rAF
 * - Non-interfering: pointer-events-none, aria-hidden="true", behind all content
 */
export function WorkspaceAmbientBackground() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [parallax, setParallax] = React.useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Subtle pointer reaction (max 3px displacement)
  React.useEffect(() => {
    if (reducedMotion) return;
    let animFrame: number;

    const handlePointerMove = (e: PointerEvent) => {
      cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth - 0.5) * 6; // -3px to +3px
        const y = (e.clientY / window.innerHeight - 0.5) * 6;
        setParallax({ x, y });
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [reducedMotion]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none"
    >
      <style jsx>{`
        @keyframes floatBloomA {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          50% {
            transform: translate(16px, -18px) scale(1.05);
          }
          100% {
            transform: translate(-12px, 14px) scale(0.97);
          }
        }
        @keyframes floatBloomB {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          50% {
            transform: translate(-16px, 18px) scale(1.06);
          }
          100% {
            transform: translate(14px, -12px) scale(0.96);
          }
        }
        @keyframes floatBloomC {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          50% {
            transform: translate(14px, 16px) scale(1.04);
          }
          100% {
            transform: translate(-16px, -12px) scale(0.96);
          }
        }
        @keyframes floatBloomD {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          50% {
            transform: translate(-14px, -16px) scale(1.05);
          }
          100% {
            transform: translate(12px, 14px) scale(0.96);
          }
        }
        @keyframes floatCapsuleSlow {
          0% {
            transform: translate(0px, 0px);
          }
          50% {
            transform: translate(4px, -6px);
          }
          100% {
            transform: translate(-4px, 4px);
          }
        }

        .ambient-bloom-a {
          animation: floatBloomA 26s ease-in-out infinite alternate;
          will-change: transform;
        }
        .ambient-bloom-b {
          animation: floatBloomB 30s ease-in-out infinite alternate;
          will-change: transform;
        }
        .ambient-bloom-c {
          animation: floatBloomC 28s ease-in-out infinite alternate;
          will-change: transform;
        }
        .ambient-bloom-d {
          animation: floatBloomD 32s ease-in-out infinite alternate;
          will-change: transform;
        }
        .ambient-capsule {
          animation: floatCapsuleSlow 20s ease-in-out infinite alternate;
          will-change: transform;
        }

        @media (prefers-reduced-motion: reduce) {
          .ambient-bloom-a,
          .ambient-bloom-b,
          .ambient-bloom-c,
          .ambient-bloom-d,
          .ambient-capsule {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* 4 Clear Ambient Blooms */}

      {/* Bloom A: Top-Left / Behind Hero (Cool Emerald + Blue-Gray) */}
      <div
        className="ambient-bloom-a absolute -top-48 -left-36 w-[720px] h-[720px] rounded-full blur-[140px] opacity-75 dark:opacity-40 bg-gradient-to-br from-emerald-500/22 via-slate-500/14 to-transparent"
        style={{
          transform: reducedMotion
            ? 'none'
            : `translate3d(${parallax.x * 0.8}px, ${parallax.y * 0.8}px, 0)`,
        }}
      />

      {/* Bloom B: Top-Right (Subtle Cyan / Slate) */}
      <div
        className="ambient-bloom-b absolute -top-24 -right-32 w-[650px] h-[650px] rounded-full blur-[130px] opacity-70 dark:opacity-35 bg-gradient-to-bl from-cyan-500/18 via-slate-600/12 to-transparent"
        style={{
          transform: reducedMotion
            ? 'none'
            : `translate3d(${-parallax.x * 0.7}px, ${parallax.y * 0.7}px, 0)`,
        }}
      />

      {/* Bloom C: Middle-Left (Large Diffuse Cool-Gray / Blue Field) */}
      <div
        className="ambient-bloom-c absolute top-[42%] -left-44 w-[740px] h-[740px] rounded-full blur-[150px] opacity-65 dark:opacity-35 bg-gradient-to-r from-slate-500/18 via-sky-600/12 to-transparent"
        style={{
          transform: reducedMotion
            ? 'none'
            : `translate3d(${parallax.x * 0.6}px, ${-parallax.y * 0.6}px, 0)`,
        }}
      />

      {/* Bloom D: Bottom-Right (Soft Emerald / Graphite Fade) */}
      <div
        className="ambient-bloom-d absolute -bottom-48 -right-36 w-[700px] h-[700px] rounded-full blur-[140px] opacity-70 dark:opacity-35 bg-gradient-to-tl from-emerald-600/18 via-slate-700/14 to-transparent"
        style={{
          transform: reducedMotion
            ? 'none'
            : `translate3d(${-parallax.x * 0.6}px, ${parallax.y * 0.6}px, 0)`,
        }}
      />

      {/* Full-Page Spatially Intentional Evidence Motifs */}
      <svg
        className="absolute inset-0 w-full h-full opacity-40 dark:opacity-25"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          transform: reducedMotion
            ? 'none'
            : `translate3d(${parallax.x * 0.4}px, ${parallax.y * 0.4}px, 0)`,
          transition: 'transform 0.2s ease-out',
        }}
      >
        <defs>
          <linearGradient id="motifLineGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.05" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="motifLineGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.06" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.20" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {/* Cluster 1: Top-Left / Hero Lineage Motif */}
        <line
          x1="5%"
          y1="18%"
          x2="14%"
          y2="28%"
          stroke="url(#motifLineGrad1)"
          strokeWidth="1.2"
          className="text-foreground"
        />
        <line
          x1="14%"
          y1="28%"
          x2="8%"
          y2="40%"
          stroke="url(#motifLineGrad1)"
          strokeWidth="1"
          strokeDasharray="4 4"
          className="text-foreground"
        />
        {/* Soft evidence nodes */}
        <circle cx="5%" cy="18%" r="4.5" className="fill-emerald-500/25 stroke-emerald-500/50" strokeWidth="1" />
        <circle cx="14%" cy="28%" r="5.5" className="fill-slate-500/20 stroke-slate-500/40" strokeWidth="1" />
        <circle cx="8%" cy="40%" r="4" className="fill-cyan-500/20 stroke-cyan-500/40" strokeWidth="1" />

        {/* Cluster 2: Bottom-Right Workspace Lineage Motif */}
        <line
          x1="88%"
          y1="64%"
          x2="94%"
          y2="76%"
          stroke="url(#motifLineGrad2)"
          strokeWidth="1.2"
          className="text-foreground"
        />
        <line
          x1="94%"
          y1="76%"
          x2="84%"
          y2="88%"
          stroke="url(#motifLineGrad2)"
          strokeWidth="1"
          strokeDasharray="4 4"
          className="text-foreground"
        />
        <circle cx="88%" cy="64%" r="5" className="fill-slate-500/20 stroke-slate-500/40" strokeWidth="1" />
        <circle cx="94%" cy="76%" r="6" className="fill-emerald-500/25 stroke-emerald-500/50" strokeWidth="1" />
        <circle cx="84%" cy="88%" r="4.5" className="fill-slate-500/20 stroke-slate-500/40" strokeWidth="1" />
      </svg>

      {/* Floating Translucent Evidence Capsules / Blur Forms */}
      <div
        className="ambient-capsule absolute top-[22%] left-[2%] xl:left-[3%] hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 dark:bg-card/40 backdrop-blur-md shadow-xs opacity-75 dark:opacity-45"
        style={{
          transform: reducedMotion
            ? 'none'
            : `translate3d(${parallax.x * 0.5}px, ${parallax.y * 0.5}px, 0)`,
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-status-verified" />
        <span className="text-[9px] font-mono tracking-wider text-muted-foreground uppercase">
          grounded claim
        </span>
      </div>

      <div
        className="ambient-capsule absolute top-[52%] right-[2%] xl:right-[3%] hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/5 dark:bg-card/40 backdrop-blur-md shadow-xs opacity-70 dark:opacity-40"
        style={{
          transform: reducedMotion
            ? 'none'
            : `translate3d(${-parallax.x * 0.5}px, ${parallax.y * 0.5}px, 0)`,
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-status-recovered" />
        <span className="text-[9px] font-mono tracking-wider text-muted-foreground uppercase">
          verified source
        </span>
      </div>

      <div
        className="ambient-capsule absolute bottom-[12%] left-[2%] xl:left-[3%] hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-500/20 bg-slate-500/5 dark:bg-card/40 backdrop-blur-md shadow-xs opacity-65 dark:opacity-35"
        style={{
          transform: reducedMotion
            ? 'none'
            : `translate3d(${parallax.x * 0.4}px, ${-parallax.y * 0.4}px, 0)`,
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary/40" />
        <span className="text-[9px] font-mono tracking-wider text-muted-foreground uppercase">
          evidence lineage
        </span>
      </div>
    </div>
  );
}
