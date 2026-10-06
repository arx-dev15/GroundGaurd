'use client';

import * as React from 'react';
import { Activity, ShieldCheck, AlertTriangle, Layers, Info } from 'lucide-react';
import type { EvidenceSignal } from '@/lib/overview-helpers';

interface EvidenceSignalsProps {
  signals: EvidenceSignal[];
}

export function EvidenceSignals({ signals }: EvidenceSignalsProps) {
  if (signals.length === 0) return null;

  return (
    <div className="space-y-3 select-none" role="region" aria-label="Evidence signals">
      {/* Editorial Title */}
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
            Evidence signals
          </h2>
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          What stands out right now
        </span>
      </div>

      {/* Structured Signal Observation Blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {signals.map((signal) => (
          <div
            key={signal.id}
            className="p-3.5 sm:p-4 rounded-xl border border-border/40 bg-card/40 space-y-1.5 transition-all duration-150 hover:bg-card/60"
          >
            <div className="flex items-start gap-2.5">
              <span
                className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                  signal.type === 'verified'
                    ? 'bg-emerald-400'
                    : signal.type === 'recovered'
                    ? 'bg-sky-400'
                    : signal.type === 'attention'
                    ? 'bg-amber-400'
                    : 'bg-primary'
                }`}
              />
              <div className="space-y-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-foreground leading-snug">
                  {signal.statement}
                </p>
                {signal.detail && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {signal.detail}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
