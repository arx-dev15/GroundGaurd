'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  ArrowRight,
  FileText,
  Layers,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import type {
  DocumentFingerprint,
  FingerprintRegion,
} from '@/lib/overview-helpers';
import { buildSourceFingerprints } from '@/lib/overview-helpers';

interface SourceFingerprintProps {
  projectId: string;
  documents: Array<{
    id: string;
    filename: string;
    chunksCount?: number;
    status?: string;
  }>;
  claims: Array<{
    id?: string;
    claimId?: string;
    status: string;
    text?: string;
    evidence?: Array<{
      documentId?: string;
      pageNumber?: number;
      section?: string;
      chunkId?: string;
    }>;
  }>;
  totalClaims: number;
  verifiedClaims: number;
  recoveredClaims: number;
  flaggedClaims: number;
}

export function SourceFingerprint({
  projectId,
  documents,
  claims,
  totalClaims,
  verifiedClaims,
  recoveredClaims,
  flaggedClaims,
}: SourceFingerprintProps) {
  const router = useRouter();

  // Deterministic Fingerprint Data Structures
  const fingerprints: DocumentFingerprint[] = React.useMemo(() => {
    return buildSourceFingerprints({
      documents,
      claims,
      metrics: {
        totalClaims,
        verifiedClaims,
        recoveredClaims,
        flaggedClaims,
      },
    });
  }, [documents, claims, totalClaims, verifiedClaims, recoveredClaims, flaggedClaims]);

  // Active hover/focus region tracking (per document id)
  const [activeRegion, setActiveRegion] = React.useState<{
    docId: string;
    region: FingerprintRegion;
  } | null>(null);

  // If no documents exist, return empty fallback
  if (fingerprints.length === 0) {
    return null;
  }

  const isSingleSource = fingerprints.length === 1;
  const primaryDoc = fingerprints[0];

  // Up to 4 visible sources
  const visibleFingerprints = fingerprints.slice(0, 4);
  const remainingCount = fingerprints.length - 4;

  return (
    <section
      className="relative rounded-2xl border border-border/35 bg-card/25 p-5 sm:p-7 space-y-6 select-none overflow-hidden"
      role="region"
      aria-label="Source fingerprint"
    >
      {/* Background Subtle Gradient Field */}
      <div className="absolute top-0 right-10 w-[350px] h-[160px] bg-primary/[0.025] rounded-full blur-3xl pointer-events-none" />

      {/* Header: Signature Identification */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-border/30">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/90 font-medium">
              Source Fingerprint
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Where evidence and trust live inside the project’s source material
          </p>
        </div>

        <div className="text-[11px] font-mono text-muted-foreground/70 flex items-center gap-2 shrink-0">
          <span>
            {documents.length} {documents.length === 1 ? 'SOURCE' : 'SOURCES'}
          </span>
          <span>·</span>
          <span>
            {primaryDoc.regions[0]?.unitType === 'page' ? 'PAGE-ALIGNED' : 'PASSAGE-ALIGNED'}
          </span>
        </div>
      </div>

      {/* =====================================================================
          ONE-SOURCE PROJECT: FULL-WIDTH SIGNATURE FORENSIC RIBBON
         ===================================================================== */}
      {isSingleSource ? (
        <div className="space-y-5">
          {/* Source Document Identifier Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <span className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
                {primaryDoc.displayTitle}
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                ({primaryDoc.filename})
              </span>
            </div>

            <div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
              <span>{primaryDoc.totalPassages} passages</span>
              <span>·</span>
              <span>{primaryDoc.totalClaims} evaluated claims</span>
            </div>
          </div>

          {/* Review Hotspot Callout (Deterministically true only) */}
          {primaryDoc.hotspotSummary && (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] text-amber-300 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
                <span className="font-medium text-amber-200">Review hotspot:</span>
                <span className="truncate">{primaryDoc.hotspotSummary}</span>
              </div>
              <Link
                href={`/projects/${projectId}/reliability?status=attention`}
                className="shrink-0 font-medium inline-flex items-center gap-1 hover:text-amber-100 underline underline-offset-2"
              >
                <span>Review evidence</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* Interactive Contextual Detail Strip (Hover / Keyboard focus) */}
          <div className="min-h-[38px] flex items-center justify-between px-3.5 py-1.5 rounded-lg border border-border/40 bg-card/40 text-xs transition-all">
            {activeRegion && activeRegion.docId === primaryDoc.documentId ? (
              <div className="flex items-center justify-between w-full gap-2">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="font-mono font-semibold text-foreground">
                    {activeRegion.region.label}
                  </span>
                  <span className="text-muted-foreground/60">·</span>
                  <span className="font-mono text-muted-foreground">
                    {activeRegion.region.claimCount} claims
                  </span>
                  <span className="text-muted-foreground/60">·</span>
                  <span className="text-emerald-400 font-mono">
                    {activeRegion.region.verifiedCount} verified
                  </span>
                  {activeRegion.region.recoveredCount > 0 && (
                    <>
                      <span className="text-muted-foreground/60">·</span>
                      <span className="text-sky-400 font-mono">
                        {activeRegion.region.recoveredCount} recovered
                      </span>
                    </>
                  )}
                  {activeRegion.region.needsReviewCount > 0 && (
                    <>
                      <span className="text-muted-foreground/60">·</span>
                      <span className="text-amber-400 font-mono font-medium">
                        {activeRegion.region.needsReviewCount} need review
                      </span>
                    </>
                  )}
                </div>

                <Link
                  href={`/projects/${projectId}/reliability?status=attention`}
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium shrink-0 ml-2"
                >
                  <span>Review evidence</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div className="text-[11px] font-mono text-muted-foreground/75 flex items-center gap-2">
                <span>Hover or focus any evidence region to inspect claim trust localization</span>
              </div>
            )}
          </div>

          {/* Forensic Evidence Track (Full-Width Continuous Ribbon) */}
          <div
            className="grid gap-2 w-full pt-1"
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, primaryDoc.regions.length)}, minmax(0, 1fr))`,
            }}
          >
            {primaryDoc.regions.map((region, idx) => {
              const isFocused =
                activeRegion?.docId === primaryDoc.documentId &&
                activeRegion?.region.id === region.id;

              const hasClaims = region.claimCount > 0;
              const maxRegionClaims = Math.max(
                1,
                ...primaryDoc.regions.map((r) => r.claimCount)
              );

              // Proportional height of the visual column (min 28px, max 84px)
              const columnHeight = hasClaims
                ? Math.round(28 + (region.claimCount / maxRegionClaims) * 56)
                : 16;

              const verifiedRatio = hasClaims ? region.verifiedCount / region.claimCount : 1;
              const recoveredRatio = hasClaims ? region.recoveredCount / region.claimCount : 0;
              const reviewRatio = hasClaims ? region.needsReviewCount / region.claimCount : 0;

              return (
                <div
                  key={region.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`${region.label}: ${region.claimCount} claims, ${region.verifiedCount} verified, ${region.recoveredCount} recovered, ${region.needsReviewCount} need review`}
                  onMouseEnter={() =>
                    setActiveRegion({ docId: primaryDoc.documentId, region })
                  }
                  onMouseLeave={() => setActiveRegion(null)}
                  onFocus={() =>
                    setActiveRegion({ docId: primaryDoc.documentId, region })
                  }
                  onBlur={() => setActiveRegion(null)}
                  className={`group relative flex flex-col items-center gap-2 cursor-pointer outline-none transition-all duration-150 py-1.5 rounded-lg ${
                    isFocused
                      ? 'bg-primary/10 ring-1 ring-primary/40'
                      : 'hover:bg-muted/30'
                  }`}
                >
                  {/* Position Index Label (Strict Source Order) */}
                  <span
                    className={`text-[10px] font-mono tracking-tight transition-colors ${
                      isFocused
                        ? 'text-foreground font-bold'
                        : region.isHotspot
                        ? 'text-amber-400 font-semibold'
                        : 'text-muted-foreground/75'
                    }`}
                  >
                    {String(region.positionIndex).padStart(2, '0')}
                  </span>

                  {/* Forensic Evidence Segment Column */}
                  <div
                    className="w-full max-w-[28px] flex flex-col-reverse items-center justify-start rounded-md overflow-hidden transition-all duration-200"
                    style={{ height: `${columnHeight}px` }}
                  >
                    {hasClaims ? (
                      <>
                        {/* Verified Segment (Emerald) */}
                        {region.verifiedCount > 0 && (
                          <div
                            style={{ flexGrow: region.verifiedCount }}
                            className="w-full bg-emerald-500/85 group-hover:bg-emerald-400 transition-colors"
                            title={`${region.verifiedCount} verified`}
                          />
                        )}

                        {/* Recovered Segment (Cyan / Sky) */}
                        {region.recoveredCount > 0 && (
                          <div
                            style={{ flexGrow: region.recoveredCount }}
                            className="w-full bg-sky-400/90 group-hover:bg-sky-300 transition-colors border-y border-background/20"
                            title={`${region.recoveredCount} recovered`}
                          />
                        )}

                        {/* Review / Flagged Segment (Amber with pattern) */}
                        {region.needsReviewCount > 0 && (
                          <div
                            style={{ flexGrow: region.needsReviewCount }}
                            className={`w-full bg-amber-400 group-hover:bg-amber-300 transition-colors ${
                              region.isHotspot ? 'animate-pulse' : ''
                            }`}
                            title={`${region.needsReviewCount} need review`}
                          />
                        )}
                      </>
                    ) : (
                      /* Zero-claim position guide marker */
                      <div className="h-full w-[2px] bg-border/40 rounded-full" />
                    )}
                  </div>

                  {/* Hotspot Indicator Dot */}
                  <div className="h-2 flex items-center justify-center">
                    {region.isHotspot && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 ring-2 ring-amber-400/30" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* =====================================================================
           MULTIPLE SOURCES: COMPACT FINGERPRINT LANES (MAX 4 LANES)
           ===================================================================== */
        <div className="space-y-4">
          <div className="space-y-3">
            {visibleFingerprints.map((doc) => (
              <div
                key={doc.documentId}
                className="p-3.5 rounded-xl border border-border/30 bg-card/30 space-y-2.5 transition-colors hover:border-border/60"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-foreground truncate">
                      {doc.displayTitle}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground/75 truncate">
                      ({doc.filename})
                    </span>
                  </div>

                  <div className="text-xs font-mono text-muted-foreground flex items-center gap-2 shrink-0">
                    <span>{doc.totalPassages} passages</span>
                    <span>·</span>
                    <span>{doc.totalClaims} claims</span>
                    {doc.hotspotRegion && (
                      <>
                        <span>·</span>
                        <span className="text-amber-400 font-medium">
                          Hotspot: {doc.hotspotRegion.label}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Compact Lane Ribbon */}
                <div
                  className="grid gap-1.5 w-full items-end"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(1, doc.regions.length)}, minmax(0, 1fr))`,
                  }}
                >
                  {doc.regions.map((region) => {
                    const isFocused =
                      activeRegion?.docId === doc.documentId &&
                      activeRegion?.region.id === region.id;
                    const hasClaims = region.claimCount > 0;
                    const maxClaims = Math.max(1, ...doc.regions.map((r) => r.claimCount));
                    const columnHeight = hasClaims
                      ? Math.round(18 + (region.claimCount / maxClaims) * 36)
                      : 10;

                    return (
                      <div
                        key={region.id}
                        tabIndex={0}
                        role="button"
                        aria-label={`${doc.displayTitle} - ${region.label}: ${region.claimCount} claims`}
                        onMouseEnter={() =>
                          setActiveRegion({ docId: doc.documentId, region })
                        }
                        onMouseLeave={() => setActiveRegion(null)}
                        onFocus={() =>
                          setActiveRegion({ docId: doc.documentId, region })
                        }
                        onBlur={() => setActiveRegion(null)}
                        className={`group relative flex flex-col items-center gap-1 cursor-pointer outline-none transition-all py-1 rounded ${
                          isFocused ? 'bg-primary/10 ring-1 ring-primary/40' : ''
                        }`}
                      >
                        <div
                          className="w-full max-w-[20px] flex flex-col-reverse rounded-xs overflow-hidden"
                          style={{ height: `${columnHeight}px` }}
                        >
                          {hasClaims ? (
                            <>
                              {region.verifiedCount > 0 && (
                                <div
                                  style={{ flexGrow: region.verifiedCount }}
                                  className="w-full bg-emerald-500/85"
                                />
                              )}
                              {region.recoveredCount > 0 && (
                                <div
                                  style={{ flexGrow: region.recoveredCount }}
                                  className="w-full bg-sky-400"
                                />
                              )}
                              {region.needsReviewCount > 0 && (
                                <div
                                  style={{ flexGrow: region.needsReviewCount }}
                                  className="w-full bg-amber-400"
                                />
                              )}
                            </>
                          ) : (
                            <div className="h-full w-[2px] mx-auto bg-border/40" />
                          )}
                        </div>

                        <span className="text-[9px] font-mono text-muted-foreground/70">
                          {String(region.positionIndex).padStart(2, '0')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {remainingCount > 0 && (
            <div className="pt-1 flex justify-end">
              <Link
                href={`/projects/${projectId}/knowledge`}
                className="text-xs text-muted-foreground hover:text-foreground font-medium inline-flex items-center gap-1"
              >
                <span>View all {documents.length} sources in Knowledge Base</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          EMBEDDED TRUST SUMMARY: THE SINGLE CONCISE CANONICAL SENTENCE
          (Requirement 11: Trust is embedded inside the Source Fingerprint)
         ===================================================================== */}
      <div className="pt-3 border-t border-border/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-medium text-foreground">
              {verifiedClaims} verified
            </span>
          </div>
          <span className="text-muted-foreground">·</span>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span className="font-medium text-foreground">
              {recoveredClaims} recovered
            </span>
          </div>
          <span className="text-muted-foreground">·</span>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="font-medium text-foreground">
              {flaggedClaims} need review
            </span>
          </div>
        </div>

        <Link
          href={`/projects/${projectId}/reliability`}
          className="text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1 shrink-0 transition-colors"
        >
          <span>Open Reliability</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
