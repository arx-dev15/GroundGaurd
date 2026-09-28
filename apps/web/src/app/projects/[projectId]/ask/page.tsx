'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { MessageSquareCode, Sparkles, Send, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import type { Project } from '@groundguard/types';

export default function AskPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || '';
  const [project, setProject] = React.useState<Project | null>(null);

  React.useEffect(() => {
    if (!projectId) return;
    apiClient
      .get<{ project: Project }>(`/v1/projects/${projectId}`)
      .then((res) => setProject(res.project))
      .catch(() => null);
  }, [projectId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <MessageSquareCode className="h-5 w-5 text-muted-foreground" />
            <span>Ask & Verify</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Grounded conversational research in{' '}
            <span className="text-foreground font-medium">{project?.name || 'this project'}</span> with real-time claim inspection.
          </p>
        </div>

        <Badge variant="outline" className="w-fit text-[11px] font-mono py-1 px-2.5 gap-1.5 self-start sm:self-center">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <span>F5 Milestone</span>
        </Badge>
      </div>

      {/* Neutral Workspace Canvas */}
      <div className="min-h-[420px] rounded-lg border border-border/70 bg-card/30 flex flex-col justify-between p-6">
        <div className="max-w-md mx-auto my-auto text-center space-y-3">
          <div className="h-10 w-10 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Verified Conversational Workspace</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Conversational queries with real-time claim verification, citation highlights, and autonomous contradiction recovery will be activated here in the F5 Ask milestone.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted/50 border border-border/50 text-muted-foreground">
              Grounding Rail
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted/50 border border-border/50 text-muted-foreground">
              Evidence Lens
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted/50 border border-border/50 text-muted-foreground">
              Recovery Playback
            </span>
          </div>
        </div>

        {/* Query Input Placeholder */}
        <div className="mt-8 border border-border/70 bg-background/80 rounded-lg p-2.5 flex items-center gap-2 shadow-xs">
          <input
            type="text"
            disabled
            placeholder="Ask anything about your project documents... (available in F5)"
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none px-2 cursor-not-allowed"
          />
          <button
            type="button"
            disabled
            aria-label="Send query"
            className="h-7 w-7 rounded bg-primary text-primary-foreground flex items-center justify-center opacity-40 cursor-not-allowed"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
