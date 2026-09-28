'use client';

import * as React from 'react';
import { ChevronsUpDown, Check, Plus, FolderKanban, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useShell } from '@/components/layout/shell-context';
import { cn } from '@/lib/utils';

export function ProjectSwitcher() {
  const { currentProject, projects, isLoadingProjects, switchProject, createProject, sidebarCollapsed } = useShell();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState('');
  const [newProjectDesc, setNewProjectDesc] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProjectName.trim();
    if (!trimmed) {
      setError('Project name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const created = await createProject(trimmed, newProjectDesc.trim() || undefined);
      setDialogOpen(false);
      setNewProjectName('');
      setNewProjectDesc('');
      switchProject(created.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create project';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggerButton = (
    <button
      type="button"
      className={cn(
        'group flex items-center transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring border border-border/50 bg-card/40 hover:bg-accent/60',
        sidebarCollapsed
          ? 'h-9 w-9 mx-auto justify-center rounded-md'
          : 'w-full justify-between gap-2.5 px-2.5 py-1.5 rounded-md text-left'
      )}
      aria-label={`Current project: ${currentProject.name}. Click to switch project.`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-6 w-6 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
          <FolderKanban className="h-3.5 w-3.5" />
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-foreground truncate leading-tight">
              {currentProject.name}
            </span>
            <span className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
              Isolated Workspace
            </span>
          </div>
        )}
      </div>

      {!sidebarCollapsed && (
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0 group-hover:text-foreground transition-colors" />
      )}
    </button>
  );

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <TooltipProvider delayDuration={200}>
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                <span className="font-semibold">{currentProject.name}</span>
                <span className="text-muted-foreground text-[10px] block">Click to switch project</span>
              </TooltipContent>
            </Tooltip>
          ) : (
            <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
          )}
        </TooltipProvider>

        <DropdownMenuContent
          align={sidebarCollapsed ? 'center' : 'start'}
          side={sidebarCollapsed ? 'right' : 'bottom'}
          sideOffset={6}
          className="w-56 p-1.5 shadow-xl border-border/80"
        >
          <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-2 py-1">
            Projects
          </DropdownMenuLabel>

          <DropdownMenuGroup>
            {isLoadingProjects && projects.length === 0 ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Loading projects...</span>
              </div>
            ) : projects.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">No projects found</div>
            ) : (
              projects.map((p) => {
                const isActive = p.id === currentProject.id;
                return (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => {
                      setDropdownOpen(false);
                      switchProject(p.id);
                    }}
                    className={cn(
                      'flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs cursor-pointer',
                      isActive && 'bg-accent/80 font-medium text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full shrink-0',
                          isActive ? 'bg-status-verified' : 'bg-muted-foreground/40'
                        )}
                      />
                      <span className="truncate">{p.name}</span>
                    </div>
                    {isActive && <Check className="h-3.5 w-3.5 text-foreground shrink-0" />}
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="my-1" />

          <DropdownMenuItem
            onClick={() => {
              setDropdownOpen(false);
              setDialogOpen(true);
            }}
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-foreground cursor-pointer focus:bg-accent"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            <span>New project...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Project Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Create New Project</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                A project keeps its documents, conversations, and evidence isolated.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-4">
              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="modal-project-name" className="text-xs font-medium text-foreground">
                  Project Name
                </label>
                <Input
                  id="modal-project-name"
                  placeholder="e.g. Legal Research & Discovery"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                  required
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="modal-project-desc" className="text-xs font-medium text-foreground">
                  Description <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  id="modal-project-desc"
                  placeholder="Domain or purpose of this project"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  disabled={isSubmitting}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || !newProjectName.trim()}
                className="text-xs gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create Project</span>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
