'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Project } from '@groundguard/contracts';
import {
  FolderKanban,
  ArrowRight,
  MoreVertical,
  Pencil,
  Settings,
  ExternalLink,
  Clock,
  FileText,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface ProjectCardProps {
  project: Project;
  viewMode?: 'grid' | 'list';
  isRecentHighlight?: boolean;
  onRename: (project: Project) => void;
}

function formatProjectDate(dateStr?: string): { text: string; isHistorical: boolean } {
  if (!dateStr) {
    return { text: 'Evaluation baseline', isHistorical: true };
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime()) || date.getTime() <= 86400000) {
    return { text: 'Historical baseline', isHistorical: true };
  }

  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);

  if (diffSec < 60) return { text: 'Just now', isHistorical: false };
  if (diffSec < 3600) return { text: `${Math.floor(diffSec / 60)}m ago`, isHistorical: false };
  if (diffSec < 86400) return { text: `${Math.floor(diffSec / 3600)}h ago`, isHistorical: false };
  if (diffSec < 86400 * 7) return { text: `${Math.floor(diffSec / 86400)}d ago`, isHistorical: false };
  if (diffSec < 86400 * 30) return { text: `${Math.floor(diffSec / (86400 * 7))}w ago`, isHistorical: false };

  return {
    text: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    isHistorical: false,
  };
}

export function ProjectCard({
  project,
  viewMode = 'grid',
  isRecentHighlight = false,
  onRename,
}: ProjectCardProps) {
  const router = useRouter();
  const { text: timeAgo, isHistorical } = formatProjectDate(project.updatedAt || project.createdAt);

  const initial = (project.name || 'P').trim().charAt(0).toUpperCase();

  const handleOpen = () => {
    router.push(`/projects/${project.id}/overview`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpen();
    }
  };

  if (viewMode === 'list') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        className="group relative flex items-center justify-between gap-4 p-4 rounded-xl border border-border/70 bg-card/40 hover:bg-card/90 hover:border-border transition-all duration-150 text-left cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* Monogram / Glyph */}
          <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-semibold text-xs shrink-0 select-none group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            {initial}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                {project.name}
              </span>
              {isRecentHighlight && (
                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-primary/10 text-primary shrink-0 border border-primary/20">
                  Recent
                </span>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {project.description ? project.description : `ID: ${project.id}`}
            </p>
          </div>
        </div>

        {/* Right side: Timestamp & Actions */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{isHistorical ? timeAgo : `Updated ${timeAgo}`}</span>
          </div>

          {/* Action Menu */}
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  aria-label="Project actions"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={handleOpen} className="gap-2 text-xs">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Open Overview</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onRename(project)}
                  className="gap-2 text-xs"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Rename project</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => router.push(`/projects/${project.id}/settings`)}
                  className="gap-2 text-xs"
                >
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Settings</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    );
  }

  // Grid Card View
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      className={`group relative flex flex-col justify-between p-5 rounded-xl border transition-all duration-150 text-left cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isRecentHighlight
          ? 'border-border/90 bg-card/60 hover:bg-card/95 hover:border-primary/40'
          : 'border-border/70 bg-card/40 hover:bg-card/90 hover:border-border'
      }`}
    >
      <div>
        {/* Top Header: Glyph & Action Menu */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-semibold text-xs shrink-0 select-none group-hover:bg-primary group-hover:text-primary-foreground transition-colors shadow-2xs">
            {initial}
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {isRecentHighlight && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                Recent
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100 transition-opacity"
                  aria-label="Project actions"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={handleOpen} className="gap-2 text-xs">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Open Overview</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onRename(project)}
                  className="gap-2 text-xs"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Rename project</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => router.push(`/projects/${project.id}/settings`)}
                  className="gap-2 text-xs"
                >
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Settings</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Project Name */}
        <h3 className="text-xs font-semibold text-foreground tracking-tight group-hover:text-primary transition-colors line-clamp-1">
          {project.name}
        </h3>

        {/* Description or quiet factual metadata */}
        <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2 min-h-[32px] leading-relaxed">
          {project.description ? project.description : `Evidence workspace · ID ${project.id}`}
        </p>
      </div>

      {/* Footer Meta & Open CTA */}
      <div className="pt-3.5 mt-3 border-t border-border/50 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">{isHistorical ? timeAgo : `Updated ${timeAgo}`}</span>
        </div>

        <div className="flex items-center gap-1 text-muted-foreground font-medium group-hover:text-foreground transition-colors shrink-0">
          <span>Open</span>
          <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
}
