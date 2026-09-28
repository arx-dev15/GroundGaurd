'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Settings, Shield, Lock, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { useShell } from '@/components/layout/shell-context';
import type { Project } from '@groundguard/types';

export default function SettingsPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || '';
  const { refreshProjects } = useShell();

  const [project, setProject] = React.useState<Project | null>(null);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    if (!projectId) return;
    async function loadProject() {
      try {
        setIsLoading(true);
        const res = await apiClient.get<{ project: Project }>(`/v1/projects/${projectId}`);
        setProject(res.project);
        setName(res.project.name || '');
        setDescription(res.project.description || '');
      } catch {
        setMessage({ type: 'error', text: 'Failed to load project settings' });
      } finally {
        setIsLoading(false);
      }
    }
    loadProject();
  }, [projectId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ type: 'error', text: 'Project name is required' });
      return;
    }

    try {
      setIsSaving(true);
      setMessage(null);
      const res = await apiClient.patch<{ project: Project }>(`/v1/projects/${projectId}`, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setProject(res.project);
      await refreshProjects();
      setMessage({ type: 'success', text: 'Project updated successfully' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update project';
      setMessage({ type: 'error', text: msg });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <span>Project Settings</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            General configuration and boundary isolation for{' '}
            <span className="text-foreground font-medium">{project?.name || 'this project'}</span>.
          </p>
        </div>

        <Badge variant="outline" className="w-fit text-[11px] font-mono py-1 px-2.5 gap-1.5 self-start sm:self-center">
          <Shield className="h-3.5 w-3.5 text-status-verified" />
          <span>Project Isolated</span>
        </Badge>
      </div>

      {message && (
        <div
          className={`p-3 rounded-md text-xs flex items-center gap-2 border ${
            message.type === 'success'
              ? 'bg-status-verified/10 border-status-verified/40 text-status-verified'
              : 'bg-destructive/10 border-destructive/40 text-destructive'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* General Settings Form */}
      <form onSubmit={handleSave} className="p-5 rounded-lg border border-border/70 bg-card/30 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">General Information</h2>

        <div className="space-y-1.5">
          <label htmlFor="settings-name" className="text-xs font-medium text-foreground">
            Project Name
          </label>
          <Input
            id="settings-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSaving}
            required
            className="text-xs h-9 max-w-md"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="settings-desc" className="text-xs font-medium text-foreground">
            Description
          </label>
          <Input
            id="settings-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSaving}
            placeholder="Domain or purpose of this project"
            className="text-xs h-9 max-w-md"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Project ID</label>
          <div className="font-mono text-xs px-3 py-2 rounded-md bg-muted/50 border border-border/60 text-muted-foreground max-w-md">
            {projectId}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Unique project identifier used for vector and database partitioning.
          </p>
        </div>

        <div className="pt-2">
          <Button type="submit" size="sm" disabled={isSaving} className="text-xs gap-1.5">
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Project Access Boundary */}
      <div className="p-5 rounded-lg border border-border/70 bg-card/30 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Lock className="h-4 w-4 text-status-verified" />
              <span>Project-Scoped Access Boundary</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Project-scoped vector partition and PostgreSQL query scoping.
            </p>
          </div>
          <Badge variant="outline" className="text-status-verified border-status-verified/40 text-xs">
            Enforced Active
          </Badge>
        </div>
      </div>
    </div>
  );
}
