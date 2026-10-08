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
import { motion, useReducedMotion } from 'framer-motion';
import { GroundingRail } from './grounding-rail';
import { CitationPill } from './citation-pill';
import { TrustSummary } from './trust-summary';
import { GroundGuardAnalysis } from './groundguard-analysis';
import { StatusBadge } from '@/components/trust/status-badge';
import { CLAIM_STATE_CONFIG } from '@/lib/trust-utils';
import { mapAnswerToClaims } from '@/lib/sentence-claim-mapper';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Claim, EvidenceItem, GenerationStatus } from '@groundguard/types';

export interface StreamingChunk {
  id: string | number;
  text: string;
  isInitial?: boolean;
}

interface AnswerViewProps {
  answerText: string;
  streamingChunks?: StreamingChunk[];
  claims?: Claim[];
  generationStatus?: GenerationStatus;
  isStreaming?: boolean;
  onStreamFlushComplete?: () => void;
  projectId: string;
  selectedClaimId?: string | null;
  onSelectClaim: (claim: Claim) => void;
  onSelectEvidence?: (evidence: EvidenceItem) => void;
  isEvidenceLens?: boolean;
  onToggleEvidenceLens?: () => void;
  onAskAnother?: () => void;
  className?: string;
}

function renderFormattedMarkdown(text: string) {
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
}

export interface VisibleToken {
  id: number;
  text: string;
  isBold?: boolean;
}

interface MemoizedTokenProps {
  text: string;
  isBold?: boolean;
}

function renderTokenFormatted(text: string) {
  if (text.includes('**')) {
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
  }
  return text;
}

const MemoizedToken = React.memo(function MemoizedToken({ text, isBold }: MemoizedTokenProps) {
  const content = renderTokenFormatted(text);
  return (
    <span className="inline animate-token-reveal">
      {isBold ? <strong className="font-semibold text-foreground">{content}</strong> : content}
    </span>
  );
});

function extractNextToken(
  text: string,
  isStreaming: boolean
): { token: string; rest: string } | null {
  if (!text) return null;

  // 1. Whitespace or newlines
  const wsMatch = text.match(/^(\s+)/);
  if (wsMatch && wsMatch[0].length > 0) {
    const ws = wsMatch[0];
    return { token: ws, rest: text.slice(ws.length) };
  }

  // 2. Word with trailing horizontal whitespace
  const wordMatch = text.match(/^([^\s\n]+[^\S\r\n]*)/);
  if (wordMatch && wordMatch[0].length > 0) {
    const word = wordMatch[0];
    const rest = text.slice(word.length);

    // If word doesn't end with space, rest is empty, and stream is still active,
    // hold briefly for the rest of the word from network packet
    if (!/[^\S\r\n]$/.test(word) && rest.length === 0 && isStreaming) {
      return null;
    }

    return { token: word, rest };
  }

  return { token: text.slice(0, 1), rest: text.slice(1) };
}

export function StreamingTextRenderer({
  text = '',
  chunks,
  fallbackText = '',
  isStreaming = true,
  onFlushComplete,
}: {
  text?: string;
  chunks?: StreamingChunk[];
  fallbackText?: string;
  isStreaming?: boolean;
  onFlushComplete?: () => void;
}) {
  const effectiveText = text || fallbackText || (chunks ? chunks.map((c) => c.text).join('') : '');
  const [visibleTokens, setVisibleTokens] = React.useState<VisibleToken[]>([]);

  const bufferRef = React.useRef<string>('');
  const lastBufferedLenRef = React.useRef<number>(0);
  const nextTokenIdRef = React.useRef<number>(1);
  const boldActiveRef = React.useRef<boolean>(false);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  const isStreamingRef = React.useRef<boolean>(isStreaming);
  isStreamingRef.current = isStreaming;

  const onFlushCompleteRef = React.useRef(onFlushComplete);
  onFlushCompleteRef.current = onFlushComplete;

  const emitToken = React.useCallback((tokenStr: string) => {
    let cleanToken = tokenStr;
    let isBold = boldActiveRef.current;

    if (cleanToken.includes('**')) {
      const asterisks = (cleanToken.match(/\*\*/g) || []).length;
      if (asterisks % 2 === 1) {
        boldActiveRef.current = !boldActiveRef.current;
        isBold = true;
        cleanToken = cleanToken.replace(/\*\*/g, '');
      } else {
        isBold = true;
        cleanToken = cleanToken.replace(/\*\*/g, '');
      }
    }

    const id = nextTokenIdRef.current++;
    setVisibleTokens((prev) => [...prev, { id, text: cleanToken, isBold }]);
  }, []);

  const consumeTick = React.useCallback(() => {
    timerRef.current = null;
    const buf = bufferRef.current;

    if (!buf || buf.length === 0) {
      if (!isStreamingRef.current) {
        onFlushCompleteRef.current?.();
      }
      return;
    }

    const extracted = extractNextToken(buf, isStreamingRef.current);
    if (!extracted) {
      if (isStreamingRef.current) {
        timerRef.current = setTimeout(consumeTick, 30);
        return;
      }
      const forced = buf;
      bufferRef.current = '';
      emitToken(forced);
      onFlushCompleteRef.current?.();
      return;
    }

    const { token, rest } = extracted;
    bufferRef.current = rest;
    emitToken(token);

    // Dynamic delay:
    // small buffer: ~22-25ms (natural ChatGPT streaming cadence)
    // medium buffer: ~16-18ms
    // large buffer: ~12-14ms
    // stream finished: ~10ms fast smooth flush
    let delayMs = 22;
    const remainingLen = rest.length;

    if (!isStreamingRef.current) {
      delayMs = remainingLen > 80 ? 8 : 12;
    } else if (remainingLen > 200) {
      delayMs = 12;
    } else if (remainingLen > 80) {
      delayMs = 16;
    } else if (remainingLen > 30) {
      delayMs = 20;
    } else {
      delayMs = 24;
    }

    timerRef.current = setTimeout(consumeTick, delayMs);
  }, [emitToken]);

  // Ingest incoming text into pending buffer
  React.useEffect(() => {
    if (!effectiveText) {
      bufferRef.current = '';
      lastBufferedLenRef.current = 0;
      boldActiveRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setVisibleTokens([]);
      return;
    }

    if (effectiveText.length > lastBufferedLenRef.current) {
      const newChunk = effectiveText.slice(lastBufferedLenRef.current);
      bufferRef.current += newChunk;
      lastBufferedLenRef.current = effectiveText.length;

      if (!timerRef.current) {
        timerRef.current = setTimeout(consumeTick, 0);
      }
    }
  }, [effectiveText, consumeTick]);

  // If streaming finished, ensure any pending buffer is drained smoothly
  React.useEffect(() => {
    if (!isStreaming && bufferRef.current.length > 0) {
      if (!timerRef.current) {
        timerRef.current = setTimeout(consumeTick, 0);
      }
    }
  }, [isStreaming, consumeTick]);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="text-sm sm:text-base text-foreground leading-relaxed font-sans whitespace-pre-wrap select-text break-words">
      {visibleTokens.map((token) => (
        <MemoizedToken key={token.id} text={token.text} isBold={token.isBold} />
      ))}
    </div>
  );
}

export function AnswerView({
  answerText,
  streamingChunks = [],
  claims = [],
  generationStatus = 'completed',
  isStreaming = false,
  onStreamFlushComplete,
  projectId,
  selectedClaimId,
  onSelectClaim,
  onSelectEvidence,
  isEvidenceLens = false,
  onToggleEvidenceLens,
  onAskAnother,
  className,
}: AnswerViewProps) {
  const [copied, setCopied] = React.useState(false);
  const [hoveredClaimId, setHoveredClaimId] = React.useState<string | null>(null);
  const [activeStatusFilter, setActiveStatusFilter] = React.useState<string | null>(null);

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

  // Deterministically map sentences to claims with 1-to-1 binding and recovery projection
  const contentBlocks = React.useMemo(() => {
    return mapAnswerToClaims(answerText, claims);
  }, [answerText, claims]);

  // Section 3 Preservation Invariant:
  // If raw answer text is non-empty and substantive, UI must NEVER render an empty answer
  // merely because sentence-to-claim mapping failed or dropped prose.
  const isProjectionSubstantiallyEmpty = React.useMemo(() => {
    const rawLen = (answerText || '').trim().length;
    if (rawLen === 0) return false;
    let projLen = 0;
    for (const block of contentBlocks) {
      for (const item of block.items) {
        projLen += (item.displayText || '').trim().length;
      }
    }
    // If projected text lost more than 50% of the substantive raw answer text, fallback to raw answer
    return projLen < rawLen * 0.5;
  }, [contentBlocks, answerText]);

  // Projected truthful answer for clipboard copy
  const projectedFullAnswer = React.useMemo(() => {
    if (!contentBlocks.length || isProjectionSubstantiallyEmpty) return answerText;
    return contentBlocks
      .map((block) =>
        block.type === 'list'
          ? block.items.map((it) => `• ${it.displayText}`).join('\n')
          : block.items.map((it) => it.displayText).join(' ')
      )
      .join('\n\n');
  }, [contentBlocks, answerText, isProjectionSubstantiallyEmpty]);

  const handleCopy = React.useCallback(() => {
    navigator.clipboard.writeText(projectedFullAnswer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [projectedFullAnswer]);

  const renderFormattedText = (text: string) => renderFormattedMarkdown(text);

  // Case 0: Streaming unverified draft response (no trust markers, no badges, neutral state with smooth appear transitions)
  if (isStreaming) {
    return (
      <div className={cn('space-y-2 py-1', className)}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono select-none">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary/80" />
          </span>
          <span className="text-foreground/80 font-medium tracking-tight">
            Generating grounded answer...
          </span>
        </div>
        <StreamingTextRenderer
          text={answerText}
          isStreaming={isStreaming}
          onFlushComplete={onStreamFlushComplete}
        />
      </div>
    );
  }

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
              EvideX AI keeps project answers grounded in uploaded evidence.
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
          {isProjectionSubstantiallyEmpty ? (
            <div className="space-y-3 leading-relaxed sm:leading-7 whitespace-pre-wrap">
              {renderFormattedText(answerText)}
            </div>
          ) : (
            contentBlocks.map((block, bIdx) => {
              if (block.type === 'list') {
              return (
                <ul key={bIdx} className="list-disc pl-5 space-y-1.5 mb-3">
                  {block.items.map((item, itemIdx) => {
                    const isSelected = item.matchedClaims.some((c) => selectedClaimId === c.claimId);
                    const isHovered = item.matchedClaims.some((c) => hoveredClaimId === c.claimId);
                    const primaryClaim = item.matchedClaims[0];

                    const hasContradiction = item.effectiveStatus === 'flagged';
                    const hasNeedsReview = item.effectiveStatus === 'needs_review';
                    const hasRecovered = item.effectiveStatus === 'recovered';

                    const matchesFilter =
                      !activeStatusFilter ||
                      item.effectiveStatus === activeStatusFilter ||
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
                        <span>{renderFormattedText(item.displayText)}</span>

                        {/* Inline Citations */}
                        {item.evidence.map((ev, evIdx) => (
                          <CitationPill
                            key={ev.chunkId || ev.evidenceId || evIdx}
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
                        {isEvidenceLens && item.effectiveStatus ? (
                          <span className="inline-block ml-1 align-middle select-none">
                            <StatusBadge status={item.effectiveStatus} size="sm" showIcon={true} />
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

                  const hasContradiction = item.effectiveStatus === 'flagged';
                  const hasNeedsReview = item.effectiveStatus === 'needs_review';
                  const hasRecovered = item.effectiveStatus === 'recovered';

                  const matchesFilter =
                    !activeStatusFilter ||
                    item.effectiveStatus === activeStatusFilter ||
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
                      <span>{renderFormattedText(item.displayText)}</span>

                      {/* Inline Citations */}
                      {item.evidence.map((ev, evIdx) => (
                        <CitationPill
                          key={ev.chunkId || ev.evidenceId || evIdx}
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
                      {isEvidenceLens && item.effectiveStatus ? (
                        <span className="inline-block ml-1 align-middle select-none">
                          <StatusBadge status={item.effectiveStatus} size="sm" showIcon={true} />
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
          })
        )}
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
