'use client';

import * as React from 'react';
import { Shield, Plus, Sparkles, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface EvidenceFieldHeroProps {
  projectCount: number;
  onNewProject: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

// 18 static evidence node coordinates in percentage (0-100%)
const NODES = [
  { id: 1, x: 8, y: 22, r: 2.5, type: 'node' },
  { id: 2, x: 18, y: 48, r: 4.5, type: 'anchor', label: 'source' },
  { id: 3, x: 28, y: 18, r: 2.5, type: 'node' },
  { id: 4, x: 38, y: 65, r: 3.0, type: 'node' },
  { id: 5, x: 48, y: 25, r: 5.0, type: 'anchor', label: 'claim' },
  { id: 6, x: 58, y: 72, r: 2.5, type: 'node' },
  { id: 7, x: 68, y: 35, r: 3.5, type: 'node' },
  { id: 8, x: 78, y: 60, r: 5.0, type: 'anchor', label: 'verified' },
  { id: 9, x: 88, y: 20, r: 2.5, type: 'node' },
  { id: 10, x: 94, y: 52, r: 3.0, type: 'node' },
  { id: 11, x: 14, y: 80, r: 3.0, type: 'node' },
  { id: 12, x: 32, y: 85, r: 2.5, type: 'node' },
  { id: 13, x: 74, y: 15, r: 4.5, type: 'anchor', label: 'evidence' },
  { id: 14, x: 84, y: 82, r: 2.5, type: 'node' },
  { id: 15, x: 52, y: 88, r: 3.0, type: 'node' },
  { id: 16, x: 4, y: 55, r: 2.5, type: 'node' },
  { id: 17, x: 64, y: 12, r: 2.5, type: 'node' },
  { id: 18, x: 42, y: 42, r: 3.5, type: 'node' },
];

// Sparse connection pairs between nearby nodes
const EDGES: [number, number][] = [
  [1, 2],
  [2, 3],
  [2, 11],
  [3, 5],
  [4, 5],
  [5, 7],
  [5, 18],
  [6, 8],
  [7, 8],
  [7, 13],
  [8, 10],
  [8, 14],
  [9, 13],
  [11, 12],
  [15, 6],
];

export function EvidenceFieldHero({
  projectCount,
  onNewProject,
  searchQuery,
  onSearchChange,
}: EvidenceFieldHeroProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [parallaxOffset, setParallaxOffset] = React.useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = React.useState(false);

  // Check prefers-reduced-motion
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Subtle pointer parallax listener (throttled via requestAnimationFrame)
  React.useEffect(() => {
    if (reducedMotion) return;
    let animFrame: number;

    const handlePointerMove = (e: PointerEvent) => {
      cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width - 0.5;
        const relY = (e.clientY - rect.top) / rect.height - 0.5;
        // Maximum 4px shift
        setParallaxOffset({
          x: Math.max(-4, Math.min(4, relX * 8)),
          y: Math.max(-4, Math.min(4, relY * 8)),
        });
      });
    };

    const handlePointerLeave = () => {
      cancelAnimationFrame(animFrame);
      setParallaxOffset({ x: 0, y: 0 });
    };

    const node = containerRef.current;
    if (node) {
      node.addEventListener('pointermove', handlePointerMove, { passive: true });
      node.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    }

    return () => {
      cancelAnimationFrame(animFrame);
      if (node) {
        node.removeEventListener('pointermove', handlePointerMove);
        node.removeEventListener('pointerleave', handlePointerLeave);
      }
    };
  }, [reducedMotion]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card/95 via-card/85 to-card/70 p-6 sm:p-8 backdrop-blur-xl shadow-xs dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all"
    >
      {/* Interactive Evidence Field Background (SVG Canvas) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden"
        style={{
          transform: reducedMotion
            ? 'none'
            : `translate3d(${parallaxOffset.x}px, ${parallaxOffset.y}px, 0)`,
          transition: 'transform 0.15s ease-out',
        }}
      >
        {/* Soft radial glow behind center */}
        <div className="absolute left-1/2 top-1/2 h-[340px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute right-12 top-8 h-48 w-48 rounded-full bg-status-verified/5 blur-2xl" />

        <svg
          className="h-full w-full opacity-60 dark:opacity-40"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" />
              <stop offset="50%" stopColor="currentColor" stopOpacity="0.25" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.12" />
            </linearGradient>
          </defs>

          {/* Sparse Connection Edges */}
          {EDGES.map(([startId, endId], idx) => {
            const start = NODES.find((n) => n.id === startId);
            const end = NODES.find((n) => n.id === endId);
            if (!start || !end) return null;
            return (
              <line
                key={`edge-${idx}`}
                x1={`${start.x}%`}
                y1={`${start.y}%`}
                x2={`${end.x}%`}
                y2={`${end.y}%`}
                stroke="url(#edgeGrad)"
                strokeWidth="1"
                strokeDasharray={idx % 3 === 0 ? '3 3' : 'none'}
                className="text-foreground/40"
              />
            );
          })}

          {/* Evidence Nodes */}
          {NODES.map((node) => (
            <g key={`node-${node.id}`} className={reducedMotion ? '' : 'animate-pulse'}>
              {node.type === 'anchor' && (
                <circle
                  cx={`${node.x}%`}
                  cy={`${node.y}%`}
                  r={node.r * 2.2}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.75"
                  className="text-status-verified/30"
                />
              )}
              <circle
                cx={`${node.x}%`}
                cy={`${node.y}%`}
                r={node.r}
                className={
                  node.type === 'anchor'
                    ? 'fill-status-verified/70 dark:fill-status-verified/60'
                    : 'fill-foreground/25 dark:fill-foreground/20'
                }
              />
              {node.label && (
                <text
                  x={`${node.x + 1.2}%`}
                  y={`${node.y - 1.2}%`}
                  className="text-[9px] font-mono tracking-wider fill-muted-foreground/60 select-none uppercase hidden sm:inline"
                >
                  {node.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Hero Foreground Content */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        {/* Left Column: Brand, Title, Orientation */}
        <div className="space-y-3 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-xs">
            <span className="flex h-1.5 w-1.5 rounded-full bg-status-verified ring-2 ring-status-verified/20" />
            <span className="font-semibold tracking-tight text-foreground">EVIDEX</span>
            <span className="text-border">·</span>
            <span>Evidence Workspaces</span>
            {projectCount > 0 && (
              <>
                <span className="text-border">·</span>
                <span className="text-foreground/80">{projectCount} loaded</span>
              </>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Your evidence workspaces
          </h1>

          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Pick up where you left off, inspect grounded knowledge, or start a new project.
            Each workspace keeps documents, claims, and telemetry strictly isolated.
          </p>
        </div>

        {/* Right Column: Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <Button
            onClick={onNewProject}
            className="h-9 px-4 text-xs font-semibold gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New project</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
