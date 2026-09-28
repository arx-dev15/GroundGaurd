'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { ShieldCheck, Activity, BarChart2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import type { Project } from '@groundguard/types';

export default function ReliabilityPage() {
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
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <span>Reliability & Observability</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            NLI entailment telemetry, contradiction intercepts, and execution traces for{' '}
            <span className="text-foreground font-medium">{project?.name || 'this project'}</span>.
          </p>
        </div>

        <Badge variant="outline" className="w-fit text-[11px] font-mono py-1 px-2.5 gap-1.5 self-start sm:self-center">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span>F6 Milestone</span>
        </Badge>
      </div>

      {/* Honest Empty State Canvas */}
      <div className="rounded-lg border border-border/70 bg-card/30 p-12 text-center space-y-4">
        <div className="h-10 w-10 mx-auto rounded-full bg-muted/50 text-muted-foreground flex items-center justify-center border border-border/50">
          <BarChart2 className="h-5 w-5" />
        </div>
        <div className="space-y-1.5 max-w-md mx-auto">
          <h2 className="text-sm font-semibold text-foreground">Execution Telemetry Activates in F6</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Per-claim DeBERTa-v3 scores, latency percentiles, and Phoenix/LangSmith-style trace telemetry will be recorded and displayed here once conversational evaluations are executed.
          </p>
        </div>
      </div>
    </div>
  );
}
