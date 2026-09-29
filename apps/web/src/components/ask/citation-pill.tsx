'use client';

import * as React from 'react';
import Link from 'next/link';
import { FileText, ExternalLink } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { EvidenceItem } from '@groundguard/types';

interface CitationPillProps {
  index: number;
  evidence?: EvidenceItem;
  projectId: string;
  onClick?: () => void;
  className?: string;
  isEvidenceLens?: boolean;
}

export function CitationPill({
  index,
  evidence,
  projectId,
  onClick,
  className,
  isEvidenceLens = false,
}: CitationPillProps) {
  const docId = evidence?.documentId;
  const pageNumber = evidence?.pageNumber ?? (evidence?.metadata?.pageNumber as number | undefined);
  const docFilename = (evidence?.metadata?.filename as string) || (evidence?.metadata?.documentFilename as string) || 'Document';
  const heading = evidence?.heading || (evidence?.metadata?.heading as string);
  const snippet = evidence?.text || '';

  const knowledgeUrl = docId
    ? pageNumber
      ? `/projects/${projectId}/knowledge/${docId}?page=${pageNumber}`
      : `/projects/${projectId}/knowledge/${docId}`
    : null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick?.();
            }}
            className={cn(
              'inline-flex items-center justify-center font-mono text-[10px] font-semibold transition-all select-none rounded cursor-pointer align-baseline mx-0.5 px-1 py-0.2',
              isEvidenceLens
                ? 'bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40',
              className
            )}
            aria-label={`Citation [${index}]`}
          >
            [{index}]
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          className="max-w-xs p-3 text-xs bg-popover/95 backdrop-blur-sm border border-border/80 shadow-md space-y-2 z-50 text-popover-foreground"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5 font-medium">
            <span className="flex items-center gap-1.5 truncate text-[11px] text-foreground">
              <FileText className="h-3 w-3 shrink-0 text-primary" />
              <span className="truncate">{docFilename}</span>
            </span>
            {pageNumber && (
              <span className="shrink-0 text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/60 border border-border/40">
                p. {pageNumber}
              </span>
            )}
          </div>

          {heading && (
            <p className="text-[10px] font-medium text-muted-foreground truncate">
              {heading}
            </p>
          )}

          {snippet && (
            <p className="text-[11px] text-muted-foreground/90 line-clamp-3 leading-relaxed italic">
              &ldquo;{snippet.trim()}&rdquo;
            </p>
          )}

          {knowledgeUrl && (
            <div className="pt-1 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Click to inspect</span>
              <Link
                href={knowledgeUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                Open document
                <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
