'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';
import { AppInspector } from '@/components/layout/app-inspector';
import { CommandPalette } from '@/components/layout/command-palette';
import { MobileNav } from '@/components/layout/mobile-nav';
import { useShell } from '@/components/layout/shell-context';
import { cn } from '@/lib/utils';

export interface AppShellLayoutProps {
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  className?: string;
}

export function AppShellLayout({
  children,
  headerActions,
  className,
}: AppShellLayoutProps) {
  const shouldReduceMotion = useReducedMotion();
  const { isDesktop } = useShell();

  return (
    <div className={cn('min-h-screen bg-background text-foreground flex overflow-hidden', className)}>
      {/* 1. Desktop / Tablet Sidebar (hidden on mobile) */}
      <div className="hidden md:flex shrink-0">
        <AppSidebar />
      </div>

      {/* 2. Main Content Workspace */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        {/* Minimal Top Bar */}
        <AppHeader actions={headerActions} />

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-6 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl w-full animate-in fade-in duration-200">
            {children}
          </div>
        </main>
      </div>

      {/* 3. Docked Right Inspector */}
      <AppInspector />

      {/* 4. Global Command Palette (⌘K) */}
      <CommandPalette />

      {/* 5. Mobile Navigation & Drawer (md:hidden) */}
      <MobileNav />
    </div>
  );
}
