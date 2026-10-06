'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TrustLandscapeProps {
  projectId: string;
  totalClaims: number;
  verifiedClaims: number;
  recoveredClaims: number;
  flaggedClaims: number;
  hoveredConceptName?: string | null;
  hoveredConceptStats?: {
    total: number;
    verified: number;
    recovered: number;
    review: number;
  } | null;
}

type LandscapeRegion = 'verified' | 'recovered' | 'review' | null;

export function TrustLandscape({
  projectId,
  totalClaims,
  verifiedClaims,
  recoveredClaims,
  flaggedClaims,
  hoveredConceptName,
  hoveredConceptStats,
}: TrustLandscapeProps) {
  const router = useRouter();
  const [hoveredRegion, setHoveredRegion] = React.useState<LandscapeRegion>(null);

  // Active counts: if a semantic concept is hovered and has real stats, focus on its distribution (Rule 12)
  const isFocusingConcept = Boolean(hoveredConceptName && hoveredConceptStats && hoveredConceptStats.total > 0);
  const activeTotal = isFocusingConcept ? hoveredConceptStats!.total : totalClaims;
  const activeVerified = isFocusingConcept ? hoveredConceptStats!.verified : verifiedClaims;
  const activeRecovered = isFocusingConcept ? hoveredConceptStats!.recovered : recoveredClaims;
  const activeReview = isFocusingConcept ? hoveredConceptStats!.review : flaggedClaims;

  // Proportional widths (minimum width for visibility when count > 0)
  const hasClaims = activeTotal > 0;
  const verifiedFlex = hasClaims
    ? Math.max(activeVerified > 0 ? 12 : 0, (activeVerified / activeTotal) * 100)
    : 100;
  const recoveredFlex = hasClaims
    ? Math.max(activeRecovered > 0 ? 10 : 0, (activeRecovered / activeTotal) * 100)
    : 0;
  const reviewFlex = hasClaims
    ? Math.max(activeReview > 0 ? 10 : 0, (activeReview / activeTotal) * 100)
    : 0;

  // Rule 10: Communicate state before numbers
  const qualitativeState = React.useMemo(() => {
    if (isFocusingConcept) {
      if (activeReview > 0) {
        return `Concept "${hoveredConceptName}" contains assertions requiring review`;
      }
      if (activeRecovered > 0) {
        return `Concept "${hoveredConceptName}" is grounded with autonomous repair`;
      }
      return `Concept "${hoveredConceptName}" is fully verified against source evidence`;
    }

    if (!hasClaims) {
      return 'Knowledge base ready · Awaiting query evaluations to establish trust terrain';
    }

    const verifiedRatio = activeTotal > 0 ? activeVerified / activeTotal : 1;
    if (verifiedRatio >= 0.8 && activeReview === 0) {
      return 'Most evidence is stable across verified sources';
    }
    if (activeRecovered > 0 && activeReview === 0) {
      return 'Autonomous recovery active: repaired assertions restored to factual alignment';
    }
    if (activeReview > 0) {
      return 'A meaningful region still needs attention before production reliance';
    }
    return 'Evidence terrain established across indexed domain sources';
  }, [isFocusingConcept, hoveredConceptName, hasClaims, activeTotal, activeVerified, activeRecovered, activeReview]);

  return (
    <div className="space-y-3 select-none" role="region" aria-label="Trust landscape">
      {/* Editorial Title */}
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
            Trust landscape
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {isFocusingConcept && (
            <Badge variant="outline" className="text-[10px] font-mono text-primary border-primary/30 py-0 px-2 animate-in fade-in">
              Filtered: {hoveredConceptName}
            </Badge>
          )}
          <Link
            href={`/projects/${projectId}/reliability`}
            className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors inline-flex items-center gap-1"
          >
            <span>Open Reliability</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Main Flowing Trust Terrain Canvas (Rule 9: continuous flowing terrain band) */}
      <div className="rounded-2xl bg-gradient-to-b from-card/45 via-card/20 to-transparent p-4 sm:p-5 border border-border/30 space-y-4">
        {/* State Perception Headline (Rule 10: state before numbers) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Overall Grounding State
            </span>
            <p className="text-sm font-semibold text-foreground tracking-tight">
              {qualitativeState}
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground shrink-0">
            {activeTotal} evaluated {activeTotal === 1 ? 'assertion' : 'assertions'}
          </span>
        </div>

        {/* Continuous Topographic Flowing Terrain Band */}
        <div
          className="relative h-16 w-full rounded-xl overflow-hidden flex items-stretch border border-border/40 p-1 bg-background/60 shadow-inner group"
          role="group"
          aria-label="Interactive evidence trust terrain"
        >
          {/* 1. Deep Stable Field (Verified) */}
          <div
            tabIndex={0}
            role="button"
            aria-label={`Verified region: ${activeVerified} verified assertions`}
            onClick={() => router.push(`/projects/${projectId}/reliability?status=verified`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                router.push(`/projects/${projectId}/reliability?status=verified`);
              }
            }}
            onMouseEnter={() => setHoveredRegion('verified')}
            onMouseLeave={() => setHoveredRegion(null)}
            onFocus={() => setHoveredRegion('verified')}
            onBlur={() => setHoveredRegion(null)}
            style={{ flex: verifiedFlex }}
            className={`relative rounded-lg bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-500/30 transition-all duration-200 cursor-pointer overflow-hidden p-2.5 flex flex-col justify-between outline-none ${
              hoveredRegion && hoveredRegion !== 'verified' ? 'opacity-35' : 'opacity-100'
            }`}
          >
            {/* Topographic layered wave background */}
            <div className="absolute inset-0 pointer-events-none opacity-25">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                <path d="M0,30 Q25,15 50,25 T100,20 L100,40 L0,40 Z" fill="currentColor" className="text-emerald-400" />
                <path d="M0,35 Q35,20 70,30 T100,25 L100,40 L0,40 Z" fill="currentColor" className="text-emerald-300" opacity="0.6" />
              </svg>
            </div>

            <div className="relative z-10 flex items-center justify-between gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                Stable
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            </div>

            <div className="relative z-10 flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-bold font-mono text-emerald-300 leading-none">
                {activeVerified}
              </span>
              <span className="text-[10px] font-mono text-emerald-400/80 hidden md:inline">
                verified
              </span>
            </div>
          </div>

          {/* 2. Cyan Repaired Transition Zone (Recovered) */}
          {activeRecovered > 0 && (
            <div
              tabIndex={0}
              role="button"
              aria-label={`Recovered region: ${activeRecovered} repaired assertions`}
              onClick={() => router.push(`/projects/${projectId}/reliability?status=recovered`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  router.push(`/projects/${projectId}/reliability?status=recovered`);
                }
              }}
              onMouseEnter={() => setHoveredRegion('recovered')}
              onMouseLeave={() => setHoveredRegion(null)}
              onFocus={() => setHoveredRegion('recovered')}
              onBlur={() => setHoveredRegion(null)}
              style={{ flex: recoveredFlex }}
              className={`relative rounded-lg bg-sky-950/40 hover:bg-sky-900/40 border border-sky-500/30 transition-all duration-200 cursor-pointer overflow-hidden p-2.5 flex flex-col justify-between outline-none ml-1 ${
                hoveredRegion && hoveredRegion !== 'recovered' ? 'opacity-35' : 'opacity-100'
              }`}
            >
              {/* Flowing transition hatch */}
              <div className="absolute inset-0 pointer-events-none opacity-20">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                  <path d="M0,25 Q30,35 60,20 T100,30 L100,40 L0,40 Z" fill="currentColor" className="text-sky-400" />
                </svg>
              </div>

              <div className="relative z-10 flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-semibold">
                  Repaired
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />
              </div>

              <div className="relative z-10 flex items-baseline gap-1.5">
                <span className="text-base sm:text-lg font-bold font-mono text-sky-300 leading-none">
                  {activeRecovered}
                </span>
                <span className="text-[10px] font-mono text-sky-400/80 hidden md:inline">
                  recovered
                </span>
              </div>
            </div>
          )}

          {/* 3. Amber Attention Region (Review / Flagged) */}
          {activeReview > 0 && (
            <div
              tabIndex={0}
              role="button"
              aria-label={`Attention region: ${activeReview} assertions requiring review`}
              onClick={() => router.push(`/projects/${projectId}/reliability?status=attention`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  router.push(`/projects/${projectId}/reliability?status=attention`);
                }
              }}
              onMouseEnter={() => setHoveredRegion('review')}
              onMouseLeave={() => setHoveredRegion(null)}
              onFocus={() => setHoveredRegion('review')}
              onBlur={() => setHoveredRegion(null)}
              style={{ flex: reviewFlex }}
              className={`relative rounded-lg bg-amber-950/40 hover:bg-amber-900/40 border border-amber-500/30 transition-all duration-200 cursor-pointer overflow-hidden p-2.5 flex flex-col justify-between outline-none ml-1 ${
                hoveredRegion && hoveredRegion !== 'review' ? 'opacity-35' : 'opacity-100'
              }`}
            >
              {/* Alert elevation wave */}
              <div className="absolute inset-0 pointer-events-none opacity-20">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                  <path d="M0,20 Q40,10 70,30 T100,15 L100,40 L0,40 Z" fill="currentColor" className="text-amber-400" />
                </svg>
              </div>

              <div className="relative z-10 flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-semibold">
                  Attention
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              </div>

              <div className="relative z-10 flex items-baseline gap-1.5">
                <span className="text-base sm:text-lg font-bold font-mono text-amber-300 leading-none">
                  {activeReview}
                </span>
                <span className="text-[10px] font-mono text-amber-400/80 hidden md:inline">
                  review
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Real Exact Proportional Counts Strip (Rule 10: exact counts, no fake percentages) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div
            onClick={() => router.push(`/projects/${projectId}/reliability?status=verified`)}
            className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-950/15 cursor-pointer hover:border-emerald-500/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Verified</span>
              <span className="text-[10px] font-mono text-emerald-400">Directly Grounded</span>
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
              {activeVerified}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Verified directly against source passage citations
            </p>
          </div>

          <div
            onClick={() => router.push(`/projects/${projectId}/reliability?status=recovered`)}
            className="p-3 rounded-xl border border-sky-500/20 bg-sky-950/15 cursor-pointer hover:border-sky-500/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Recovered</span>
              <span className="text-[10px] font-mono text-sky-400">Repaired</span>
            </div>
            <div className="text-xl font-bold font-mono text-sky-400 mt-1">
              {activeRecovered}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Re-queried and repaired via autonomous recovery rail
            </p>
          </div>

          <div
            onClick={() => router.push(`/projects/${projectId}/reliability?status=attention`)}
            className="p-3 rounded-xl border border-amber-500/20 bg-amber-950/15 cursor-pointer hover:border-amber-500/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Needs review</span>
              <span className="text-[10px] font-mono text-amber-400">Attention</span>
            </div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-1">
              {activeReview}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Unverified or flagged assertions requiring manual review
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
