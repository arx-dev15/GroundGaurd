'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileText } from 'lucide-react';
import type { Document as GroundDocument } from '@groundguard/types';
import { formatRelativeTime } from '@/lib/overview-helpers';

interface RecentKnowledgeListProps {
  projectId: string;
  documents: GroundDocument[];
}

export function RecentKnowledgeList({
  projectId,
  documents,
}: RecentKnowledgeListProps) {
  const router = useRouter();
  const recentDocs = React.useMemo(() => documents.slice(0, 4), [documents]);

  return (
    <div className="space-y-4 select-none">
      {/* Editorial Section Title */}
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
          Recently added knowledge
        </h2>
        <Link
          href={`/projects/${projectId}/knowledge`}
          className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors inline-flex items-center gap-1.5"
        >
          <span>View all</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Clean Structured Knowledge Object List */}
      <div className="divide-y divide-border/25">
        {recentDocs.map((doc) => (
          <div
            key={doc.id}
            onClick={() => router.push(`/projects/${projectId}/knowledge/${doc.id}`)}
            className="group flex items-center justify-between py-3.5 px-3 -mx-3 rounded-xl hover:bg-card/50 transition-all duration-150 cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0 pr-3">
              {/* Document Silhouette Glyph */}
              <div className="h-10 w-10 rounded-lg bg-card/60 border border-border/50 flex items-center justify-center shrink-0 text-muted-foreground group-hover:text-primary group-hover:border-primary/40 transition-colors shadow-2xs">
                <FileText className="h-5 w-5" />
              </div>

              <div className="min-w-0 space-y-1">
                <span className="text-sm font-semibold text-foreground truncate block group-hover:text-primary transition-colors">
                  {doc.filename}
                </span>
                <div className="text-xs text-muted-foreground flex items-center gap-2 font-sans">
                  <span
                    className={
                      doc.status === 'ready'
                        ? 'text-emerald-400 font-medium'
                        : doc.status === 'failed'
                        ? 'text-destructive font-medium'
                        : 'text-amber-400 font-medium'
                    }
                  >
                    {doc.status === 'ready' ? 'Ready' : doc.status === 'failed' ? 'Failed' : 'Processing'}
                  </span>
                  <span>·</span>
                  <span>{doc.chunksCount || 0} passages</span>
                  <span>·</span>
                  <span>{formatRelativeTime(doc.createdAt)}</span>
                </div>
              </div>
            </div>

            <ArrowRight className="h-4 w-4 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-1.5 group-hover:text-foreground shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
