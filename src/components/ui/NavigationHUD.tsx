'use client';

import React from 'react';
import { StoryChapter } from '../../types/architecture';
import { ShieldCheck, Play, Code2, AlertTriangle, Layers } from 'lucide-react';

interface NavigationHUDProps {
  chapters: StoryChapter[];
  currentChapterIndex: number;
  onSelectChapter: (index: number) => void;
  onOpenArchitectureMap: () => void;
  onStartLiveFlow: () => void;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
  underTheHood: boolean;
  onToggleUnderTheHood: () => void;
  demoConflict: boolean;
  onToggleDemoConflict: () => void;
}

export const NavigationHUD: React.FC<NavigationHUDProps> = ({
  chapters,
  currentChapterIndex,
  onSelectChapter,
  onOpenArchitectureMap,
  onStartLiveFlow,
  reducedMotion,
  onToggleReducedMotion,
  underTheHood,
  onToggleUnderTheHood,
  demoConflict,
  onToggleDemoConflict,
}) => {
  return (
    <>
      {/* Top Header Bar: Clean, Minimal, Light Product Design */}
      <header className="fixed top-0 left-0 right-0 z-40 px-6 py-3.5 flex items-center justify-between pointer-events-auto bg-white/85 backdrop-blur-md border-b border-slate-200/60 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
        {/* Left: Brand & Product Scope */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white shadow-sm">
            <ShieldCheck className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-wider text-slate-900 uppercase">
                GroundGuard
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">
                PROTOTYPE
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              Verification-Driven Engineering Intelligence
            </div>
          </div>
        </div>

        {/* Right: Product Controls & Layer Toggles */}
        <div className="flex items-center gap-2.5">
          {/* Layer 3: Under The Hood Toggle */}
          <button
            onClick={onToggleUnderTheHood}
            title={underTheHood ? 'Hide technical engine names' : 'Show technical engine names (Layer 3)'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              underTheHood
                ? 'bg-sky-50 border-sky-300 text-sky-900 shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Under The Hood</span>
          </button>

          {/* Presenter Demo Conflict Toggle */}
          <button
            onClick={onToggleDemoConflict}
            title={demoConflict ? 'Conflict mode active (15.2 ≠ 12.5 bar -> Recovery)' : 'Immediate pass mode active'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              demoConflict
                ? 'bg-amber-50/80 border-amber-300 text-amber-900 shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
            }`}
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${demoConflict ? 'text-amber-600' : 'text-slate-400'}`} />
            <span>Demo Conflict</span>
          </button>

          {/* Replay Full Customer Journey Flow */}
          <button
            onClick={onStartLiveFlow}
            title="Watch GroundGuard execute full verified engineering lifecycle"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
          >
            <Play className="w-3.5 h-3.5 text-sky-400 fill-sky-400" />
            <span>Replay Flow</span>
          </button>
        </div>
      </header>

      {/* Hero Scroll Invitation (Clean & Subtle) */}
      {currentChapterIndex === 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex flex-col items-center gap-1.5">
          <div className="text-xs font-semibold text-slate-400 tracking-wide uppercase text-[10px]">
            Scroll to step through customer journey ↓
          </div>
          <div className="w-4 h-6 rounded-full border border-slate-300 flex items-start justify-center p-1">
            <div className="w-1 h-1.5 bg-slate-400 rounded-full animate-bounce" />
          </div>
        </div>
      )}
    </>
  );
};
