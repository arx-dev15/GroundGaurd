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
  Info,
  HelpCircle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import type { Project, Document as GroundDocument, Conversation } from '@groundguard/types';
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

export default function RealProjectOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = (params?.projectId as string) || '';

  const [project, setProject] = React.useState<Project | null>(null);
  const [documents, setDocuments] = React.useState<GroundDocument[]>([]);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [learnModalOpen, setLearnModalOpen] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    if (!projectId) return;
    try {
      setIsLoading(true);
      setError(null);

      const [projRes, docsRes, convsRes] = await Promise.all([
        apiClient.get<{ project: Project }>(`/v1/projects/${projectId}`),
        apiClient.get<{ documents: GroundDocument[] }>(`/v1/projects/${projectId}/documents`).catch(() => ({ documents: [] })),
        apiClient.get<{ conversations: Conversation[] }>(`/v1/projects/${projectId}/conversations`).catch(() => ({ conversations: [] })),
      ]);

      setProject(projRes.project);
      setDocuments(docsRes.documents || []);
      setConversations(convsRes.conversations || []);
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

  // Derived Real Counts (Zero Fake Data)
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

  // Loading Skeleton State
  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading project overview">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/60">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  // Error State
  if (error || !project) {
    return (
      <div className="p-8 rounded-lg border border-destructive/40 bg-card/60 text-center space-y-4 max-w-lg mx-auto my-12">
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

  // FIRST-USE STATE: 0 documents exist yet
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

  // ACTIVE STATE: Documents / Activity Exist (Real Data Only)
  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-border/60">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {project.name}
            </h1>
            <Badge variant="outline" className="text-[10px] font-mono py-0.5 px-2 text-status-verified border-status-verified/30">
              Active Project
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {project.description || 'Grounded conversational workspace and evidence repository.'}
          </p>
        </div>

        {/* Primary / Secondary Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/projects/${projectId}/knowledge?upload=1`)}
            className="text-xs h-8 gap-1.5"
          >
            <UploadCloud className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Add Knowledge</span>
          </Button>
          <Button
            size="sm"
            onClick={() => router.push(`/projects/${projectId}/ask`)}
            className="text-xs h-8 gap-1.5"
          >
            <MessageSquareCode className="h-3.5 w-3.5" />
            <span>Ask EvideX AI</span>
          </Button>
        </div>
      </div>

      {/* Real Knowledge Status Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg border border-border/70 bg-card/40 space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Total Documents
          </span>
          <div className="text-2xl font-bold font-mono text-foreground">{documents.length}</div>
          <p className="text-[10px] text-muted-foreground">In document repository</p>
        </div>

        <div className="p-3.5 rounded-lg border border-border/70 bg-card/40 space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Ready for Retrieval
          </span>
          <div className="text-2xl font-bold font-mono text-status-verified">{readyDocs.length}</div>
          <p className="text-[10px] text-status-verified flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            <span>Available for retrieval</span>
          </p>
        </div>

        <div className="p-3.5 rounded-lg border border-border/70 bg-card/40 space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Processing
          </span>
          <div className="text-2xl font-bold font-mono text-foreground">{processingDocs.length}</div>
          <p className="text-[10px] text-muted-foreground">
            {processingDocs.length > 0 ? 'Parsing in background' : 'No active ingestions'}
          </p>
        </div>

        <div className="p-3.5 rounded-lg border border-border/70 bg-card/40 space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Indexed Passages
          </span>
          <div className="text-2xl font-bold font-mono text-foreground">{totalChunks}</div>
          <p className="text-[10px] text-muted-foreground">Embedded text chunks</p>
        </div>
      </div>

      {/* Needs Attention Alert (Only shown if failed documents exist from real API) */}
      {failedDocs.length > 0 && (
        <div className="p-4 rounded-lg border border-destructive/40 bg-destructive/10 space-y-2">
          <div className="flex items-center gap-2 text-destructive font-semibold text-xs">
            <AlertCircle className="h-4 w-4" />
            <span>{failedDocs.length} document(s) encountered processing errors</span>
          </div>
          <div className="space-y-1.5 pl-6">
            {failedDocs.map((doc) => (
              <div key={doc.id} className="text-xs flex items-center justify-between text-foreground">
                <span className="font-medium truncate">{doc.filename}</span>
                <span className="text-destructive font-mono text-[11px]">
                  {doc.errorMessage || 'Parsing failed'}
                </span>
              </div>
            ))}
          </div>
          <div className="pt-1 pl-6">
            <Link
              href={`/projects/${projectId}/knowledge`}
              className="text-xs text-destructive underline font-medium hover:opacity-80 inline-flex items-center gap-1"
            >
              <span>Manage failed files in Knowledge Base</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Two Column Section: Recent Documents & Recent Conversations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents */}
        <div className="rounded-lg border border-border/70 bg-card/30 flex flex-col justify-between overflow-hidden">
          <div className="p-4 border-b border-border/60 flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Recent Documents</span>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Domain files available for evidence retrieval.
              </p>
            </div>
            <Link
              href={`/projects/${projectId}/knowledge`}
              className="text-[11px] text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              <span>View all</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="divide-y divide-border/50 text-xs flex-1">
            {documents.slice(0, 5).map((doc) => (
              <div
                key={doc.id}
                onClick={() => router.push(`/projects/${projectId}/knowledge/${doc.id}`)}
                className="flex items-center justify-between p-3.5 hover:bg-muted/40 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                  <span className="font-medium text-foreground truncate group-hover:text-primary transition-colors">{doc.filename}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-muted-foreground font-mono text-[11px]">
                  <span>{formatBytes(doc.fileSize)}</span>
                  <Badge
                    variant="outline"
                    className={
                      doc.status === 'ready'
                        ? 'border-status-verified/40 text-status-verified text-[10px] py-0 px-1.5'
                        : doc.status === 'failed'
                        ? 'border-destructive/40 text-destructive text-[10px] py-0 px-1.5'
                        : 'text-muted-foreground text-[10px] py-0 px-1.5'
                    }
                  >
                    {doc.status}
                  </Badge>
                  <span className="hidden sm:inline">{formatRelativeTime(doc.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-muted/20 border-t border-border/50 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/projects/${projectId}/knowledge?upload=1`)}
              className="text-xs w-full h-8 text-muted-foreground hover:text-foreground"
            >
              + Add more documents
            </Button>
          </div>
        </div>

        {/* Recent Conversations */}
        <div className="rounded-lg border border-border/70 bg-card/30 flex flex-col justify-between overflow-hidden">
          <div className="p-4 border-b border-border/60 flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <MessageSquareCode className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Recent Conversations</span>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Grounded sessions evaluated by the verification rail.
              </p>
            </div>
            <Link
              href={`/projects/${projectId}/ask`}
              className="text-[11px] text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              <span>New query</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="divide-y divide-border/50 text-xs flex-1">
            {conversations.length === 0 ? (
              <div className="p-8 text-center space-y-2.5 my-auto">
                <MessageSquareCode className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">No conversations yet</p>
                  <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                    Start asking questions against your uploaded documents. Retrieved passages will be cited in real time.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => router.push(`/projects/${projectId}/ask`)}
                  className="text-xs h-8 gap-1.5"
                >
                  <MessageSquareCode className="h-3 w-3" />
                  <span>Start Conversation</span>
                </Button>
              </div>
            ) : (
              conversations.slice(0, 5).map((conv) => (
                <Link
                  key={conv.id}
                  href={`/projects/${projectId}/ask?conversationId=${conv.id}`}
                  className="flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-status-verified shrink-0" />
                    <span className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {conv.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-muted-foreground font-mono text-[11px]">
                    <Clock className="h-3 w-3 opacity-60" />
                    <span>{formatRelativeTime(conv.updatedAt)}</span>
                  </div>
                </Link>
              ))
            )}
          </div>

          {conversations.length > 0 && (
            <div className="p-3 bg-muted/20 border-t border-border/50 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/projects/${projectId}/ask`)}
                className="text-xs w-full h-8 text-muted-foreground hover:text-foreground"
              >
                + New grounded conversation
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Trust & Verification Rail Snapshot (Honest Contract - No Fake Telemetry) */}
      <div className="p-4 rounded-lg border border-border/70 bg-card/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 text-status-verified shrink-0" />
          <div className="space-y-0.5">
            <span className="font-medium text-foreground block">
              Project-scoped access boundary active
            </span>
            <span className="text-[11px] text-muted-foreground block">
              Vector index and document citations are isolated to project ID:{' '}
              <code className="font-mono text-[10px] text-foreground">{projectId}</code>.
            </span>
          </div>
        </div>

        <span className="text-[11px] font-mono text-muted-foreground shrink-0 self-start sm:self-center">
          Observability metrics active during Ask queries
        </span>
      </div>
    </div>
  );
}
