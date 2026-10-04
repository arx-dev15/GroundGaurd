'use client';

import * as React from 'react';
import {
  FileText,
  ExternalLink,
  X,
  Loader2,
  AlertCircle,
  Maximize2,
  Bookmark,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { API_BASE_URL, getAuthToken } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export interface PDFSourceViewerProps {
  documentId?: string | null;
  documentFilename?: string;
  pageNumber?: number;
  highlightedExcerpt?: string;
  onClose?: () => void;
  className?: string;
  showExcerpt?: boolean;
}

export function PDFSourceViewer({
  documentId,
  documentFilename = 'Source Document',
  pageNumber,
  highlightedExcerpt,
  onClose,
  className,
  showExcerpt = true,
}: PDFSourceViewerProps) {
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState<number | undefined>(pageNumber);

  // Synchronize internal page when prop updates
  React.useEffect(() => {
    setCurrentPage(pageNumber);
  }, [pageNumber]);

  // Fetch PDF bytes securely from M3
  React.useEffect(() => {
    if (!documentId) {
      setBlobUrl(null);
      return;
    }

    let active = true;
    let createdUrl: string | null = null;

    async function loadPdf() {
      setIsLoading(true);
      setError(null);
      try {
        const token = getAuthToken();
        const url = `${API_BASE_URL.replace(/\/$/, '')}/v1/documents/${documentId}/content`;
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('PDF file was not found on the server.');
          }
          if (res.status === 401 || res.status === 403) {
            throw new Error('You do not have permission to view this document.');
          }
          throw new Error(`Failed to load PDF (${res.status})`);
        }

        const blob = await res.blob();
        if (active) {
          createdUrl = URL.createObjectURL(blob);
          setBlobUrl(createdUrl);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Unable to load PDF document.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [documentId]);

  if (!documentId) {
    return (
      <div className={cn('h-full flex flex-col items-center justify-center p-8 text-center bg-card/40 border border-border/60 rounded-xl', className)}>
        <FileText className="h-10 w-10 text-muted-foreground/60 mb-3" />
        <h4 className="text-sm font-semibold text-foreground mb-1">No source document selected</h4>
        <p className="text-xs text-muted-foreground max-w-xs">
          Click any citation [1] or evidence passage to inspect the original PDF page.
        </p>
      </div>
    );
  }

  const iframeSrc = blobUrl
    ? `${blobUrl}#page=${currentPage || 1}&zoom=page-fit`
    : undefined;

  return (
    <div className={cn('h-full flex flex-col bg-card/90 border border-border/80 rounded-xl shadow-md overflow-hidden min-h-[480px]', className)}>
      {/* Header Bar */}
      <div className="p-3 border-b border-border/70 bg-muted/30 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate" title={documentFilename}>
            {documentFilename}
          </span>
          {currentPage && (
            <Badge variant="outline" className="text-[10px] font-mono shrink-0 bg-primary/10 text-primary border-primary/30">
              Page {currentPage}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {blobUrl && (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              title="Open PDF in new tab"
            >
              <a href={blobUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="sr-only">Open PDF in new tab</span>
              </a>
            </Button>
          )}

          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              title="Close source viewer"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Close</span>
            </Button>
          )}
        </div>
      </div>

      {/* Cited Evidence Highlight Callout */}
      {showExcerpt && highlightedExcerpt && (
        <div className="p-3 bg-primary/5 border-b border-primary/20 shrink-0 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-primary">
            <Bookmark className="h-3 w-3" />
            <span>Cited Evidence Excerpt {currentPage ? `(p. ${currentPage})` : ''}</span>
          </div>
          <p className="text-xs text-foreground/90 italic leading-relaxed pl-2 border-l-2 border-primary/40 line-clamp-3 select-text">
            &ldquo;{highlightedExcerpt}&rdquo;
          </p>
        </div>
      )}

      {/* PDF Content Area */}
      <div className="flex-1 relative bg-muted/10 min-h-[360px] flex flex-col">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-2xs z-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs font-mono text-muted-foreground">Streaming authoritative source…</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3 bg-background/90 z-10">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <h5 className="text-sm font-semibold text-foreground">Could not load document</h5>
              <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
            </div>
            {blobUrl && (
              <Button asChild variant="outline" size="sm" className="text-xs gap-1.5 mt-2">
                <a href={blobUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                  <span>Try opening in browser tab</span>
                </a>
              </Button>
            )}
          </div>
        )}

        {iframeSrc && !error && (
          <iframe
            src={iframeSrc}
            title={documentFilename}
            className="w-full flex-1 border-0 rounded-b-xl bg-background"
          />
        )}
      </div>
    </div>
  );
}
