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

import { Dhadhi3DCanvas } from '@/components/ui/dhadhi-3d-canvas';

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
  const { isDesktop, currentSection } = useShell();
  const isAskPage = currentSection === 'ask';

  return (
    <div className={cn('relative min-h-screen bg-background text-foreground flex overflow-hidden', className)}>
      {/* Ambient 3D Wallpaper Backdrop (Low density, non-intrusive) */}
      <Dhadhi3DCanvas density="low" themeAccent="emerald" className="opacity-20 pointer-events-none" interactive={false} />

      {/* 1. Desktop / Tablet Sidebar (hidden on mobile) */}
      <div className="relative z-10 hidden md:flex shrink-0">
        <AppSidebar />
      </div>

      {/* 2. Main Content Workspace */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        {/* Minimal Top Bar */}
        <AppHeader actions={headerActions} />

        {/* Scrollable Page Body */}
        <main
          className={cn(
            'flex-1 overflow-y-auto',
            isAskPage ? 'p-0 pb-0 overflow-hidden flex flex-col' : 'pb-20 md:pb-6 p-4 sm:p-6 lg:p-8'
          )}
        >
          {isAskPage ? (
            <div className="w-full h-full flex-1 flex flex-col">{children}</div>
          ) : (
            <div className="mx-auto max-w-6xl w-full animate-in fade-in duration-200">
              {children}
            </div>
          )}
        </main>
      </div>

      {/* 3. Docked Right Inspector (Only outside Ask page, since Ask has contextual claim inspector) */}
      {!isAskPage && <AppInspector />}

      {/* 4. Global Command Palette (⌘K) */}
      <CommandPalette />

      {/* 5. Mobile Navigation & Drawer (md:hidden) */}
      <MobileNav />
    </div>
  );
}
