'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard,
  MessageSquareCode,
  FolderGit2,
  ShieldCheck,
  Settings,
  FolderKanban,
  PanelLeft,
  PanelRight,
  Sun,
  Moon,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useShell } from '@/components/layout/shell-context';

export function CommandPalette() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    currentProjectId,
    projects,
    switchProject,
    toggleSidebar,
    toggleInspector,
  } = useShell();

  const handleSelect = React.useCallback(
    (action: () => void) => {
      setCommandPaletteOpen(false);
      action();
    },
    [setCommandPaletteOpen]
  );

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList className="max-h-[340px]">
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Primary Navigation Group */}
        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() =>
              handleSelect(() => router.push(`/projects/${currentProjectId}/overview`))
            }
          >
            <LayoutDashboard className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Go to Overview</span>
            <CommandShortcut>G O</CommandShortcut>
          </CommandItem>

          <CommandItem
            onSelect={() =>
              handleSelect(() => router.push(`/projects/${currentProjectId}/ask`))
            }
          >
            <MessageSquareCode className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Go to Ask</span>
            <CommandShortcut>G A</CommandShortcut>
          </CommandItem>

          <CommandItem
            onSelect={() =>
              handleSelect(() => router.push(`/projects/${currentProjectId}/knowledge`))
            }
          >
            <FolderGit2 className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Go to Knowledge</span>
            <CommandShortcut>G K</CommandShortcut>
          </CommandItem>

          <CommandItem
            onSelect={() =>
              handleSelect(() => router.push(`/projects/${currentProjectId}/reliability`))
            }
          >
            <ShieldCheck className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Go to Reliability</span>
            <CommandShortcut>G R</CommandShortcut>
          </CommandItem>

          <CommandItem
            onSelect={() =>
              handleSelect(() => router.push(`/projects/${currentProjectId}/settings`))
            }
          >
            <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Go to Settings</span>
            <CommandShortcut>G S</CommandShortcut>
          </CommandItem>

          <CommandItem
            onSelect={() =>
              handleSelect(() => router.push('/docs'))
            }
          >
            <FolderGit2 className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Open Documentation</span>
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Project Switching Group */}
        <CommandGroup heading="Switch Project">
          <CommandItem
            onSelect={() => handleSelect(() => router.push('/projects'))}
          >
            <FolderKanban className="mr-2 h-4 w-4 text-primary" />
            <span className="font-medium">All Workspaces Home</span>
            <CommandShortcut>G W</CommandShortcut>
          </CommandItem>

          {projects.map((p) => (
            <CommandItem
              key={p.id}
              onSelect={() => handleSelect(() => switchProject(p.id))}
            >
              <FolderKanban className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{p.name}</span>
              {p.id === currentProjectId && (
                <span className="ml-auto text-[10px] font-mono text-status-verified font-medium">
                  Active
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Workspace Actions Group */}
        <CommandGroup heading="Actions & Appearance">
          <CommandItem
            onSelect={() =>
              handleSelect(() => router.push(`/projects/${currentProjectId}/knowledge?upload=1`))
            }
          >
            <FolderGit2 className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Ingest Source Document</span>
          </CommandItem>

          <CommandItem onSelect={() => handleSelect(toggleSidebar)}>
            <PanelLeft className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Toggle Sidebar</span>
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>

          <CommandItem onSelect={() => handleSelect(toggleInspector)}>
            <PanelRight className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Toggle Trust Inspector</span>
            <CommandShortcut>⌘I</CommandShortcut>
          </CommandItem>

          <CommandItem onSelect={() => handleSelect(() => setTheme('light'))}>
            <Sun className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Set Light Theme</span>
          </CommandItem>

          <CommandItem onSelect={() => handleSelect(() => setTheme('dark'))}>
            <Moon className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Set Dark Theme</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
