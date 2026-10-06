'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  FileText,
  MessageSquareCode,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import type {
  Project,
  Document as GroundDocument,
  Conversation,
  ProjectMetricsResponse,
} from '@groundguard/types';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Pure Deterministic Overview Helpers
import {
  computeProjectReadiness,
  getHeroSummaryText,
  getSuggestedNextSteps,
  formatBytes,
  formatRelativeTime,
} from '@/lib/overview-helpers';
import { getProjectClaimsPaginated } from '@/lib/conversations-api';

// Editorial Overview Components
import { ProjectPulseHero } from '@/components/overview/project-pulse-hero';
import { ProjectUnderstanding } from '@/components/overview/project-understanding';
import { TrustSummary } from '@/components/overview/trust-summary';
import { ContinueWorking } from '@/components/overview/continue-working';
import { KnowledgeOrigin } from '@/components/overview/knowledge-origin';
import { WhatMattersNext } from '@/components/overview/what-matters-next';
import { QuietTrustFooter } from '@/components/overview/quiet-trust-footer';
import type { ProjectClaimItem } from '@groundguard/types';

export default function RealProjectOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = (params?.projectId as string) || '';

  const [project, setProject] = React.useState<Project | null>(null);
  const [documents, setDocuments] = React.useState<GroundDocument[]>([]);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [claims, setClaims] = React.useState<ProjectClaimItem[]>([]);
  const [metrics, setMetrics] = React.useState<ProjectMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [learnModalOpen, setLearnModalOpen] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    if (!projectId) return;
    try {
      setIsLoading(true);
      setError(null);

      // Parallel data loading for fast page shell hydration
      const [projRes, docsRes, convsRes, metricsRes, claimsRes] = await Promise.all([
        apiClient.get<{ project: Project }>(`/v1/projects/${projectId}`),
        apiClient.get<{ documents: GroundDocument[] }>(`/v1/projects/${projectId}/documents`).catch(() => ({ documents: [] })),
        apiClient.get<{ conversations: Conversation[] }>(`/v1/projects/${projectId}/conversations`).catch(() => ({ conversations: [] })),
        apiClient.get<ProjectMetricsResponse>(`/v1/projects/${projectId}/metrics`).catch(() => null),
        getProjectClaimsPaginated(projectId, { limit: 15 }).catch(() => ({ claims: [] })),
      ]);

      setProject(projRes.project);
      setDocuments(docsRes.documents || []);
      setConversations(convsRes.conversations || []);
      setMetrics(metricsRes || null);
      setClaims(claimsRes?.claims || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load project details';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived Real Counts (Zero Synthetic Telemetry)
  const readyDocs = React.useMemo(() => documents.filter((d) => d.status === 'ready'), [documents]);
  const processingDocs = React.useMemo(
    () => documents.filter((d) => d.status === 'processing' || d.status === 'uploaded'),
    [documents]
  );
  const failedDocs = React.useMemo(() => documents.filter((d) => d.status === 'failed'), [documents]);
  const totalChunks = React.useMemo(
    () => documents.reduce((sum, d) => sum + (d.chunksCount || 0), 0),
    [documents]
  );

  // Live Claim Counts
  const totalClaims = metrics?.totalClaims ?? 0;
  const verifiedClaims = metrics?.verifiedClaims ?? 0;
  const recoveredClaims = metrics?.recoveredClaims ?? 0;
  const flaggedClaims = metrics?.flaggedClaims ?? 0;

  // Deterministic Project Readiness & Copy
  const readinessParams = React.useMemo(
    () => ({
      totalDocs: documents.length,
      readyDocsCount: readyDocs.length,
      processingDocsCount: processingDocs.length,
      failedDocsCount: failedDocs.length,
      flaggedClaimsCount: flaggedClaims,
      totalChunks,
      totalClaims,
    }),
    [documents.length, readyDocs.length, processingDocs.length, failedDocs.length, flaggedClaims, totalChunks, totalClaims]
  );

  const readinessState = React.useMemo(
    () => computeProjectReadiness(readinessParams),
    [readinessParams]
  );

  const heroSummaryText = React.useMemo(
    () => getHeroSummaryText(readinessState, readinessParams),
    [readinessState, readinessParams]
  );

  const recommendedSteps = React.useMemo(
    () =>
      getSuggestedNextSteps({
        totalDocs: documents.length,
        readyDocsCount: readyDocs.length,
        processingDocsCount: processingDocs.length,
        failedDocsCount: failedDocs.length,
        flaggedClaimsCount: flaggedClaims,
        conversationsCount: conversations.length,
        projectId,
      }),
    [documents.length, readyDocs.length, processingDocs.length, failedDocs.length, flaggedClaims, conversations.length, projectId]
  );

  // Loading Skeleton State (Smooth, zero layout shift)
  if (isLoading) {
    return (
      <div className="space-y-12 max-w-[1400px] w-full mx-auto py-2" aria-busy="true" aria-label="Loading project overview">
        {/* Hero Canvas Skeleton */}
        <div className="space-y-6 pt-1 pb-6">
          <div className="space-y-3">
            <Skeleton className="h-12 w-80" />
            <Skeleton className="h-6 w-full max-w-2xl" />
          </div>
          <div className="flex gap-4 pt-1">
            <Skeleton className="h-11 w-36 rounded-lg" />
            <Skeleton className="h-11 w-32 rounded-lg" />
          </div>
          <div className="pt-6">
            <Skeleton className="h-44 w-full rounded-2xl" />
          </div>
        </div>

        {/* Attention Narrative Skeleton */}
        <Skeleton className="h-16 w-full rounded-lg" />

        {/* Dual Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-2">
          <div className="lg:col-span-7 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
          <div className="lg:col-span-5 space-y-3">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        </div>

        {/* Recommendations Skeleton */}
        <div className="space-y-3 pt-2">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // Error State
  if (error || !project) {
    return (
      <div className="p-8 rounded-xl border border-destructive/40 bg-card/60 text-center space-y-4 max-w-lg mx-auto my-12">
        <div className="h-10 w-10 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Unable to load project</h2>
          <p className="text-xs text-muted-foreground">{error || 'Project not found or access denied.'}</p>
        </div>
        <div className="flex justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
          <Button size="sm" onClick={() => router.push('/projects')} className="text-xs">
            Switch Project
          </Button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STATE A: NO KNOWLEDGE (0 documents exist) — PRESERVED ONBOARDING EXPERIENCE
  // =========================================================================
  if (documents.length === 0) {
    return (
      <div className="space-y-8 max-w-4xl mx-auto py-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/60">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {project.name}
              </h1>
              <Badge variant="outline" className="text-[10px] font-mono py-0.5 px-2 text-primary border-primary/30">
                New Project
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {project.description || 'A project keeps its documents, conversations and evidence isolated.'}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setLearnModalOpen(true)}
            className="text-xs gap-1.5 self-start sm:self-center shrink-0"
          >
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            <span>How EvideX AI works</span>
          </Button>
        </div>

        {/* Onboarding Guide Card */}
        <div className="rounded-xl border border-border/80 bg-card/40 p-6 sm:p-8 space-y-8 shadow-xs">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Project created successfully</span>
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              Ready to establish your verified knowledge base
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xl leading-relaxed">
              EvideX AI isolates this workspace so evidence, citations, and conversation history
              never bleed across projects. Follow three steps to get started.
            </p>
          </div>

          {/* 3 Step Progression */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Step 1 */}
            <div className="p-4 rounded-lg border border-border/80 bg-background/60 space-y-2.5 relative">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                  Step 1
                </span>
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-xs font-semibold text-foreground">Add your knowledge</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Upload domain PDFs, SEC filings, or policy manuals. Passages are indexed for project-scoped retrieval.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 rounded-lg border border-border/60 bg-background/30 space-y-2.5 opacity-85">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  Step 2
                </span>
                <MessageSquareCode className="h-4 w-4 text-muted-foreground" />
              </div>
              <h3 className="text-xs font-semibold text-foreground">Ask a grounded question</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Query in natural language. Every assertion generated is bound to retrieved passages with strict cross-encoder NLI verification.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-4 rounded-lg border border-border/60 bg-background/30 space-y-2.5 opacity-85">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  Step 3
                </span>
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              </div>
              <h3 className="text-xs font-semibold text-foreground">Inspect & audit evidence</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Review cited chunks, inspect claim entailment labels, and see contradictions intercepted before delivery.
              </p>
            </div>
          </div>

          {/* Primary Action Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-accent/40 border border-border/70">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground block">
                Begin with your source documents
              </span>
              <span className="text-[11px] text-muted-foreground block">
                Knowledge documents will appear in this overview once uploaded.
              </span>
            </div>
            <Button
              onClick={() => router.push(`/projects/${projectId}/knowledge`)}
              className="gap-2 text-xs h-9 px-4 shrink-0"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>Go to Knowledge Base</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Learn How It Works Dialog */}
        <Dialog open={learnModalOpen} onOpenChange={setLearnModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">How EvideX AI Works</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Strict factual grounding architecture with autonomous recovery.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3.5 py-3 text-xs text-muted-foreground leading-relaxed">
              <div className="p-3 rounded-md border border-border/60 bg-accent/30 space-y-1">
                <span className="font-semibold text-foreground block">1. Project-Scoped Access Boundary</span>
                <p>
                  Documents and embeddings are partitioned by your project ID, preventing cross-project data leakage.
                </p>
              </div>
              <div className="p-3 rounded-md border border-border/60 bg-accent/30 space-y-1">
                <span className="font-semibold text-foreground block">2. DeBERTa-v3 Cross-Encoder Rail</span>
                <p>
                  Every individual sentence in an answer is parsed into a factual claim and verified against retrieved
                  evidence using Natural Language Inference.
                </p>
              </div>
              <div className="p-3 rounded-md border border-border/60 bg-accent/30 space-y-1">
                <span className="font-semibold text-foreground block">3. Autonomous Recovery Rail</span>
                <p>
                  If a generated assertion is contradicted or neutral, EvideX AI re-queries the passage index to repair
                  the claim before presenting it to you.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // =========================================================================
  // STATE B: POPULATED PROJECT — THE LIVING KNOWLEDGE PORTRAIT
  // Narrative Sequence:
  // 1. This is your project (ProjectPulseHero with Evidence Lineage)
  // 2. Here is what EVIDEX understands about it (WhatEvidexSees Constellation)
  // 3. Here is how trustworthy that knowledge is (TrustLandscape Terrain Strip)
  // 4. Here is what stands out (EvidenceSignals Observations)
  // 5. Here is where you left off & Knowledge origin (60 / 40 Intentional Asymmetry)
  // 6. Here is what matters next (WhatMattersNext Decisions)
  // 7. Quiet Trust Footer
  // =========================================================================
  // =========================================================================
  // STATE B: POPULATED PROJECT — EDITORIAL RESEARCH OVERVIEW
  // Section Structure (Exact):
  // A. Project hero + B. Evidence lineage (integrated in ProjectPulseHero)
  // C. Project understanding (What this project is about)
  // D. Trust summary (Trust at a glance)
  // E. Continue where you left off + Recent knowledge (compact 60/40 grid)
  // F. What matters next (Max 3 prioritized actions)
  // G. Quiet footer
  // =========================================================================
  return (
    <div className="space-y-8 max-w-[1400px] w-full mx-auto py-2">
      {/* A. Project Hero + B. Evidence Lineage (The Signature Visual) */}
      <ProjectPulseHero
        projectId={projectId}
        projectName={project.name}
        readinessState={readinessState}
        summaryText={heroSummaryText}
        totalDocs={documents.length}
        readyDocsCount={readyDocs.length}
        processingDocsCount={processingDocs.length}
        failedDocsCount={failedDocs.length}
        totalChunks={totalChunks}
        totalClaims={totalClaims}
        verifiedClaims={verifiedClaims}
        recoveredClaims={recoveredClaims}
        flaggedClaims={flaggedClaims}
      />

      {/* C. Project Understanding: What this project is about */}
      <ProjectUnderstanding
        documents={documents}
        claims={claims}
      />

      {/* D. Trust Summary: Trust at a glance (Sentence-form communication) */}
      <TrustSummary
        projectId={projectId}
        totalClaims={totalClaims}
        verifiedClaims={verifiedClaims}
        recoveredClaims={recoveredClaims}
        flaggedClaims={flaggedClaims}
      />

      {/* E. Continue where you left off + Recent knowledge */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start pt-1">
        <div className="lg:col-span-7">
          <ContinueWorking
            projectId={projectId}
            conversations={conversations}
          />
        </div>
        <div className="lg:col-span-5">
          <KnowledgeOrigin
            projectId={projectId}
            documents={documents}
            totalChunks={totalChunks}
          />
        </div>
      </div>

      {/* F. What Matters Next (Max 3 editorial actions) */}
      <WhatMattersNext steps={recommendedSteps} />

      {/* G. Quiet Trust Footer */}
      <QuietTrustFooter projectId={projectId} />
    </div>
  );
}
