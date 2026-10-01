'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  HelpCircle,
  Clock,
  Copy,
  Check,
  SearchX,
  ArrowRight,
  BookOpen,
  SlidersHorizontal,
} from 'lucide-react';
import { GroundingRail } from './grounding-rail';
import { CitationPill } from './citation-pill';
import { TrustSummary } from './trust-summary';
import { StatusBadge } from '@/components/trust/status-badge';
import { CLAIM_STATE_CONFIG } from '@/lib/trust-utils';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Claim, EvidenceItem, GenerationStatus } from '@groundguard/types';

interface AnswerViewProps {
  answerText: string;
  claims?: Claim[];
  generationStatus?: GenerationStatus;
  projectId: string;
  selectedClaimId?: string | null;
  onSelectClaim: (claim: Claim) => void;
  onSelectEvidence?: (evidence: EvidenceItem) => void;
  isEvidenceLens: boolean;
  onToggleEvidenceLens: () => void;
  onAskAnother?: () => void;
  className?: string;
}

export function AnswerView({
  answerText,
  claims = [],
  generationStatus = 'completed',
  projectId,
  selectedClaimId,
  onSelectClaim,
  onSelectEvidence,
  isEvidenceLens,
  onToggleEvidenceLens,
  onAskAnother,
  className,
}: AnswerViewProps) {
  const [copied, setCopied] = React.useState(false);
  const [hoveredClaimId, setHoveredClaimId] = React.useState<string | null>(null);
  const [activeStatusFilter, setActiveStatusFilter] = React.useState<string | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(answerText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasClaims = claims.length > 0;

  // Build flattened unique evidence array for numbering [1], [2], etc.
  const evidencePool: EvidenceItem[] = React.useMemo(() => {
    const list: EvidenceItem[] = [];
    const seen = new Set<string>();
    for (const c of claims) {
      for (const ev of c.evidence || []) {
        const id = ev.chunkId || ev.evidenceId || ev.text;
        if (!seen.has(id)) {
          seen.add(id);
          list.push(ev);
        }
      }
    }
    return list;
  }, [claims]);

  const getCitationNumber = (ev: EvidenceItem) => {
    const id = ev.chunkId || ev.evidenceId || ev.text;
    const idx = evidencePool.findIndex((e) => (e.chunkId || e.evidenceId || e.text) === id);
    return idx >= 0 ? idx + 1 : 1;
  };

  // Filtered claims if user clicked a filter pill in TrustSummary
  const displayedClaims = React.useMemo(() => {
    if (!activeStatusFilter) return claims;
    return claims.filter((c) => c.status === activeStatusFilter);
  }, [claims, activeStatusFilter]);

  // Case 1: Non-claim response (Conversational, Product Help, or Scoped Abstention)
  if (!hasClaims) {
    const isAbstention =
      answerText.includes('does not contain sufficient evidence') ||
      answerText.includes('scoped strictly to') ||
      answerText.includes('No supported answer');

    if (isAbstention) {
      return (
        <div className={cn('py-2 space-y-3', className)}>
          <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-md bg-muted text-muted-foreground shrink-0 mt-0.5">
                <SearchX className="h-4 w-4" />
              </div>
              <div className="space-y-1 flex-1">
                <h4 className="text-xs font-semibold text-foreground tracking-tight">
                  Evidence Boundary Notice
                </h4>
                <p className="text-xs text-foreground/90 leading-relaxed font-sans">
                  {answerText}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 pl-8">
              {onAskAnother && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAskAnother}
                  className="h-7 text-[11px] px-2.5 gap-1.5"
                >
                  <span>Ask another question</span>
                </Button>
              )}

              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] px-2.5 gap-1 text-muted-foreground hover:text-foreground"
              >
                <Link href={`/projects/${projectId}/knowledge`}>
                  <BookOpen className="h-3 w-3" />
                  <span>View Knowledge Base</span>
                  <ArrowRight className="h-2.5 w-2.5 ml-0.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Friendly conversational or product help response (no fake verification, clean prose)
    return (
      <div className={cn('space-y-2 py-1', className)}>
        <div className="flex items-center justify-end pb-1 select-none">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Copy answer"
            aria-label="Copy answer text"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div className="text-sm sm:text-base text-foreground leading-relaxed font-sans whitespace-pre-wrap">
          {answerText}
        </div>
      </div>
    );
  }

  // Case 2: Grounded Research Document Answer with Claims & Grounding Rail
  return (
    <div className={cn('space-y-3 py-1', className)}>
      {/* 1. Signature Trust Summary Header */}
      <TrustSummary
        claims={claims}
        generationStatus={generationStatus}
        selectedStatusFilter={activeStatusFilter}
        onClickClaimFilter={setActiveStatusFilter}
      />

      {/* Utility Bar: Evidence Lens toggle + Copy action */}
      <div className="flex items-center justify-between text-xs font-mono select-none px-0.5">
        <div className="flex items-center gap-2">
          {activeStatusFilter && (
            <button
              type="button"
              onClick={() => setActiveStatusFilter(null)}
              className="text-[11px] text-primary hover:underline font-mono"
            >
              Clear filter ({activeStatusFilter})
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={onToggleEvidenceLens}
            className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded border transition-colors select-none',
              isEvidenceLens
                ? 'bg-primary/15 text-primary border-primary/40 font-medium'
                : 'bg-transparent text-muted-foreground border-border/40 hover:bg-muted/50 hover:text-foreground'
            )}
            title="Toggle Evidence Lens reading mode"
            aria-pressed={isEvidenceLens}
          >
            {isEvidenceLens ? (
              <>
                <Eye className="h-3 w-3" />
                <span>Evidence Lens ON</span>
              </>
            ) : (
              <>
                <EyeOff className="h-3 w-3" />
                <span>Evidence Lens</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Copy answer"
            aria-label="Copy answer text"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 2. Main Research Document Flow: Grounding Rail + Claim Spans */}
      <div className="flex items-stretch gap-3 sm:gap-4 min-w-0">
        {/* Signature Vertical Grounding Rail (hidden on very small mobile, visible sm+) */}
        <div className="hidden sm:block shrink-0 pt-1">
          <GroundingRail
            claims={claims}
            selectedClaimId={selectedClaimId}
            hoveredClaimId={hoveredClaimId}
            onSelectClaim={onSelectClaim}
            onHoverClaim={setHoveredClaimId}
            isEvidenceLens={isEvidenceLens}
          />
        </div>

        {/* Readable Document Text with subtle claim mapping */}
        <div className="flex-1 min-w-0 space-y-2 text-xs sm:text-sm text-foreground leading-relaxed font-sans">
          {displayedClaims.map((claim, idx) => {
            const isSelected = selectedClaimId === claim.claimId;
            const isHovered = hoveredClaimId === claim.claimId;
            const claimEvList = claim.evidence || [];
            const config = CLAIM_STATE_CONFIG[claim.status] || CLAIM_STATE_CONFIG.pending;

            return (
              <div
                key={claim.claimId || idx}
                onClick={() => onSelectClaim(claim)}
                onMouseEnter={() => setHoveredClaimId(claim.claimId)}
                onMouseLeave={() => setHoveredClaimId(null)}
                onFocus={() => setHoveredClaimId(claim.claimId)}
                onBlur={() => setHoveredClaimId(null)}
                tabIndex={0}
                role="button"
                aria-label={`Claim: ${claim.text}. Status: ${config.label}. Click to inspect.`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectClaim(claim);
                  }
                }}
                className={cn(
                  'group relative py-1 px-1.5 rounded transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  isSelected
                    ? 'bg-primary/10 ring-1 ring-primary/40'
                    : isHovered
                    ? 'bg-muted/30 ring-1 ring-border/60'
                    : isEvidenceLens
                    ? 'border-b border-border/60 hover:bg-muted/30'
                    : 'hover:bg-muted/20'
                )}
              >
                {/* Text span */}
                <span>{claim.text}</span>

                {/* Inline Citations */}
                {claimEvList.map((ev, evIdx) => (
                  <CitationPill
                    key={ev.chunkId || evIdx}
                    index={getCitationNumber(ev)}
                    evidence={ev}
                    projectId={projectId}
                    isEvidenceLens={isEvidenceLens}
                    onClick={() => {
                      onSelectClaim(claim);
                      onSelectEvidence?.(ev);
                    }}
                  />
                ))}

                {/* Evidence Lens / Flagged status chip */}
                {(isEvidenceLens || claim.status === 'flagged' || claim.status === 'needs_review') && (
                  <span className="inline-block ml-2 align-middle select-none">
                    <StatusBadge status={claim.status} size="sm" showIcon={true} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
