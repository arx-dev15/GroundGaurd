'use client';

import * as React from 'react';
import Link from 'next/link';

interface EvidenceLineageProps {
  projectId: string;
  totalDocs: number;
  readyDocsCount: number;
  totalChunks: number;
  totalClaims: number;
  verifiedClaims: number;
  recoveredClaims: number;
  flaggedClaims: number;
}

type StageId = 'source' | 'passages' | 'claims' | 'verified' | 'recovered' | 'review' | null;

export function EvidenceLineage({
  projectId,
  totalDocs,
  readyDocsCount,
  totalChunks,
  totalClaims,
  verifiedClaims,
  recoveredClaims,
  flaggedClaims,
}: EvidenceLineageProps) {
  const [activeStage, setActiveStage] = React.useState<StageId>(null);

  // Concise supporting descriptions for interactive inspection
  const stageExplanations: Record<NonNullable<StageId>, string> = {
    source: `${totalDocs} ${totalDocs === 1 ? 'source' : 'sources'} uploaded (${readyDocsCount} indexed for retrieval)`,
    passages: `${totalChunks.toLocaleString()} text passages indexed using lexical + semantic retrieval`,
    claims: `${totalClaims} assertions extracted and analyzed from grounded answers`,
    verified: `${verifiedClaims} assertions directly supported by retrieved evidence`,
    recovered: `${recoveredClaims} assertions repaired and verified through autonomous recovery`,
    review: `${flaggedClaims} claims that require human attention`,
  };

  const isDimmed = (stage: StageId) => {
    if (!activeStage) return false;
    return activeStage !== stage;
  };

  return (
    <div
      className="relative w-full py-2 select-none"
      role="region"
      aria-label="Evidence transformation lineage"
    >
      {/* =====================================================================
          DESKTOP & TABLET HORIZONTAL LINEAGE FLOW (Refined ~15-20% Scale)
         ===================================================================== */}
      <div className="hidden md:flex flex-col gap-3">
        {/* Main Flow Rail — Confident, refined 120-130px height */}
        <div className="relative flex items-center justify-between w-full min-h-[120px] px-1 py-1">
          {/* Stage 1: Sources Node */}
          <div
            tabIndex={0}
            onMouseEnter={() => setActiveStage('source')}
            onMouseLeave={() => setActiveStage(null)}
            onFocus={() => setActiveStage('source')}
            onBlur={() => setActiveStage(null)}
            className={`group relative z-10 flex flex-col items-start cursor-pointer transition-all duration-200 outline-none ${
              isDimmed('source') ? 'opacity-35 blur-[0.3px]' : 'opacity-100'
            }`}
          >
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/80 mb-1">
              Source
            </span>
            <div className="flex items-center gap-2.5">
              <span className="h-3.5 w-3.5 rounded-full bg-primary ring-3 ring-primary/20 shadow-xs transition-transform duration-200 group-hover:scale-125 shrink-0" />
              <span className="text-lg sm:text-xl font-bold font-mono tracking-tight text-foreground">
                {totalDocs} {totalDocs === 1 ? 'source' : 'sources'}
              </span>
            </div>
            <span className="text-xs text-muted-foreground mt-0.5 font-medium pl-6">
              {readyDocsCount} ready for query
            </span>
          </div>

          {/* Connector 1 -> 2 */}
          <div className="relative flex-1 mx-3 sm:mx-5 h-[2px]">
            <div className="absolute inset-0 bg-border/70 rounded-full" />
            <div
              className={`absolute inset-0 bg-gradient-to-r from-primary/60 to-primary/30 rounded-full transition-opacity duration-300 ${
                activeStage === 'source' || activeStage === 'passages' ? 'opacity-100' : 'opacity-40'
              }`}
            />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-border" />
          </div>

          {/* Stage 2: Passages Node */}
          <div
            tabIndex={0}
            onMouseEnter={() => setActiveStage('passages')}
            onMouseLeave={() => setActiveStage(null)}
            onFocus={() => setActiveStage('passages')}
            onBlur={() => setActiveStage(null)}
            className={`group relative z-10 flex flex-col items-start cursor-pointer transition-all duration-200 outline-none ${
              isDimmed('passages') ? 'opacity-35 blur-[0.3px]' : 'opacity-100'
            }`}
          >
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/80 mb-1">
              Evidence
            </span>
            <div className="flex items-center gap-2.5">
              <span className="h-3.5 w-3.5 rounded-full bg-primary ring-3 ring-primary/20 shadow-xs transition-transform duration-200 group-hover:scale-125 shrink-0" />
              <span className="text-lg sm:text-xl font-bold font-mono tracking-tight text-foreground">
                {totalChunks.toLocaleString()} passages
              </span>
            </div>
            <span className="text-xs text-muted-foreground mt-0.5 font-medium pl-6">
              Lexical & semantic index
            </span>
          </div>

          {/* Connector 2 -> 3 */}
          <div className="relative flex-1 mx-3 sm:mx-5 h-[2px]">
            <div className="absolute inset-0 bg-border/70 rounded-full" />
            <div
              className={`absolute inset-0 bg-gradient-to-r from-primary/60 to-primary/30 rounded-full transition-opacity duration-300 ${
                activeStage === 'passages' || activeStage === 'claims' ? 'opacity-100' : 'opacity-40'
              }`}
            />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-border" />
          </div>

          {/* Stage 3: Claims Node */}
          <div
            tabIndex={0}
            onMouseEnter={() => setActiveStage('claims')}
            onMouseLeave={() => setActiveStage(null)}
            onFocus={() => setActiveStage('claims')}
            onBlur={() => setActiveStage(null)}
            className={`group relative z-10 flex flex-col items-start cursor-pointer transition-all duration-200 outline-none ${
              isDimmed('claims') ? 'opacity-35 blur-[0.3px]' : 'opacity-100'
            }`}
          >
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/80 mb-1">
              Claims
            </span>
            <div className="flex items-center gap-2.5">
              <span className="h-3.5 w-3.5 rounded-full bg-primary ring-3 ring-primary/20 shadow-xs transition-transform duration-200 group-hover:scale-125 shrink-0" />
              <span className="text-lg sm:text-xl font-bold font-mono tracking-tight text-foreground">
                {totalClaims} claims
              </span>
            </div>
            <span className="text-xs text-muted-foreground mt-0.5 font-medium pl-6">
              NLI Evaluated
            </span>
          </div>

          {/* Connector 3 -> 4: Branching SVG Flow Line */}
          <div className="relative w-24 sm:w-28 h-28 shrink-0 mx-2 flex items-center">
            <svg
              className="w-full h-full text-border/80"
              viewBox="0 0 100 112"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              {/* Branch to Verified (top, emerald cue) */}
              <path
                d="M 0 56 C 40 56, 60 16, 100 16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className={`transition-colors duration-300 ${
                  activeStage === 'verified' ? 'text-emerald-500' : 'text-border/80'
                }`}
              />
              {/* Branch to Recovered (middle, cyan cue) */}
              <path
                d="M 0 56 L 100 56"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                className={`transition-colors duration-300 ${
                  activeStage === 'recovered' ? 'text-sky-400' : 'text-border/70'
                }`}
              />
              {/* Branch to Review (bottom, amber cue) */}
              <path
                d="M 0 56 C 40 56, 60 96, 100 96"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                className={`transition-colors duration-300 ${
                  activeStage === 'review' || flaggedClaims > 0
                    ? 'text-amber-500/80'
                    : 'text-border/70'
                }`}
              />
            </svg>
          </div>

          {/* Stage 4: Branching Trust Outcomes (The Climax) */}
          <div className="flex flex-col justify-between h-28 py-0.5 min-w-[145px] shrink-0">
            {/* Branch A: Verified */}
            <div
              tabIndex={0}
              onMouseEnter={() => setActiveStage('verified')}
              onMouseLeave={() => setActiveStage(null)}
              onFocus={() => setActiveStage('verified')}
              onBlur={() => setActiveStage(null)}
              className={`group flex items-center gap-2.5 cursor-pointer transition-all duration-200 outline-none ${
                isDimmed('verified') ? 'opacity-35 blur-[0.3px]' : 'opacity-100'
              }`}
            >
              <span className="h-3 w-3 rounded-full bg-emerald-500 ring-3 ring-emerald-500/25 shrink-0 group-hover:scale-125 transition-transform" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg sm:text-xl font-bold font-mono text-emerald-400">
                  {verifiedClaims}
                </span>
                <span className="text-xs font-semibold text-foreground/90 group-hover:text-emerald-400 transition-colors">
                  verified
                </span>
              </div>
            </div>

            {/* Branch B: Recovered */}
            <div
              tabIndex={0}
              onMouseEnter={() => setActiveStage('recovered')}
              onMouseLeave={() => setActiveStage(null)}
              onFocus={() => setActiveStage('recovered')}
              onBlur={() => setActiveStage(null)}
              className={`group flex items-center gap-2.5 cursor-pointer transition-all duration-200 outline-none ${
                isDimmed('recovered') ? 'opacity-35 blur-[0.3px]' : 'opacity-100'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400 ring-3 ring-sky-400/25 shrink-0 group-hover:scale-125 transition-transform" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm sm:text-base font-bold font-mono text-sky-400">
                  {recoveredClaims}
                </span>
                <span className="text-xs font-semibold text-foreground/80 group-hover:text-sky-400 transition-colors">
                  recovered
                </span>
              </div>
            </div>

            {/* Branch C: Needs Review */}
            <div
              tabIndex={0}
              onMouseEnter={() => setActiveStage('review')}
              onMouseLeave={() => setActiveStage(null)}
              onFocus={() => setActiveStage('review')}
              onBlur={() => setActiveStage(null)}
              className={`group flex items-center gap-2.5 cursor-pointer transition-all duration-200 outline-none ${
                isDimmed('review') ? 'opacity-35 blur-[0.3px]' : 'opacity-100'
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 group-hover:scale-125 transition-transform ${
                  flaggedClaims > 0
                    ? 'bg-amber-500 ring-3 ring-amber-500/25'
                    : 'bg-muted-foreground/40 ring-3 ring-muted-foreground/10'
                }`}
              />
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-sm sm:text-base font-bold font-mono ${
                    flaggedClaims > 0 ? 'text-amber-400' : 'text-muted-foreground'
                  }`}
                >
                  {flaggedClaims}
                </span>
                <span className="text-xs font-semibold text-foreground/80 group-hover:text-amber-400 transition-colors">
                  review
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Supporting Detail Callout */}
        <div className="min-h-[26px] px-2.5 py-1 rounded-lg bg-card/30 border border-border/30 flex items-center">
          <p className="text-xs text-foreground/85 font-sans tracking-tight transition-all duration-200">
            {activeStage ? (
              <span className="inline-flex items-center gap-2 font-medium animate-in fade-in duration-150">
                <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                <span>{stageExplanations[activeStage]}</span>
              </span>
            ) : (
              <span className="text-muted-foreground/70 italic text-[11px]">
                Hover or focus any stage or outcome branch to inspect evidence mechanics
              </span>
            )}
          </p>
        </div>
      </div>

      {/* =====================================================================
          MOBILE VERTICAL LINEAGE FLOW (shown only on mobile < 768px)
         ===================================================================== */}
      <div className="md:hidden flex flex-col space-y-3 pl-3 py-1">
        {/* Node 1: Sources */}
        <div className="flex items-start gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-primary mt-1 shrink-0 ring-3 ring-primary/20" />
          <div className="space-y-0.5">
            <div className="text-sm font-bold font-mono text-foreground">
              {totalDocs} {totalDocs === 1 ? 'source' : 'sources'}
            </div>
            <div className="text-xs text-muted-foreground">
              {readyDocsCount} indexed for retrieval
            </div>
          </div>
        </div>

        {/* Vertical Connector */}
        <div className="ml-[4px] w-[2px] h-4 bg-border/80" />

        {/* Node 2: Passages */}
        <div className="flex items-start gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-primary mt-1 shrink-0 ring-3 ring-primary/20" />
          <div className="space-y-0.5">
            <div className="text-sm font-bold font-mono text-foreground">
              {totalChunks.toLocaleString()} passages
            </div>
            <div className="text-xs text-muted-foreground">
              Lexical & semantic index
            </div>
          </div>
        </div>

        {/* Vertical Connector */}
        <div className="ml-[4px] w-[2px] h-4 bg-border/80" />

        {/* Node 3: Claims */}
        <div className="flex items-start gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-primary mt-1 shrink-0 ring-3 ring-primary/20" />
          <div className="space-y-0.5">
            <div className="text-sm font-bold font-mono text-foreground">
              {totalClaims} claims evaluated
            </div>
            <div className="text-xs text-muted-foreground">
              Grounded sentence assertions
            </div>
          </div>
        </div>

        {/* Vertical Branching Tree */}
        <div className="ml-[4px] pl-3.5 border-l-2 border-border/80 space-y-2 pt-1">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 ring-2 ring-emerald-500/25" />
            <span className="text-xs font-mono font-bold text-emerald-400">
              {verifiedClaims}
            </span>
            <span className="text-xs text-foreground/80 font-medium">verified assertions</span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-sky-400 shrink-0 ring-2 ring-sky-400/25" />
            <span className="text-xs font-mono font-bold text-sky-400">
              {recoveredClaims}
            </span>
            <span className="text-xs text-foreground/80 font-medium">recovered assertions</span>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                flaggedClaims > 0 ? 'bg-amber-500 ring-2 ring-amber-500/25' : 'bg-muted-foreground/40'
              }`}
            />
            <span
              className={`text-xs font-mono font-bold ${
                flaggedClaims > 0 ? 'text-amber-400' : 'text-muted-foreground'
              }`}
            >
              {flaggedClaims}
            </span>
            <span className="text-xs text-foreground/80 font-medium">review needed</span>
          </div>
        </div>
      </div>
    </div>
  );
}
