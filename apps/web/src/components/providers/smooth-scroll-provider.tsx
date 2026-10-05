'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const lenisRef = React.useRef<Lenis | null>(null);
  const pathname = usePathname();
  // Project dashboard pages (/projects/[projectId]/...) use their own container-level Lenis instance
  const isProjectDashboard = pathname?.includes('/projects/') && pathname !== '/projects';

  React.useEffect(() => {
    // Check reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    // On project dashboard pages, let AppShellLayout manage the dedicated container Lenis instance
    if (isProjectDashboard) {
      if (lenisRef.current) {
        lenisRef.current.destroy();
        lenisRef.current = null;
      }
      return;
    }

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.5,
      allowNestedScroll: true,
      prevent: (node) => {
        return !!(
          node.closest?.('main') ||
          node.closest?.('[data-lenis-prevent]') ||
          node.closest?.('nav') ||
          node.closest?.('aside') ||
          node.closest?.('[role="dialog"]')
        );
      },
    });

    lenisRef.current = lenis;

    // Synchronize Lenis scroll position with GSAP ScrollTrigger
    lenis.on('scroll', ScrollTrigger.update);

    const rafHandler = (time: number) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(rafHandler);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(rafHandler);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [isProjectDashboard]);

  return <>{children}</>;
}
