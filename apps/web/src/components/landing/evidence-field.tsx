'use client';

import * as React from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface EvidenceFragment {
  id: string;
  label: string;
  sourceTag?: string;
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  connectsTo?: string; // id of connected fragment
  visibility: 'all' | 'tablet' | 'desktop'; // responsive density control
  inquiryMatchIndex?: number; // matches question index (0: trust, 1: provenance, 2: conflict, 3: recovery)
}

export const FRAGMENTS: EvidenceFragment[] = [
  // Upper left cluster
  {
    id: 'f-1',
    label: '42.7%',
    sourceTag: 'variance metric',
    x: 8,
    y: 18,
    connectsTo: 'f-2',
    visibility: 'all',
    inquiryMatchIndex: 2, // conflict inquiry
  },
  {
    id: 'f-2',
    label: 'Annual Report · Page 18',
    sourceTag: 'certified document',
    x: 18,
    y: 28,
    visibility: 'all',
    inquiryMatchIndex: 1, // provenance inquiry
  },

  // Upper right cluster
  {
    id: 'f-3',
    label: '$12.4M',
    sourceTag: 'reported sum',
    x: 88,
    y: 16,
    connectsTo: 'f-4',
    visibility: 'all',
    inquiryMatchIndex: 0,
  },
  {
    id: 'f-4',
    label: '“...increased year over year”',
    sourceTag: 'quote passage',
    x: 76,
    y: 26,
    visibility: 'all',
    inquiryMatchIndex: 0,
  },

  // Mid left
  {
    id: 'f-5',
    label: '[ source / 04 ]',
    sourceTag: 'index reference',
    x: 6,
    y: 52,
    connectsTo: 'f-6',
    visibility: 'tablet',
    inquiryMatchIndex: 1, // provenance inquiry
  },
  {
    id: 'f-6',
    label: 'Policy revision 3.1',
    sourceTag: 'active policy',
    x: 15,
    y: 64,
    visibility: 'tablet',
    inquiryMatchIndex: 3, // recovery inquiry
  },

  // Mid right
  {
    id: 'f-7',
    label: 'Section 8.2',
    sourceTag: 'clause reference',
    x: 90,
    y: 48,
    connectsTo: 'f-8',
    visibility: 'tablet',
    inquiryMatchIndex: 2, // conflict inquiry
  },
  {
    id: 'f-8',
    label: '“shall not exceed”',
    sourceTag: 'boundary constraint',
    x: 78,
    y: 60,
    visibility: 'tablet',
    inquiryMatchIndex: 2,
  },

  // Lower periphery (desktop only)
  {
    id: 'f-9',
    label: 'effective from January',
    sourceTag: 'temporal scope',
    x: 10,
    y: 84,
    visibility: 'desktop',
    inquiryMatchIndex: 3, // recovery inquiry
  },
  {
    id: 'f-10',
    label: 'rev. 3',
    sourceTag: 'version lineage',
    x: 86,
    y: 84,
    visibility: 'desktop',
    inquiryMatchIndex: 1,
  },
];

interface EvidenceFieldProps {
  activeInquiryIndex?: number;
}

export function EvidenceField({ activeInquiryIndex = 0 }: EvidenceFieldProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const nodeRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const lineRefs = React.useRef<Map<string, SVGLineElement>>(new Map());
  const shouldReduceMotion = useReducedMotion();

  React.useEffect(() => {
    if (shouldReduceMotion) return;

    const container = containerRef.current;
    if (!container) return;

    let rafId: number;
    let mouseX = -1000;
    let mouseY = -1000;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateProximity);
    };

    const handlePointerLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateProximity);
    };

    const updateProximity = () => {
      const rect = container.getBoundingClientRect();
      const radius = 250; // Proximity field influence radius
      const hasPointerInView = mouseX > 0 && mouseY > 0;

      FRAGMENTS.forEach((fragment) => {
        const el = nodeRefs.current.get(fragment.id);
        if (!el) return;

        const posX = (fragment.x / 100) * rect.width;
        const posY = (fragment.y / 100) * rect.height;
        const dist = Math.hypot(mouseX - posX, mouseY - posY);

        const matchesInquiry = fragment.inquiryMatchIndex === activeInquiryIndex;

        if (hasPointerInView && dist < radius) {
          // Sharpens near pointer: opacity up to 0.95, slight scale
          const strength = 1 - dist / radius;
          const targetOpacity = 0.35 + strength * 0.6;
          el.style.opacity = targetOpacity.toFixed(3);
          el.style.borderColor = `hsl(var(--border) / ${(0.4 + strength * 0.55).toFixed(2)})`;
          el.style.transform = `translate(-50%, -50%) scale(${(1 + strength * 0.05).toFixed(3)})`;
          el.classList.add('shadow-sm');

          // Reveal provenance tag
          const tagEl = el.querySelector('.provenance-tag') as HTMLElement | null;
          if (tagEl) {
            tagEl.style.opacity = (strength * 0.9).toFixed(2);
            tagEl.style.maxHeight = '20px';
          }
        } else if (matchesInquiry) {
          // Subtle highlight corresponding to the active typed question
          el.style.opacity = '0.55';
          el.style.borderColor = 'hsl(var(--border) / 0.5)';
          el.style.transform = 'translate(-50%, -50%) scale(1.02)';
          el.classList.remove('shadow-sm');

          const tagEl = el.querySelector('.provenance-tag') as HTMLElement | null;
          if (tagEl) {
            tagEl.style.opacity = '0.5';
            tagEl.style.maxHeight = '20px';
          }
        } else {
          // Calmed baseline: slight dimming when cursor is elsewhere
          const baseOpacity = hasPointerInView ? '0.18' : '0.26';
          el.style.opacity = baseOpacity;
          el.style.borderColor = 'hsl(var(--border) / 0.25)';
          el.style.transform = 'translate(-50%, -50%) scale(1)';
          el.classList.remove('shadow-sm');

          const tagEl = el.querySelector('.provenance-tag') as HTMLElement | null;
          if (tagEl) {
            tagEl.style.opacity = '0';
            tagEl.style.maxHeight = '0px';
          }
        }

        // Update connected SVG line
        if (fragment.connectsTo) {
          const lineEl = lineRefs.current.get(`${fragment.id}-${fragment.connectsTo}`);
          if (lineEl) {
            const targetFrag = FRAGMENTS.find((f) => f.id === fragment.connectsTo);
            if (targetFrag) {
              const targetX = (targetFrag.x / 100) * rect.width;
              const targetY = (targetFrag.y / 100) * rect.height;
              const distToMidpoint = Math.hypot(
                mouseX - (posX + targetX) / 2,
                mouseY - (posY + targetY) / 2
              );

              if (hasPointerInView && distToMidpoint < radius * 1.3) {
                const lineStrength = 1 - distToMidpoint / (radius * 1.3);
                lineEl.style.opacity = (0.06 + lineStrength * 0.55).toFixed(3);
                lineEl.setAttribute('stroke-width', '1.5');
              } else if (matchesInquiry) {
                lineEl.style.opacity = '0.35';
                lineEl.setAttribute('stroke-width', '1.2');
              } else {
                lineEl.style.opacity = '0.06';
                lineEl.setAttribute('stroke-width', '1');
              }
            }
          }
        }
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    container.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
      cancelAnimationFrame(rafId);
    };
  }, [shouldReduceMotion, activeInquiryIndex]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0"
    >
      {/* LAYER 0: Subtle Coordinate / Reasoning Marks */}
      <div className="absolute inset-0 opacity-[0.035] bg-[radial-gradient(hsl(var(--foreground))_1px,transparent_1px)] [background-size:32px_32px]" />

      {/* LAYER 2: Fine SVG relationship lines between linked nodes */}
      <svg className="absolute inset-0 w-full h-full">
        {FRAGMENTS.filter((f) => f.connectsTo).map((f) => {
          const target = FRAGMENTS.find((t) => t.id === f.connectsTo);
          if (!target) return null;
          return (
            <line
              key={`${f.id}-${target.id}`}
              ref={(el) => {
                if (el) lineRefs.current.set(`${f.id}-${target.id}`, el);
                else lineRefs.current.delete(`${f.id}-${target.id}`);
              }}
              x1={`${f.x}%`}
              y1={`${f.y}%`}
              x2={`${target.x}%`}
              y2={`${target.y}%`}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 3"
              className={cn(
                'text-muted-foreground transition-opacity duration-300',
                f.visibility === 'tablet' && 'hidden sm:block',
                f.visibility === 'desktop' && 'hidden lg:block'
              )}
              style={{ opacity: 0.06 }}
            />
          );
        })}
      </svg>

      {/* LAYER 1: Ambient Information Fragments */}
      {FRAGMENTS.map((fragment, index) => {
        const animationDelay = `${(index * 1.6) % 6}s`;

        return (
          <div
            key={fragment.id}
            ref={(el) => {
              if (el) nodeRefs.current.set(fragment.id, el);
              else nodeRefs.current.delete(fragment.id);
            }}
            className={cn(
              'absolute text-xs tracking-tight rounded-md px-2.5 py-1 border border-border/30 bg-card/50 backdrop-blur-[2px] text-muted-foreground whitespace-nowrap transition-all duration-300 flex flex-col items-start gap-0.5',
              !shouldReduceMotion && 'animate-subtle-pulse',
              fragment.visibility === 'tablet' && 'hidden sm:inline-flex',
              fragment.visibility === 'desktop' && 'hidden lg:inline-flex'
            )}
            style={{
              left: `${fragment.x}%`,
              top: `${fragment.y}%`,
              transform: 'translate(-50%, -50%)',
              opacity: 0.26,
              animationDelay,
              animationDuration: `${14 + (index % 5)}s`,
            }}
          >
            <div className="flex items-center gap-1.5 font-medium">
              <span className="h-1 w-1 rounded-full bg-muted-foreground/60 shrink-0" />
              <span>{fragment.label}</span>
            </div>
            {fragment.sourceTag && (
              <span className="provenance-tag text-[9px] font-mono uppercase tracking-wider text-muted-foreground/80 opacity-0 max-h-0 overflow-hidden transition-all duration-200">
                {fragment.sourceTag}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
