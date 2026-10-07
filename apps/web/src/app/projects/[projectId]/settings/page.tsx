'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Settings,
  Shield,
  Lock,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sun,
  Moon,
  Laptop,
  MessageSquareCode,
  ShieldCheck,
  Bell,
  Database,
  Trash2,
  Download,
  Terminal,
  ChevronDown,
  ChevronRight,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';
import { useShell } from '@/components/layout/shell-context';
import type { Project } from '@groundguard/types';

type SettingsTab =
  | 'workspace'
  | 'appearance'
  | 'ask'
  | 'reliability'
  | 'notifications'
  | 'privacy'
  | 'advanced';

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = (params?.projectId as string) || '';
  const { refreshProjects } = useShell();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = React.useState<SettingsTab>('workspace');
  const [project, setProject] = React.useState<Project | null>(null);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = React.useState('');
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Presentation Preferences (Local Storage)
  const [density, setDensity] = React.useState<'comfortable' | 'compact'>('comfortable');
  const [autoOpenLens, setAutoOpenLens] = React.useState(true);
  const [citationDensity, setCitationDensity] = React.useState<'standard' | 'full'>('standard');
  const [showRecovered, setShowRecovered] = React.useState(true);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDensity = localStorage.getItem('evidex_pref_density');
      if (savedDensity === 'compact' || savedDensity === 'comfortable') setDensity(savedDensity);
      const savedLens = localStorage.getItem('evidex_pref_auto_lens');
      if (savedLens !== null) setAutoOpenLens(savedLens === 'true');
      const savedRecovered = localStorage.getItem('evidex_pref_show_recovered');
      if (savedRecovered !== null) setShowRecovered(savedRecovered === 'true');
    }
  }, []);

  const handleDensityChange = (val: 'comfortable' | 'compact') => {
    setDensity(val);
    localStorage.setItem('evidex_pref_density', val);
  };

  const handleAutoLensChange = (val: boolean) => {
    setAutoOpenLens(val);
    localStorage.setItem('evidex_pref_auto_lens', String(val));
  };

  const handleShowRecoveredChange = (val: boolean) => {
    setShowRecovered(val);
    localStorage.setItem('evidex_pref_show_recovered', String(val));
  };

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
        setMessage({ type: 'error', text: 'Failed to load workspace settings' });
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
      setMessage({ type: 'success', text: 'Workspace settings saved successfully' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update workspace';
      setMessage({ type: 'error', text: msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!project || deleteConfirmText.trim().toLowerCase() !== project.name.trim().toLowerCase()) {
      return;
    }
    try {
      setIsDeleting(true);
      await apiClient.delete(`/v1/projects/${projectId}`);
      await refreshProjects();
      router.push('/projects');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete workspace';
      setMessage({ type: 'error', text: msg });
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleExportWorkspace = () => {
    if (!project) return;
    const data = {
      project,
      exportedAt: new Date().toISOString(),
      platform: 'EVIDEX Reliability Platform',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidex-workspace-${project.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Loading workspace settings...</span>
      </div>
    );
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: 'workspace', label: 'Workspace', icon: Settings },
    { id: 'appearance', label: 'Appearance', icon: Sun },
    { id: 'ask', label: 'Ask & Evidence', icon: MessageSquareCode },
    { id: 'reliability', label: 'Reliability', icon: ShieldCheck },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Data & Privacy', icon: Database },
    { id: 'advanced', label: 'Advanced', icon: Terminal },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <span>Workspace Settings</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage boundary configuration, presentation preferences, and data privacy for{' '}
            <span className="text-foreground font-semibold">{project?.name || 'this workspace'}</span>.
          </p>
        </div>

        <Badge variant="outline" className="w-fit text-[11px] font-mono py-1 px-2.5 gap-1.5 self-start sm:self-center border-status-verified/40 text-status-verified bg-status-verified/10">
          <Shield className="h-3.5 w-3.5 fill-current" />
          <span>PostgreSQL Isolated</span>
        </Badge>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
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

      {/* Main Grid: Left Navigation Rail + Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Left Section Navigation */}
        <div className="md:col-span-3 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  isActive
                    ? 'bg-accent text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Section Content */}
        <div className="md:col-span-9 space-y-6">
          {/* TAB 1: WORKSPACE */}
          {activeTab === 'workspace' && (
            <form onSubmit={handleSave} className="p-6 rounded-xl border border-border/70 bg-card/40 space-y-5 shadow-xs">
              <div>
                <h2 className="text-sm font-semibold text-foreground">General Workspace Information</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Metadata identifying this workspace across EVIDEX.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="settings-name" className="text-xs font-medium text-foreground">
                  Workspace Name
                </label>
                <Input
                  id="settings-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSaving}
                  required
                  className="text-xs h-9 max-w-md bg-card/60"
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
                  placeholder="Domain or purpose of this evidence workspace"
                  className="text-xs h-9 max-w-md bg-card/60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Workspace ID</label>
                <div className="font-mono text-xs px-3 py-2 rounded-md bg-muted/40 border border-border/60 text-muted-foreground max-w-md select-all">
                  {projectId}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Read-only identifier used for vector and PostgreSQL partitioning.
                </p>
              </div>

              <div className="pt-2">
                <Button type="submit" size="sm" disabled={isSaving} className="text-xs gap-1.5 cursor-pointer">
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
          )}

          {/* TAB 2: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="p-6 rounded-xl border border-border/70 bg-card/40 space-y-6 shadow-xs">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Appearance & Interface Density</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Customize the look and feel of your workspace environment.
                </p>
              </div>

              {/* Theme Selector */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Color Theme</label>
                <div className="grid grid-cols-3 gap-3 max-w-md">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`p-3 rounded-lg border text-xs font-medium flex flex-col items-center gap-2 transition-all cursor-pointer ${
                      theme === 'light'
                        ? 'border-primary bg-accent/80 text-foreground font-semibold shadow-xs'
                        : 'border-border/70 bg-card/30 text-muted-foreground hover:text-foreground hover:bg-accent/40'
                    }`}
                  >
                    <Sun className="h-4 w-4" />
                    <span>Light</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`p-3 rounded-lg border text-xs font-medium flex flex-col items-center gap-2 transition-all cursor-pointer ${
                      theme === 'dark'
                        ? 'border-primary bg-accent/80 text-foreground font-semibold shadow-xs'
                        : 'border-border/70 bg-card/30 text-muted-foreground hover:text-foreground hover:bg-accent/40'
                    }`}
                  >
                    <Moon className="h-4 w-4" />
                    <span>Dark</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme('system')}
                    className={`p-3 rounded-lg border text-xs font-medium flex flex-col items-center gap-2 transition-all cursor-pointer ${
                      theme === 'system'
                        ? 'border-primary bg-accent/80 text-foreground font-semibold shadow-xs'
                        : 'border-border/70 bg-card/30 text-muted-foreground hover:text-foreground hover:bg-accent/40'
                    }`}
                  >
                    <Laptop className="h-4 w-4" />
                    <span>System</span>
                  </button>
                </div>
              </div>

              {/* Layout Density */}
              <div className="space-y-2 pt-2 border-t border-border/40">
                <label className="text-xs font-medium text-foreground">Layout Density</label>
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <button
                    type="button"
                    onClick={() => handleDensityChange('comfortable')}
                    className={`p-2.5 rounded-lg border text-xs font-medium text-center transition-all cursor-pointer ${
                      density === 'comfortable'
                        ? 'border-primary bg-accent/80 text-foreground font-semibold shadow-xs'
                        : 'border-border/70 bg-card/30 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Comfortable
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDensityChange('compact')}
                    className={`p-2.5 rounded-lg border text-xs font-medium text-center transition-all cursor-pointer ${
                      density === 'compact'
                        ? 'border-primary bg-accent/80 text-foreground font-semibold shadow-xs'
                        : 'border-border/70 bg-card/30 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Compact
                  </button>
                </div>
              </div>

              {/* Reduced Motion Indicator */}
              <div className="pt-2 border-t border-border/40 flex items-center justify-between max-w-md">
                <div>
                  <div className="text-xs font-medium text-foreground">Operating System Motion</div>
                  <div className="text-[11px] text-muted-foreground">
                    Honors system-level <code className="font-mono text-[10px]">prefers-reduced-motion</code> automatically.
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono text-status-verified border-status-verified/30">
                  Enforced
                </Badge>
              </div>
            </div>
          )}

          {/* TAB 3: ASK & EVIDENCE */}
          {activeTab === 'ask' && (
            <div className="p-6 rounded-xl border border-border/70 bg-card/40 space-y-6 shadow-xs">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Ask & Evidence Presentation</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Display preferences for answering grounded questions and inspecting claims.
                </p>
              </div>

              <div className="space-y-4">
                {/* Auto-open Evidence Lens */}
                <div className="flex items-center justify-between max-w-lg p-3 rounded-lg border border-border/60 bg-card/30">
                  <div>
                    <div className="text-xs font-medium text-foreground">Auto-Open Evidence Lens</div>
                    <div className="text-[11px] text-muted-foreground">
                      Automatically expands the citation drawer when inspecting an atomic assertion.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoOpenLens}
                    onChange={(e) => handleAutoLensChange(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-1 focus:ring-ring cursor-pointer"
                  />
                </div>

                {/* Citation Density */}
                <div className="flex items-center justify-between max-w-lg p-3 rounded-lg border border-border/60 bg-card/30">
                  <div>
                    <div className="text-xs font-medium text-foreground">Citation Format</div>
                    <div className="text-[11px] text-muted-foreground">
                      Display inline bracketed document and page markers.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCitationDensity('standard')}
                      className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                        citationDensity === 'standard' ? 'bg-primary text-primary-foreground font-semibold' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => setCitationDensity('full')}
                      className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                        citationDensity === 'full' ? 'bg-primary text-primary-foreground font-semibold' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      Full Details
                    </button>
                  </div>
                </div>
              </div>

              {/* Locked Invariants Callout */}
              <div className="p-4 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Lock className="h-3.5 w-3.5 text-status-verified" />
                  <span>Frozen Verification Invariants</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  The <strong className="text-foreground">0.35 sufficiency invariant</strong>, DeBERTa-v3 cross-encoder scoring,
                  and autonomous secondary repair rails are enterprise reliability invariants and cannot be altered by presentation preferences.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: RELIABILITY */}
          {activeTab === 'reliability' && (
            <div className="p-6 rounded-xl border border-border/70 bg-card/40 space-y-6 shadow-xs">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Reliability Presentation Preferences</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure queue display and claim inspection defaults.
                </p>
              </div>

              <div className="space-y-4">
                {/* Show Recovered Claims */}
                <div className="flex items-center justify-between max-w-lg p-3 rounded-lg border border-border/60 bg-card/30">
                  <div>
                    <div className="text-xs font-medium text-foreground">Display Recovered Claims</div>
                    <div className="text-[11px] text-muted-foreground">
                      Show assertions repaired autonomously by EVIDEX in the verification queue.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showRecovered}
                    onChange={(e) => handleShowRecoveredChange(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-1 focus:ring-ring cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between max-w-lg p-3 rounded-lg border border-border/60 bg-card/30">
                  <div>
                    <div className="text-xs font-medium text-foreground">Default Queue Page Size</div>
                    <div className="text-[11px] text-muted-foreground">
                      Number of atomic claims displayed per verification queue page.
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">
                    5 claims / page
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="p-6 rounded-xl border border-border/70 bg-card/40 space-y-6 shadow-xs">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Workspace Notifications</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Real-time alerts for background document processing and claim changes.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-4 rounded-lg border border-border/60 bg-muted/20 flex items-center justify-between opacity-75" aria-disabled="true">
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium text-foreground">Document Ingestion Completed</div>
                    <div className="text-[11px] text-muted-foreground">
                      Receive an alert when newly uploaded technical PDFs finish chunking and indexing.
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground uppercase">
                    POST-MVP
                  </Badge>
                </div>

                <div className="p-4 rounded-lg border border-border/60 bg-muted/20 flex items-center justify-between opacity-75" aria-disabled="true">
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium text-foreground">Unresolved Claims Require Attention</div>
                    <div className="text-[11px] text-muted-foreground">
                      Notify project reviewers when unverified assertions accumulate in the queue.
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground uppercase">
                    POST-MVP
                  </Badge>
                </div>

                <div className="p-4 rounded-lg border border-border/60 bg-muted/20 flex items-center justify-between opacity-75" aria-disabled="true">
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium text-foreground">Evidence Drift Monitoring</div>
                    <div className="text-[11px] text-muted-foreground">
                      Alerts when updated or re-uploaded documents weaken previously verified claims.
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground uppercase">
                    POST-MVP
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: DATA & PRIVACY */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl border border-border/70 bg-card/40 space-y-5 shadow-xs">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Data Export & Backup</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Download workspace configuration and metadata records.
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportWorkspace}
                  className="text-xs gap-2 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export Workspace JSON</span>
                </Button>
              </div>

              {/* Danger Zone */}
              <div className="p-6 rounded-xl border border-destructive/40 bg-destructive/5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-destructive flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    <span>Danger Zone</span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Irreversible actions affecting this workspace and its indexed evidence.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-destructive/20 bg-background/60">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-foreground">Delete this workspace</div>
                    <div className="text-[11px] text-muted-foreground">
                      Permanently removes all uploaded documents, passage embeddings, and claim verification records.
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setDeleteConfirmText('');
                      setDeleteDialogOpen(true);
                    }}
                    className="text-xs cursor-pointer shrink-0"
                  >
                    Delete Workspace
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: ADVANCED */}
          {activeTab === 'advanced' && (
            <div className="p-6 rounded-xl border border-border/70 bg-card/40 space-y-6 shadow-xs">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Technical Diagnostics & Architecture</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Internal runtime configurations and vector partition telemetry.
                </p>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-between">
                  <span className="text-muted-foreground">Vector Database</span>
                  <span className="text-foreground font-semibold">Qdrant Partitioned (groundguard-qdrant)</span>
                </div>

                <div className="p-3 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-between">
                  <span className="text-muted-foreground">Cross-Encoder Verifier</span>
                  <span className="text-foreground font-semibold">DeBERTa-v3-base NLI (Local CPU/GPU)</span>
                </div>

                <div className="p-3 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-between">
                  <span className="text-muted-foreground">PostgreSQL Persistence</span>
                  <span className="text-foreground font-semibold">groundguard-postgres (Port 5432)</span>
                </div>

                <div className="p-3 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-between">
                  <span className="text-muted-foreground">Fastify Core API</span>
                  <span className="text-foreground font-semibold">http://localhost:4000/v1</span>
                </div>
              </div>

              <div className="pt-2 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="text-xs gap-1.5 cursor-pointer"
                >
                  <a href="/docs" target="_blank" rel="noopener noreferrer">
                    <span>View Architectural Documentation</span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-destructive flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              <span>Confirm Workspace Deletion</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              This action cannot be undone. All documents, citations, conversations, and claim verification
              records will be permanently deleted from PostgreSQL and Qdrant.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <p className="text-foreground">
              Please type <strong className="font-mono text-destructive select-all">{project?.name}</strong> to confirm:
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={project?.name}
              className="text-xs h-9 bg-card"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(false)}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isDeleting || deleteConfirmText.trim().toLowerCase() !== (project?.name || '').trim().toLowerCase()}
              onClick={handleDelete}
              className="text-xs cursor-pointer gap-1.5"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <span>Permanently Delete</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
