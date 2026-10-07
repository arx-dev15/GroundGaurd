'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Project } from '@groundguard/contracts';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { AuthGuard } from '@/components/auth/auth-guard';
import { EvidenceFieldHero } from '@/components/projects/evidence-field-hero';
import { WorkspaceAmbientBackground } from '@/components/projects/workspace-ambient-background';
import { ProjectCard } from '@/components/projects/project-card';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { RenameProjectDialog } from '@/components/projects/rename-project-dialog';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield,
  Plus,
  Search,
  X,
  LayoutGrid,
  List as ListIcon,
  ArrowUpDown,
  Clock,
  FolderKanban,
  FileText,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export default function ProjectsWorkspaceHome() {
  return (
    <AuthGuard>
      <ProjectsWorkspaceContent />
    </AuthGuard>
  );
}

type SortOption = 'updated' | 'created' | 'name';

const INITIAL_VISIBLE_COUNT = 3;
const BATCH_INCREMENT = 3;

function ProjectsWorkspaceContent() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [projects, setProjects] = React.useState<Project[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  // Controls
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortBy, setSortBy] = React.useState<SortOption>('updated');
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [visibleCount, setVisibleCount] = React.useState(INITIAL_VISIBLE_COUNT);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<Project | null>(null);

  // Fetch projects from M3 API
  const loadProjects = React.useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const response = await apiClient.get<{ projects: Project[] }>('/v1/projects');
      const list = response.projects || [];
      setProjects(list);
    } catch (err) {
      console.error('Failed to load projects:', err);
      setFetchError('We couldn’t load your workspaces. Please verify connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleProjectCreated = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev]);
  };

  const handleProjectRenamed = (updated: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  // Helper to parse project date for sorting (treat null/epoch <= 1 day as -1 to sort last)
  const getTimestamp = (dateStr?: string) => {
    if (!dateStr) return -1;
    const t = new Date(dateStr).getTime();
    if (isNaN(t) || t <= 86400000) return -1;
    return t;
  };

  // Filtered and sorted projects
  const filteredProjects = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = projects;

    if (q) {
      result = result.filter((p) => {
        const matchName = p.name.toLowerCase().includes(q);
        const matchDesc = p.description ? p.description.toLowerCase().includes(q) : false;
        const matchId = p.id.toLowerCase().includes(q);
        return matchName || matchDesc || matchId;
      });
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'created') {
        const ta = getTimestamp(a.createdAt);
        const tb = getTimestamp(b.createdAt);
        return tb - ta;
      }
      // default: updated
      const ta = getTimestamp(a.updatedAt || a.createdAt);
      const tb = getTimestamp(b.updatedAt || b.createdAt);
      return tb - ta;
    });
  }, [projects, searchQuery, sortBy]);

  // "Continue working" candidates: up to 3 most recently updated projects with genuine recent timestamps
  const continueWorkingProjects = React.useMemo(() => {
    if (searchQuery.trim().length > 0) return [];
    return projects
      .filter((p) => getTimestamp(p.updatedAt || p.createdAt) > 0)
      .sort((a, b) => getTimestamp(b.updatedAt || b.createdAt) - getTimestamp(a.updatedAt || a.createdAt))
      .slice(0, 3);
  }, [projects, searchQuery]);

  // Reset progressive loading batch on search or sort change
  React.useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [searchQuery, sortBy]);

  // Displayed projects in "All workspaces" (batched)
  const displayedProjects = React.useMemo(() => {
    return filteredProjects.slice(0, visibleCount);
  }, [filteredProjects, visibleCount]);

  const hasMore = visibleCount < filteredProjects.length;

  const handleLoadMore = () => {
    setVisibleCount((prev) => Math.min(prev + BATCH_INCREMENT, filteredProjects.length));
  };

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-[#0c1017] text-foreground flex flex-col selection:bg-muted relative isolate">
      {/* Full-Page Subtle Ambient Atmospheric Depth */}
      <WorkspaceAmbientBackground />

      {/* Workspace Top Navigation Bar */}
      <header className="sticky top-0 z-30 w-full border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Brand & Workspace Indicator */}
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              className="flex items-center gap-2 group outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md p-1"
            >
              <div className="h-6 w-6 rounded bg-foreground text-background flex items-center justify-center shrink-0 shadow-xs relative">
                <Shield className="h-3.5 w-3.5 fill-current" />
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-status-verified ring-2 ring-background" />
              </div>
              <span className="text-xs font-bold tracking-tight text-foreground">
                EvideX
              </span>
            </Link>

            <span className="text-border">/</span>
            <span className="text-xs font-medium text-muted-foreground">
              Workspaces
            </span>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              className="h-8 px-3 text-xs font-semibold gap-1.5 cursor-pointer hidden sm:inline-flex"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New project</span>
            </Button>

            {/* Global Appearance Toggle */}
            <ThemeToggle />

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground gap-2 cursor-pointer"
                  >
                    <div className="h-5 w-5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center text-[10px] font-bold">
                      {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <span className="max-w-[120px] truncate hidden md:inline">
                      {user.name || user.email}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="font-normal text-xs py-2">
                    <div className="font-semibold text-foreground truncate">{user.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => logout()}
                    className="gap-2 text-xs text-destructive focus:text-destructive cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Loading State: Stable Skeleton */}
        {isLoading && (
          <div className="space-y-8 animate-in fade-in duration-150">
            {/* Hero Skeleton */}
            <div className="rounded-2xl border border-border/60 bg-card/40 p-8 space-y-4">
              <Skeleton className="h-5 w-36 rounded-full" />
              <Skeleton className="h-8 w-72 rounded-md" />
              <Skeleton className="h-4 w-96 rounded" />
            </div>

            {/* Controls Bar Skeleton */}
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-9 w-64 rounded-lg" />
              <Skeleton className="h-9 w-40 rounded-lg" />
            </div>

            {/* Grid Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-5 rounded-xl border border-border/50 bg-card/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <Skeleton className="h-5 w-12 rounded" />
                  </div>
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                  <div className="pt-3 border-t border-border/40 flex justify-between">
                    <Skeleton className="h-3 w-20 rounded" />
                    <Skeleton className="h-3 w-12 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error State: Explicit Server Failure */}
        {!isLoading && fetchError && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-8 text-center max-w-xl mx-auto space-y-4 shadow-sm animate-in fade-in duration-200">
            <div className="h-12 w-12 rounded-full bg-destructive/20 text-destructive flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-foreground">
                We couldn&apos;t load your workspaces
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {fetchError} Your projects, documents, and verified evidence remain completely safe in PostgreSQL.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadProjects}
              className="text-xs gap-1.5 cursor-pointer mt-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retry connection</span>
            </Button>
          </div>
        )}

        {/* State 1: Genuine Zero Projects Onboarding */}
        {!isLoading && !fetchError && projects.length === 0 && (
          <div className="rounded-2xl border border-border/80 bg-card/40 p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-8 backdrop-blur-sm shadow-sm animate-in fade-in duration-200">
            <div className="space-y-3">
              <div className="h-12 w-12 mx-auto rounded-xl bg-foreground text-background flex items-center justify-center shadow-md relative">
                <Shield className="h-6 w-6 fill-current" />
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-status-verified ring-2 ring-background" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                No projects yet
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Create your first evidence workspace to upload sources, ask grounded questions, and verify generated claims.
              </p>
            </div>

            {/* 3-Step Orientation */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-left pt-2">
              <div className="p-4 rounded-xl border border-border/70 bg-card/60 space-y-1.5">
                <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Step 1</div>
                <div className="text-xs font-semibold text-foreground">Add Knowledge</div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Ingest technical manuals, research papers, and policy PDFs.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-border/70 bg-card/60 space-y-1.5">
                <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Step 2</div>
                <div className="text-xs font-semibold text-foreground">Ask Questions</div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Query the evidence with hybrid dense-sparse passage retrieval.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-border/70 bg-card/60 space-y-1.5">
                <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Step 3</div>
                <div className="text-xs font-semibold text-foreground">Verify Claims</div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Audit atomic NLI entailment verdicts and citation lineage.
                </p>
              </div>
            </div>

            <Button
              onClick={() => setIsCreateOpen(true)}
              className="text-xs font-semibold gap-1.5 cursor-pointer px-6 h-9"
            >
              <Plus className="h-4 w-4" />
              <span>Create project</span>
            </Button>
          </div>
        )}

        {/* State 2: Populated Workspace Home */}
        {!isLoading && !fetchError && projects.length > 0 && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Interactive Hero with Ambient Evidence Field */}
            <EvidenceFieldHero
              projectCount={projects.length}
              onNewProject={() => setIsCreateOpen(true)}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />

            {/* Controls Bar: Search, View Toggle, Sort */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              {/* Search Input */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search projects by name or description…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9 pr-8 text-xs bg-card/50 border-border/80 focus-visible:ring-1"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Sorting and View Mode */}
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                {/* Result count */}
                <span className="text-[11px] text-muted-foreground font-mono mr-1">
                  {filteredProjects.length}{' '}
                  {filteredProjects.length === 1 ? 'workspace' : 'workspaces'}
                </span>

                {/* Sort Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs font-medium gap-1.5 cursor-pointer bg-card/50"
                    >
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                      <span>
                        {sortBy === 'updated' && 'Recently updated'}
                        {sortBy === 'created' && 'Recently created'}
                        {sortBy === 'name' && 'Name A–Z'}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onClick={() => setSortBy('updated')}
                      className={`text-xs ${sortBy === 'updated' ? 'font-semibold text-primary' : ''}`}
                    >
                      Recently updated
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSortBy('created')}
                      className={`text-xs ${sortBy === 'created' ? 'font-semibold text-primary' : ''}`}
                    >
                      Recently created
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSortBy('name')}
                      className={`text-xs ${sortBy === 'name' ? 'font-semibold text-primary' : ''}`}
                    >
                      Name A–Z
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Grid / List View Toggle */}
                <div className="flex items-center border border-border/80 rounded-lg p-0.5 bg-card/50">
                  <Button
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setViewMode('grid')}
                    className="h-7 w-7 rounded-md cursor-pointer"
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setViewMode('list')}
                    className="h-7 w-7 rounded-md cursor-pointer"
                    aria-label="List view"
                  >
                    <ListIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Section C: Continue Working (only when no search active) */}
            {continueWorkingProjects.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <h2 className="text-xs font-semibold tracking-tight text-foreground uppercase tracking-wider">
                    Continue working
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {continueWorkingProjects.map((project) => (
                    <ProjectCard
                      key={`continue-${project.id}`}
                      project={project}
                      viewMode="grid"
                      isRecentHighlight={true}
                      onRename={(p) => setRenameTarget(p)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section D: All Workspaces */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                  <h2 className="text-xs font-semibold tracking-tight text-foreground uppercase tracking-wider">
                    {searchQuery ? 'Matching workspaces' : 'All workspaces'}
                  </h2>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                    {filteredProjects.length}
                  </span>
                </div>

                {/* Quiet isolation note per Section 23 */}
                <span className="text-[11px] text-muted-foreground/70 hidden sm:inline">
                  Workspaces maintain isolated knowledge & claims
                </span>
              </div>

              {/* No Search Results */}
              {filteredProjects.length === 0 && searchQuery && (
                <div className="rounded-xl border border-dashed border-border/80 p-8 text-center space-y-3 bg-card/20">
                  <p className="text-xs text-muted-foreground">
                    No workspaces match &ldquo;{searchQuery}&rdquo;.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                    className="text-xs cursor-pointer"
                  >
                    Clear search
                  </Button>
                </div>
              )}

              {/* Populated Grid or List */}
              {filteredProjects.length > 0 && (
                <>
                  <div
                    className={
                      viewMode === 'grid'
                        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
                        : 'space-y-2'
                    }
                  >
                    {displayedProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        viewMode={viewMode}
                        onRename={(p) => setRenameTarget(p)}
                      />
                    ))}
                  </div>

                  {/* Modernized Progressive Load Control (Pill Dock + Real Progress Line) */}
                  {filteredProjects.length > INITIAL_VISIBLE_COUNT && (
                    <div className="pt-6 pb-2 flex flex-col items-center justify-center gap-2.5">
                      {hasMore ? (
                        <div className="group/pill inline-flex flex-col items-center w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={handleLoadMore}
                            aria-label={`Show ${Math.min(BATCH_INCREMENT, filteredProjects.length - displayedProjects.length)} more workspaces`}
                            className="relative inline-flex items-center justify-between sm:justify-center gap-3 w-full sm:w-auto px-4 py-2 rounded-full border border-border/80 bg-card/90 hover:bg-card hover:border-border text-foreground backdrop-blur-md shadow-xs hover:shadow-sm transition-all duration-200 cursor-pointer focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {/* Current progress */}
                            <span className="text-xs font-mono font-medium text-muted-foreground group-hover/pill:text-foreground transition-colors">
                              {displayedProjects.length} of {filteredProjects.length} shown
                            </span>

                            <span className="h-3 w-[1px] bg-border" aria-hidden="true" />

                            {/* Action + chevron with 2px downward hover translation */}
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                              <span>Show {Math.min(BATCH_INCREMENT, filteredProjects.length - displayedProjects.length)} more</span>
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover/pill:text-foreground group-hover/pill:translate-y-0.5 transition-all duration-200" />
                            </span>
                          </button>

                          {/* Thin progress line beneath the control */}
                          <div className="w-36 sm:w-44 h-1 bg-border/40 rounded-full overflow-hidden mt-2">
                            <div
                              className="h-full bg-primary/70 rounded-full transition-all duration-300 ease-out"
                              style={{
                                width: `${Math.min(100, Math.round((displayedProjects.length / filteredProjects.length) * 100))}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border/50 bg-card/60 text-muted-foreground text-xs backdrop-blur-xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-status-verified" />
                          <span className="font-mono text-[11px]">All {filteredProjects.length} workspaces shown</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Modals */}
      <CreateProjectDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={handleProjectCreated}
      />

      <RenameProjectDialog
        project={renameTarget}
        open={!!renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        onRenamed={handleProjectRenamed}
      />
    </div>
  );
}
