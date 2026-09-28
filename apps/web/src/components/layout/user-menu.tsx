'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import {
  User as UserIcon,
  Sun,
  Moon,
  Laptop,
  LogOut,
  Command,
  Sliders,
  MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useShell } from '@/components/layout/shell-context';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

export function UserMenu() {
  const { sidebarCollapsed, setCommandPaletteOpen } = useShell();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();

  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'User');
  const displayEmail = user?.email || '';

  const initials = React.useMemo(() => {
    if (user?.name) {
      const parts = user.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'U';
  }, [user]);

  const triggerButton = (
    <button
      type="button"
      className={cn(
        'group flex items-center transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md hover:bg-accent/60',
        sidebarCollapsed
          ? 'h-9 w-9 mx-auto justify-center'
          : 'w-full justify-between gap-2.5 px-2 py-1.5 text-left'
      )}
      aria-label={`User menu for ${displayName}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-6 w-6 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-mono text-[10px] font-semibold border border-border/70 shrink-0">
          {initials}
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-foreground truncate leading-tight">
              {displayName}
            </span>
            <span className="text-[10px] text-muted-foreground truncate leading-tight">
              {displayEmail}
            </span>
          </div>
        )}
      </div>

      {!sidebarCollapsed && (
        <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 group-hover:text-foreground transition-colors" />
      )}
    </button>
  );

  return (
    <DropdownMenu>
      <TooltipProvider delayDuration={200}>
        {sidebarCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              <span className="font-semibold">{displayName}</span>
              <span className="text-muted-foreground text-[10px] block">{displayEmail}</span>
            </TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
        )}
      </TooltipProvider>

      <DropdownMenuContent
        align={sidebarCollapsed ? 'center' : 'start'}
        side={sidebarCollapsed ? 'right' : 'top'}
        sideOffset={6}
        className="w-56 p-1.5 shadow-xl border-border/80"
      >
        <DropdownMenuLabel className="px-2 py-1.5 font-normal">
          <div className="flex flex-col space-y-0.5">
            <p className="text-xs font-semibold text-foreground leading-none">{displayName}</p>
            <p className="text-[10px] font-mono text-muted-foreground leading-none">{displayEmail}</p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="my-1" />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center justify-between px-2 py-1.5 text-xs cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Command className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Command Menu</span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">⌘K</span>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex items-center gap-2 px-2 py-1.5 text-xs">
              {theme === 'dark' ? (
                <Moon className="h-3.5 w-3.5 text-muted-foreground" />
              ) : theme === 'light' ? (
                <Sun className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-32">
              <DropdownMenuItem onClick={() => setTheme('light')} className="text-xs">
                <Sun className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')} className="text-xs">
                <Moon className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')} className="text-xs">
                <Laptop className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                System
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="my-1" />

        <DropdownMenuItem
          onClick={logout}
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
