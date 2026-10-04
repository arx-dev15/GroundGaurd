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
  FileText,
} from 'lucide-react';
import { GroundingRail } from './grounding-rail';
import { CitationPill } from './citation-pill';
import { TrustSummary } from './trust-summary';
import { GroundGuardAnalysis } from './groundguard-analysis';
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

const STOP_WORDS = new Set([
  'the', 'is', 'a', 'an', 'to', 'of', 'and', 'in', 'on', 'for', 'as', 'with', 'it', 'that', 'this',
  'system', 'campus', 'monitor', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'at', 'by', 'from', 'also', 'such', 'more', 'than', 'into', 'their', 'which',
  'there', 'they', 'them', 'these', 'those', 'about', 'over', 'both', 'between', 'through', 'during'
]);

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

  const handleCopy = React.useCallback(() => {
    navigator.clipboard.writeText(answerText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [answerText]);

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

  const getCitationNumber = React.useCallback(
    (ev: EvidenceItem) => {
      const id = ev.chunkId || ev.evidenceId || ev.text;
      const idx = evidencePool.findIndex((e) => (e.chunkId || e.evidenceId || e.text) === id);
      return idx >= 0 ? idx + 1 : 1;
    },
    [evidencePool]
  );

  // Filtered claims if user clicked a filter pill in TrustSummary
  const displayedClaims = React.useMemo(() => {
    if (!activeStatusFilter) return claims;
    return claims.filter((c) => c.status === activeStatusFilter);
  }, [claims, activeStatusFilter]);

  const getKeywords = React.useCallback((text: string): string[] => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  }, []);

  const findMatchingClaims = React.useCallback(
    (text: string, allClaims: Claim[]): Claim[] => {
      const textWords = new Set(getKeywords(text));
      const matched: Claim[] = [];

      for (const c of allClaims) {
        const cClean = c.text.toLowerCase().trim();
        const tClean = text.toLowerCase().trim();
        if (tClean.includes(cClean) || cClean.includes(tClean)) {
          matched.push(c);
          continue;
        }

        const cWords = getKeywords(c.text);
        if (cWords.length === 0) continue;
        const overlap = cWords.filter((w) => textWords.has(w));
        if (
          overlap.length >= 2 ||
          (cWords.length === 1 && overlap.length === 1) ||
          overlap.length / cWords.length >= 0.5
        ) {
          matched.push(c);
        }
      }
      return matched;
    },
    [getKeywords]
  );

  // Parse natural answerText into paragraphs and bullet lists
  const contentBlocks = React.useMemo(() => {
    if (!answerText) return [];
    const rawBlocks = answerText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

    return rawBlocks.map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      const isBulletList = lines.length > 1 && lines.every((l) => /^[*•\-]|\d+\./.test(l));

      if (isBulletList) {
        return {
          type: 'list' as const,
          items: lines.map((line) => {
            const cleanLine = line.replace(/^[*•\-]\s*|\d+\.\s*/, '').trim();
            const matched = findMatchingClaims(cleanLine, claims);
            return { text: cleanLine, matchedClaims: matched, raw: line };
          }),
        };
      } else {
        // Match sentences: text ending with . ! ? followed by space or end
        const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
        const rawSentences = block.match(sentenceRegex) || [block];
        const sentences = rawSentences.map((s) => s.trim()).filter(Boolean);

        return {
          type: 'paragraph' as const,
          items: sentences.map((sent) => {
            const matched = findMatchingClaims(sent, claims);
            return { text: sent, matchedClaims: matched, raw: sent };
          }),
        };
      }
    });
  }, [answerText, claims, findMatchingClaims]);

  const renderFormattedText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={idx} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  // Case 1: Non-claim response (Conversational, Product Help, or Scoped Abstention)
  if (!hasClaims) {
    const isAbstention =
      answerText.includes('does not contain sufficient evidence') ||
      answerText.includes('scoped strictly to') ||
      answerText.includes('No supported answer') ||
      answerText.includes("couldn't answer that from this project") ||
      answerText.includes('keeps project answers grounded in uploaded evidence');

    if (isAbstention) {
      return (
        <div className={cn('py-1 space-y-2.5', className)}>
          <div className="p-4 rounded-xl border border-border/70 bg-card/60 space-y-2">
            <p className="text-xs sm:text-sm text-foreground font-medium leading-relaxed font-sans">
              I couldn&apos;t answer that from this project&apos;s sources.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed font-sans">
              GroundGuard keeps project answers grounded in uploaded evidence.
            </p>

            <div className="flex items-center gap-2 pt-1">
              {onAskAnother && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAskAnother}
                  className="h-7 text-xs px-2.5 font-sans"
                >
                  <span>Ask about this project</span>
                </Button>
              )}

              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2.5 gap-1.5 text-muted-foreground hover:text-foreground font-sans"
              >
                <Link href={`/projects/${projectId}/knowledge`}>
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>View project knowledge</span>
                  <ArrowRight className="h-3 w-3 ml-0.5" />
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

  // Case 2: Grounded Research Document Answer with Claims & Grounding Rail (Answer-First Workspace)
  return (
    <div className={cn('space-y-4 py-1', className)}>
      {/* Utility Bar: Copy action + Evidence Lens toggle */}
      <div className="flex items-center justify-between text-xs font-mono select-none px-0.5 pb-1">
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

      {/* 1. Main Visual Hero: Answer Reading Flow */}
      <div className="flex items-stretch gap-3 sm:gap-4 min-w-0">
        {/* Subtle Vertical Grounding Rail (hidden on very small mobile, visible sm+) */}
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

        {/* Natural Readable Document Answer with subtle claim mapping */}
        <div className="flex-1 min-w-0 text-sm sm:text-[15px] text-foreground leading-relaxed sm:leading-7 font-sans">
          {contentBlocks.map((block, bIdx) => {
            if (block.type === 'list') {
              return (
                <ul key={bIdx} className="list-disc pl-5 space-y-1.5 mb-3">
                  {block.items.map((item, itemIdx) => {
                    const isSelected = item.matchedClaims.some((c) => selectedClaimId === c.claimId);
                    const isHovered = item.matchedClaims.some((c) => hoveredClaimId === c.claimId);
                    const primaryClaim = item.matchedClaims[0];

                    const itemEvidence: EvidenceItem[] = [];
                    const seenEv = new Set<string>();
                    for (const c of item.matchedClaims) {
                      for (const ev of c.evidence || []) {
                        const id = ev.chunkId || ev.evidenceId || ev.text;
                        if (!seenEv.has(id)) {
                          seenEv.add(id);
                          itemEvidence.push(ev);
                        }
                      }
                    }

                    const hasContradiction = item.matchedClaims.some((c) => c.status === 'flagged');
                    const hasNeedsReview = item.matchedClaims.some((c) => c.status === 'needs_review');
                    const hasRecovered = item.matchedClaims.some((c) => c.status === 'recovered');

                    const matchesFilter =
                      !activeStatusFilter ||
                      item.matchedClaims.some((c) => c.status === activeStatusFilter);

                    return (
                      <li
                        key={itemIdx}
                        onClick={() => {
                          if (primaryClaim) onSelectClaim(primaryClaim);
                        }}
                        onMouseEnter={() => {
                          if (primaryClaim) setHoveredClaimId(primaryClaim.claimId);
                        }}
                        onMouseLeave={() => setHoveredClaimId(null)}
                        className={cn(
                          'transition-all duration-150 rounded px-1 -mx-1',
                          item.matchedClaims.length > 0 ? 'cursor-pointer' : '',
                          !matchesFilter ? 'opacity-40' : '',
                          isSelected
                            ? 'bg-primary/15 ring-1 ring-primary/40 font-medium'
                            : isHovered
                            ? 'bg-muted/40 ring-1 ring-border/60'
                            : isEvidenceLens && item.matchedClaims.length > 0
                            ? 'border-b border-border/70 hover:bg-muted/30'
                            : item.matchedClaims.length > 0
                            ? 'hover:bg-muted/20'
                            : ''
                        )}
                      >
                        <span>{renderFormattedText(item.text)}</span>

                        {/* Inline Citations */}
                        {itemEvidence.map((ev, evIdx) => (
                          <CitationPill
                            key={ev.chunkId || evIdx}
                            index={getCitationNumber(ev)}
                            evidence={ev}
                            projectId={projectId}
                            isEvidenceLens={isEvidenceLens}
                            onClick={() => {
                              if (primaryClaim) onSelectClaim(primaryClaim);
                              onSelectEvidence?.(ev);
                            }}
                          />
                        ))}

                        {/* Subtle Status Badges */}
                        {isEvidenceLens && primaryClaim ? (
                          <span className="inline-block ml-1 align-middle select-none">
                            <StatusBadge status={primaryClaim.status} size="sm" showIcon={true} />
                          </span>
                        ) : (
                          <>
                            {hasNeedsReview && (
                              <span
                                className="inline-flex items-center gap-0.5 ml-1 px-1 py-0.2 rounded text-[10px] font-mono font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 align-baseline select-none"
                                title="Needs review: evidence does not fully support statement"
                              >
                                <HelpCircle className="h-2.5 w-2.5" />
                                <span>review</span>
                              </span>
                            )}
                            {hasContradiction && (
                              <span
                                className="inline-flex items-center gap-0.5 ml-1 px-1 py-0.2 rounded text-[10px] font-mono font-medium text-rose-700 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 align-baseline select-none"
                                title="Contradicted by authoritative evidence"
                              >
                                <AlertTriangle className="h-2.5 w-2.5" />
                                <span>contradicted</span>
                              </span>
                            )}
                            {hasRecovered && (
                              <span
                                className="inline-flex items-center gap-0.5 ml-1 px-1 py-0.2 rounded text-[10px] font-mono font-medium text-blue-700 dark:text-blue-400 bg-blue-500/10 border border-blue-500/30 align-baseline select-none"
                                title="Recovered: rewritten against authoritative evidence"
                              >
                                <RotateCcw className="h-2.5 w-2.5" />
                                <span>recovered</span>
                              </span>
                            )}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              );
            }

            // Paragraph of flowing text
            return (
              <p key={bIdx} className="mb-3 leading-relaxed sm:leading-7">
                {block.items.map((item, itemIdx) => {
                  const isSelected = item.matchedClaims.some((c) => selectedClaimId === c.claimId);
                  const isHovered = item.matchedClaims.some((c) => hoveredClaimId === c.claimId);
                  const primaryClaim = item.matchedClaims[0];

                  const itemEvidence: EvidenceItem[] = [];
                  const seenEv = new Set<string>();
                  for (const c of item.matchedClaims) {
                    for (const ev of c.evidence || []) {
                      const id = ev.chunkId || ev.evidenceId || ev.text;
                      if (!seenEv.has(id)) {
                        seenEv.add(id);
                        itemEvidence.push(ev);
                      }
                    }
                  }

                  const hasContradiction = item.matchedClaims.some((c) => c.status === 'flagged');
                  const hasNeedsReview = item.matchedClaims.some((c) => c.status === 'needs_review');
                  const hasRecovered = item.matchedClaims.some((c) => c.status === 'recovered');

                  const matchesFilter =
                    !activeStatusFilter ||
                    item.matchedClaims.some((c) => c.status === activeStatusFilter);

                  return (
                    <span
                      key={itemIdx}
                      onClick={() => {
                        if (primaryClaim) onSelectClaim(primaryClaim);
                      }}
                      onMouseEnter={() => {
                        if (primaryClaim) setHoveredClaimId(primaryClaim.claimId);
                      }}
                      onMouseLeave={() => setHoveredClaimId(null)}
                      className={cn(
                        'inline transition-all duration-150 rounded px-0.5 -mx-0.5 mr-1',
                        item.matchedClaims.length > 0 ? 'cursor-pointer' : '',
                        !matchesFilter ? 'opacity-40' : '',
                        isSelected
                          ? 'bg-primary/15 ring-1 ring-primary/40 font-medium'
                          : isHovered
                          ? 'bg-muted/40 ring-1 ring-border/60'
                          : isEvidenceLens && item.matchedClaims.length > 0
                          ? 'border-b border-border/70 hover:bg-muted/30'
                          : item.matchedClaims.length > 0
                          ? 'hover:bg-muted/20'
                          : ''
                      )}
                    >
                      <span>{renderFormattedText(item.text)}</span>

                      {/* Inline Citations */}
                      {itemEvidence.map((ev, evIdx) => (
                        <CitationPill
                          key={ev.chunkId || evIdx}
                          index={getCitationNumber(ev)}
                          evidence={ev}
                          projectId={projectId}
                          isEvidenceLens={isEvidenceLens}
                          onClick={() => {
                            if (primaryClaim) onSelectClaim(primaryClaim);
                            onSelectEvidence?.(ev);
                          }}
                        />
                      ))}

                      {/* Subtle Status Badges */}
                      {isEvidenceLens && primaryClaim ? (
                        <span className="inline-block ml-1 align-middle select-none">
                          <StatusBadge status={primaryClaim.status} size="sm" showIcon={true} />
                        </span>
                      ) : (
                        <>
                          {hasNeedsReview && (
                            <span
                              className="inline-flex items-center gap-0.5 ml-1 px-1 py-0.2 rounded text-[10px] font-mono font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 align-baseline select-none"
                              title="Needs review: evidence does not fully support statement"
                            >
                              <HelpCircle className="h-2.5 w-2.5" />
                              <span>review</span>
                            </span>
                          )}
                          {hasContradiction && (
                            <span
                              className="inline-flex items-center gap-0.5 ml-1 px-1 py-0.2 rounded text-[10px] font-mono font-medium text-rose-700 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 align-baseline select-none"
                              title="Contradicted by authoritative evidence"
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              <span>contradicted</span>
                            </span>
                          )}
                          {hasRecovered && (
                            <span
                              className="inline-flex items-center gap-0.5 ml-1 px-1 py-0.2 rounded text-[10px] font-mono font-medium text-blue-700 dark:text-blue-400 bg-blue-500/10 border border-blue-500/30 align-baseline select-none"
                              title="Recovered: rewritten against authoritative evidence"
                            >
                              <RotateCcw className="h-2.5 w-2.5" />
                              <span>recovered</span>
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  );
                })}
              </p>
            );
          })}
        </div>
      </div>

      {/* 2. Compact Truthful Summary (After the Answer) */}
      <TrustSummary
        claims={claims}
        generationStatus={generationStatus}
        selectedStatusFilter={activeStatusFilter}
        onClickClaimFilter={setActiveStatusFilter}
      />

      {/* 3. Readable Authoritative Sources */}
      {evidencePool.length > 0 && (
        <div className="pt-2 border-t border-border/40 space-y-2 select-none">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <span>Project Sources ({evidencePool.length})</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {evidencePool.slice(0, 4).map((ev, idx) => {
              const docName =
                (ev.metadata?.filename as string) ||
                (ev.metadata?.documentFilename as string) ||
                'Project Document';
              const pageNum = ev.pageNumber ?? (ev.metadata?.pageNumber as number | undefined);

              return (
                <div
                  key={ev.chunkId || idx}
                  onClick={() => {
                    const relatedClaim = claims.find((c) =>
                      (c.evidence || []).some(
                        (e) => (e.chunkId || e.text) === (ev.chunkId || ev.text)
                      )
                    );
                    if (relatedClaim) onSelectClaim(relatedClaim);
                    onSelectEvidence?.(ev);
                  }}
                  className="p-2.5 rounded-lg border border-border/60 bg-card/40 hover:bg-card/80 hover:border-border transition-all cursor-pointer text-left space-y-1 group"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      const relatedClaim = claims.find((c) =>
                        (c.evidence || []).some(
                          (e) => (e.chunkId || e.text) === (ev.chunkId || ev.text)
                        )
                      );
                      if (relatedClaim) onSelectClaim(relatedClaim);
                      onSelectEvidence?.(ev);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-1 text-xs font-medium text-foreground">
                    <span className="flex items-center gap-1.5 truncate">
                      <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="truncate">{docName}</span>
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                      [{idx + 1}]{pageNum !== undefined ? ` · p. ${pageNum}` : ''}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 italic leading-relaxed">
                    &ldquo;{ev.text}&rdquo;
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Completed Analysis Summary: How GroundGuard worked */}
      <GroundGuardAnalysis
        mode="completed"
        claims={claims}
        evidence={evidencePool}
        generationStatus={generationStatus}
      />
    </div>
  );
}
