'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MessageSquareCode,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ProjectReadinessState } from '@/lib/overview-helpers';
import { EvidenceLineage } from './evidence-lineage';

interface ProjectPulseHeroProps {
  projectId: string;
  projectName: string;
  readinessState: ProjectReadinessState;
  summaryText: string;
  totalDocs: number;
  readyDocsCount: number;
  processingDocsCount: number;
  failedDocsCount: number;
  totalChunks: number;
  totalClaims: number;
  verifiedClaims: number;
  recoveredClaims: number;
  flaggedClaims: number;
}

export function ProjectPulseHero({
  projectId,
  projectName,
  readinessState,
  summaryText,
  totalDocs,
  readyDocsCount,
  processingDocsCount,
  failedDocsCount,
  totalChunks,
  totalClaims,
  verifiedClaims,
  recoveredClaims,
  flaggedClaims,
}: ProjectPulseHeroProps) {
  const router = useRouter();

  const readinessBadgeConfig = React.useMemo(() => {
    switch (readinessState) {
      case 'READY':
        return {
          label: 'Ready to ask',
          className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
          dotClass: 'bg-emerald-500',
        };
      case 'PARTIALLY_READY':
        return {
          label: 'Partially ready',
          className: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
          dotClass: 'bg-sky-500',
        };
      case 'PREPARING':
        return {
          label: 'Preparing',
          className: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
          dotClass: 'bg-amber-500',
        };
      case 'NEEDS_ATTENTION':
        return {
          label: 'Needs attention',
          className: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
          dotClass: 'bg-amber-500',
        };
    }
  }, [readinessState]);

  return (
    <div className="relative w-full rounded-2xl bg-gradient-to-b from-card/40 via-card/15 to-transparent p-5 sm:p-7 border border-border/30 overflow-hidden space-y-5 select-none">
      {/* Luminous subtle radial field behind canvas (restrained depth) */}
      <div className="absolute top-0 right-1/4 -translate-y-1/2 w-[460px] h-[260px] bg-primary/[0.035] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-10 w-[300px] h-[180px] bg-emerald-500/[0.02] rounded-full blur-3xl pointer-events-none" />

      {/* Editorial Header Area: Confident Scale & Open Space */}
      <div className="relative z-10 space-y-3.5 max-w-4xl">
        {/* Project Name & Readiness State */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
            {projectName}
          </h1>
          <Badge
            variant="outline"
            className={`text-xs font-mono uppercase tracking-wider py-0.5 px-2.5 gap-1.5 ${readinessBadgeConfig.className}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${readinessBadgeConfig.dotClass}`} />
            <span>{readinessBadgeConfig.label}</span>
          </Badge>
        </div>

        {/* Short Deterministic Project Sentence */}
        <p className="text-base sm:text-lg text-foreground/85 leading-relaxed font-normal max-w-3xl">
          {summaryText}
        </p>

        {/* Action Controls: Ask EVIDEX Dominates */}
        <div className="flex flex-wrap items-center gap-4 pt-0.5">
          {/* Dominant Primary CTA */}
          <Button
            size="default"
            onClick={() => router.push(`/projects/${projectId}/ask`)}
            className="h-10 px-4 text-xs sm:text-sm font-medium gap-2 shadow-sm hover:shadow-md rounded-lg transition-all"
          >
            <MessageSquareCode className="h-4 w-4" />
            <span>Ask EVIDEX</span>
          </Button>

          {/* Secondary Action */}
          <button
            onClick={() => router.push(`/projects/${projectId}/knowledge?upload=1`)}
            className="text-xs sm:text-sm text-muted-foreground hover:text-foreground font-medium transition-colors inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg hover:bg-muted/30"
          >
            <UploadCloud className="h-4 w-4 opacity-75" />
            <span>Add knowledge</span>
          </button>

          {/* Contextual Action when issues exist */}
          {flaggedClaims > 0 && (
            <Link
              href={`/projects/${projectId}/reliability`}
              className="text-xs sm:text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg hover:bg-amber-500/10"
            >
              <span>Review {flaggedClaims} issues</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}

          {failedDocsCount > 0 && flaggedClaims === 0 && (
            <Link
              href={`/projects/${projectId}/knowledge`}
              className="text-xs sm:text-sm text-destructive hover:opacity-85 font-medium transition-colors inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg hover:bg-destructive/10"
            >
              <span>Inspect failed sources</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Signature Evidence Lineage: Canvas Visual (Sacred Backbone) */}
      <div className="relative z-10 pt-3 border-t border-border/40">
        <EvidenceLineage
          projectId={projectId}
          totalDocs={totalDocs}
          readyDocsCount={readyDocsCount}
          totalChunks={totalChunks}
          totalClaims={totalClaims}
          verifiedClaims={verifiedClaims}
          recoveredClaims={recoveredClaims}
          flaggedClaims={flaggedClaims}
        />
      </div>
    </div>
  );
}
