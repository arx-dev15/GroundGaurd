'use client';

import * as React from 'react';
import {
  UploadCloud,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  FileCheck,
  Clock,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { uploadDocument } from '@/lib/documents-api';
import { useQueryClient } from '@tanstack/react-query';
import { documentQueryKeys } from '@/lib/documents-query';
import { cn } from '@/lib/utils';
import type { Document } from '@groundguard/types';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per backend configuration

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface QueuedFile {
  id: string;
  file: File;
  status: 'selected' | 'uploading' | 'processing' | 'ready' | 'failed';
  errorMessage?: string;
  documentId?: string;
}

interface DocumentUploadModalProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: (doc: Document) => void;
}

export function DocumentUploadModal({
  projectId,
  open,
  onOpenChange,
  onUploadSuccess,
}: DocumentUploadModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [queue, setQueue] = React.useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = React.useState(false);
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  // Clear queue on modal close
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !isProcessingQueue) {
      setQueue([]);
      setGlobalError(null);
    }
    onOpenChange(newOpen);
  };

  const validateAndAddFiles = (files: FileList | File[]) => {
    setGlobalError(null);
    const newItems: QueuedFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate MIME type / extension
      const isPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        setGlobalError(`"${file.name}" was rejected. Only PDF files are supported.`);
        continue;
      }

      // Validate size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setGlobalError(
          `"${file.name}" exceeds the 10 MB limit (${formatBytes(file.size)}).`
        );
        continue;
      }

      if (file.size === 0) {
        setGlobalError(`"${file.name}" is empty and cannot be processed.`);
        continue;
      }

      newItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        status: 'selected',
      });
    }

    if (newItems.length > 0) {
      setQueue((prev) => [...prev, ...newItems]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
    }
    // reset input so the same file can be re-selected if removed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeItem = (id: string) => {
    if (isProcessingQueue) return;
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  // Sequential serialized upload execution
  const processUploads = async () => {
    if (queue.length === 0 || isProcessingQueue) return;

    setIsProcessingQueue(true);
    setGlobalError(null);

    const pendingItems = queue.filter(
      (item) => item.status === 'selected' || item.status === 'failed'
    );

    for (const item of pendingItems) {
      // Set to uploading
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading' } : q))
      );

      try {
        // Step 1: Upload transport & backend ingestion
        const doc = await uploadDocument(projectId, item.file);

        // Map genuine backend status
        const terminalStatus =
          doc.status === 'ready'
            ? 'ready'
            : doc.status === 'failed'
            ? 'failed'
            : 'processing';

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: terminalStatus,
                  documentId: doc.id,
                  errorMessage: doc.errorMessage,
                }
              : q
          )
        );

        onUploadSuccess?.(doc);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload transport failed';
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: 'failed', errorMessage: msg } : q
          )
        );
      }
    }

    // Invalidate project documents query cache
    queryClient.invalidateQueries({
      queryKey: documentQueryKeys.projectList(projectId),
    });

    setIsProcessingQueue(false);
  };

  const hasSuccessfulUploads = queue.some(
    (q) => q.status === 'ready' || q.status === 'processing'
  );
  const allCompleted =
    queue.length > 0 &&
    queue.every(
      (q) => q.status === 'ready' || q.status === 'failed' || q.status === 'processing'
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <UploadCloud className="h-4 w-4 text-primary" />
            <span>Upload Knowledge Documents</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            PDF files are parsed and indexed with project-scoped retrieval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {globalError && (
            <div className="p-3 rounded-md border border-destructive/40 bg-destructive/10 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{globalError}</span>
            </div>
          )}

          {/* Accessible Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border/70 hover:border-border hover:bg-muted/30'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
              disabled={isProcessingQueue}
            />

            <div className="space-y-2">
              <div className="h-10 w-10 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground">
                  <span className="text-primary hover:underline">Click to select files</span> or drag and drop
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  PDF format only • Up to 10 MB per file
                </p>
              </div>
            </div>
          </div>

          {/* Queued Files List */}
          {queue.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted-foreground px-1">
                <span>Selected Documents ({queue.length})</span>
                {allCompleted && (
                  <span className="text-status-verified">Batch Completed</span>
                )}
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-border/30">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{item.file.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {formatBytes(item.file.size)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === 'selected' && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground">
                          Ready
                        </Badge>
                      )}

                      {item.status === 'uploading' && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-primary border-primary/30 flex items-center gap-1">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          <span>Uploading…</span>
                        </Badge>
                      )}

                      {item.status === 'processing' && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-amber-500 border-amber-500/30 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5 animate-spin" />
                          <span>Processing…</span>
                        </Badge>
                      )}

                      {item.status === 'ready' && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-status-verified border-status-verified/40 flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          <span>Ready</span>
                        </Badge>
                      )}

                      {item.status === 'failed' && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-destructive border-destructive/40 flex items-center gap-1">
                          <AlertCircle className="h-2.5 w-2.5" />
                          <span>Failed</span>
                        </Badge>
                      )}

                      {!isProcessingQueue && item.status === 'selected' && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                          aria-label={`Remove ${item.file.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
          <p className="text-[11px] text-muted-foreground">
            {isProcessingQueue
              ? 'Uploading documents sequentially…'
              : queue.length === 0
              ? 'Select files to begin upload'
              : `${queue.length} file(s) queued`}
          </p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isProcessingQueue}
              onClick={() => handleOpenChange(false)}
              className="text-xs h-8"
            >
              {allCompleted || hasSuccessfulUploads ? 'Close' : 'Cancel'}
            </Button>

            {queue.some((q) => q.status === 'selected' || q.status === 'failed') && (
              <Button
                type="button"
                size="sm"
                disabled={isProcessingQueue}
                onClick={processUploads}
                className="text-xs h-8 gap-1.5"
              >
                {isProcessingQueue ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Uploading…</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-3.5 w-3.5" />
                    <span>Start Upload</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
