'use client';

import * as React from 'react';
import { Sparkles, Compass } from 'lucide-react';
import { generateProjectBrief } from '@/lib/overview-helpers';

interface ProjectBriefProps {
  totalDocs: number;
  readyDocsCount: number;
  totalChunks: number;
  totalClaims: number;
  verifiedClaims: number;
  recoveredClaims: number;
  flaggedClaims: number;
  hotspotLabel?: string | null;
}

export function ProjectBrief({
  totalDocs,
  readyDocsCount,
  totalChunks,
  totalClaims,
  verifiedClaims,
  recoveredClaims,
  flaggedClaims,
  hotspotLabel,
}: ProjectBriefProps) {
  const observations = React.useMemo(() => {
    return generateProjectBrief({
      totalDocs,
      readyDocsCount,
      totalChunks,
      totalClaims,
      verifiedClaims,
      recoveredClaims,
      flaggedClaims,
      hotspotLabel,
    });
  }, [
    totalDocs,
    readyDocsCount,
    totalChunks,
    totalClaims,
    verifiedClaims,
    recoveredClaims,
    flaggedClaims,
    hotspotLabel,
  ]);

  if (observations.length === 0) return null;

  return (
    <section
      className="relative rounded-2xl border border-border/35 bg-card/20 p-5 sm:p-6 overflow-hidden select-none"
      role="region"
      aria-label="Project brief"
    >
      {/* Quiet Technical Section Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/25">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
          <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/80 font-medium">
            Project Brief
          </h2>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/50 tracking-wider">
          DETERMINISTIC · ZERO SYNTHETIC TELEMETRY
        </span>
      </div>

      {/* Editorial Narrative Stream: Clean typography, authoritative voice, no KPI cards */}
      <div className="pt-4 space-y-2 max-w-4xl">
        <p className="text-base sm:text-lg text-foreground/90 font-normal leading-relaxed tracking-tight">
          {observations.map((sentence, idx) => (
            <React.Fragment key={idx}>
              <span className={idx === 0 ? 'text-foreground font-medium' : 'text-foreground/85'}>
                {sentence}
              </span>{' '}
            </React.Fragment>
          ))}
        </p>
      </div>
    </section>
  );
}
