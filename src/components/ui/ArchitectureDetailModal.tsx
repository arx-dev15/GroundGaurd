'use client';

import React from 'react';
import { SubsystemType } from '../../types/architecture';
import { SUBSYSTEM_DETAILS } from '../../data/architectureData';
import { X, CheckCircle, Shield, Brain, Heart, Network, Database, ArrowRight, CornerDownRight } from 'lucide-react';

interface ArchitectureDetailModalProps {
  selectedSubsystem: SubsystemType | null;
  onClose: () => void;
  onSelectSubsystem: (subsystem: SubsystemType) => void;
}

export const ArchitectureDetailModal: React.FC<ArchitectureDetailModalProps> = ({
  selectedSubsystem,
  onClose,
  onSelectSubsystem,
}) => {
  if (!selectedSubsystem) return null;

  const detail = SUBSYSTEM_DETAILS[selectedSubsystem] || SUBSYSTEM_DETAILS.sentinel;

  const subsystemsList: { id: SubsystemType; name: string; icon: any }[] = [
    { id: 'sentinel', name: 'Sentinel Overview', icon: Shield },
    { id: 'brain', name: 'Brain (M2 RAG)', icon: Brain },
    { id: 'trust_core', name: 'Trust Core (M1 Verifier)', icon: Heart },
    { id: 'spine', name: 'Spine (M3 Nervous)', icon: Network },
    { id: 'knowledge', name: 'Knowledge Chamber', icon: Database },
    { id: 'left_arm', name: 'Input / Ingestion', icon: ArrowRight },
    { id: 'right_arm', name: 'Trusted Output', icon: CheckCircle },
    { id: 'recovery', name: 'Recovery Subsystem', icon: CornerDownRight },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md pointer-events-auto">
      <div className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 md:p-8 relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Subsystem Switcher Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 border-b border-slate-100">
          {subsystemsList.map((item) => {
            const isSelected = item.id === selectedSubsystem;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onSelectSubsystem(item.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-sans font-medium whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.name}
              </button>
            );
          })}
        </div>

        {/* Header Info */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2.5 py-1 text-xs font-mono font-bold text-cyan-800 bg-cyan-50 border border-cyan-200 rounded">
              {detail.code}
            </span>
            <span className="text-xs font-sans text-slate-500 uppercase tracking-wider">
              {detail.role}
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            {detail.name}
          </h2>
          <p className="mt-2 text-sm md:text-base text-slate-600 leading-relaxed">
            {detail.description}
          </p>
        </div>

        {/* Grid of Components and Responsibilities */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6 pt-6 border-t border-slate-100">
          {/* Subsystem Modules */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <h3 className="text-xs font-sans font-bold text-slate-900 uppercase tracking-wider mb-3">
              Engineered Components
            </h3>
            <ul className="space-y-2">
              {detail.components.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-xs md:text-sm text-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* System Responsibilities */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <h3 className="text-xs font-sans font-bold text-slate-900 uppercase tracking-wider mb-3">
              System Invariants & Guarantees
            </h3>
            <ul className="space-y-2">
              {detail.responsibilities.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-xs md:text-sm text-slate-700">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Metaphor Clarification Notice */}
        <div className="mt-6 p-4 rounded-xl bg-cyan-50/60 border border-cyan-100 text-xs text-cyan-900/80 leading-relaxed">
          Architectural Invariant: GroundGuard operates on a fail-closed verification loop. Candidate evidence retrieval never equates to factual truth until verified through the Trust Core.
        </div>
      </div>
    </div>
  );
};
