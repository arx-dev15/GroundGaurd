'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  FileText,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Copy,
  Check,
  Shield,
  BookOpen,
} from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { PDFSourceViewer } from '@/components/source/pdf-source-viewer';
import { useDocument, useDeleteDocument } from '@/lib/documents-query';
import type { DocumentStatus } from '@groundguard/types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

function DocumentDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading document details">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="h-20 rounded-lg bg-card/40 border border-border/60 p-4 space-y-2">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-96 rounded-lg bg-card/40 border border-border/60" />
        <div className="h-96 rounded-lg bg-card/40 border border-border/60" />
      </div>
    </div>
  );
}

function DocumentDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const projectId = (params?.projectId as string) || '';
  const documentId = (params?.documentId as string) || '';

  const { data: document, isLoading, isError } = useDocument(documentId);
  const deleteMutation = useDeleteDocument(projectId);

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState(false);

  // Preserve citation deep-link context from ?page=X
  const pageParam = searchParams.get('page');

  const handleCopyId = () => {
    if (!document) return;
    navigator.clipboard.writeText(document.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteMutation.mutateAsync(documentId);
      setDeleteDialogOpen(false);
      router.push(`/projects/${projectId}/knowledge`);
    } catch {
      // Handled by delete mutation
    }
  };

  const getStatusBadge = (status: DocumentStatus) => {
    switch (status) {
      case 'ready':
        return (
          <Badge
            variant="outline"
            className="text-xs py-0.5 px-2.5 text-status-verified border-status-verified/40 bg-status-verified/5 flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-3 w-3" />
            <span>Ready for retrieval</span>
          </Badge>
        );
      case 'processing':
      case 'uploaded':
        return (
          <Badge
            variant="outline"
            className="text-xs py-0.5 px-2.5 text-amber-500 border-amber-500/30 bg-amber-500/5 flex items-center gap-1.5"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Processing Ingestion</span>
          </Badge>
        );
      case 'failed':
        return (
          <Badge
            variant="outline"
            className="text-xs py-0.5 px-2.5 text-destructive border-destructive/40 bg-destructive/5 flex items-center gap-1.5"
          >
            <AlertCircle className="h-3 w-3" />
            <span>Processing Failed</span>
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Loading skeleton
  if (isLoading) {
    return <DocumentDetailSkeleton />;
  }

  // Not found or error
  if (isError || !document) {
    return (
      <div className="p-8 rounded-lg border border-destructive/40 bg-card/60 text-center space-y-4 max-w-lg mx-auto my-12">
        <div className="h-10 w-10 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Document not found</h2>
          <p className="text-xs text-muted-foreground">
            The requested document could not be retrieved or has been deleted.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/projects/${projectId}/knowledge`)}
          className="text-xs"
        >
          Return to Knowledge Base
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb / Back Link */}
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <Link
          href={`/projects/${projectId}/knowledge`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to Knowledge</span>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 border-destructive/30"
          >
            <Trash2 className="h-3 w-3" />
            <span>Delete Document</span>
          </Button>
        </div>
      </div>

      {/* Document Header Card */}
      <div className="rounded-lg border border-border/70 bg-card/40 p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 mt-0.5">
              <FileText className="h-5 w-5" />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
                  {document.filename}
                </h1>
                {pageParam && (
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0 text-primary border-primary/30">
                    Citation target: page {pageParam}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-mono">
                <span>{formatBytes(document.fileSize)}</span>
                <span>•</span>
                <span>PDF Document</span>
                <span>•</span>
                <span>Uploaded {formatDate(document.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="self-start sm:self-center shrink-0">
            {getStatusBadge(document.status)}
          </div>
        </div>
      </div>

      {/* Main Grid: Source Workspace & Technical Metadata */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column: Source Evidence & Lineage Workspace */}
        <div className="lg:col-span-2 space-y-4">
          {/* Status Details Banner */}
          {document.status === 'ready' && (
            <div className="p-4 rounded-lg border border-status-verified/40 bg-status-verified/5 space-y-2">
              <div className="flex items-center gap-2 text-status-verified text-xs font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>Ready for retrieval</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This document has been ingested and indexed into{' '}
                <span className="font-semibold text-foreground">{document.chunksCount} passages</span>.
                It is available for project-scoped retrieval during query evaluation.
              </p>
            </div>
          )}

          {document.status === 'failed' && (
            <div className="p-4 rounded-lg border border-destructive/40 bg-destructive/10 space-y-2">
              <div className="flex items-center gap-2 text-destructive text-xs font-semibold">
                <AlertCircle className="h-4 w-4" />
                <span>Processing Error Encountered</span>
              </div>
              <p className="text-xs text-destructive/90 font-mono">
                {document.errorMessage || 'AI service document processing failed.'}
              </p>
              <div className="pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/projects/${projectId}/knowledge?upload=1`)}
                  className="text-xs h-7"
                >
                  Re-upload document
                </Button>
              </div>
            </div>
          )}

          {(document.status === 'processing' || document.status === 'uploaded') && (
            <div className="p-4 rounded-lg border border-amber-500/40 bg-amber-500/5 space-y-2">
              <div className="flex items-center gap-2 text-amber-500 text-xs font-semibold">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Ingestion in Progress</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Document is being processed into vector chunks. This page updates automatically upon completion.
              </p>
            </div>
          )}

          {/* Real Embedded PDF Source Viewer */}
          <div className="h-[640px] rounded-xl overflow-hidden shadow-xs">
            <PDFSourceViewer
              documentId={document.id}
              documentFilename={document.filename}
              pageNumber={pageParam ? parseInt(pageParam, 10) : undefined}
              showExcerpt={false}
              className="h-full"
            />
          </div>
        </div>

        {/* Right Column: Progressive Metadata & Lineage Inspector */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border/70 bg-card/40 p-5 space-y-4">
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
              Metadata & Lineage
            </h2>

            <div className="space-y-3 divide-y divide-border/40 text-xs">
              {/* Document ID */}
              <div className="space-y-1 pt-2 first:pt-0">
                <span className="text-muted-foreground block text-[11px]">Document ID</span>
                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/40 font-mono text-[11px] text-foreground">
                  <span className="truncate">{document.id}</span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label="Copy document ID"
                  >
                    {copiedId ? <Check className="h-3.5 w-3.5 text-status-verified" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Status */}
              <div className="flex justify-between items-center pt-2.5">
                <span className="text-muted-foreground text-[11px]">Status</span>
                <span className="font-mono capitalize text-foreground">{document.status}</span>
              </div>

              {/* MIME Type */}
              <div className="flex justify-between items-center pt-2.5">
                <span className="text-muted-foreground text-[11px]">Format</span>
                <span className="font-mono text-foreground">{document.mimeType}</span>
              </div>

              {/* File Size */}
              <div className="flex justify-between items-center pt-2.5">
                <span className="text-muted-foreground text-[11px]">File Size</span>
                <span className="font-mono text-foreground">{formatBytes(document.fileSize)}</span>
              </div>

              {/* Chunks */}
              <div className="flex justify-between items-center pt-2.5">
                <span className="text-muted-foreground text-[11px]">Indexed Passages</span>
                <span className="font-mono text-foreground">{document.chunksCount}</span>
              </div>

              {/* Created */}
              <div className="space-y-0.5 pt-2.5">
                <span className="text-muted-foreground block text-[11px]">Uploaded At</span>
                <span className="font-mono text-[11px] text-foreground">{formatDate(document.createdAt)}</span>
              </div>

              {/* Updated */}
              <div className="space-y-0.5 pt-2.5">
                <span className="text-muted-foreground block text-[11px]">Last Processed</span>
                <span className="font-mono text-[11px] text-foreground">{formatDate(document.updatedAt)}</span>
              </div>
            </div>
          </div>

          {/* Project Isolation Notice */}
          <div className="rounded-lg border border-border/70 bg-card/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Shield className="h-3.5 w-3.5 text-status-verified" />
              <span>Project-Scoped Retrieval</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Access control and vector retrieval are restricted to project{' '}
              <code className="font-mono text-foreground text-[10px]">{projectId}</code> through authenticated M3 backend requests.
            </p>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Delete Document</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete <span className="font-medium text-foreground">{document.filename}</span>?
              All associated vector embeddings and chunk lineage will be permanently purged.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteDialogOpen(false)}
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

export default function DocumentDetailPage() {
  return (
    <React.Suspense fallback={<DocumentDetailSkeleton />}>
      <DocumentDetailContent />
    </React.Suspense>
  );
}
