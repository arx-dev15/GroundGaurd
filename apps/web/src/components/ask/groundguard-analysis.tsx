'use client';

import * as React from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertTriangle,
  HelpCircle,
  FileText,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Layers,
  Database,
  Cpu,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Claim, EvidenceItem, GenerationStatus } from '@groundguard/types';

interface LiveStage {
  id: string;
  label: string;
  status: 'completed' | 'active' | 'pending';
}

interface GroundGuardAnalysisProps {
  mode: 'live' | 'completed';
  currentStage?: string;
  claims?: Claim[];
  evidence?: EvidenceItem[];
  generationStatus?: GenerationStatus;
  generationMetadata?: Record<string, unknown>;
  modelVersion?: string;
  className?: string;
}

export function GroundGuardAnalysis({
  mode,
  currentStage = 'Searching project knowledge...',
  claims = [],
  evidence = [],
  generationStatus = 'completed',
  generationMetadata,
  modelVersion,
  className,
}: GroundGuardAnalysisProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Derive real counts for completed mode
  const totalClaims = claims.length;
  const verifiedCount = claims.filter((c) => c.status === 'verified').length;
  const recoveredCount = claims.filter((c) => c.status === 'recovered').length;
  const contradictedCount = claims.filter((c) => c.status === 'flagged').length;
  const reviewCount = claims.filter((c) => c.status === 'needs_review').length;

  const uniqueDocs = React.useMemo(() => {
    const set = new Set<string>();
    evidence.forEach((e) => {
      const name = (e as any).filename || e.documentId;
      if (name) set.add(name);
    });
    return Array.from(set);
  }, [evidence]);

  const sourceCount = uniqueDocs.length > 0 ? uniqueDocs.length : (evidence.length > 0 ? 1 : 0);
  const evidenceCount = evidence.length;

  // Determine real recovery attempts if recorded
  const recoveryAttempted = claims.some(
    (c) => c.status === 'recovered' || (c as any).recoveryAttemptsCount > 0
  );

  // Derive observable high-level explanation
  const highLevelExplanation = React.useMemo(() => {
    if (totalClaims === 0) return null;
    if (verifiedCount === totalClaims) {
      return `GroundGuard verified all ${totalClaims} factual claims against project documentation.`;
    }
    if (recoveredCount > 0 && verifiedCount + recoveredCount === totalClaims) {
      return `GroundGuard verified ${verifiedCount} claims and successfully repaired ${recoveredCount} claim against project evidence.`;
    }
    if (contradictedCount > 0) {
      return `GroundGuard identified ${contradictedCount} statement that conflicts with project documentation.`;
    }
    if (reviewCount > 0) {
      return `GroundGuard could not verify ${reviewCount} statement due to insufficient evidence in the project documentation.`;
    }
    return `GroundGuard verified ${verifiedCount} of ${totalClaims} claims against retrieved project evidence.`;
  }, [totalClaims, verifiedCount, recoveredCount, contradictedCount, reviewCount]);

  // LIVE STAGE VIEW (during active generation/verification)
  if (mode === 'live') {
    const isVerifying = currentStage.toLowerCase().includes('verifying') || currentStage.toLowerCase().includes('checking');
    const isRecovering = currentStage.toLowerCase().includes('recovering') || currentStage.toLowerCase().includes('repairing');

    const stages: LiveStage[] = [
      { id: 'understand', label: 'Understanding your question', status: 'completed' },
      {
        id: 'evidence',
        label: 'Working with project evidence',
        status: isVerifying || isRecovering ? 'completed' : 'active',
      },
      {
        id: 'check',
        label: 'Checking factual claims',
        status: isRecovering ? 'completed' : isVerifying ? 'active' : 'pending',
      },
      {
        id: 'repair',
        label: 'Repairing unsupported claims if necessary',
        status: isRecovering ? 'active' : 'pending',
      },
    ];

    return (
      <div className={cn('p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-3 select-none animate-in fade-in duration-200', className)}>
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span>GroundGuard is analyzing</span>
        </div>

        <div className="space-y-1.5 pl-1 text-xs">
          {stages.map((st) => (
            <div key={st.id} className="flex items-center gap-2">
              {st.status === 'completed' && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              )}
              {st.status === 'active' && (
                <div className="h-3.5 w-3.5 flex items-center justify-center shrink-0">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                </div>
              )}
              {st.status === 'pending' && (
                <div className="h-3.5 w-3.5 flex items-center justify-center shrink-0">
                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                </div>
              )}
              <span
                className={cn(
                  st.status === 'completed' && 'text-muted-foreground line-through decoration-muted-foreground/30',
                  st.status === 'active' && 'text-foreground font-medium',
                  st.status === 'pending' && 'text-muted-foreground/60'
                )}
              >
                {st.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // COMPLETED SUMMARY VIEW (collapsed by default with real observable metrics)
  if (totalClaims === 0 && evidenceCount === 0) {
    return null;
  }

  return (
    <div className={cn('rounded-lg border border-border/50 bg-card/30 text-xs select-none overflow-hidden transition-all', className)}>
      {/* Header Bar / Toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-2.5 sm:px-3 hover:bg-muted/30 transition-colors text-left"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-semibold text-foreground tracking-tight text-[11px] sm:text-xs">
            How GroundGuard worked
          </span>
          <span className="text-border">·</span>
          <span className="text-[11px] text-muted-foreground font-mono truncate">
            {sourceCount > 0 ? `${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}` : 'Grounded'} · {totalClaims} {totalClaims === 1 ? 'claim' : 'claims'}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
          <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
      </button>

      {/* Expanded Real Trace Grid */}
      {isExpanded && (
        <div className="p-3 border-t border-border/40 space-y-3 bg-muted/10 font-sans">
          {highLevelExplanation && (
            <p className="text-xs text-foreground/90 leading-relaxed font-medium pb-1 border-b border-border/30">
              {highLevelExplanation}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 1. Evidence */}
            <div className="space-y-1 p-2 rounded bg-card/60 border border-border/40">
              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                <Database className="h-3 w-3 text-primary" />
                <span>Evidence</span>
              </div>
              <p className="font-semibold text-foreground">
                {evidenceCount} {evidenceCount === 1 ? 'chunk' : 'chunks'} considered
              </p>
              <p className="text-[11px] text-muted-foreground">
                {sourceCount} {sourceCount === 1 ? 'source' : 'sources'} evaluated
              </p>
            </div>

            {/* 2. Generation */}
            <div className="space-y-1 p-2 rounded bg-card/60 border border-border/40">
              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>Generation</span>
              </div>
              <p className="font-semibold text-foreground">Grounded synthesis</p>
              <p className="text-[11px] text-muted-foreground font-mono truncate">
                {modelVersion || 'Gemini Flash'}
              </p>
            </div>

            {/* 3. Verification */}
            <div className="space-y-1 p-2 rounded bg-card/60 border border-border/40">
              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                <span>Verification</span>
              </div>
              <p className="font-semibold text-foreground">
                {totalClaims} {totalClaims === 1 ? 'claim' : 'claims'} checked
              </p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {verifiedCount} verified · {contradictedCount} flagged · {reviewCount} review
              </p>
            </div>

            {/* 4. Recovery */}
            <div className="space-y-1 p-2 rounded bg-card/60 border border-border/40">
              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                <RotateCcw className="h-3 w-3 text-blue-500" />
                <span>Recovery</span>
              </div>
              <p className="font-semibold text-foreground">
                {recoveredCount > 0
                  ? `${recoveredCount} recovered`
                  : contradictedCount > 0
                  ? 'Attempted'
                  : 'Not needed'}
              </p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {recoveredCount > 0 ? 'Reverified with M1' : 'Zero unrecovered claims'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
