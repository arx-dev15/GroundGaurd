'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, MessageSquareCode, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Conversation } from '@groundguard/types';
import { formatRelativeTime } from '@/lib/overview-helpers';

interface ContinueWorkingProps {
  projectId: string;
  conversations: Conversation[];
}

export function ContinueWorking({
  projectId,
  conversations,
}: ContinueWorkingProps) {
  const router = useRouter();
  const recentWork = React.useMemo(() => conversations.slice(0, 3), [conversations]);

  return (
    <div className="space-y-4 select-none">
      {/* Editorial Section Title */}
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
          Continue where you left off
        </h2>
        {recentWork.length > 0 && (
          <Link
            href={`/projects/${projectId}/ask`}
            className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors inline-flex items-center gap-1.5"
          >
            <span>New inquiry</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {recentWork.length === 0 ? (
        /* Contextual Prompt when no conversations exist */
        <div className="p-6 rounded-xl border border-border/40 bg-card/25 space-y-3">
          <p className="text-sm font-semibold text-foreground">
            No active inquiries yet
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
            Ask questions against indexed evidence to generate grounded answers with claim-level verification.
          </p>
          <div className="pt-1">
            <Button
              size="sm"
              onClick={() => router.push(`/projects/${projectId}/ask`)}
              className="text-xs h-8 px-3.5 gap-2"
            >
              <MessageSquareCode className="h-3.5 w-3.5" />
              <span>Ask EVIDEX</span>
            </Button>
          </div>
        </div>
      ) : (
        /* Generous Structured List with Hairline Separators & Subtle Hover Surface */
        <div className="divide-y divide-border/25">
          {recentWork.map((conv) => (
            <Link
              key={conv.id}
              href={`/projects/${projectId}/ask?conversationId=${conv.id}`}
              className="group flex items-center justify-between py-3.5 px-3 -mx-3 rounded-xl hover:bg-card/50 transition-all duration-150 cursor-pointer"
            >
              <div className="min-w-0 pr-4 space-y-1">
                <span className="text-sm sm:text-base font-semibold text-foreground truncate block group-hover:text-primary transition-colors">
                  {conv.title}
                </span>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/90" />
                  <span className="font-medium text-foreground/80">Verified session</span>
                  <span>·</span>
                  <span>{formatRelativeTime(conv.updatedAt)}</span>
                </div>
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-1.5 group-hover:text-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
