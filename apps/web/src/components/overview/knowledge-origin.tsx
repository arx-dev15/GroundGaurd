'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileText, Database } from 'lucide-react';
import type { Document as GroundDocument } from '@groundguard/types';
import { formatRelativeTime } from '@/lib/overview-helpers';

interface KnowledgeOriginProps {
  projectId: string;
  documents: GroundDocument[];
  totalChunks: number;
}

// Format clean human display title
function formatDisplayTitle(filename: string): string {
  return filename
    .replace(/\.[a-zA-Z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bPdf\b/g, '')
    .trim();
}

export function KnowledgeOrigin({
  projectId,
  documents,
  totalChunks,
}: KnowledgeOriginProps) {
  const router = useRouter();
  const recentDocs = React.useMemo(() => documents.slice(0, 3), [documents]);

  return (
    <div className="space-y-3 select-none" role="region" aria-label="Recent knowledge">
      {/* Editorial Section Title */}
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
            Recent knowledge
          </h2>
        </div>
        <Link
          href={`/projects/${projectId}/knowledge`}
          className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors inline-flex items-center gap-1.5"
        >
          <span>All sources</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Structured Source Origin Items */}
      <div className="divide-y divide-border/25">
        {recentDocs.map((doc) => {
          const displayTitle = formatDisplayTitle(doc.filename);

          return (
            <div
              key={doc.id}
              onClick={() => router.push(`/projects/${projectId}/knowledge/${doc.id}`)}
              className="group flex items-center justify-between py-3 px-2.5 -mx-2.5 rounded-xl hover:bg-card/50 transition-all duration-150 cursor-pointer gap-3"
            >
              <div className="flex items-center gap-3 min-w-0 pr-3">
                <div className="h-8 w-8 rounded-lg bg-card/60 border border-border/50 flex items-center justify-center shrink-0 text-muted-foreground group-hover:text-primary group-hover:border-primary/40 transition-colors shadow-2xs">
                  <FileText className="h-4 w-4" />
                </div>

                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate block group-hover:text-primary transition-colors">
                      {displayTitle}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded border uppercase tracking-wider ${
                        doc.status === 'ready'
                          ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                          : doc.status === 'failed'
                          ? 'border-destructive/30 text-destructive bg-destructive/10'
                          : 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                      }`}
                    >
                      {doc.status}
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground flex items-center gap-2 font-mono">
                    <span>{doc.chunksCount || 0} passages</span>
                    <span>·</span>
                    <span>{formatRelativeTime(doc.createdAt)}</span>
                  </div>
                </div>
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-1 group-hover:text-foreground shrink-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
