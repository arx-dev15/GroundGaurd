'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { STORY_CHAPTERS } from '../data/storyChapters';
import { SubsystemType } from '../types/architecture';
import { NavigationHUD } from '../components/ui/NavigationHUD';
import { ChapterOverlay } from '../components/ui/ChapterOverlay';
import { LiveFlowController } from '../components/ui/LiveFlowController';
import { ArchitectureDetailModal } from '../components/ui/ArchitectureDetailModal';
import { EvidenceLensModal } from '../components/ui/EvidenceLensModal';
import { FallbackExperience } from '../components/ui/FallbackExperience';

// Dynamically import GroundGuardCanvas to avoid SSR WebGL issues
const GroundGuardCanvas = dynamic(
  () => import('../components/scene/GroundGuardCanvas').then((mod) => mod.GroundGuardCanvas),
  { ssr: false }
);

export default function GroundGuardExperiencePage() {
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [cinematicChapterIndex, setCinematicChapterIndex] = useState<number | null>(null);
  const [explodeProgress, setExplodeProgress] = useState(0);
  const [isLiveFlowOpen, setIsLiveFlowOpen] = useState(false);
  const [selectedSubsystem, setSelectedSubsystem] = useState<SubsystemType | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [webGLSupported, setWebGLSupported] = useState(true);
  const [underTheHood, setUnderTheHood] = useState(false);
  const [demoConflict, setDemoConflict] = useState(true);
  const [inspectedClaimId, setInspectedClaimId] = useState<string | null>(null);

  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  // Check WebGL support on mount
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebGLSupported(false);
      }
    } catch (e) {
      setWebGLSupported(false);
    }
  }, []);

  // Check system prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mediaQuery.matches) {
        setReducedMotion(true);
      }
    }
  }, []);

  // Smooth scroll to chapter
  const scrollToChapter = useCallback((index: number) => {
    const el = sectionRefs.current[index];
    if (el) {
      el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, [reducedMotion]);

  // Master scroll listener to compute chapter index
  useEffect(() => {
    if (isLiveFlowOpen) return; // When cinematic mode is on, scroll does not override

    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const totalHeight = document.documentElement.scrollHeight - windowHeight;

      if (totalHeight <= 0) return;

      let activeIndex = 0;
      sectionRefs.current.forEach((el, idx) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.top <= windowHeight * 0.45 && rect.bottom >= windowHeight * 0.45) {
          activeIndex = idx;
        }
      });

      setCurrentChapterIndex(activeIndex);
      const targetExplode = STORY_CHAPTERS[activeIndex]?.explodeProgress ?? 0;
      setExplodeProgress(targetExplode);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLiveFlowOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (isLiveFlowOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        const next = Math.min(STORY_CHAPTERS.length - 1, currentChapterIndex + 1);
        scrollToChapter(next);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        const prev = Math.max(0, currentChapterIndex - 1);
        scrollToChapter(prev);
      } else if (e.key === 'Home') {
        e.preventDefault();
        scrollToChapter(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        scrollToChapter(STORY_CHAPTERS.length - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentChapterIndex, scrollToChapter, isLiveFlowOpen]);

  // Fallback for non-WebGL environments
  if (!webGLSupported) {
    return (
      <FallbackExperience
        chapters={STORY_CHAPTERS}
        currentIndex={currentChapterIndex}
        onSelectChapter={scrollToChapter}
      />
    );
  }

  // Active chapter driven either by cinematic timeline or scroll
  const activeIndex = isLiveFlowOpen && cinematicChapterIndex !== null
    ? cinematicChapterIndex
    : currentChapterIndex;

  const currentChapter = STORY_CHAPTERS[activeIndex] || STORY_CHAPTERS[0];

  return (
    <main className="relative bg-[#fafafb] text-slate-900 min-h-screen">
      {/* Persistent WebGL 3D Canvas */}
      <GroundGuardCanvas
        currentChapter={currentChapter}
        explodeProgress={explodeProgress}
        liveFlowActive={isLiveFlowOpen}
        demoConflict={demoConflict}
      />

      {/* Top Header Navigation HUD (Discreetly hides when live flow is active) */}
      {!isLiveFlowOpen && (
        <NavigationHUD
          chapters={STORY_CHAPTERS}
          currentChapterIndex={currentChapterIndex}
          onSelectChapter={scrollToChapter}
          onOpenArchitectureMap={() => setSelectedSubsystem('sentinel')}
          onStartLiveFlow={() => setIsLiveFlowOpen(true)}
          reducedMotion={reducedMotion}
          onToggleReducedMotion={() => setReducedMotion(!reducedMotion)}
          underTheHood={underTheHood}
          onToggleUnderTheHood={() => setUnderTheHood(!underTheHood)}
          demoConflict={demoConflict}
          onToggleDemoConflict={() => setDemoConflict(!demoConflict)}
        />
      )}

      {/* Scroll Sections Container (Hidden completely during Cinematic Replay Flow) */}
      {!isLiveFlowOpen && (
        <div className="relative z-10 w-full pointer-events-none">
          {STORY_CHAPTERS.map((ch, idx) => {
            const isLeftFocused = ch.highlightSubsystem === 'left_arm';
            const isRightFocused = ch.highlightSubsystem === 'right_arm';
            const justifyClass = isRightFocused ? 'justify-start' : 'justify-end';

            return (
              <section
                key={ch.id}
                ref={(el) => { sectionRefs.current[idx] = el; }}
                id={`chapter-${ch.id}`}
                className={`min-h-screen w-full flex items-center ${justifyClass} px-6 md:px-14 lg:px-20 py-20 pointer-events-none`}
              >
                {/* Lightweight Editorial Typography */}
                <div className={`transition-all duration-700 pointer-events-auto ${
                  idx === currentChapterIndex ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                }`}>
                  <ChapterOverlay
                    chapter={ch}
                    onExploreSubsystem={(sub) => setSelectedSubsystem(sub as SubsystemType)}
                    onStartLiveFlow={() => setIsLiveFlowOpen(true)}
                    onInspectClaim={(claimId) => setInspectedClaimId(claimId)}
                    underTheHood={underTheHood}
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Interactive Cinematic Live Flow Controller */}
      <LiveFlowController
        isOpen={isLiveFlowOpen}
        onClose={() => {
          setIsLiveFlowOpen(false);
          setCinematicChapterIndex(null);
        }}
        onStepChange={(step, chapterId, subsystem) => {
          const chIdx = STORY_CHAPTERS.findIndex(c => c.id === chapterId);
          if (chIdx !== -1) {
            setCinematicChapterIndex(chIdx);
          }
        }}
      />

      {/* Deep-Dive Subsystem Architecture Modal */}
      <ArchitectureDetailModal
        selectedSubsystem={selectedSubsystem}
        onClose={() => setSelectedSubsystem(null)}
        onSelectSubsystem={(sub) => setSelectedSubsystem(sub)}
      />

      {/* Interactive Customer Evidence Lens Modal */}
      <EvidenceLensModal
        claimId={inspectedClaimId}
        onClose={() => setInspectedClaimId(null)}
      />
    </main>
  );
}
