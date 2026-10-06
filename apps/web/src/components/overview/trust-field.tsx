'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ArrowRight, CheckCircle2, RotateCcw, AlertTriangle } from 'lucide-react';

interface TrustFieldProps {
  projectId: string;
  totalClaims: number;
  verifiedClaims: number;
  recoveredClaims: number;
  flaggedClaims: number;
}

type FieldRegion = 'verified' | 'recovered' | 'review' | null;

export function TrustField({
  projectId,
  totalClaims,
  verifiedClaims,
  recoveredClaims,
  flaggedClaims,
}: TrustFieldProps) {
  const router = useRouter();
  const [hoveredRegion, setHoveredRegion] = React.useState<FieldRegion>(null);

  // Proportional distribution using real counts
  const hasClaims = totalClaims > 0;
  const verifiedFlex = hasClaims ? Math.max(verifiedClaims > 0 ? 12 : 0, (verifiedClaims / totalClaims) * 100) : 100;
  const recoveredFlex = hasClaims ? Math.max(recoveredClaims > 0 ? 10 : 0, (recoveredClaims / totalClaims) * 100) : 0;
  const reviewFlex = hasClaims ? Math.max(flaggedClaims > 0 ? 10 : 0, (flaggedClaims / totalClaims) * 100) : 0;

  // Qualitative state before numbers (Section 4)
  const perceptionHeadline = React.useMemo(() => {
    if (!hasClaims) {
      return 'Knowledge indexed · Awaiting evaluation turns to establish trust field';
    }
    const verifiedRatio = verifiedClaims / totalClaims;
    if (verifiedRatio >= 0.75 && flaggedClaims === 0) {
      return 'Most evidence is stable across verified sources';
    }
    if (recoveredClaims > 0 && flaggedClaims === 0) {
      return 'Autonomous recovery active: all non-entailed claims repaired';
    }
    if (flaggedClaims > 0) {
      return 'A meaningful portion of evidence needs attention before production reliance';
    }
    return 'Evidence trust field established across indexed sources';
  }, [hasClaims, totalClaims, verifiedClaims, recoveredClaims, flaggedClaims]);

  return (
    <div className="space-y-3 select-none" role="region" aria-label="Trust field">
      {/* Editorial Title */}
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
            Trust field
          </h2>
        </div>
        <Link
          href={`/projects/${projectId}/reliability`}
          className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors inline-flex items-center gap-1"
        >
          <span>Open Reliability</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Main Continuous Flowing Trust Field Canvas (~140px tall desktop) */}
      <div className="rounded-2xl bg-gradient-to-b from-card/45 via-card/20 to-transparent p-4 sm:p-5 border border-border/30 space-y-3">
        {/* Qualitative State Perception (Section 4: state before numbers) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <p className="text-xs sm:text-sm font-semibold text-foreground tracking-tight">
            {perceptionHeadline}
          </p>
          <span className="text-[11px] font-mono text-muted-foreground shrink-0">
            {totalClaims} evaluated {totalClaims === 1 ? 'assertion' : 'assertions'}
          </span>
        </div>

        {/* Continuous Flowing Layered Field with Soft Contoured Boundaries */}
        <div
          className="relative h-14 w-full rounded-xl overflow-hidden flex items-stretch border border-border/40 p-1 bg-background/60 shadow-inner group"
          role="group"
          aria-label="Interactive continuous trust field"
        >
          {/* Stable Verified Field */}
          <div
            tabIndex={0}
            role="button"
            aria-label={`Stable verified region: ${verifiedClaims} assertions`}
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
            className={`relative rounded-lg bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-500/30 transition-all duration-200 cursor-pointer overflow-hidden p-2 flex flex-col justify-between outline-none ${
              hoveredRegion && hoveredRegion !== 'verified' ? 'opacity-35' : 'opacity-100'
            }`}
          >
            {/* Topographic elevation wave background */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                <path d="M0,28 Q30,12 60,24 T100,18 L100,40 L0,40 Z" fill="currentColor" className="text-emerald-400" />
              </svg>
            </div>

            <div className="relative z-10 flex items-center justify-between gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                Stable
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
            </div>

            <div className="relative z-10 flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-bold font-mono text-emerald-300 leading-none">
                {verifiedClaims}
              </span>
              <span className="text-[10px] font-mono text-emerald-400/80 hidden sm:inline">
                verified
              </span>
            </div>
          </div>

          {/* Cyan Repaired Transition Zone */}
          {recoveredClaims > 0 && (
            <div
              tabIndex={0}
              role="button"
              aria-label={`Repaired region: ${recoveredClaims} assertions`}
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
              className={`relative rounded-lg bg-sky-950/40 hover:bg-sky-900/40 border border-sky-500/30 transition-all duration-200 cursor-pointer overflow-hidden p-2 flex flex-col justify-between outline-none ml-1 ${
                hoveredRegion && hoveredRegion !== 'recovered' ? 'opacity-35' : 'opacity-100'
              }`}
            >
              {/* Transition diagonal hatch */}
              <div className="absolute inset-0 pointer-events-none opacity-20">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                  <path d="M0,20 Q35,35 70,18 T100,30 L100,40 L0,40 Z" fill="currentColor" className="text-sky-400" />
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
                  {recoveredClaims}
                </span>
                <span className="text-[10px] font-mono text-sky-400/80 hidden sm:inline">
                  recovered
                </span>
              </div>
            </div>
          )}

          {/* Amber Attention Region */}
          {flaggedClaims > 0 && (
            <div
              tabIndex={0}
              role="button"
              aria-label={`Attention region: ${flaggedClaims} assertions`}
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
              className={`relative rounded-lg bg-amber-950/40 hover:bg-amber-900/40 border border-amber-500/30 transition-all duration-200 cursor-pointer overflow-hidden p-2 flex flex-col justify-between outline-none ml-1 ${
                hoveredRegion && hoveredRegion !== 'review' ? 'opacity-35' : 'opacity-100'
              }`}
            >
              {/* Alert elevation wave */}
              <div className="absolute inset-0 pointer-events-none opacity-20">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                  <path d="M0,15 Q40,10 70,30 T100,20 L100,40 L0,40 Z" fill="currentColor" className="text-amber-400" />
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
                  {flaggedClaims}
                </span>
                <span className="text-[10px] font-mono text-amber-400/80 hidden sm:inline">
                  review
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Real Exact Proportional Counts Below (Section 4) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-0.5">
          <div
            tabIndex={0}
            role="button"
            onClick={() => router.push(`/projects/${projectId}/reliability?status=verified`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                router.push(`/projects/${projectId}/reliability?status=verified`);
              }
            }}
            className="p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-950/15 cursor-pointer hover:border-emerald-500/40 transition-colors flex items-center justify-between outline-none"
          >
            <div>
              <span className="text-[11px] text-muted-foreground block font-medium">Verified</span>
              <span className="text-base font-bold font-mono text-emerald-400 leading-tight">
                {verifiedClaims}
              </span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
              Grounded
            </span>
          </div>

          <div
            tabIndex={0}
            role="button"
            onClick={() => router.push(`/projects/${projectId}/reliability?status=recovered`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                router.push(`/projects/${projectId}/reliability?status=recovered`);
              }
            }}
            className="p-2.5 rounded-xl border border-sky-500/20 bg-sky-950/15 cursor-pointer hover:border-sky-500/40 transition-colors flex items-center justify-between outline-none"
          >
            <div>
              <span className="text-[11px] text-muted-foreground block font-medium">Recovered</span>
              <span className="text-base font-bold font-mono text-sky-400 leading-tight">
                {recoveredClaims}
              </span>
            </div>
            <span className="text-[10px] font-mono text-sky-400/80 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-500/20">
              Repaired
            </span>
          </div>

          <div
            tabIndex={0}
            role="button"
            onClick={() => router.push(`/projects/${projectId}/reliability?status=attention`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                router.push(`/projects/${projectId}/reliability?status=attention`);
              }
            }}
            className="p-2.5 rounded-xl border border-amber-500/20 bg-amber-950/15 cursor-pointer hover:border-amber-500/40 transition-colors flex items-center justify-between outline-none"
          >
            <div>
              <span className="text-[11px] text-muted-foreground block font-medium">Needs review</span>
              <span className="text-base font-bold font-mono text-amber-400 leading-tight">
                {flaggedClaims}
              </span>
            </div>
            <span className="text-[10px] font-mono text-amber-400/80 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20">
              Attention
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
