'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  FileText,
  MessageSquareCode,
  UploadCloud,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import type {
  Project,
  Document as GroundDocument,
  Conversation,
  ProjectMetricsResponse,
  ProjectClaimItem,
} from '@groundguard/types';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildSourceFingerprints, computeProjectReadiness, getSuggestedNextSteps } from '@/lib/overview-helpers';
import {
  buildActivityFeed,
  claimBreakdown,
  documentCounts,
  documentsByRecency,
  overviewSummary,
} from '@/lib/overview-activity';
import { getProjectClaimsPaginated } from '@/lib/conversations-api';
import { WhatMattersNext } from '@/components/overview/what-matters-next';
import { QuietTrustFooter } from '@/components/overview/quiet-trust-footer';
import {
  EmphasizedNumbers,
  EvidenceLandscape,
  EvidenceStatusPanel,
  ProjectFacts,
  ReadinessPill,
  ResearchTimeline,
  Reveal,
  SourceList,
} from '@/components/overview/workspace-sections';

const PAGE = 'mx-auto w-full max-w-[1240px]';

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
        getProjectClaimsPaginated(projectId, { limit: 500 }).catch(() => ({ claims: [] })),
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

  // Derived real counts (no synthetic values)
  const docs = React.useMemo(() => documentCounts(documents), [documents]);
  const totalChunks = React.useMemo(() => documents.reduce((sum, d) => sum + (d.chunksCount || 0), 0), [documents]);
  const claimsSummary = React.useMemo(() => claimBreakdown(metrics), [metrics]);

  // Same metric fields as before (0 when metrics are unavailable) for the existing helpers/visuals.
  const totalClaims = metrics?.totalClaims ?? 0;
  const verifiedClaims = metrics?.verifiedClaims ?? 0;
  const recoveredClaims = metrics?.recoveredClaims ?? 0;
  const flaggedClaims = metrics?.flaggedClaims ?? 0;

  const readinessState = React.useMemo(
    () =>
      computeProjectReadiness({
        totalDocs: docs.total,
        readyDocsCount: docs.ready,
        processingDocsCount: docs.processing,
        failedDocsCount: docs.failed,
        flaggedClaimsCount: flaggedClaims,
        totalChunks,
        totalClaims,
      }),
    [docs, flaggedClaims, totalChunks, totalClaims]
  );

  const recommendedSteps = React.useMemo(
    () =>
      getSuggestedNextSteps({
        totalDocs: docs.total,
        readyDocsCount: docs.ready,
        processingDocsCount: docs.processing,
        failedDocsCount: docs.failed,
        flaggedClaimsCount: flaggedClaims,
        conversationsCount: conversations.length,
        projectId,
      }),
    [docs, flaggedClaims, conversations.length, projectId]
  );

  const activity = React.useMemo(
    () => buildActivityFeed({ projectId, conversations, documents, claims, limit: 10 }),
    [projectId, conversations, documents, claims]
  );
  const recentDocuments = React.useMemo(() => documentsByRecency(documents).slice(0, 6), [documents]);
  // Same inputs the previous Source Fingerprint used; the calculation itself is unchanged.
  const fingerprints = React.useMemo(
    () => buildSourceFingerprints({ documents, claims, metrics: { totalClaims, verifiedClaims, recoveredClaims, flaggedClaims } }),
    [documents, claims, totalClaims, verifiedClaims, recoveredClaims, flaggedClaims]
  );

  // ------------------------------------------------------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className={`${PAGE} space-y-14 py-2`} aria-busy="true" aria-label="Loading project overview">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="space-y-6 lg:col-span-7 lg:pt-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-10 w-4/5" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full max-w-[34rem]" />
              <Skeleton className="h-4 w-2/3 max-w-[24rem]" />
            </div>
            <Skeleton className="h-[74px] w-full rounded-none" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-32 rounded-md" />
              <Skeleton className="h-9 w-36 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-[340px] w-full rounded-2xl lg:col-span-5" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------------------------------------------------
  // Error
  // ------------------------------------------------------------------------------------------------------------
  if (error || !project) {
    return (
      <div className="mx-auto my-16 max-w-md rounded-xl border border-border/70 bg-card/50 p-6 text-center" role="alert">
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Unable to load this project</h2>
        <p className="mt-1 text-xs text-muted-foreground break-words">{error || 'Project not found or access denied.'}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
          <Button size="sm" onClick={() => router.push('/projects')} className="text-xs">
            Switch project
          </Button>
        </div>
      </div>
    );
  }

  const hasDocs = documents.length > 0;
  const identity = (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <span>Project overview</span>
        <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
        {hasDocs ? (
          <ReadinessPill state={readinessState} />
        ) : (
          <span className="rounded-full border border-border/80 px-2 py-0.5 text-[12px] text-foreground/85">New project</span>
        )}
      </div>
      <h1
        className="line-clamp-2 text-[30px] font-semibold leading-[1.06] tracking-[-0.035em] text-foreground [overflow-wrap:anywhere] sm:text-[38px] lg:text-[42px]"
        title={project.name}
      >
        {project.name}
      </h1>
      <p className="max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground sm:text-base">
        {hasDocs ? (
          <EmphasizedNumbers text={overviewSummary(docs, claimsSummary)} />
        ) : (
          project.description || 'A project keeps its documents, conversations and evidence isolated.'
        )}
      </p>
      {hasDocs && project.description && (
        <p className="max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground/85 line-clamp-2">{project.description}</p>
      )}
    </div>
  );

  const actions = hasDocs ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => router.push(`/projects/${projectId}/ask`)} className="h-9 gap-1.5 px-3.5 text-[13px]">
        <MessageSquareCode className="h-4 w-4" />
        Ask EVIDEX
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push(`/projects/${projectId}/knowledge?upload=1`)}
        className="h-9 gap-1.5 px-3 text-[13px]"
      >
        <UploadCloud className="h-4 w-4" />
        Add documents
      </Button>
      {claimsSummary && claimsSummary.needsReview > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/projects/${projectId}/reliability`)}
          className="h-9 gap-1.5 px-3 text-[13px] text-[hsl(var(--status-needs-review))] hover:text-[hsl(var(--status-needs-review))]"
        >
          Review {claimsSummary.needsReview.toLocaleString()} {claimsSummary.needsReview === 1 ? 'claim' : 'claims'}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" onClick={() => setLearnModalOpen(true)} className="h-9 gap-1.5 text-[13px] text-muted-foreground">
        <HelpCircle className="h-4 w-4" />
        How EvideX AI works
      </Button>
    </div>
  );

  // ------------------------------------------------------------------------------------------------------------
  // Empty project (no documents): onboarding
  // ------------------------------------------------------------------------------------------------------------
  if (documents.length === 0) {
    const steps = [
      {
        icon: FileText,
        title: 'Add your knowledge',
        body: 'Upload PDFs such as manuals, filings or policies. Passages are indexed for project-scoped retrieval.',
        current: true,
      },
      {
        icon: MessageSquareCode,
        title: 'Ask a grounded question',
        body: 'Ask in natural language. Each claim in the answer is checked against the retrieved passages.',
        current: false,
      },
      {
        icon: ShieldCheck,
        title: 'Inspect the evidence',
        body: 'Open cited passages, see each claim’s verification result, and review anything left unresolved.',
        current: false,
      },
    ];
    return (
      <div className={`${PAGE} space-y-8 py-1`}>
        <Reveal className="space-y-4">
          {identity}
          {actions}
        </Reveal>

        <Reveal delay={0.05}>
          <section aria-label="Get started" className="rounded-xl border border-border/70 bg-card/40">
            <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-border/60 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="bg-card p-5">
                  <div className="flex items-center justify-between">
                    <span
                      className={
                        s.current
                          ? 'font-mono text-[11px] uppercase tracking-wider text-foreground'
                          : 'font-mono text-[11px] uppercase tracking-wider text-muted-foreground'
                      }
                    >
                      Step {i + 1}
                    </span>
                    <s.icon className={s.current ? 'h-4 w-4 text-foreground' : 'h-4 w-4 text-muted-foreground/70'} />
                  </div>
                  <h3 className={s.current ? 'mt-3 text-sm font-medium text-foreground' : 'mt-3 text-sm text-foreground/80'}>{s.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-3 border-t border-border/60 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Begin with your source documents</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Documents, activity and verification results appear here once uploaded.</p>
              </div>
              <Button onClick={() => router.push(`/projects/${projectId}/knowledge`)} className="h-9 shrink-0 gap-2 text-xs">
                <UploadCloud className="h-3.5 w-3.5" />
                Go to Knowledge Base
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </section>
        </Reveal>

        <Dialog open={learnModalOpen} onOpenChange={setLearnModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">How EvideX AI works</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Answers are grounded in your project’s documents and checked claim by claim.
              </DialogDescription>
            </DialogHeader>
            <ol className="divide-y divide-border/60 rounded-lg border border-border/60 text-xs leading-relaxed text-muted-foreground">
              <li className="p-3">
                <span className="block font-medium text-foreground">1. Project-scoped evidence</span>
                Documents and embeddings are partitioned by project, so evidence never crosses projects.
              </li>
              <li className="p-3">
                <span className="block font-medium text-foreground">2. Claim-level verification</span>
                Each answer is split into factual claims, and every claim is checked against its retrieved evidence with
                a natural-language-inference model.
              </li>
              <li className="p-3">
                <span className="block font-medium text-foreground">3. Bounded recovery</span>
                Claims that are contradicted or unsupported are re-checked against additional evidence. Claims that
                still can’t be supported stay marked for review.
              </li>
            </ol>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ------------------------------------------------------------------------------------------------------------
  // Populated project
  // ------------------------------------------------------------------------------------------------------------
  return (
    <div className={`${PAGE} space-y-14 py-2`}>
      <Reveal className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="min-w-0 space-y-7 lg:col-span-7 lg:pt-2">
          {identity}
          <ProjectFacts totalChunks={totalChunks} metrics={metrics} conversationsCount={conversations.length} />
          {actions}
        </div>
        <div className="min-w-0 lg:col-span-5">
          <EvidenceStatusPanel projectId={projectId} docs={docs} claims={claimsSummary} onRetry={fetchData} />
        </div>
      </Reveal>

      <Reveal delay={0.06}>
        <EvidenceLandscape
          fingerprints={fingerprints}
          projectId={projectId}
          loadedClaims={claims.length}
          totalClaims={claimsSummary ? claimsSummary.total : null}
        />
      </Reveal>

      <Reveal delay={0.1} className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-14">
        <div className="min-w-0 lg:col-span-7">
          <ResearchTimeline items={activity} projectId={projectId} />
        </div>
        <div className="min-w-0 space-y-12 lg:col-span-5">
          <SourceList documents={recentDocuments} projectId={projectId} docs={docs} />
          <WhatMattersNext steps={recommendedSteps} />
        </div>
      </Reveal>

      <QuietTrustFooter projectId={projectId} />
    </div>
  );
}
