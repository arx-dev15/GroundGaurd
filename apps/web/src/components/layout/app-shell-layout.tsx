'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
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
  const { isDesktop, currentSection } = useShell();
  const isAskPage = currentSection === 'ask';

  const mainRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const lenisRef = React.useRef<Lenis | null>(null);

  // Dedicated Lenis smooth scroll instance for dashboard main content area
  React.useEffect(() => {
    if (isAskPage || !mainRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const mainEl = mainRef.current;
    const contentEl = contentRef.current;

    const lenis = new Lenis({
      wrapper: mainEl,
      content: contentEl || undefined,
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.5,
      autoResize: true,
      prevent: (node) => {
        return !!(
          node.closest?.('[data-lenis-prevent]') ||
          node.closest?.('textarea') ||
          node.closest?.('input') ||
          node.closest?.('[role="dialog"]')
        );
      },
    });

    lenisRef.current = lenis;

    // Synchronize with ScrollTrigger if registered
    if (typeof window !== 'undefined') {
      lenis.on('scroll', ScrollTrigger.update);
    }

    const rafHandler = (time: number) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(rafHandler);

    return () => {
      gsap.ticker.remove(rafHandler);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [isAskPage]);

  // Reset scroll to top on dashboard section navigation
  React.useEffect(() => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { immediate: true });
    } else if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [currentSection]);

  return (
    <div className={cn('min-h-screen bg-background text-foreground flex overflow-hidden', className)}>
      {/* 1. Desktop / Tablet Sidebar (hidden on mobile) */}
      <div className="hidden md:flex shrink-0" data-lenis-prevent>
        <AppSidebar />
      </div>

      {/* 2. Main Content Workspace */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        {/* Minimal Top Bar */}
        <AppHeader actions={headerActions} />

        {/* Scrollable Page Body with Lenis smooth scroll */}
        <main
          ref={mainRef}
          className={cn(
            'flex-1 overflow-y-auto',
            isAskPage ? 'p-0 pb-0 overflow-hidden flex flex-col' : 'pb-20 md:pb-6 p-4 sm:p-6 lg:p-8'
          )}
        >
          {isAskPage ? (
            <div className="w-full h-full flex-1 flex flex-col">{children}</div>
          ) : (
            <div ref={contentRef} className="mx-auto max-w-6xl w-full animate-in fade-in duration-200">
              {children}
            </div>
          )}
        </main>
      </div>

      {/* 3. Docked Right Inspector (Only outside Ask page, since Ask has contextual claim inspector) */}
      {!isAskPage && (
        <div data-lenis-prevent className="shrink-0 flex h-screen sticky top-0">
          <AppInspector />
        </div>
      )}

      {/* 4. Global Command Palette (⌘K) */}
      <CommandPalette />

      {/* 5. Mobile Navigation & Drawer (md:hidden) */}
      <MobileNav />
    </div>
  );
}
