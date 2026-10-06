'use client';

import React from 'react';
import { StoryChapter } from '../../types/architecture';
import { CheckCircle2, RefreshCw, FileSearch, ArrowRight, ShieldCheck } from 'lucide-react';
import { ProductHeroOverlay } from './ProductHeroOverlay';
import { PUMP_STATION_ALPHA } from '../../data/productScenario';

interface ChapterOverlayProps {
  chapter: StoryChapter;
  onExploreSubsystem?: (subsystem: string) => void;
  onStartLiveFlow?: () => void;
  onInspectClaim?: (claimId: string) => void;
  underTheHood?: boolean;
}

export const ChapterOverlay: React.FC<ChapterOverlayProps> = ({
  chapter,
  onExploreSubsystem,
  onStartLiveFlow,
  onInspectClaim,
  underTheHood = false,
}) => {
  // Movement I: Customer Hero Layer
  if (chapter.index === 0) {
    return (
      <ProductHeroOverlay
        onRunVerifiedAnswer={() => onStartLiveFlow?.()}
        selectedQuestion={PUMP_STATION_ALPHA.primaryQuestion}
      />
    );
  }

  // Final Step: Inspect Trusted Answer (Layer 1 + Interactive Evidence Lens)
  if (chapter.id === '07_inspect_answer') {
    return (
      <div className="relative w-full max-w-md pointer-events-auto select-none pl-2 animate-fade-in text-slate-900">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold mb-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>GROUNDGUARD VERIFIED</span>
        </div>

        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 mb-1">
          {PUMP_STATION_ALPHA.finalResponse.equipmentTag} Verified Response
        </h2>

        <p className="text-xs md:text-sm font-medium text-slate-600 mb-4 leading-relaxed">
          Evidence-backed engineering intelligence. Click any claim to inspect source provenance and recovery history.
        </p>

        {/* Interactive Claim Cards with Evidence Lens Trigger */}
        <div className="space-y-2 mb-4">
          {PUMP_STATION_ALPHA.claims.map((claim) => (
            <button
              key={claim.id}
              onClick={() => onInspectClaim?.(claim.id)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-white/90 hover:bg-white border border-slate-200 hover:border-sky-300 shadow-sm hover:shadow-md transition-all text-left group"
            >
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                  {claim.claimNumber} • {claim.sourceDoc} (P.{claim.sourcePage})
                </div>
                <div className="text-xs font-semibold text-slate-800 group-hover:text-sky-950">
                  {claim.statement}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  claim.status === 'recovered'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {claim.status === 'recovered' ? 'Recovered' : 'Verified'}
                </span>
                <FileSearch className="w-4 h-4 text-slate-400 group-hover:text-sky-600 transition-colors" />
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onStartLiveFlow}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-all shadow-sm"
          >
            <RefreshCw className="w-3 h-3" /> Replay Product Flow
          </button>
        </div>
      </div>
    );
  }

  // Intermediate Customer Steps (02 to 06)
  const keywords = chapter.keyConcepts.slice(0, 3);

  // Under-the-hood technical engine mapping
  const technicalTag = 
    chapter.id === '02_build_knowledge'
      ? 'PostgreSQL • Qdrant • Tantivy • NetworkX'
      : chapter.id === '03_ask'
      ? 'M3 Control Bus • Scope Boundary'
      : chapter.id === '04_find_evidence'
      ? 'Hybrid Search • RRF Fusion • FlashRank • Gemini Draft'
      : chapter.id === '05_verify'
      ? 'DeBERTa NLI • Deterministic Verification Gate'
      : chapter.id === '06_recover'
      ? 'Spinal Recovery Loop • Targeted Retrieval'
      : null;

  return (
    <div className="relative w-full max-w-xs md:max-w-sm pointer-events-auto select-none pl-1 transition-all duration-500 text-slate-900">
      {/* Small Eyebrow */}
      <div className="text-[11px] font-bold text-sky-600 tracking-widest uppercase mb-1">
        {chapter.phaseCode}
      </div>

      {/* Section Title */}
      <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 mb-1.5">
        {chapter.title}
      </h2>

      {/* One Crisp Sentence */}
      <p className="text-xs md:text-sm font-medium text-slate-600 mb-3 leading-relaxed">
        {chapter.subtitle}
      </p>

      {/* 3 Compact Keywords (Dot-separated) */}
      <div className="flex items-center flex-wrap gap-1.5 text-xs text-slate-500 font-medium mb-3">
        {keywords.map((word, idx) => (
          <React.Fragment key={idx}>
            <span className="text-slate-700">{word}</span>
            {idx < keywords.length - 1 && <span className="text-slate-300">•</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Optional Under-The-Hood Technical Tag */}
      {underTheHood && technicalTag && (
        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-600 mb-3">
          <span>Engine: {technicalTag}</span>
        </div>
      )}
    </div>
  );
};
