'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { Document as GroundDocument } from '@groundguard/types';

interface AttentionNarrativeProps {
  projectId: string;
  flaggedClaims: number;
  processingDocs: GroundDocument[];
  failedDocs: GroundDocument[];
  totalDocs: number;
  totalClaims: number;
}

export function AttentionNarrative({
  projectId,
  flaggedClaims,
  processingDocs,
  failedDocs,
  totalDocs,
  totalClaims,
}: AttentionNarrativeProps) {
  const hasIssues = flaggedClaims > 0 || failedDocs.length > 0 || processingDocs.length > 0;

  if (!hasIssues) {
    // Calm Success Narrative with emerald continuity
    return (
      <div className="border-l-4 border-emerald-500/50 pl-6 py-3 my-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none">
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Zero unresolved claims
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground/90 max-w-3xl leading-relaxed">
            All project assertions are verified against indexed evidence with complete citation provenance.
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/reliability`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 px-4 py-2 rounded-lg shrink-0 self-start sm:self-center"
        >
          <span>Reliability telemetry</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="my-2 select-none">
      {/* Narrative Container emerging directly from the amber Review lineage branch */}
      <div className="border-l-4 border-amber-500/70 pl-6 py-3 space-y-3">
        {/* Narrative Heading & Prominent Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {flaggedClaims > 0
                ? `${flaggedClaims} ${flaggedClaims === 1 ? 'claim needs' : 'claims need'} your attention`
                : failedDocs.length > 0
                ? `${failedDocs.length} ${failedDocs.length === 1 ? 'source' : 'sources'} failed ingestion`
                : `${processingDocs.length} ${processingDocs.length === 1 ? 'source' : 'sources'} processing`}
            </h2>

            {/* Narrative Description (Human Product Copy) */}
            <p className="text-sm sm:text-base text-muted-foreground/90 max-w-3xl leading-relaxed font-normal">
              {flaggedClaims > 0 ? (
                <span>
                  Most are unresolved verification cases. Review them in Reliability before relying on those claims.
                </span>
              ) : failedDocs.length > 0 ? (
                <span>
                  Text extraction or indexing encountered errors for {failedDocs.map((d) => d.filename).join(', ')}. Inspect documents to retry.
                </span>
              ) : (
                <span>
                  Passages are actively chunking and generating embeddings. Sources will be available for inquiry shortly.
                </span>
              )}
            </p>
          </div>

          {/* Connected Action */}
          {flaggedClaims > 0 && (
            <Link
              href={`/projects/${projectId}/reliability`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 px-4 py-2.5 rounded-lg shrink-0 self-start sm:self-center shadow-xs"
            >
              <span>Review claims</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}

          {failedDocs.length > 0 && flaggedClaims === 0 && (
            <Link
              href={`/projects/${projectId}/knowledge`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-destructive hover:opacity-85 transition-opacity bg-destructive/10 border border-destructive/25 px-4 py-2.5 rounded-lg shrink-0 self-start sm:self-center"
            >
              <span>Manage knowledge</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        {/* Real Breakdown Details (Quiet factual cues if multiple categories exist) */}
        {failedDocs.length > 0 && flaggedClaims > 0 && (
          <div className="pt-1 flex items-center gap-4 text-xs font-mono text-muted-foreground">
            <span className="text-destructive font-medium">
              {failedDocs.length} {failedDocs.length === 1 ? 'failed source' : 'failed sources'}
            </span>
            <span>·</span>
            <span className="text-amber-400 font-medium">
              {flaggedClaims} unverified claims
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
