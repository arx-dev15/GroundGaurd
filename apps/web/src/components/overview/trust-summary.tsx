'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowRight } from 'lucide-react';

interface TrustSummaryProps {
  projectId: string;
  totalClaims: number;
  verifiedClaims: number;
  recoveredClaims: number;
  flaggedClaims: number;
}

export function TrustSummary({
  projectId,
  totalClaims,
  verifiedClaims,
  recoveredClaims,
  flaggedClaims,
}: TrustSummaryProps) {
  // Proportional widths for subtle horizontal strip
  const hasClaims = totalClaims > 0;
  const verifiedPct = hasClaims ? Math.round((verifiedClaims / totalClaims) * 100) : 100;
  const recoveredPct = hasClaims ? Math.round((recoveredClaims / totalClaims) * 100) : 0;
  const flaggedPct = hasClaims ? Math.round((flaggedClaims / totalClaims) * 100) : 0;

  return (
    <section className="space-y-3 select-none" aria-label="Trust at a glance">
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
            Trust at a glance
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

      <div className="p-4 sm:p-5 rounded-2xl bg-card/35 border border-border/30 space-y-3">
        {/* Subtle Horizontal Proportional Strip */}
        {hasClaims && (
          <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-muted/40 gap-0.5">
            <div
              style={{ width: `${verifiedPct}%` }}
              className="bg-emerald-400/90 rounded-full transition-all duration-300"
              title={`${verifiedClaims} verified`}
            />
            {recoveredClaims > 0 && (
              <div
                style={{ width: `${recoveredPct}%` }}
                className="bg-sky-400/90 rounded-full transition-all duration-300"
                title={`${recoveredClaims} recovered`}
              />
            )}
            {flaggedClaims > 0 && (
              <div
                style={{ width: `${flaggedPct}%` }}
                className="bg-amber-400/90 rounded-full transition-all duration-300"
                title={`${flaggedClaims} review`}
              />
            )}
          </div>
        )}

        {/* Sentence Form Trust Communication (Rule 4 & 5: sentence form only, no duplicated metric cards) */}
        <div className="space-y-1.5 text-xs sm:text-sm text-foreground/85 leading-relaxed">
          <p>
            <span className="font-semibold text-emerald-400">{verifiedClaims} claims</span> are verified directly against project evidence.
          </p>
          {recoveredClaims > 0 && (
            <p>
              <span className="font-semibold text-sky-400">{recoveredClaims} claims</span> were recovered and successfully reverified.
            </p>
          )}
          {flaggedClaims > 0 ? (
            <p>
              <span className="font-semibold text-amber-400">{flaggedClaims} claims</span> still need review before full production reliance.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Zero claims currently require human review.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
