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
  Highlighter,
  EyeOff,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { API_BASE_URL, getAuthToken } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  buildPageTextIndex,
  findExcerpt,
  segmentItem,
  textLayerStyleVars,
  type ExcerptMatch,
  type HighlightKind,
  type PageTextIndex,
} from '@/lib/pdf-text-match';
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

// ---------------------------------------------------------------------------------------------------------------
// Small in-memory cache of fetched PDF bytes (per auth token + document) so switching between citations of the
// same few documents does not re-download them. PDF.js transfers its input buffer, so each load gets a copy.
// ---------------------------------------------------------------------------------------------------------------
const PDF_CACHE_LIMIT = 4;
const pdfBytesCache = new Map<string, Promise<ArrayBuffer>>();

function fetchPdfBytes(documentId: string): Promise<ArrayBuffer> {
  const token = getAuthToken();
  const key = `${token ?? 'anon'}|${documentId}`;
  const cached = pdfBytesCache.get(key);
  if (cached) {
    pdfBytesCache.delete(key);
    pdfBytesCache.set(key, cached); // LRU touch
    return cached;
  }
  const url = `${API_BASE_URL.replace(/\/$/, '')}/v1/documents/${documentId}/content`;
  const p = fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(async (res) => {
    if (!res.ok) {
      if (res.status === 404) throw new Error('PDF file was not found on the server.');
      if (res.status === 401 || res.status === 403) throw new Error('You do not have permission to view this document.');
      throw new Error(`Failed to load PDF (${res.status})`);
    }
    return res.arrayBuffer();
  });
  p.catch(() => pdfBytesCache.delete(key)); // never cache failures
  pdfBytesCache.set(key, p);
  while (pdfBytesCache.size > PDF_CACHE_LIMIT) {
    const oldest = pdfBytesCache.keys().next().value;
    if (oldest === undefined) break;
    pdfBytesCache.delete(oldest);
  }
  return p;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

interface RenderedLayer {
  version: number;
  divs: HTMLElement[];
  items: string[];
  index: PageTextIndex;
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
  const layerRef = React.useRef<RenderedLayer | null>(null);
  const modifiedDivsRef = React.useRef<Set<number>>(new Set());
  const pdfjsRef = React.useRef<typeof PDFJS | null>(null);

  const [pdfDoc, setPdfDoc] = React.useState<PDFJS.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = React.useState<number>(1);
  const [currentPage, setCurrentPage] = React.useState<number>(pageNumber || 1);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRenderingPage, setIsRenderingPage] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [zoomScale, setZoomScale] = React.useState<number>(1.2);
  const [rawBlobUrl, setRawBlobUrl] = React.useState<string | null>(null);
  const [containerWidth, setContainerWidth] = React.useState<number>(0);
  const [layerVersion, setLayerVersion] = React.useState<number>(0);
  const [match, setMatch] = React.useState<ExcerptMatch | null>(null);
  const [highlightCleared, setHighlightCleared] = React.useState(false);
  const lastScrollKeyRef = React.useRef<string>('');

  // Parents rebuild the citations array on every render (e.g. during SSE updates); key highlight work on content.
  const citationsRef = React.useRef(citations);
  citationsRef.current = citations;
  const citationsKey = React.useMemo(
    () => citations.map((c) => `${c.documentId ?? ''}|${c.pageNumber ?? ''}|${c.chunkId ?? ''}|${(c.text ?? '').length}`).join('§'),
    [citations]
  );

  // Navigate to the cited page whenever the selected evidence changes — even if the page number is the same as the
  // previous citation's (the user may have paged away manually in between).
  React.useEffect(() => {
    if (pageNumber) setCurrentPage((p) => (pdfDoc ? Math.min(Math.max(1, pageNumber), pdfDoc.numPages) : pageNumber) || p);
    setHighlightCleared(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, highlightedExcerpt, activeCitationIndex, documentId]);

  // Track the available width so the page re-fits (and highlights re-align) on resize. Bucketed to avoid loops
  // caused by a scrollbar appearing/disappearing.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      clearTimeout(timer);
      timer = setTimeout(() => {
        setContainerWidth((prev) => (Math.abs(prev - w) >= 24 ? w : prev));
      }, 120);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, []);

  // Fetch document bytes via the authenticated M3 content endpoint.
  React.useEffect(() => {
    if (!documentId) {
      setPdfDoc(null);
      return;
    }
    let active = true;
    let createdBlobUrl: string | null = null;
    let loadingTask: PDFJS.PDFDocumentLoadingTask | null = null;

    (async () => {
      setIsLoading(true);
      setError(null);
      setMatch(null);
      try {
        const bytes = await fetchPdfBytes(documentId);
        if (!active) return;
        createdBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        setRawBlobUrl(createdBlobUrl);

        const pdfjs = pdfjsRef.current || (await import('pdfjs-dist'));
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        pdfjsRef.current = pdfjs;
        loadingTask = pdfjs.getDocument({
          data: new Uint8Array(bytes.slice(0)),
          cMapUrl: 'https://unpkg.com/pdfjs-dist@6.4.299/cmaps/',
          cMapPacked: true,
        });
        const doc = await loadingTask.promise;
        if (!active) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(pageNumber ? Math.min(Math.max(1, pageNumber), doc.numPages) : 1);
      } catch (err: any) {
        if (active) setError(err?.message || 'Unable to load PDF document.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
      if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
      loadingTask?.destroy().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  // Render the canvas + text layer of the current page. Highlighting is applied separately (below) so switching
  // claims never re-renders the page, and every re-render (zoom/resize/page) re-applies highlights from text.
  React.useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !textLayerRef.current) return;
    let active = true;
    let renderTask: any = null;
    let textLayer: any = null;

    (async () => {
      setIsRenderingPage(true);
      layerRef.current = null;
      modifiedDivsRef.current.clear();
      setLayerVersion(0);
      try {
        const page = await pdfDoc.getPage(Math.min(Math.max(1, currentPage), pdfDoc.numPages));
        if (!active) return;

        const width = containerWidth || containerRef.current?.clientWidth || 700;
        const unscaled = page.getViewport({ scale: 1 });
        const fitScale = Math.max(0.5, (width - 32) / unscaled.width);
        const scale = fitScale * zoomScale;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderTask = page.render({ canvasContext: ctx, viewport, canvas });
        await renderTask.promise;
        if (!active) return;

        const textLayerDiv = textLayerRef.current!;
        textLayerDiv.replaceChildren();
        textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
        textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
        for (const [k, v] of Object.entries(textLayerStyleVars(scale))) textLayerDiv.style.setProperty(k, v);

        const textContent = await page.getTextContent();
        if (!active) return;
        const pdfjs = pdfjsRef.current || (await import('pdfjs-dist'));
        textLayer = new pdfjs.TextLayer({ textContentSource: textContent, container: textLayerDiv, viewport });
        await textLayer.render();
        if (!active) return;

        const divs = (textLayer.textDivs as HTMLElement[]) || [];
        const items = divs.map((d) => d.textContent || '');
        layerRef.current = { version: Date.now(), divs, items, index: buildPageTextIndex(items) };
        setLayerVersion(layerRef.current.version);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException' && err?.name !== 'AbortException') {
          console.error('PDF page render error:', err);
        }
      } finally {
        if (active) setIsRenderingPage(false);
      }
    })();

    return () => {
      active = false;
      try {
        renderTask?.cancel();
      } catch {}
      try {
        textLayer?.cancel();
      } catch {}
    };
  }, [pdfDoc, currentPage, zoomScale, containerWidth]);

  // Apply exact highlights to the rendered text layer.
  React.useEffect(() => {
    const layer = layerRef.current;
    if (!layer || layer.version !== layerVersion) {
      setMatch(null);
      return;
    }

    // 1. Clear stale highlights from a previous claim/citation.
    for (const i of modifiedDivsRef.current) {
      const div = layer.divs[i];
      if (div) div.textContent = layer.items[i];
    }
    modifiedDivsRef.current.clear();

    if (!highlightedExcerpt) {
      setMatch(null);
      return;
    }

    // 2. Locate the active passage (exact text only) and other citations on this page (muted).
    const active = findExcerpt(layer.index, highlightedExcerpt, layer.items);
    setMatch(active);
    if (highlightCleared) return;

    const perDiv = new Map<number, Array<{ start: number; end: number; kind: HighlightKind }>>();
    const add = (m: ExcerptMatch, kind: HighlightKind) => {
      if (m.kind === 'none') return;
      for (const r of m.ranges) {
        const list = perDiv.get(r.item) ?? [];
        list.push({ start: r.start, end: r.end, kind });
        perDiv.set(r.item, list);
      }
    };
    citationsRef.current.forEach((c, i) => {
      const isActive = i === (activeCitationIndex ?? 0);
      if (isActive || !c.text || c.text === highlightedExcerpt) return;
      if (c.documentId && documentId && c.documentId !== documentId) return;
      if (c.pageNumber && c.pageNumber !== currentPage) return;
      add(findExcerpt(layer.index, c.text, layer.items), 'muted');
    });
    add(active, 'active');

    // 3. Render marks inside the real text-layer spans (inherit their font size / scaleX → exact glyph alignment).
    let firstActive: HTMLElement | null = null;
    for (const [i, ranges] of perDiv) {
      const div = layer.divs[i];
      if (!div) continue;
      const frag = document.createDocumentFragment();
      for (const seg of segmentItem(layer.items[i], ranges)) {
        if (!seg.kind) {
          frag.appendChild(document.createTextNode(seg.text));
          continue;
        }
        const mark = document.createElement('mark');
        mark.className = `gg-hl gg-hl--${seg.kind}`;
        mark.textContent = seg.text;
        frag.appendChild(mark);
        if (seg.kind === 'active' && !firstActive) firstActive = mark;
      }
      div.replaceChildren(frag);
      modifiedDivsRef.current.add(i);
    }

    // 4. Bring the passage into view inside the viewer's own scroll container.
    const container = containerRef.current;
    const scrollKey = `${layerVersion}|${highlightedExcerpt}`;
    if (firstActive && container && scrollKey !== lastScrollKeyRef.current) {
      lastScrollKeyRef.current = scrollKey;
      const target = firstActive;
      requestAnimationFrame(() => {
        const c = container.getBoundingClientRect();
        const t = target.getBoundingClientRect();
        container.scrollTo({
          top: container.scrollTop + (t.top - c.top) - c.height / 3,
          left: Math.max(0, container.scrollLeft + (t.left - c.left) - 24),
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      });
    }
  }, [layerVersion, highlightedExcerpt, highlightCleared, citationsKey, activeCitationIndex, currentPage, documentId]);

  const onViewerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') setCurrentPage((p) => Math.max(1, p - 1));
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') setCurrentPage((p) => Math.min(totalPages, p + 1));
    else if (e.key === '+' || e.key === '=') setZoomScale((z) => Math.min(2.4, z + 0.15));
    else if (e.key === '-') setZoomScale((z) => Math.max(0.6, z - 0.15));
    else return;
    e.preventDefault();
  };

  if (!documentId) {
    return (
      <div className={cn('h-full flex flex-col items-center justify-center p-8 text-center bg-card/40 border border-border/60 rounded-xl', className)}>
        <FileText className="h-9 w-9 text-muted-foreground/50 mb-3" />
        <h4 className="text-sm font-medium text-foreground mb-1">No source document selected</h4>
        <p className="text-xs text-muted-foreground max-w-xs">Select a citation or claim to open the original PDF page.</p>
      </div>
    );
  }

  const showingHighlight = !!match && match.kind !== 'none' && !highlightCleared;
  const pct = match ? Math.round(match.coverage * 100) : 0;

  return (
    <div className={cn('h-full flex flex-col bg-card/90 border border-border/80 rounded-xl overflow-hidden min-h-[480px]', className)}>
      <style jsx global>{`
        /* PDF.js v6 text-layer geometry (mirrors pdfjs-dist/web/pdf_viewer.css) — required so span boxes, and therefore
           highlights, match the rendered glyphs at every zoom level. */
        .gg-pdf-page .textLayer {
          position: absolute;
          text-align: initial;
          inset: 0;
          overflow: clip;
          opacity: 1;
          line-height: 1;
          letter-spacing: normal;
          word-spacing: normal;
          text-size-adjust: none;
          forced-color-adjust: none;
          transform-origin: 0 0;
          z-index: 2;
          --min-font-size: 1;
          --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
          --min-font-size-inv: calc(1 / var(--min-font-size));
        }
        .gg-pdf-page .textLayer :is(span, br) {
          color: transparent;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
        }
        .gg-pdf-page .textLayer > :not(.markedContent),
        .gg-pdf-page .textLayer .markedContent span:not(.markedContent) {
          z-index: 1;
          --font-height: 0;
          font-size: calc(var(--text-scale-factor) * var(--font-height));
          --scale-x: 1;
          --rotate: 0deg;
          transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
        }
        .gg-pdf-page .textLayer .markedContent {
          display: contents;
        }
        .gg-pdf-page .textLayer span::selection,
        .gg-pdf-page .textLayer mark::selection {
          background: rgb(59 130 246 / 0.3);
        }
        .gg-pdf-page .textLayer mark.gg-hl {
          color: transparent;
          position: relative;
          margin: 0;
          padding: 0;
          border-radius: 2px;
        }
        .gg-pdf-page .textLayer mark.gg-hl--active {
          background-color: rgb(250 204 21 / 0.42);
          box-shadow: 0 1px 0 0 rgb(202 138 4 / 0.85);
          animation: gg-hl-in 420ms ease-out;
        }
        .gg-pdf-page .textLayer mark.gg-hl--muted {
          background-color: rgb(148 163 184 / 0.26);
        }
        @keyframes gg-hl-in {
          from {
            background-color: rgb(250 204 21 / 0.75);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .gg-pdf-page .textLayer mark.gg-hl--active {
            animation: none;
          }
        }
      `}</style>

      {/* Header: document, page navigation, zoom */}
      <div className="px-3 py-2 border-b border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-foreground truncate max-w-[180px] sm:max-w-xs" title={documentFilename}>
            {documentFilename}
          </span>
          {match && highlightedExcerpt && (
            <span
              className={cn(
                'hidden sm:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0',
                match.kind === 'exact' && 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
                match.kind === 'partial' && 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
                match.kind === 'none' && 'bg-muted text-muted-foreground border-border'
              )}
            >
              {match.kind === 'exact' ? 'Exact match' : match.kind === 'partial' ? `Partial match · ${pct}%` : 'No exact match'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || isRenderingPage}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground px-1" aria-live="polite">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages || isRenderingPage}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <div className="h-4 w-px bg-border/60 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoomScale((z) => Math.max(0.6, z - 0.15))}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="hidden sm:inline text-[11px] font-mono tabular-nums text-muted-foreground w-9 text-center">
            {Math.round(zoomScale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoomScale((z) => Math.min(2.4, z + 0.15))}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          {rawBlobUrl && (
            <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground ml-0.5">
              <a href={rawBlobUrl} target="_blank" rel="noopener noreferrer" aria-label="Open PDF in new tab" title="Open PDF in new tab">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground ml-0.5"
              aria-label="Close viewer"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Citation switcher */}
      {citations.length > 1 && (
        <div className="px-3 py-1.5 bg-muted/10 border-b border-border/50 flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0" role="tablist" aria-label="Citations">
          <span className="text-muted-foreground text-[10px] uppercase tracking-wider shrink-0">Sources</span>
          {citations.map((c, i) => {
            const isSelected = i === (activeCitationIndex ?? 0);
            return (
              <button
                key={c.chunkId || i}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => onSelectCitation?.(i)}
                className={cn(
                  'px-2 py-0.5 rounded-md text-[11px] font-mono transition-colors border flex items-center gap-1 shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  isSelected
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background/60 hover:bg-background border-border/60 text-muted-foreground hover:text-foreground'
                )}
              >
                <span>[{c.index || i + 1}]</span>
                {c.pageNumber ? <span className="opacity-80">p. {c.pageNumber}</span> : null}
              </button>
            );
          })}
        </div>
      )}

      {/* Cited excerpt + honest highlight status */}
      {showExcerpt && highlightedExcerpt && (
        <div className="px-3 py-2.5 border-b border-border/50 bg-background/40 shrink-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Bookmark className="h-3 w-3" />
              Cited excerpt{pageNumber ? ` · p. ${pageNumber}` : ''}
            </span>
            {match && match.kind !== 'none' && (
              <button
                type="button"
                onClick={() => setHighlightCleared((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground rounded px-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {highlightCleared ? <Highlighter className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {highlightCleared ? 'Show highlight' : 'Clear highlight'}
              </button>
            )}
          </div>
          <p className="text-xs text-foreground/90 leading-relaxed pl-2 border-l-2 border-amber-500/50 line-clamp-3 select-text">
            {highlightedExcerpt}
          </p>
          {match && (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                {match.kind === 'exact' &&
                  (showingHighlight
                    ? match.occurrences > 1
                      ? `Exact passage highlighted. It appears ${match.occurrences} times on this page; the first occurrence is shown.`
                      : 'Exact passage highlighted on the page below.'
                    : 'Highlight hidden.')}
                {match.kind === 'partial' &&
                  (match.anchor === 'start'
                    ? `The first ${pct}% of the passage is highlighted; the rest continues beyond this page.`
                    : `The last ${pct}% of the passage is highlighted; it begins on an earlier page.`)}
                {match.kind === 'none' &&
                  (currentPage !== pageNumber && pageNumber
                    ? `This passage is not on page ${currentPage}. It is cited from page ${pageNumber}.`
                    : 'Precise highlighting is unavailable: the text layer of this page does not contain the cited passage verbatim (for example a scanned page or a passage on another page). The exact cited text is shown above.')}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Page */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onViewerKeyDown}
        aria-label={`PDF page ${currentPage} of ${totalPages}. Use arrow keys to change page and plus or minus to zoom.`}
        className="flex-1 relative bg-muted/15 min-h-[360px] overflow-auto flex flex-col items-center p-4 scrollbar-thin select-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 z-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading document…</span>
          </div>
        )}
        {isRenderingPage && !isLoading && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-background/90 border border-border/60 text-[10px] text-muted-foreground z-20">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Rendering page…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3 bg-background/95 z-20">
            <AlertCircle className="h-7 w-7 text-destructive" />
            <div className="space-y-1">
              <h5 className="text-sm font-medium text-foreground">Could not load document</h5>
              <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
            </div>
            {rawBlobUrl && (
              <Button asChild variant="outline" size="sm" className="text-xs gap-1.5 mt-1">
                <a href={rawBlobUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                  Open in a browser tab
                </a>
              </Button>
            )}
          </div>
        )}

        <div className="gg-pdf-page relative shadow-sm rounded-sm border border-border/70 bg-white">
          <canvas ref={canvasRef} className="block rounded-sm" />
          <div ref={textLayerRef} className="textLayer" />
        </div>
      </div>
    </div>
  );
}
