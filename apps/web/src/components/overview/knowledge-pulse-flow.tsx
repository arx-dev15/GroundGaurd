'use client';

import * as React from 'react';
import {
  FileText,
  CheckCircle2,
  Layers,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface KnowledgePulseFlowProps {
  totalDocs: number;
  readyDocsCount: number;
  totalChunks: number;
  totalClaims: number;
  verifiedClaims: number;
  recoveredClaims: number;
  flaggedClaims: number;
}

export function KnowledgePulseFlow({
  totalDocs,
  readyDocsCount,
  totalChunks,
  totalClaims,
  verifiedClaims,
  recoveredClaims,
  flaggedClaims,
}: KnowledgePulseFlowProps) {
  const trustedClaims = verifiedClaims + recoveredClaims;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
          <span>Knowledge Pulse</span>
          <span className="text-[10px] text-muted-foreground/60 font-normal">
            (Grounding Pipeline)
          </span>
        </h2>
        <span className="text-[11px] text-muted-foreground font-mono">
          Live Canonical Metrics
        </span>
      </div>

      {/* One Connected Visual Rail */}
      <div className="rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5 backdrop-blur-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-2">
          {/* Stage 1: Uploaded Documents */}
          <div className="flex-1 p-3 rounded-lg bg-background/50 border border-border/40 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-[10px] font-mono uppercase">
              <span>Source Files</span>
              <FileText className="h-3.5 w-3.5 opacity-60" />
            </div>
            <div className="text-lg font-bold font-mono text-foreground">
              {totalDocs} <span className="text-xs font-normal text-muted-foreground">files</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Uploaded knowledge
            </p>
          </div>

          <div className="hidden md:flex items-center justify-center text-muted-foreground/40 shrink-0 px-1">
            <ArrowRight className="h-4 w-4" />
          </div>

          {/* Stage 2: Ready for Retrieval */}
          <div className="flex-1 p-3 rounded-lg bg-background/50 border border-border/40 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-[10px] font-mono uppercase">
              <span>Ready Sources</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-status-verified" />
            </div>
            <div className="text-lg font-bold font-mono text-status-verified">
              {readyDocsCount} <span className="text-xs font-normal text-muted-foreground">ready</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Active in project scope
            </p>
          </div>

          <div className="hidden md:flex items-center justify-center text-muted-foreground/40 shrink-0 px-1">
            <ArrowRight className="h-4 w-4" />
          </div>

          {/* Stage 3: Indexed Passages */}
          <div className="flex-1 p-3 rounded-lg bg-background/50 border border-border/40 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-[10px] font-mono uppercase">
              <span>Indexed Passages</span>
              <Layers className="h-3.5 w-3.5 opacity-60" />
            </div>
            <div className="text-lg font-bold font-mono text-foreground">
              {totalChunks.toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground">
              BM25 & vector chunks
            </p>
          </div>

          <div className="hidden md:flex items-center justify-center text-muted-foreground/40 shrink-0 px-1">
            <ArrowRight className="h-4 w-4" />
          </div>

          {/* Stage 4: Extracted Claims */}
          <div className="flex-1 p-3 rounded-lg bg-background/50 border border-border/40 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-[10px] font-mono uppercase">
              <span>Evaluated Claims</span>
              <Sparkles className="h-3.5 w-3.5 opacity-60" />
            </div>
            <div className="text-lg font-bold font-mono text-foreground">
              {totalClaims}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {totalClaims > 0 ? 'Extracted assertions' : 'On query execution'}
            </p>
          </div>

          <div className="hidden md:flex items-center justify-center text-muted-foreground/40 shrink-0 px-1">
            <ArrowRight className="h-4 w-4" />
          </div>

          {/* Stage 5: Trusted vs Needs Attention */}
          <div className="flex-1 p-3 rounded-lg bg-background/50 border border-border/40 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-[10px] font-mono uppercase">
              <span>Verification Status</span>
              <ShieldCheck className="h-3.5 w-3.5 text-status-verified" />
            </div>
            <div className="text-lg font-bold font-mono text-foreground flex items-baseline gap-1.5">
              <span className="text-status-verified">{trustedClaims}</span>
              <span className="text-xs text-muted-foreground font-normal">trusted</span>
              {flaggedClaims > 0 && (
                <>
                  <span className="text-xs text-muted-foreground font-normal">/</span>
                  <span className="text-xs text-status-needs-review font-semibold">
                    {flaggedClaims} review
                  </span>
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {totalClaims > 0 ? `${verifiedClaims} verified, ${recoveredClaims} recovered` : 'Zero unverified claims'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
