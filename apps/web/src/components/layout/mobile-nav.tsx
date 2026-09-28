'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquareCode,
  FolderGit2,
  ShieldCheck,
  Settings,
  Shield,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ProjectSwitcher } from '@/components/layout/project-switcher';
import { UserMenu } from '@/components/layout/user-menu';
import { useShell } from '@/components/layout/shell-context';
import { cn } from '@/lib/utils';

export function MobileNav() {
  const pathname = usePathname();
  const { currentProjectId, mobileMenuOpen, setMobileMenuOpen } = useShell();

  const primaryItems = [
    {
      label: 'Overview',
      href: `/projects/${currentProjectId}/overview`,
      icon: LayoutDashboard,
      activePattern: `/projects/${currentProjectId}/overview`,
    },
    {
      label: 'Ask',
      href: `/projects/${currentProjectId}/ask`,
      icon: MessageSquareCode,
      activePattern: `/projects/${currentProjectId}/ask`,
    },
    {
      label: 'Knowledge',
      href: `/projects/${currentProjectId}/knowledge`,
      icon: FolderGit2,
      activePattern: `/projects/${currentProjectId}/knowledge`,
    },
    {
      label: 'Reliability',
      href: `/projects/${currentProjectId}/reliability`,
      icon: ShieldCheck,
      activePattern: `/projects/${currentProjectId}/reliability`,
    },
  ];

  return (
    <>
      {/* Mobile Bottom Navigation Bar (md:hidden) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border/80 px-2 py-1 flex items-center justify-around select-none shadow-lg"
      >
        {primaryItems.map((item) => {
          const isActive = pathname.startsWith(item.activePattern);
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center min-h-[44px] min-w-[56px] px-2 py-1 rounded-md text-[10px] font-medium transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring',
                isActive
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 mb-0.5 transition-transform',
                  isActive ? 'scale-110 text-foreground' : 'text-muted-foreground'
                )}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Mobile Drawer (Accessible from header or bottom bar) */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[280px] p-0 flex flex-col z-50">
          <SheetHeader className="p-4 border-b border-border/70 flex flex-row items-center gap-2.5 space-y-0">
            <div className="h-6 w-6 rounded bg-foreground text-background flex items-center justify-center shrink-0 shadow-xs relative">
              <Shield className="h-3.5 w-3.5 fill-current" />
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-status-verified ring-2 ring-background" />
            </div>
            <SheetTitle className="text-xs font-semibold text-foreground">
              GroundGuard Workspace
            </SheetTitle>
          </SheetHeader>

          <div className="p-3 border-b border-border/60">
            <ProjectSwitcher />
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
            {primaryItems.map((item) => {
              const isActive = pathname.startsWith(item.activePattern);
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors min-h-[44px]',
                    isActive
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <div className="py-2">
              <div className="border-t border-border/50 mx-2" />
            </div>

            <Link
              href={`/projects/${currentProjectId}/settings`}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors min-h-[44px]',
                pathname.includes('/settings')
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span>Settings</span>
            </Link>
          </div>

          <div className="p-3 border-t border-border/70 bg-card/20">
            <UserMenu />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
