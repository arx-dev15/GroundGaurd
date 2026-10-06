'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Document as GroundDocument } from '@groundguard/types';

interface WhatNeedsAttentionProps {
  projectId: string;
  flaggedClaims: number;
  processingDocs: GroundDocument[];
  failedDocs: GroundDocument[];
  totalDocs: number;
}

export function WhatNeedsAttention({
  projectId,
  flaggedClaims,
  processingDocs,
  failedDocs,
  totalDocs,
}: WhatNeedsAttentionProps) {
  const router = useRouter();
  const hasIssues = flaggedClaims > 0 || processingDocs.length > 0 || failedDocs.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
          <span>What Needs Attention</span>
          {hasIssues && (
            <Badge
              variant="outline"
              className="text-[10px] font-mono py-0 px-1.5 text-status-needs-review border-status-needs-review/30"
            >
              Actionable
            </Badge>
          )}
        </h2>
      </div>

      {!hasIssues ? (
        /* Calm Compact Success State */
        <div className="flex items-center justify-between p-4 rounded-xl border border-border/70 bg-card/30 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-status-verified/10 text-status-verified flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-foreground block">
                All knowledge and claims in good standing
              </span>
              <span className="text-[11px] text-muted-foreground block">
                {totalDocs} {totalDocs === 1 ? 'document is' : 'documents are'} indexed with zero unverified claims requiring manual review.
              </span>
            </div>
          </div>

          <Link
            href={`/projects/${projectId}/reliability`}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0 font-medium transition-colors"
          >
            <span>Open Reliability</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        /* Actionable Issue Cards */
        <div className="space-y-2.5">
          {/* Issue 1: Claims Needing Review */}
          {flaggedClaims > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-status-needs-review/30 bg-status-needs-review/5">
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-status-needs-review/10 text-status-needs-review flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-foreground block">
                    {flaggedClaims} {flaggedClaims === 1 ? 'claim requires' : 'claims require'} manual review
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    Assertions flagged during NLI verification or unresolvable by autonomous recovery.
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/projects/${projectId}/reliability`)}
                className="text-xs h-8 gap-1.5 border-status-needs-review/40 text-status-needs-review hover:bg-status-needs-review/10 self-start sm:self-center shrink-0"
              >
                <span>Review Claims</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Issue 2: Failed Documents */}
          {failedDocs.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-destructive/30 bg-destructive/5">
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  <AlertCircle className="h-3.5 w-3.5" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-foreground block">
                    {failedDocs.length} {failedDocs.length === 1 ? 'document' : 'documents'} failed ingestion
                  </span>
                  <span className="text-[11px] text-muted-foreground block truncate max-w-md">
                    {failedDocs.map((d) => d.filename).join(', ')}
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/projects/${projectId}/knowledge`)}
                className="text-xs h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 self-start sm:self-center shrink-0"
              >
                <span>Manage Files</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Issue 3: Ingestion In Progress */}
          {processingDocs.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-status-pending/30 bg-status-pending/5">
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-status-pending/10 text-status-pending flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-foreground block">
                    {processingDocs.length} {processingDocs.length === 1 ? 'document is' : 'documents are'} processing
                  </span>
                  <span className="text-[11px] text-muted-foreground block truncate max-w-md">
                    Running chunking and vector indexing in the background.
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/projects/${projectId}/knowledge`)}
                className="text-xs h-8 gap-1.5 border-status-pending/40 text-status-pending hover:bg-status-pending/10 self-start sm:self-center shrink-0"
              >
                <span>View Progress</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
