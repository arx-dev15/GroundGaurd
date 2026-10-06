'use client';

import React, { useState } from 'react';
import { FileText, ArrowRight, Play, CheckCircle2, ChevronDown, Sparkles } from 'lucide-react';
import { PUMP_STATION_ALPHA } from '../../data/productScenario';

interface ProductHeroOverlayProps {
  onRunVerifiedAnswer: () => void;
  onSelectQuestion?: (q: string) => void;
  selectedQuestion: string;
}

export const ProductHeroOverlay: React.FC<ProductHeroOverlayProps> = ({
  onRunVerifiedAnswer,
  onSelectQuestion,
  selectedQuestion,
}) => {
  const [showQuestionPicker, setShowQuestionPicker] = useState(false);

  return (
    <div className="relative w-full max-w-lg pointer-events-auto select-none pl-2 animate-fade-in text-slate-900">
      {/* Brand & Value Proposition */}
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200/80 text-sky-800 text-[11px] font-semibold mb-3 shadow-xs">
        <Sparkles className="w-3.5 h-3.5 text-sky-600" />
        <span>Verification-Driven Engineering Intelligence</span>
      </div>

      <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-2">
        GROUNDGUARD
      </h1>

      <p className="text-sm md:text-base font-medium text-slate-600 mb-5 leading-relaxed">
        Give GroundGuard project documents, ask an engineering question, and receive an answer it can prove.
      </p>

      {/* Project & Documents Container */}
      <div className="bg-white/85 backdrop-blur-md rounded-2xl p-4 border border-slate-200/80 shadow-md mb-4 space-y-3">
        {/* Project Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
              Active Project
            </div>
            <div className="text-xs font-bold text-slate-800">
              {PUMP_STATION_ALPHA.projectName}
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-mono font-semibold text-slate-600">
            {PUMP_STATION_ALPHA.projectCode}
          </span>
        </div>

        {/* 3 Connected Documents */}
        <div>
          <div className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center justify-between">
            <span>3 Engineering Documents Connected</span>
            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Indexed
            </span>
          </div>
          <div className="space-y-1.5">
            {PUMP_STATION_ALPHA.documents.map((doc, idx) => (
              <div
                key={doc.id}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                  idx === 0
                    ? 'bg-sky-50/80 border border-sky-200/60 text-slate-800 font-medium'
                    : 'bg-slate-50/80 border border-slate-200/40 text-slate-600'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${idx === 0 ? 'text-sky-600' : 'text-slate-400'}`} />
                  <span className="truncate">{doc.filename}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 flex-shrink-0 ml-2">
                  {doc.size}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Question Selector & Input Field */}
        <div className="pt-1">
          <div className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center justify-between">
            <span>Ask GroundGuard</span>
            <button
              onClick={() => setShowQuestionPicker(!showQuestionPicker)}
              className="text-[10px] font-medium text-sky-600 hover:text-sky-700 flex items-center gap-0.5"
            >
              <span>Sample Questions</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          <div className="relative">
            <div className="w-full px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium leading-snug shadow-inner">
              {selectedQuestion}
            </div>

            {/* Dropdown for Sample Questions */}
            {showQuestionPicker && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 space-y-1">
                {PUMP_STATION_ALPHA.sampleQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      onSelectQuestion?.(q);
                      setShowQuestionPicker(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      q === selectedQuestion ? 'bg-sky-50 text-sky-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Primary CTA Button */}
        <button
          onClick={onRunVerifiedAnswer}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs tracking-wide shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
        >
          <Play className="w-3.5 h-3.5 text-sky-400 fill-sky-400" />
          <span>RUN VERIFIED ANSWER</span>
          <ArrowRight className="w-3.5 h-3.5 ml-1 text-slate-400" />
        </button>
      </div>

      <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400 tracking-wide">
        <span>Scroll to step through</span>
        <span>•</span>
        <span>Drag to rotate Sentinel</span>
      </div>
    </div>
  );
};
