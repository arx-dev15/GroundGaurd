'use client';

import React, { useState, useEffect } from 'react';
import { SubsystemType } from '../../types/architecture';
import { Play, Pause, RotateCcw, X } from 'lucide-react';

interface LiveFlowControllerProps {
  isOpen: boolean;
  onClose: () => void;
  onStepChange?: (stepIndex: number, chapterId: string, subsystem: SubsystemType) => void;
}

export interface CinematicStep {
  step: number;
  chapterId: string;
  subsystem: SubsystemType;
  label: string;
  description: string;
  durationMs: number;
}

export const CINEMATIC_TIMELINE: CinematicStep[] = [
  {
    step: 1,
    chapterId: '02_build_knowledge',
    subsystem: 'left_arm',
    label: 'INGESTION',
    description: 'P-101A Datasheet docks at left palm, decomposes into structured chunks',
    durationMs: 4400,
  },
  {
    step: 2,
    chapterId: '03_ask',
    subsystem: 'spine',
    label: 'ASK QUESTION',
    description: 'Query routes via central spinal bus to intelligence core',
    durationMs: 3600,
  },
  {
    step: 3,
    chapterId: '04_find_evidence',
    subsystem: 'brain',
    label: 'FIND EVIDENCE',
    description: 'Dense, exact & relation search, RRF fusion, FlashRank gate, draft synthesis',
    durationMs: 4800,
  },
  {
    step: 4,
    chapterId: '05_verify',
    subsystem: 'trust_core',
    label: 'VERIFY CLAIMS',
    description: 'Claim 01 passes green; Claim 02 triggers conflict (15.2 ≠ 12.5 bar) and is blocked red',
    durationMs: 4800,
  },
  {
    step: 5,
    chapterId: '06_recover',
    subsystem: 'trust_core',
    label: 'RECOVERY LOOP',
    description: 'Blocked claim ascends spine, targeted retrieval corrects to 12.5 bar, reverifies to green',
    durationMs: 5000,
  },
  {
    step: 6,
    chapterId: '07_inspect_answer',
    subsystem: 'right_arm',
    label: 'TRUSTED ANSWER',
    description: 'Verified payload flows down right arm to palm, ready for customer evidence inspection',
    durationMs: 5400,
  },
];

export const LiveFlowController: React.FC<LiveFlowControllerProps> = ({
  isOpen,
  onClose,
  onStepChange,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentStepIndex(0);
    setIsPlaying(true);
    const firstStep = CINEMATIC_TIMELINE[0];
    onStepChange?.(0, firstStep.chapterId, firstStep.subsystem);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isPlaying) return;

    const currentStep = CINEMATIC_TIMELINE[currentStepIndex];
    const timer = setTimeout(() => {
      if (currentStepIndex < CINEMATIC_TIMELINE.length - 1) {
        const next = currentStepIndex + 1;
        setCurrentStepIndex(next);
        const nextStep = CINEMATIC_TIMELINE[next];
        onStepChange?.(next, nextStep.chapterId, nextStep.subsystem);
      } else {
        setIsPlaying(false);
      }
    }, currentStep.durationMs);

    return () => clearTimeout(timer);
  }, [isOpen, isPlaying, currentStepIndex, onStepChange]);

  if (!isOpen) return null;

  const currentStep = CINEMATIC_TIMELINE[currentStepIndex];

  return (
    <div className="fixed bottom-6 right-6 z-50 pointer-events-auto select-none">
      {/* Discreet Cinematic Minimal Pill: Replay / Pause / Exit */}
      <div className="bg-slate-900/85 backdrop-blur-md rounded-full px-4 py-2 border border-slate-700/50 shadow-xl flex items-center gap-3 text-white">
        <span className="text-[11px] font-bold tracking-widest text-sky-400 uppercase">
          {currentStep.label}
        </span>
        <div className="w-px h-3 bg-slate-700" />
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-1 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => {
            setCurrentStepIndex(0);
            setIsPlaying(true);
            const firstStep = CINEMATIC_TIMELINE[0];
            onStepChange?.(0, firstStep.chapterId, firstStep.subsystem);
          }}
          className="p-1 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          title="Restart Flow"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          title="Exit Cinematic Flow"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
