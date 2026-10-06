'use client';

import React from 'react';
import { StoryChapter } from '../../types/architecture';
import { ShieldCheck, Cpu, Database, Heart, Layers, ArrowRight } from 'lucide-react';

interface FallbackExperienceProps {
  chapters: StoryChapter[];
  onSelectChapter: (index: number) => void;
  currentIndex: number;
}

export const FallbackExperience: React.FC<FallbackExperienceProps> = ({
  chapters,
  onSelectChapter,
  currentIndex,
}) => {
  const current = chapters[currentIndex] || chapters[0];

  return (
    <div className="min-h-screen bg-[#06070a] text-slate-200 p-6 md:p-12 max-w-5xl mx-auto">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-6 border-b border-white/10 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-widest uppercase">GroundGuard Architecture</h1>
            <p className="text-xs font-mono text-slate-400">Static / 2D High-Reliability Mode</p>
          </div>
        </div>
        <span className="px-3 py-1 rounded bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-mono">
          WebGL Fallback Active
        </span>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Chapters Navigation */}
        <div className="space-y-2">
          <h2 className="text-xs font-mono text-cyan-400 uppercase tracking-widest mb-3">Architecture Chapters</h2>
          <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-2">
            {chapters.map((ch, idx) => (
              <button
                key={ch.id}
                onClick={() => onSelectChapter(idx)}
                className={`w-full text-left p-3 rounded-xl border text-xs font-mono transition-all ${
                  idx === currentIndex
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-white'
                    : 'bg-slate-900/40 border-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-[10px] text-cyan-400/80">{ch.phaseCode}</div>
                <div className="font-bold text-slate-200 mt-0.5">{ch.title}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Selected Chapter Focus */}
        <div className="lg:col-span-2 glass-panel-glow rounded-3xl p-8 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/30 text-xs font-mono text-cyan-300">
              {current.phaseCode}
            </span>
            <span className="text-xs font-mono text-slate-400 uppercase">{current.act}</span>
          </div>

          <h3 className="text-3xl font-extrabold text-white mb-2">{current.title}</h3>
          <p className="text-sm font-medium text-cyan-400 mb-6">{current.subtitle}</p>

          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            {current.summary}
          </p>

          <div className="space-y-3 p-4 rounded-xl bg-slate-900/60 border border-white/5 mb-6">
            <div className="text-xs font-mono text-cyan-300 uppercase tracking-wider">Key Invariants</div>
            {current.keyConcepts.map((kc, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                {kc}
              </div>
            ))}
          </div>

          {current.metrics && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
              {current.metrics.map((m, i) => (
                <div key={i} className="p-3 rounded-lg bg-black/40 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">{m.label}</div>
                  <div className="text-sm font-bold font-mono text-cyan-300 mt-1">{m.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
