'use client';

import * as React from 'react';
import {
  FileText,
  ExternalLink,
  X,
  Loader2,
  AlertCircle,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { API_BASE_URL, getAuthToken } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type * as PDFJS from 'pdfjs-dist';

export interface CitationItem {
  index: number;
  documentId?: string;
  pageNumber?: number;
  text?: string;
  chunkId?: string;
}

export interface PDFSourceViewerProps {
  documentId?: string | null;
  documentFilename?: string;
  pageNumber?: number;
  highlightedExcerpt?: string;
  citations?: CitationItem[];
  activeCitationIndex?: number;
  onSelectCitation?: (index: number) => void;
  onClose?: () => void;
  className?: string;
  showExcerpt?: boolean;
}

// Normalize text for resilient matching across PDF line breaks and encoding variances
function normalizeText(str: string): string {
  return str
    .replace(/\r?\n|\r/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

export function PDFSourceViewer({
  documentId,
  documentFilename = 'Source Document',
  pageNumber,
  highlightedExcerpt,
  citations = [],
  activeCitationIndex,
  onSelectCitation,
  onClose,
  className,
  showExcerpt = true,
}: PDFSourceViewerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const textLayerRef = React.useRef<HTMLDivElement>(null);

  const [pdfDoc, setPdfDoc] = React.useState<PDFJS.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = React.useState<number>(1);
  const [currentPage, setCurrentPage] = React.useState<number>(pageNumber || 1);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRenderingPage, setIsRenderingPage] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [zoomScale, setZoomScale] = React.useState<number>(1.2);
  const [isHighlighted, setIsHighlighted] = React.useState<boolean>(false);
  const [rawBlobUrl, setRawBlobUrl] = React.useState<string | null>(null);

  const pdfjsRef = React.useRef<typeof PDFJS | null>(null);

  // Sync currentPage with incoming pageNumber prop
  React.useEffect(() => {
    if (pageNumber && pageNumber !== currentPage) {
      setCurrentPage(pageNumber);
    }
  }, [pageNumber]);

  // Load PDF.js library dynamically in browser
  React.useEffect(() => {
    let active = true;
    async function initPdfJs() {
      if (!pdfjsRef.current) {
        try {
          const pdfjs = await import('pdfjs-dist');
          if (active) {
            pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
            pdfjsRef.current = pdfjs;
          }
        } catch (err) {
          console.error('Failed to load PDF.js engine:', err);
        }
      }
    }
    initPdfJs();
    return () => {
      active = false;
    };
  }, []);

  // Fetch document bytes securely via M3 Authorization header
  React.useEffect(() => {
    if (!documentId) {
      setPdfDoc(null);
      return;
    }

    let active = true;
    let createdBlobUrl: string | null = null;

    async function fetchPdf() {
      setIsLoading(true);
      setError(null);
      setIsHighlighted(false);

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

        const arrayBuffer = await res.arrayBuffer();

        // Also create object URL for external tab opening
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        createdBlobUrl = URL.createObjectURL(blob);
        if (active) {
          setRawBlobUrl(createdBlobUrl);
        }

        // Initialize PDF.js document proxy
        const pdfjs = pdfjsRef.current || (await import('pdfjs-dist'));
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        pdfjsRef.current = pdfjs;

        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(arrayBuffer),
          cMapUrl: 'https://unpkg.com/pdfjs-dist@6.4.299/cmaps/',
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        if (active) {
          setPdfDoc(doc);
          setTotalPages(doc.numPages);
          setCurrentPage(pageNumber ? Math.min(Math.max(1, pageNumber), doc.numPages) : 1);
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

    fetchPdf();

    return () => {
      active = false;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [documentId]);

  // Render canvas & text layer for selected page
  React.useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !textLayerRef.current) return;

    let active = true;
    let currentRenderTask: any = null;

    async function renderPage() {
      setIsRenderingPage(true);
      setIsHighlighted(false);

      try {
        const targetPageNumber = Math.min(Math.max(1, currentPage), pdfDoc!.numPages);
        const page = await pdfDoc!.getPage(targetPageNumber);

        if (!active) return;

        const containerWidth = containerRef.current?.clientWidth || 700;
        const unscaledViewport = page.getViewport({ scale: 1 });
        const autoFitScale = Math.max(0.8, (containerWidth - 48) / unscaledViewport.width);
        const effectiveScale = autoFitScale * zoomScale;
        const viewport = page.getViewport({ scale: effectiveScale });

        // 1. Render Canvas
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        currentRenderTask = page.render({
          canvasContext: ctx,
          viewport: viewport,
          canvas: canvas,
        });

        await currentRenderTask.promise;

        if (!active) return;

        // 2. Render Text Layer
        const textLayerDiv = textLayerRef.current!;
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
        textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
        textLayerDiv.style.setProperty('--scale-factor', `${effectiveScale}`);

        const textContent = await page.getTextContent();
        if (!active) return;

        const pdfjs = pdfjsRef.current || (await import('pdfjs-dist'));
        const textLayer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: viewport,
        });

        await textLayer.render();

        if (!active) return;

        // 3. Programmatic Evidence Text Matching & Highlighting
        if (highlightedExcerpt) {
          const spans = Array.from(textLayerDiv.querySelectorAll('span'));
          if (spans.length > 0) {
            // Build full normalized page text with index mapping
            let concatenated = '';
            const spanMap: Array<{ span: HTMLElement; start: number; end: number; text: string }> = [];

            for (const span of spans) {
              const str = span.textContent || '';
              const start = concatenated.length;
              concatenated += str + ' ';
              const end = concatenated.length;
              spanMap.push({ span, start, end, text: str });
            }

            const normPage = normalizeText(concatenated);
            const normExcerpt = normalizeText(highlightedExcerpt);

            // Strategy A: Exact normalized passage match
            let matchStart = normPage.indexOf(normExcerpt);

            // Strategy B: If exact match fails (e.g. slight OCR/hyphenation), match leading sentence / key phrase (>= 6 words)
            if (matchStart === -1) {
              const words = normExcerpt.split(' ').filter(Boolean);
              if (words.length >= 6) {
                // Try first 6-10 words
                for (let len = Math.min(10, words.length); len >= 6; len--) {
                  const subPhrase = words.slice(0, len).join(' ');
                  const idx = normPage.indexOf(subPhrase);
                  if (idx !== -1) {
                    matchStart = idx;
                    break;
                  }
                }
              }
            }

            if (matchStart !== -1) {
              // Locate matching character range in original concatenated text
              // Map approximate character position back to span objects
              const ratio = concatenated.length / (normPage.length || 1);
              const approxStart = Math.max(0, Math.floor(matchStart * ratio) - 5);
              const approxEnd = Math.min(concatenated.length, Math.floor((matchStart + normExcerpt.length) * ratio) + 10);

              const matchingSpans: HTMLElement[] = [];
              for (const entry of spanMap) {
                if (entry.end >= approxStart && entry.start <= approxEnd) {
                  // Check that the span actually shares words with target
                  const spanNorm = normalizeText(entry.text);
                  if (spanNorm.length > 1 && normExcerpt.includes(spanNorm)) {
                    entry.span.classList.add('gg-pdf-highlight');
                    matchingSpans.push(entry.span);
                  }
                }
              }

              if (matchingSpans.length > 0) {
                setIsHighlighted(true);
                // Scroll first matching span smoothly into view
                setTimeout(() => {
                  matchingSpans[0]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  });
                }, 100);
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('PDF page render error:', err);
        }
      } finally {
        if (active) {
          setIsRenderingPage(false);
        }
      }
    }

    renderPage();

    return () => {
      active = false;
      if (currentRenderTask) {
        try {
          currentRenderTask.cancel();
        } catch {}
      }
    };
  }, [pdfDoc, currentPage, zoomScale, highlightedExcerpt]);

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

  return (
    <div className={cn('h-full flex flex-col bg-card/90 border border-border/80 rounded-xl shadow-md overflow-hidden min-h-[480px]', className)}>
      {/* Scoped CSS for Text Layer and EvideX AI Evidence Highlighting */}
      <style jsx global>{`
        .textLayer {
          position: absolute;
          text-align: initial;
          left: 0;
          top: 0;
          right: 0;
          bottom: 0;
          overflow: hidden;
          opacity: 1;
          line-height: 1;
          text-size-adjust: none;
          forced-color-adjust: none;
          transform-origin: 0 0;
          z-index: 2;
          pointer-events: auto;
        }
        .textLayer span,
        .textLayer br {
          color: transparent !important;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
        }
        .textLayer span::selection {
          background: rgba(59, 130, 246, 0.3);
        }
        .textLayer .gg-pdf-highlight {
          background-color: rgba(251, 191, 36, 0.42) !important;
          border-bottom: 2px solid rgba(217, 119, 6, 0.9) !important;
          border-radius: 2px !important;
          box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.4) !important;
        }
      `}</style>

      {/* 1. Header Bar: Document, Page Navigation, Zoom, and Citation Selector */}
      <div className="p-2.5 sm:p-3 border-b border-border/70 bg-muted/30 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs" title={documentFilename}>
            {documentFilename}
          </span>
          <Badge variant="outline" className="text-[10px] font-mono shrink-0 bg-primary/10 text-primary border-primary/30">
            Page {currentPage} of {totalPages}
          </Badge>
          {isHighlighted && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-mono font-medium">
              Highlighted
            </span>
          )}
        </div>

        {/* Page & Zoom Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || isRenderingPage}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>

          <span className="text-[11px] font-mono text-muted-foreground px-1">
            {currentPage}/{totalPages}
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages || isRenderingPage}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>

          <div className="h-4 w-px bg-border/60 mx-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoomScale((z) => Math.max(0.7, z - 0.15))}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoomScale((z) => Math.min(2.0, z + 0.15))}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>

          {rawBlobUrl && (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground ml-1"
              title="Open full PDF in new tab"
            >
              <a href={rawBlobUrl} target="_blank" rel="noopener noreferrer">
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
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground ml-1"
              title="Close viewer"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Close</span>
            </Button>
          )}
        </div>
      </div>

      {/* Multiple Citations Switcher Bar (Section 22) */}
      {citations.length > 1 && (
        <div className="px-3 py-1.5 bg-muted/40 border-b border-border/50 flex items-center gap-2 overflow-x-auto scrollbar-none text-[11px] shrink-0">
          <span className="text-muted-foreground font-mono uppercase text-[10px] shrink-0">
            Citations:
          </span>
          <div className="flex items-center gap-1.5">
            {citations.map((c, i) => {
              const isSelected = activeCitationIndex === i || (!activeCitationIndex && i === 0);
              return (
                <button
                  key={c.chunkId || i}
                  type="button"
                  onClick={() => onSelectCitation?.(i)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-mono transition-colors border flex items-center gap-1 shrink-0',
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary font-semibold'
                      : 'bg-background/80 hover:bg-background border-border/60 text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span>[{c.index || i + 1}]</span>
                  {c.pageNumber && <span>p. {c.pageNumber}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Cited Evidence Excerpt Banner (Fall back target if OCR/PDF text layer differs) */}
      {showExcerpt && highlightedExcerpt && (
        <div className="p-3 bg-primary/5 border-b border-primary/20 shrink-0 space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono font-semibold uppercase tracking-wider text-primary">
            <span className="flex items-center gap-1.5">
              <Bookmark className="h-3 w-3" />
              <span>Cited Evidence Excerpt {currentPage ? `(p. ${currentPage})` : ''}</span>
            </span>
            {isHighlighted ? (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-sans font-normal lowercase">
                ✓ highlighted on page below
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground font-sans font-normal lowercase">
                passage displayed for inspection
              </span>
            )}
          </div>
          <p className="text-xs text-foreground/90 italic leading-relaxed pl-2 border-l-2 border-primary/40 line-clamp-3 select-text">
            &ldquo;{highlightedExcerpt}&rdquo;
          </p>
        </div>
      )}

      {/* 3. PDF Canvas & Text Layer Display Container */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-muted/15 min-h-[360px] overflow-auto flex flex-col items-center p-4 scrollbar-thin select-text"
      >
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-2xs z-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs font-mono text-muted-foreground">Streaming authoritative source…</span>
          </div>
        )}

        {isRenderingPage && !isLoading && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 rounded bg-background/80 border border-border/60 text-[10px] font-mono text-muted-foreground z-20 shadow-xs">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span>Rendering page…</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3 bg-background/90 z-20">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <h5 className="text-sm font-semibold text-foreground">Could not load document</h5>
              <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
            </div>
            {rawBlobUrl && (
              <Button asChild variant="outline" size="sm" className="text-xs gap-1.5 mt-2">
                <a href={rawBlobUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                  <span>Try opening in browser tab</span>
                </a>
              </Button>
            )}
          </div>
        )}

        {/* PDF Page Container with Canvas and Overlay Text Layer */}
        <div className="relative shadow-md rounded border border-border/80 bg-white">
          <canvas ref={canvasRef} className="block rounded" />
          <div ref={textLayerRef} className="textLayer" />
        </div>
      </div>
    </div>
  );
}
