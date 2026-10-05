'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  LayoutDashboard,
  MessageSquareCode,
  FolderGit2,
  ShieldCheck,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProjectSwitcher } from '@/components/layout/project-switcher';
import { UserMenu } from '@/components/layout/user-menu';
import { useShell } from '@/components/layout/shell-context';
import { cn } from '@/lib/utils';

export function AppSidebar() {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const { sidebarCollapsed, toggleSidebar, currentProjectId } = useShell();

  const navItems = [
    {
      label: 'Overview',
      href: `/projects/${currentProjectId}/overview`,
      icon: LayoutDashboard,
      activePattern: `/projects/${currentProjectId}/overview`,
      shortcut: 'G O',
    },
    {
      label: 'Ask',
      href: `/projects/${currentProjectId}/ask`,
      icon: MessageSquareCode,
      activePattern: `/projects/${currentProjectId}/ask`,
      shortcut: 'G A',
    },
    {
      label: 'Knowledge',
      href: `/projects/${currentProjectId}/knowledge`,
      icon: FolderGit2,
      activePattern: `/projects/${currentProjectId}/knowledge`,
      shortcut: 'G K',
    },
    {
      label: 'Reliability',
      href: `/projects/${currentProjectId}/reliability`,
      icon: ShieldCheck,
      activePattern: `/projects/${currentProjectId}/reliability`,
      shortcut: 'G R',
    },
  ];

  const settingsItem = {
    label: 'Settings',
    href: `/projects/${currentProjectId}/settings`,
    icon: Settings,
    activePattern: `/projects/${currentProjectId}/settings`,
    shortcut: 'G S',
  };

  return (
    <motion.aside
      initial={false}
      animate={{
        width: sidebarCollapsed ? 64 : 248,
      }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
      }
      className="h-screen sticky top-0 shrink-0 border-r border-border/70 bg-card/40 backdrop-blur-md z-30 flex flex-col justify-between select-none overflow-hidden"
      aria-label="Application primary navigation"
    >
      {/* Top Section: Brand + Navigation */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Brand Header */}
        <div className="h-12 border-b border-border/70 flex items-center justify-between px-3 shrink-0">
          <Link
            href={`/projects/${currentProjectId}/overview`}
            className="flex items-center gap-2.5 min-w-0 outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md p-1 group"
            aria-label="EvideX AI Home"
          >
            <div className="h-6 w-6 rounded bg-foreground text-background flex items-center justify-center shrink-0 shadow-xs relative">
              <Shield className="h-3.5 w-3.5 fill-current" />
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-status-verified ring-2 ring-background" />
            </div>

            {!sidebarCollapsed && (
              <span className="text-xs font-semibold tracking-tight text-foreground truncate">
                EvideX AI
              </span>
            )}
          </Link>

          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label={sidebarCollapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen className="h-3.5 w-3.5" />
                  ) : (
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                <span>{sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
                <span className="text-[10px] font-mono text-muted-foreground ml-1.5">⌘B</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Primary Navigation List */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1" aria-label="Main Navigation">
          <TooltipProvider delayDuration={150}>
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.activePattern);
              const Icon = item.icon;

              const linkContent = (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center transition-all duration-150 outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md',
                    sidebarCollapsed
                      ? 'h-9 w-9 mx-auto justify-center'
                      : 'w-full gap-2.5 px-2.5 py-1.5 text-xs',
                    isActive
                      ? 'bg-accent/80 text-foreground font-medium shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/40 font-normal'
                  )}
                >
                  {/* Subtle active left accent indicator */}
                  {isActive && !sidebarCollapsed && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
                  )}

                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  />

                  {!sidebarCollapsed && (
                    <span className="truncate flex-1 leading-tight">{item.label}</span>
                  )}
                </Link>
              );

              if (sidebarCollapsed) {
                return (
                  <Tooltip key={item.label}>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right" className="text-xs flex items-center gap-2">
                      <span>{item.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{item.shortcut}</span>
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return linkContent;
            })}

            {/* Subtle Divider */}
            <div className="py-2">
              <div className="border-t border-border/50 mx-1" />
            </div>

            {/* Settings Navigation */}
            {(() => {
              const isActive = pathname.startsWith(settingsItem.activePattern);
              const Icon = settingsItem.icon;

              const linkContent = (
                <Link
                  href={settingsItem.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center transition-all duration-150 outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md',
                    sidebarCollapsed
                      ? 'h-9 w-9 mx-auto justify-center'
                      : 'w-full gap-2.5 px-2.5 py-1.5 text-xs',
                    isActive
                      ? 'bg-accent/80 text-foreground font-medium shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/40 font-normal'
                  )}
                >
                  {isActive && !sidebarCollapsed && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
                  )}

                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  />

                  {!sidebarCollapsed && (
                    <span className="truncate flex-1 leading-tight">{settingsItem.label}</span>
                  )}
                </Link>
              );

              if (sidebarCollapsed) {
                return (
                  <Tooltip key={settingsItem.label}>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right" className="text-xs flex items-center gap-2">
                      <span>{settingsItem.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{settingsItem.shortcut}</span>
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return linkContent;
            })()}
          </TooltipProvider>
        </nav>
      </div>

      {/* Bottom Area: Project Switcher & User Menu */}
      <div className="border-t border-border/70 p-2 space-y-2 shrink-0 bg-card/20">
        <ProjectSwitcher />
        <UserMenu />
      </div>
    </motion.aside>
  );
}
