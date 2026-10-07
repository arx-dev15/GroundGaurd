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
import { useAuth } from '@/lib/auth-context';
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
  const { user } = useAuth();

  const greetingName = user?.name?.trim() || user?.email?.split('@')[0];
  const greetingText = greetingName ? `Welcome back, ${greetingName}` : 'Welcome back';

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

      {/* Editorial Header Area: Welcoming Orientation Layer */}
      <div className="relative z-10 space-y-3.5 max-w-4xl">
        {/* Warm Personal Greeting */}
        <div className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
          <span>{greetingText}</span>
        </div>

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

        {/* Grounded Orientation Narrative */}
        <div className="space-y-1">
          <p className="text-sm sm:text-base text-foreground/90 font-medium leading-relaxed">
            Your evidence base is ready.{' '}
            <span className="text-foreground">
              {totalDocs} {totalDocs === 1 ? 'source is' : 'sources are'} indexed
            </span>{' '}
            and EVIDEX has evaluated{' '}
            <span className="text-foreground font-semibold">
              {totalClaims} {totalClaims === 1 ? 'claim' : 'claims'}
            </span>.
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {flaggedClaims > 0 ? (
              <span>
                <strong className="text-amber-400 font-semibold">{flaggedClaims} claims</strong> still need review, but the project is ready to query.
              </span>
            ) : (
              <span>All evaluated claims are verified against source evidence, ready for queries.</span>
            )}
          </p>
        </div>

        {/* 3 Clear Action Choices */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Dominant Primary CTA: Ask EVIDEX */}
          <Button
            size="default"
            onClick={() => router.push(`/projects/${projectId}/ask`)}
            className="h-9 px-4 text-xs sm:text-sm font-medium gap-2 shadow-xs hover:shadow-sm rounded-lg transition-all cursor-pointer"
          >
            <MessageSquareCode className="h-4 w-4" />
            <span>Ask EVIDEX</span>
          </Button>

          {/* Contextual Action when issues exist: Review issues */}
          {flaggedClaims > 0 && (
            <Button
              variant="outline"
              size="default"
              onClick={() => router.push(`/projects/${projectId}/reliability`)}
              className="h-9 px-3.5 text-xs sm:text-sm font-medium gap-2 border-amber-500/30 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors cursor-pointer"
            >
              <span>Review issues</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Tertiary Action: Add knowledge */}
          <Button
            variant="ghost"
            size="default"
            onClick={() => router.push(`/projects/${projectId}/knowledge?upload=1`)}
            className="h-9 px-3 text-xs sm:text-sm text-muted-foreground hover:text-foreground font-medium gap-2 rounded-lg cursor-pointer"
          >
            <UploadCloud className="h-4 w-4 opacity-75" />
            <span>Add knowledge</span>
          </Button>
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
