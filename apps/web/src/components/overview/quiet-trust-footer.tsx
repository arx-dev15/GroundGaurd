'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

interface QuietTrustFooterProps {
  projectId: string;
}

export function QuietTrustFooter({ projectId }: QuietTrustFooterProps) {
  return (
    <footer className="pt-4 border-t border-border/50 text-xs text-muted-foreground">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-status-verified shrink-0" />
          <p className="text-[11px] leading-relaxed">
            EVIDEX verifies generated claims against project evidence and surfaces uncertainty when support is insufficient.
          </p>
        </div>

        <div className="flex items-center gap-4 text-[11px] font-medium shrink-0">
          <Link
            href={`/projects/${projectId}/reliability`}
            className="hover:text-foreground transition-colors"
          >
            Open Reliability
          </Link>
          <span className="text-border">•</span>
          <Link
            href={`/projects/${projectId}/knowledge`}
            className="hover:text-foreground transition-colors"
          >
            View Knowledge
          </Link>
          <span className="text-border">•</span>
          <Link
            href={`/projects/${projectId}/settings`}
            className="hover:text-foreground transition-colors"
          >
            Project Settings
          </Link>
        </div>
      </div>
    </footer>
  );
}
