'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Search,
  PanelRight,
  PanelRightClose,
  Menu,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useShell } from '@/components/layout/shell-context';
import { cn } from '@/lib/utils';

export interface AppHeaderProps {
  actions?: React.ReactNode;
  className?: string;
}

export function AppHeader({ actions, className }: AppHeaderProps) {
  const {
    currentProject,
    currentSection,
    currentProjectId,
    inspectorOpen,
    toggleInspector,
    setCommandPaletteOpen,
    setMobileMenuOpen,
    isDesktop,
  } = useShell();

  const sectionTitles: Record<string, string> = {
    overview: 'Overview',
    ask: 'Ask',
    knowledge: 'Knowledge',
    reliability: 'Reliability',
    settings: 'Settings',
  };

  const formattedSection = sectionTitles[currentSection] || 'Overview';

  return (
    <header
      className={cn(
        'h-12 border-b border-border/70 bg-card/30 backdrop-blur-sm shrink-0 flex items-center justify-between px-3 sm:px-4 z-20 select-none text-xs',
        className
      )}
    >
      {/* Left: Breadcrumbs + Mobile Menu Trigger */}
      <div className="flex items-center gap-2 min-w-0">
        {!isDesktop && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open mobile navigation"
            className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors mr-1 cursor-pointer"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}

        <div className="flex items-center gap-1.5 font-medium truncate">
          <Link
            href={`/projects/${currentProjectId}/overview`}
            className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[140px] sm:max-w-[200px]"
          >
            {currentProject.name}
          </Link>
          <span className="text-muted-foreground/40 font-mono">/</span>
          <span className="text-foreground font-semibold truncate">{formattedSection}</span>
        </div>
      </div>

      {/* Center: Command Palette Trigger */}
      <div className="hidden md:flex items-center justify-center flex-1 max-w-sm px-4">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground border border-border/50 text-xs transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Open command palette (⌘K)"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground/70" />
            <span className="text-xs">Search or jump to...</span>
          </div>
          <kbd className="font-mono text-[10px] text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded border border-border/60 shadow-2xs">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Page Actions + Inspector Toggle */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Mobile search icon trigger */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          aria-label="Search (⌘K)"
          className="md:hidden h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors cursor-pointer"
        >
          <Search className="h-4 w-4" />
        </button>

        {actions && <div className="flex items-center gap-1.5">{actions}</div>}

        {/* Inspector Control Button */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleInspector}
                aria-label={inspectorOpen ? 'Close Inspector (⌘I)' : 'Open Inspector (⌘I)'}
                className={cn(
                  'h-8 px-2.5 rounded-md flex items-center gap-1.5 border transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring text-xs font-medium',
                  inspectorOpen
                    ? 'border-border bg-accent text-foreground shadow-xs'
                    : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent/40'
                )}
              >
                {inspectorOpen ? (
                  <PanelRightClose className="h-3.5 w-3.5 text-foreground" />
                ) : (
                  <PanelRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="hidden sm:inline">Inspector</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs flex items-center gap-1.5">
              <span>{inspectorOpen ? 'Hide Trust Inspector' : 'Show Trust Inspector'}</span>
              <span className="text-[10px] font-mono text-muted-foreground">⌘I</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  );
}
