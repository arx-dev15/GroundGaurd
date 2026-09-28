'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Project } from '@groundguard/contracts';
import { apiClient } from '@/lib/api-client';
import { AuthGuard } from '@/components/auth/auth-guard';
import { Shield, Plus, FolderKanban, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectsEntryPage() {
  return (
    <AuthGuard>
      <ProjectsEntryContent />
    </AuthGuard>
  );
}

function ProjectsEntryContent() {
  const router = useRouter();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isCreating, setIsCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // Fetch real projects from M3
  React.useEffect(() => {
    async function loadProjects() {
      try {
        const response = await apiClient.get<{ projects: Project[] }>('/v1/projects');
        const list = response.projects || [];
        setProjects(list);

        // If exactly 1 project, navigate directly to overview
        if (list.length === 1) {
          router.replace(`/projects/${list[0].id}/overview`);
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadProjects();
  }, [router]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a project name');
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const response = await apiClient.post<{ project: Project }>('/v1/projects', {
        name: name.trim(),
        description: description.trim() || undefined,
      });

      router.push(`/projects/${response.project.id}/overview`);
    } catch (err: unknown) {
      setError('Failed to create project. Please try again.');
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-center items-center p-6 space-y-4">
        <Skeleton className="h-8 w-64 rounded" />
        <Skeleton className="h-4 w-96 rounded" />
        <div className="w-full max-w-md pt-4 space-y-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // State 1: Zero Projects Onboarding
  if (projects.length === 0) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center px-4 py-12 select-none">
        <div className="w-full max-w-md space-y-8">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-xl bg-foreground text-background flex items-center justify-center shadow-md relative">
              <Shield className="h-6 w-6 fill-current" />
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-status-verified ring-2 ring-background" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Create your first project
            </h1>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              A project keeps its documents, conversations and evidence strictly isolated within its own verified boundaries.
            </p>
          </div>

          {/* Creation Form */}
          <form
            onSubmit={handleCreateProject}
            className="p-6 rounded-xl border border-border/80 bg-card/50 backdrop-blur-sm shadow-xl space-y-4"
          >
            {error && (
              <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="projectName" className="text-xs font-medium text-foreground block">
                Project Name
              </label>
              <Input
                id="projectName"
                autoFocus
                placeholder="e.g. Enterprise Knowledge Base"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                className="h-9 text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="projectDesc" className="text-xs font-medium text-foreground block">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                id="projectDesc"
                placeholder="What factual evidence and domains will this project contain?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-xs min-h-[72px] resize-none"
              />
            </div>

            <Button
              type="submit"
              disabled={isCreating}
              className="w-full h-9 text-xs font-semibold gap-1.5 cursor-pointer mt-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Creating project...</span>
                </>
              ) : (
                <>
                  <span>Create project</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // State 2: Multiple Projects Selector
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center px-4 py-12 select-none">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="h-10 w-10 mx-auto rounded-xl bg-foreground text-background flex items-center justify-center shadow-md">
            <Shield className="h-5 w-5 fill-current" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Select a project</h1>
          <p className="text-xs text-muted-foreground">
            Choose a workspace to inspect claims and grounded knowledge.
          </p>
        </div>

        {/* Project List */}
        <div className="space-y-2">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/projects/${p.id}/overview`)}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-border/70 bg-card/40 hover:bg-accent/50 hover:border-border transition-all text-left group cursor-pointer shadow-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                  <FolderKanban className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {p.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {p.description || 'Isolated project workspace'}
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          ))}
        </div>

        {/* Create Another Project */}
        <div className="pt-4 border-t border-border/60 text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProjects([])}
            className="text-xs gap-1.5 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create another project</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
