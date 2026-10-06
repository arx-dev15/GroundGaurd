'use client';

import React from 'react';
import { X, CheckCircle2, AlertTriangle, FileText, ArrowDown, History, ExternalLink } from 'lucide-react';
import { PUMP_STATION_ALPHA } from '../../data/productScenario';

interface EvidenceLensModalProps {
  claimId: string | null;
  onClose: () => void;
}

export const EvidenceLensModal: React.FC<EvidenceLensModalProps> = ({
  claimId,
  onClose,
}) => {
  if (!claimId) return null;

  const claim = PUMP_STATION_ALPHA.claims.find(c => c.id === claimId);
  if (!claim) return null;

  const isRecovered = claim.status === 'recovered';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs select-none pointer-events-auto animate-fade-in">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">
                Evidence Lens • {claim.claimNumber}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                isRecovered ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}>
                {claim.status === 'recovered' ? 'Recovered & Verified' : 'Verified'}
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-900 leading-snug">
              {claim.statement}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source Document Citation */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <div className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-sky-600" />
              <span>{claim.sourceDoc}</span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">Page {claim.sourcePage}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-800 leading-relaxed shadow-inner">
            <span className="text-slate-400 select-none mr-2">L34:</span>
            <mark className="bg-sky-100 text-sky-950 font-semibold px-1 rounded">
              {claim.id === 'claim-1' ? 'Rated flow: 120 m³/h' : 'Maximum discharge pressure: 12.5 bar'}
            </mark>
            <span className="text-slate-500"> (Pump curve ref: PC-101A-Rev2)</span>
          </div>
        </div>

        {/* Recovery Audit Trail (For Claim 02) */}
        {isRecovered && claim.recoveryAudit && (
          <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <History className="w-4 h-4 text-amber-600" />
              <span>Recovery Audit History</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-amber-200/50">
                <span className="text-slate-500">1. Imperfect Model Draft</span>
                <span className="font-mono font-semibold text-rose-600">15.2 bar</span>
              </div>
              <div className="flex justify-center text-amber-600">
                <ArrowDown className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-rose-200 bg-rose-50/30">
                <span className="text-rose-900 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                  <span>2. Contradiction Detected</span>
                </span>
                <span className="text-[11px] font-mono text-rose-700">15.2 ≠ 12.5 bar</span>
              </div>
              <div className="flex justify-center text-amber-600">
                <ArrowDown className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-amber-200 bg-amber-50/30">
                <span className="text-amber-900 font-medium">3. Targeted Spinal Recovery</span>
                <span className="font-mono font-semibold text-amber-800">Retrieved 12.5 bar</span>
              </div>
              <div className="flex justify-center text-emerald-600">
                <ArrowDown className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-emerald-200 bg-emerald-50/50">
                <span className="text-emerald-900 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>4. Reverified Result</span>
                </span>
                <span className="font-mono font-bold text-emerald-700">12.5 bar [RECOVERED]</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
          <span>Fail-Closed Deterministic Boundary</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors"
          >
            Close Lens
          </button>
        </div>
      </div>
    </div>
  );
};
