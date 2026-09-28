'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  FolderGit2,
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Search,
  MoreVertical,
  Trash2,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectDocuments, useDeleteDocument } from '@/lib/documents-query';
import { DocumentUploadModal } from '@/components/knowledge/document-upload-modal';
import { cn } from '@/lib/utils';
import type { Document as GroundDocument, DocumentStatus } from '@groundguard/types';

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

type StatusFilter = 'all' | 'ready' | 'processing' | 'failed';

function KnowledgeSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading knowledge documents">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/60">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
    </div>
  );
}

function KnowledgePageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = (params?.projectId as string) || '';

  const { data: documents = [], isLoading, isError, refetch } = useProjectDocuments(projectId);
  const deleteMutation = useDeleteDocument(projectId);

  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [documentToDelete, setDocumentToDelete] = React.useState<GroundDocument | null>(null);

  // Auto-open upload modal if ?upload=1 in URL
  React.useEffect(() => {
    if (searchParams.get('upload') === '1' || searchParams.get('upload') === 'true') {
      setUploadModalOpen(true);
    }
  }, [searchParams]);

  // Derived counts
  const readyCount = React.useMemo(() => documents.filter((d) => d.status === 'ready').length, [documents]);
  const processingCount = React.useMemo(
    () => documents.filter((d) => d.status === 'processing' || d.status === 'uploaded').length,
    [documents]
  );
  const failedCount = React.useMemo(() => documents.filter((d) => d.status === 'failed').length, [documents]);

  // Filtered documents
  const filteredDocuments = React.useMemo(() => {
    return documents.filter((doc) => {
      // Search match
      const matchesSearch =
        !searchQuery.trim() ||
        doc.filename.toLowerCase().includes(searchQuery.trim().toLowerCase());

      // Status match
      let matchesStatus = true;
      if (statusFilter === 'ready') matchesStatus = doc.status === 'ready';
      else if (statusFilter === 'processing')
        matchesStatus = doc.status === 'processing' || doc.status === 'uploaded';
      else if (statusFilter === 'failed') matchesStatus = doc.status === 'failed';

      return matchesSearch && matchesStatus;
    });
  }, [documents, searchQuery, statusFilter]);

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;
    try {
      await deleteMutation.mutateAsync(documentToDelete.id);
      setDocumentToDelete(null);
    } catch {
      // Handled by mutation error state
    }
  };

  const getStatusBadge = (status: DocumentStatus) => {
    switch (status) {
      case 'ready':
        return (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-2 text-status-verified border-status-verified/40 bg-status-verified/5 flex items-center gap-1"
          >
            <CheckCircle2 className="h-2.5 w-2.5" />
            <span>Ready</span>
          </Badge>
        );
      case 'processing':
      case 'uploaded':
        return (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-2 text-amber-500 border-amber-500/30 bg-amber-500/5 flex items-center gap-1"
          >
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            <span>Processing</span>
          </Badge>
        );
      case 'failed':
        return (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-2 text-destructive border-destructive/40 bg-destructive/5 flex items-center gap-1"
          >
            <AlertCircle className="h-2.5 w-2.5" />
            <span>Failed</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px] py-0 px-2 text-muted-foreground">
            {status}
          </Badge>
        );
    }
  };

  // Loading skeleton state
  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading knowledge documents">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/60">
          <div className="space-y-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>

        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-48" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="p-8 rounded-lg border border-destructive/40 bg-card/60 text-center space-y-4 max-w-lg mx-auto my-12">
        <div className="h-10 w-10 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Failed to load documents</h2>
          <p className="text-xs text-muted-foreground">
            The knowledge repository could not be reached.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FolderGit2 className="h-5 w-5 text-muted-foreground" />
            <span>Knowledge Base</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Documents GroundGuard can retrieve evidence from with project-scoped isolation.
          </p>
        </div>

        <Button
          onClick={() => setUploadModalOpen(true)}
          className="text-xs h-9 gap-1.5 self-start sm:self-center shrink-0"
        >
          <UploadCloud className="h-3.5 w-3.5" />
          <span>Upload Documents</span>
        </Button>
      </div>

      {/* Main Content Area */}
      {documents.length === 0 ? (
        /* Zero Documents First-Use Onboarding State */
        <div className="rounded-xl border border-border/80 bg-card/30 p-8 sm:p-12 text-center space-y-4 max-w-2xl mx-auto my-6">
          <div className="h-12 w-12 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-foreground">Add knowledge to this project</h2>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              Upload source documents GroundGuard can use as evidence. Once indexed, passages
              are available for retrieval during conversational evaluations.
            </p>
          </div>

          <div className="pt-2">
            <Button onClick={() => setUploadModalOpen(true)} className="gap-2 text-xs h-9 px-4">
              <UploadCloud className="h-4 w-4" />
              <span>Upload Documents</span>
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground font-mono pt-4 border-t border-border/50 max-w-sm mx-auto">
            Supported format: PDF up to 10 MB • Isolated to project workspace
          </p>
        </div>
      ) : (
        /* Active Document Repository Table / List */
        <div className="space-y-4">
          {/* Controls: Search & Filter Tabs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search documents by name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs h-8 pl-8 pr-8"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  statusFilter === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                All ({documents.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ready')}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  statusFilter === 'ready'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                Ready ({readyCount})
              </button>
              {processingCount > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('processing')}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    statusFilter === 'processing'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  Processing ({processingCount})
                </button>
              )}
              {failedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('failed')}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    statusFilter === 'failed'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  Failed ({failedCount})
                </button>
              )}
            </div>
          </div>

          {/* Documents Table */}
          <div className="rounded-lg border border-border/70 bg-card/30 overflow-hidden shadow-2xs">
            {filteredDocuments.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs text-muted-foreground">No documents match the current filter</p>
                {(searchQuery || statusFilter !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                    }}
                    className="text-xs h-7"
                  >
                    Clear filter
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border/50 text-xs">
                {/* Desktop Table Header */}
                <div className="hidden md:grid md:grid-cols-12 gap-3 px-4 py-2.5 bg-muted/30 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  <div className="col-span-5">Document Name</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Chunks / Size</div>
                  <div className="col-span-2">Uploaded</div>
                  <div className="col-span-1 text-right">Actions</div>
                </div>

                {filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => router.push(`/projects/${projectId}/knowledge/${doc.id}`)}
                    className="group flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-3 px-4 py-3 md:items-center hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    {/* Document Name */}
                    <div className="col-span-5 flex items-center gap-2.5 min-w-0">
                      <div className="h-7 w-7 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {doc.filename}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono md:hidden">
                          {formatBytes(doc.fileSize)} • {doc.chunksCount} chunks
                        </p>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="col-span-2 flex items-center">
                      {getStatusBadge(doc.status)}
                    </div>

                    {/* Chunks / Size */}
                    <div className="col-span-2 hidden md:flex flex-col text-[11px] font-mono text-muted-foreground">
                      <span className="text-foreground">
                        {doc.chunksCount > 0 ? `${doc.chunksCount} chunks` : '—'}
                      </span>
                      <span>{formatBytes(doc.fileSize)}</span>
                    </div>

                    {/* Upload Date */}
                    <div className="col-span-2 hidden md:block text-[11px] font-mono text-muted-foreground">
                      {formatRelativeTime(doc.createdAt)}
                    </div>

                    {/* Actions Menu */}
                    <div
                      className="col-span-1 flex items-center justify-end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 text-xs">
                          <DropdownMenuItem
                            onClick={() => router.push(`/projects/${projectId}/knowledge/${doc.id}`)}
                            className="cursor-pointer gap-2"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Open Details</span>
                          </DropdownMenuItem>

                          {doc.status === 'failed' && (
                            <DropdownMenuItem
                              onClick={() => setUploadModalOpen(true)}
                              className="cursor-pointer gap-2"
                            >
                              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Re-upload document</span>
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            onClick={() => setDocumentToDelete(doc)}
                            className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <DocumentUploadModal
        projectId={projectId}
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(documentToDelete)} onOpenChange={(open) => !open && setDocumentToDelete(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Delete Document</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete <span className="font-medium text-foreground">{documentToDelete?.filename}</span>?
              All associated vector embeddings and indexed passages will be permanently removed.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => setDocumentToDelete(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={handleDeleteConfirm}
              className="text-xs gap-1.5"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Deleting…</span>
                </>
              ) : (
                <span>Delete Document</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function KnowledgePage() {
  return (
    <React.Suspense fallback={<KnowledgeSkeleton />}>
      <KnowledgePageContent />
    </React.Suspense>
  );
}
