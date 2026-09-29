'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  X,
  ShieldCheck,
  FileText,
  Activity,
  Layers,
  RotateCcw,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Clock,
  ArrowRight,
  Database,
  Cpu,
  Info,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/trust/status-badge';
import { useClaimRecoveryAttempts } from '@/lib/conversations-query';
import { cn } from '@/lib/utils';
import type { Claim, EvidenceItem, RecoveryAttempt } from '@groundguard/types';

interface AskInspectorProps {
  claim: Claim | null;
  selectedEvidence?: EvidenceItem | null;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  generationMetadata?: any;
}

export function AskInspector({
  claim,
  selectedEvidence,
  projectId,
  isOpen,
  onClose,
  generationMetadata,
}: AskInspectorProps) {
  const shouldReduceMotion = useReducedMotion();
  const [activeTab, setActiveTab] = React.useState<string>('claim');

  // Fetch recovery attempts from M3 if claim exists
  const { data: recoveryAttempts = [] } = useClaimRecoveryAttempts(claim?.claimId);

  // If selected evidence changes or claim changes, switch tab accordingly
  React.useEffect(() => {
    if (selectedEvidence) {
      setActiveTab('evidence');
    } else if (claim) {
      setActiveTab('claim');
    }
  }, [claim, selectedEvidence]);

  if (!isOpen || !claim) return null;

  const verification = claim.verification;
  const isRecovered = claim.status === 'recovered' || recoveryAttempts.length > 0;
  const evidenceList = claim.evidence || [];

  return (
    <aside
      className={cn(
        'w-full md:w-[380px] lg:w-[420px] shrink-0 border-l border-border/70 bg-card/95 backdrop-blur-sm',
        'flex flex-col h-full overflow-hidden shadow-lg md:shadow-none z-30'
      )}
      aria-label="Claim Inspector"
    >
      {/* Inspector Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-foreground truncate">
              Claim Inspector
            </h3>
            <p className="text-[10px] font-mono text-muted-foreground truncate">
              {claim.claimId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <StatusBadge status={claim.status} size="sm" />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors ml-1"
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="px-4 pt-2 border-b border-border/50 bg-muted/10">
          <TabsList className="grid grid-cols-5 h-8 p-0.5 bg-muted/50 rounded-lg text-[11px]">
            <TabsTrigger value="claim" className="py-1 px-1.5 text-[11px]">
              Claim
            </TabsTrigger>
            <TabsTrigger value="evidence" className="py-1 px-1.5 text-[11px]">
              Evidence
            </TabsTrigger>
            <TabsTrigger value="verification" className="py-1 px-1.5 text-[11px]">
              Verify
            </TabsTrigger>
            {isRecovered ? (
              <TabsTrigger value="recovery" className="py-1 px-1.5 text-[11px] text-blue-500 font-medium">
                Recovery
              </TabsTrigger>
            ) : (
              <TabsTrigger value="recovery" disabled className="py-1 px-1.5 text-[11px] opacity-30 cursor-not-allowed">
                Recovery
              </TabsTrigger>
            )}
            <TabsTrigger value="advanced" className="py-1 px-1.5 text-[11px]">
              Trace
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Claim */}
        <TabsContent value="claim" className="flex-1 overflow-y-auto p-4 space-y-4 m-0 scrollbar-thin">
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Accepted Claim Statement
            </span>
            <div className="p-3 rounded-lg border border-border/70 bg-background/60 text-xs text-foreground leading-relaxed font-sans">
              {claim.text}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
              <span className="text-[10px] font-mono text-muted-foreground">Status</span>
              <div>
                <StatusBadge status={claim.status} size="sm" />
              </div>
            </div>

            <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
              <span className="text-[10px] font-mono text-muted-foreground">Ordinal Sequence</span>
              <div className="text-xs font-mono font-medium text-foreground">
                #{claim.ordinal ?? 0 + 1} in transcript
              </div>
            </div>
          </div>

          {claim.sourceText && claim.sourceText !== claim.text && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Candidate Statement (Pre-Verification)
              </span>
              <div className="p-2.5 rounded-lg border border-border/50 bg-muted/30 text-xs text-muted-foreground italic leading-relaxed">
                {claim.sourceText}
              </div>
            </div>
          )}

          {evidenceList.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Grounding Sources ({evidenceList.length})
              </span>
              <div className="space-y-1.5">
                {evidenceList.map((ev, i) => (
                  <button
                    key={ev.chunkId || i}
                    type="button"
                    onClick={() => setActiveTab('evidence')}
                    className="w-full text-left p-2 rounded border border-border/50 bg-muted/20 hover:bg-muted/50 transition-colors flex items-center justify-between text-xs"
                  >
                    <span className="truncate font-medium text-foreground flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">
                        {(ev.metadata?.filename as string) || (ev.metadata?.documentFilename as string) || 'Document'}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">
                      p. {ev.pageNumber ?? (ev.metadata?.pageNumber as number) ?? 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Evidence */}
        <TabsContent value="evidence" className="flex-1 overflow-y-auto p-4 space-y-3 m-0 scrollbar-thin">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span>Supporting Evidence Chunks</span>
            <span>{evidenceList.length} items</span>
          </div>

          {evidenceList.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg">
              No direct vector chunks associated with this claim.
            </div>
          ) : (
            <div className="space-y-3">
              {evidenceList.map((ev, i) => {
                const docId = ev.documentId;
                const pageNum = ev.pageNumber ?? (ev.metadata?.pageNumber as number | undefined);
                const filename = (ev.metadata?.filename as string) || (ev.metadata?.documentFilename as string) || 'Knowledge Document';
                const knowledgeUrl = docId
                  ? pageNum
                    ? `/projects/${projectId}/knowledge/${docId}?page=${pageNum}`
                    : `/projects/${projectId}/knowledge/${docId}`
                  : null;

                return (
                  <div
                    key={ev.chunkId || i}
                    className="p-3 rounded-lg border border-border/70 bg-card/60 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                      <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                        <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">{filename}</span>
                      </span>
                      {pageNum && (
                        <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/60 border border-border/40 shrink-0">
                          Page {pageNum}
                        </span>
                      )}
                    </div>

                    {ev.heading && (
                      <div className="text-[10px] font-mono text-muted-foreground">
                        Section: <span className="text-foreground">{ev.heading}</span>
                      </div>
                    )}

                    <p className="text-xs text-foreground/90 leading-relaxed italic bg-muted/20 p-2 rounded border border-border/30">
                      &ldquo;{ev.text}&rdquo;
                    </p>

                    {knowledgeUrl && (
                      <div className="pt-1 flex items-center justify-end">
                        <Link
                          href={knowledgeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                        >
                          <span>Open in Knowledge Base</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Verification */}
        <TabsContent value="verification" className="flex-1 overflow-y-auto p-4 space-y-4 m-0 scrollbar-thin">
          {/* Plain Human Explanation */}
          <div className="p-3 rounded-lg border border-border/70 bg-card/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Verification Verdict
              </span>
              <StatusBadge status={claim.status} size="sm" />
            </div>

            <p className="text-xs text-foreground leading-relaxed">
              {claim.status === 'verified' && (
                <>Evidence directly <strong>entails</strong> and confirms the statements in this claim.</>
              )}
              {claim.status === 'recovered' && (
                <>This claim was autonomously revised and re-verified against supporting evidence.</>
              )}
              {claim.status === 'flagged' && (
                <>Evidence <strong>contradicts</strong> this statement or failed technical invariant checks.</>
              )}
              {claim.status === 'needs_review' && (
                <>Evidence is inconclusive or insufficient for complete factual verification.</>
              )}
              {claim.status === 'pending' && (
                <>Verification is queued or pending inference execution.</>
              )}
            </p>
          </div>

          {/* M1 DeBERTa NLI Classification Distribution */}
          {verification && (
            <div className="space-y-2 p-3 rounded-lg border border-border/70 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Neural NLI Cross-Encoder Scores
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {verification.modelVersion || 'DeBERTa-v3'}
                </span>
              </div>

              <div className="space-y-2 pt-1 text-xs font-mono">
                {/* Entailment */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-emerald-500 font-medium">Entailment</span>
                    <span>{(verification.scores.entailment * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.max(0, Math.min(100, verification.scores.entailment * 100))}%` }}
                    />
                  </div>
                </div>

                {/* Neutral */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-amber-500 font-medium">Neutral</span>
                    <span>{(verification.scores.neutral * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${Math.max(0, Math.min(100, verification.scores.neutral * 100))}%` }}
                    />
                  </div>
                </div>

                {/* Contradiction */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-rose-500 font-medium">Contradiction</span>
                    <span>{(verification.scores.contradiction * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full"
                      style={{ width: `${Math.max(0, Math.min(100, verification.scores.contradiction * 100))}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border/40 text-[10px] text-muted-foreground flex items-center justify-between">
                <span>Grounding Score:</span>
                <span className="font-mono text-foreground font-semibold">
                  {(verification.groundingScore * 100).toFixed(1)}%
                </span>
              </div>

              <div className="text-[9px] text-muted-foreground/80 italic pt-1">
                * Note: NLI distribution scores represent natural language premise-hypothesis alignment, not absolute truth probabilities.
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab 4: Recovery (Observable Playback Sequence) */}
        {isRecovered && (
          <TabsContent value="recovery" className="flex-1 overflow-y-auto p-4 space-y-4 m-0 scrollbar-thin">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-500">
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Contradiction Recovery Audit Sequence</span>
            </div>

            <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
              {/* Step 1: Initial Candidate Claim */}
              <div className="relative space-y-1">
                <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-muted-foreground border-2 border-background" />
                <span className="text-[10px] font-mono text-muted-foreground">1. Initial Generation</span>
                <p className="text-xs text-muted-foreground/80 line-through bg-muted/20 p-2 rounded border border-border/40">
                  {claim.sourceText || 'Original uncalibrated candidate statement'}
                </p>
              </div>

              {/* Step 2: Verification Failure Diagnosis */}
              <div className="relative space-y-1">
                <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-background" />
                <span className="text-[10px] font-mono text-rose-500">2. Verification Conflict Detected</span>
                <p className="text-xs text-foreground bg-rose-500/10 border border-rose-500/20 p-2 rounded">
                  Dual-stage engine flagged discrepancy with canonical evidence chunks.
                </p>
              </div>

              {/* Step 3: Autonomous Recovery / Revision */}
              <div className="relative space-y-1">
                <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-background" />
                <span className="text-[10px] font-mono text-blue-500">3. Bounded Re-Retrieval & Targeted Revision</span>
                <p className="text-xs text-foreground bg-blue-500/10 border border-blue-500/20 p-2 rounded">
                  Agent targeted contradictory entities and aligned with authoritative document evidence.
                </p>
              </div>

              {/* Step 4: Final Settled State */}
              <div className="relative space-y-1">
                <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                <span className="text-[10px] font-mono text-emerald-500">4. Recovered Entailment Verified</span>
                <p className="text-xs text-foreground font-medium bg-emerald-500/10 border border-emerald-500/20 p-2 rounded">
                  {claim.text}
                </p>
              </div>
            </div>
          </TabsContent>
        )}

        {/* Tab 5: Advanced (Phoenix/LangSmith style technical trace) */}
        <TabsContent value="advanced" className="flex-1 overflow-y-auto p-4 space-y-3 m-0 scrollbar-thin">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Cpu className="h-3.5 w-3.5 text-primary" />
            <span>Trace & Diagnostic Metadata</span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
              <span className="text-[10px] text-muted-foreground">Claim ID</span>
              <div className="truncate text-foreground">{claim.claimId}</div>
            </div>

            <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
              <span className="text-[10px] text-muted-foreground">Claim Verification Status</span>
              <div className="text-foreground capitalize">{claim.status}</div>
            </div>

            <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
              <span className="text-[10px] text-muted-foreground">Sequence Ordinal</span>
              <div className="text-foreground">Index #{claim.ordinal ?? 0}</div>
            </div>

            {verification?.modelVersion && (
              <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
                <span className="text-[10px] text-muted-foreground">Verification Model</span>
                <div className="truncate text-foreground">{verification.modelVersion}</div>
              </div>
            )}

            {verification?.groundingScore !== undefined && (
              <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
                <span className="text-[10px] text-muted-foreground">Grounding Score</span>
                <div className="text-foreground">{(verification.groundingScore * 100).toFixed(1)}%</div>
              </div>
            )}

            <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
              <span className="text-[10px] text-muted-foreground">Associated Evidence Chunks</span>
              <div className="text-foreground">{evidenceList.length} chunks</div>
            </div>

            {generationMetadata?.provider && (
              <div className="p-2 rounded border border-border/50 bg-muted/20 space-y-1">
                <span className="text-[10px] text-muted-foreground">LLM Provider</span>
                <div className="truncate text-foreground">{String(generationMetadata.provider)}</div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
