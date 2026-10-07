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
  BookOpen,
  History,
  Pin,
  Lock,
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

  const primaryNavItems = [
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

  const secondaryNavItems = [
    {
      label: 'Docs',
      href: '/docs',
      icon: BookOpen,
      activePattern: '/docs',
      shortcut: 'G D',
      isPostMvp: false,
    },
    {
      label: 'Settings',
      href: `/projects/${currentProjectId}/settings`,
      icon: Settings,
      activePattern: `/projects/${currentProjectId}/settings`,
      shortcut: 'G S',
      isPostMvp: false,
    },
    {
      label: 'Activity',
      href: '#',
      icon: History,
      shortcut: '',
      isPostMvp: true,
      description: 'Audit events & project timeline (Coming later)',
    },
    {
      label: 'Pinned',
      href: '#',
      icon: Pin,
      shortcut: '',
      isPostMvp: true,
      description: 'Pin key claims & passages (Coming later)',
    },
  ];

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

        {/* Primary & Secondary Navigation Lists */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4" aria-label="Main Navigation">
          {/* Primary Navigation */}
          <div className="space-y-1">
            {!sidebarCollapsed && (
              <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 select-none">
                Workspace
              </div>
            )}
            <TooltipProvider delayDuration={150}>
              {primaryNavItems.map((item) => {
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
            </TooltipProvider>
          </div>

          {/* Secondary Navigation */}
          <div className="space-y-1 pt-1 border-t border-border/40">
            {!sidebarCollapsed && (
              <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 select-none">
                Project Rail
              </div>
            )}
            <TooltipProvider delayDuration={150}>
              {secondaryNavItems.map((item) => {
                const isActive = item.activePattern ? pathname.startsWith(item.activePattern) : false;
                const Icon = item.icon;

                if (item.isPostMvp) {
                  const content = (
                    <div
                      key={item.label}
                      aria-disabled="true"
                      className={cn(
                        'relative flex items-center select-none opacity-45 cursor-not-allowed',
                        sidebarCollapsed
                          ? 'h-8 w-8 mx-auto justify-center rounded-md'
                          : 'w-full gap-2.5 px-2.5 py-1.5 text-xs rounded-md text-muted-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                      {!sidebarCollapsed && (
                        <>
                          <span className="truncate flex-1 leading-tight">{item.label}</span>
                          <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-muted/60 text-muted-foreground/70">
                            Post-MVP
                          </span>
                        </>
                      )}
                    </div>
                  );

                  return (
                    <Tooltip key={item.label}>
                      <TooltipTrigger asChild>{content}</TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        <span className="font-medium">{item.label} (Post-MVP)</span>
                        <span className="text-muted-foreground text-[10px] block">{item.description}</span>
                      </TooltipContent>
                    </Tooltip>
                  );
                }

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
            </TooltipProvider>
          </div>
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
