/**
 * Pure helper functions for the EVIDEX Populated Overview / Project Pulse experience.
 * Fully deterministic, zero LLM reliance, strictly grounded on canonical project state.
 */

export type ProjectReadinessState = 'READY' | 'PARTIALLY_READY' | 'PREPARING' | 'NEEDS_ATTENTION';

export interface ReadinessEvaluationParams {
  totalDocs: number;
  readyDocsCount: number;
  processingDocsCount: number;
  failedDocsCount: number;
  flaggedClaimsCount: number;
  totalChunks?: number;
  totalClaims?: number;
}

/**
 * Computes deterministic project readiness state from real document and claim counts.
 */
export function computeProjectReadiness(params: ReadinessEvaluationParams): ProjectReadinessState {
  const { totalDocs, readyDocsCount, processingDocsCount, failedDocsCount, flaggedClaimsCount } = params;

  if (totalDocs === 0) {
    return 'PREPARING';
  }

  // If any documents failed or any claims require attention -> NEEDS_ATTENTION
  if (failedDocsCount > 0 || flaggedClaimsCount > 0) {
    return 'NEEDS_ATTENTION';
  }

  // If some docs are ready and some are still processing -> PARTIALLY_READY
  if (readyDocsCount > 0 && processingDocsCount > 0) {
    return 'PARTIALLY_READY';
  }

  // If docs exist but none are ready yet -> PREPARING
  if (processingDocsCount > 0 && readyDocsCount === 0) {
    return 'PREPARING';
  }

  // If all documents are ready and nothing is processing or failed -> READY
  if (readyDocsCount > 0 && processingDocsCount === 0 && failedDocsCount === 0) {
    return 'READY';
  }

  return 'PREPARING';
}

/**
 * Generates concise, editorial copy for the Hero section based on readiness state.
 */
export function getHeroSummaryText(state: ProjectReadinessState, params: ReadinessEvaluationParams): string {
  const {
    readyDocsCount,
    processingDocsCount,
    failedDocsCount,
    flaggedClaimsCount,
    totalChunks = 0,
    totalClaims = 0,
  } = params;

  switch (state) {
    case 'READY':
      if (totalClaims > 0) {
        return `Your evidence base is ready. EVIDEX has indexed ${readyDocsCount} ${
          readyDocsCount === 1 ? 'source' : 'sources'
        } across ${totalChunks} passages. All evaluated claims are verified.`;
      }
      return `Your evidence base is ready to ask. ${readyDocsCount} ${
        readyDocsCount === 1 ? 'source is' : 'sources are'
      } indexed across ${totalChunks} passages and available to EVIDEX.`;

    case 'NEEDS_ATTENTION':
      if (flaggedClaimsCount > 0) {
        if (totalClaims > 0 && totalChunks > 0) {
          return `Your evidence base is ready. EVIDEX has evaluated ${totalClaims} claims from ${totalChunks} indexed passages. ${flaggedClaimsCount} ${
            flaggedClaimsCount === 1 ? 'claim still needs' : 'claims still need'
          } review.`;
        }
        return `Your evidence base is ready, but ${flaggedClaimsCount} ${
          flaggedClaimsCount === 1 ? 'claim needs' : 'claims need'
        } review.`;
      }
      return `${failedDocsCount} ${failedDocsCount === 1 ? 'source' : 'sources'} encountered an ingestion issue and requires re-processing.`;

    case 'PREPARING':
      return `${processingDocsCount} ${
        processingDocsCount === 1 ? 'source is' : 'sources are'
      } still being processed.${
        readyDocsCount > 0
          ? ' Available sources can already be queried.'
          : ' Inquiries will be enabled once indexing completes.'
      }`;

    case 'PARTIALLY_READY':
      return `${readyDocsCount} ${
        readyDocsCount === 1 ? 'source is' : 'sources are'
      } ready, while ${processingDocsCount} ${
        processingDocsCount === 1 ? 'is' : 'are'
      } indexing. Available sources can be queried immediately.`;
  }
}

export interface SuggestedNextStep {
  id: string;
  priorityNumber: number;
  priorityLabel?: string;
  title: string;
  description: string;
  whyExplanation?: string;
  actionLabel: string;
  href: string;
  badge?: string;
  isDisabled?: boolean;
  disabledReason?: string;
}

export interface NextStepsContext {
  totalDocs: number;
  readyDocsCount: number;
  processingDocsCount: number;
  failedDocsCount: number;
  flaggedClaimsCount: number;
  conversationsCount: number;
  projectId: string;
}

/**
 * Produces up to 3 vertically prioritized next steps based on real project state.
 * Implements strict UX logic: impossible actions are disabled or contextualized,
 * and every action explains WHY it matters.
 */
export function getSuggestedNextSteps(ctx: NextStepsContext): SuggestedNextStep[] {
  const steps: SuggestedNextStep[] = [];
  const {
    totalDocs,
    readyDocsCount,
    processingDocsCount,
    failedDocsCount,
    flaggedClaimsCount,
    conversationsCount,
    projectId,
  } = ctx;

  let currentPriority = 1;

  // 1. Blocking / Trust Issue (Priority 1)
  if (flaggedClaimsCount > 0) {
    steps.push({
      id: 'review-claims',
      priorityNumber: currentPriority++,
      priorityLabel: 'Highest priority',
      title: `Review ${flaggedClaimsCount} unresolved ${flaggedClaimsCount === 1 ? 'claim' : 'claims'}`,
      description: 'Review claims flagged during verification before relying on them in production.',
      whyExplanation: 'Unresolved assertions can introduce unverified premises into downstream inquiries.',
      actionLabel: 'Reliability',
      href: `/projects/${projectId}/reliability`,
      badge: 'Attention',
    });
  } else if (failedDocsCount > 0) {
    steps.push({
      id: 'resolve-failed-docs',
      priorityNumber: currentPriority++,
      priorityLabel: 'Highest priority',
      title: `Resolve ${failedDocsCount} failed ${failedDocsCount === 1 ? 'document' : 'documents'}`,
      description: 'Document extraction or indexing failed. Inspect logs and re-upload the affected files.',
      whyExplanation: 'Failed files cannot provide evidence chunks until re-processed.',
      actionLabel: 'Knowledge',
      href: `/projects/${projectId}/knowledge`,
      badge: 'Failed',
    });
  }

  // 2. Missing Knowledge / Coverage Broadening (Priority 2)
  if (totalDocs === 1 && steps.length < 3) {
    steps.push({
      id: 'add-second-source',
      priorityNumber: currentPriority++,
      priorityLabel: 'Coverage',
      title: 'Add another source',
      description: 'You currently have one source. Additional evidence enables cross-source verification.',
      whyExplanation: 'Single-source evidence limits verification to internal document consistency.',
      actionLabel: 'Add knowledge',
      href: `/projects/${projectId}/knowledge?upload=1`,
    });
  } else if (totalDocs === 0 && steps.length < 3) {
    steps.push({
      id: 'add-first-source',
      priorityNumber: currentPriority++,
      priorityLabel: 'Knowledge',
      title: 'Upload primary reference document',
      description: 'Supply domain specifications, SEC filings, or policies for grounded retrieval.',
      whyExplanation: 'EvideX requires indexed source text before assertions can be grounded.',
      actionLabel: 'Add knowledge',
      href: `/projects/${projectId}/knowledge?upload=1`,
    });
  } else if (processingDocsCount > 0 && steps.length < 3) {
    steps.push({
      id: 'monitor-indexing',
      priorityNumber: currentPriority++,
      priorityLabel: 'Processing',
      title: 'Inspect processing documents',
      description: `${processingDocsCount} ${processingDocsCount === 1 ? 'file is' : 'files are'} running passage chunking and dense indexing.`,
      whyExplanation: 'New chunks will update the retrieval index once dense embedding finishes.',
      actionLabel: 'Knowledge',
      href: `/projects/${projectId}/knowledge`,
    });
  }

  // 3. Inquiry / Exploration / Cross-Source Verification (Priority 3)
  if (conversationsCount === 0 && readyDocsCount > 0 && steps.length < 3) {
    steps.push({
      id: 'ask-first-question',
      priorityNumber: currentPriority++,
      priorityLabel: 'Inquiry',
      title: 'Ask your first grounded question',
      description: 'Formulate an inquiry to inspect cited passages and sentence-level NLI verification.',
      whyExplanation: 'Exercises sentence-level cross-encoder verification against indexed passages.',
      actionLabel: 'Ask EVIDEX',
      href: `/projects/${projectId}/ask`,
    });
  } else if (totalDocs === 1 && steps.length < 3) {
    // Intelligent UX rule: If only 1 source, cross-source comparison is not immediately actionable
    steps.push({
      id: 'compare-evidence-disabled',
      priorityNumber: currentPriority++,
      priorityLabel: 'Future capability',
      title: 'Compare evidence across sources',
      description: 'Available once another source is added to the project knowledge base.',
      whyExplanation: 'Cross-document verification requires at least two distinct evidence sources.',
      actionLabel: 'Add source first',
      href: `/projects/${projectId}/knowledge?upload=1`,
      isDisabled: true,
      disabledReason: 'Available after another source is added',
    });
  }

  if (totalDocs > 1 && readyDocsCount > 1 && steps.length < 3) {
    steps.push({
      id: 'compare-evidence',
      priorityNumber: currentPriority++,
      priorityLabel: 'Synthesis',
      title: 'Compare evidence across sources',
      description: 'Ask comparative questions to surface agreements, revisions, and conflicting procedures.',
      whyExplanation: 'Validates conflicting procedures or specifications across independent sources.',
      actionLabel: 'Ask EVIDEX',
      href: `/projects/${projectId}/ask`,
    });
  }

  if (steps.length < 3) {
    steps.push({
      id: 'audit-reliability',
      priorityNumber: currentPriority++,
      priorityLabel: 'Audit',
      title: 'Audit verification telemetry',
      description: 'Inspect citation precision, recovery playback, and historical pass rates in Reliability.',
      whyExplanation: 'Confirms grounding precision and autonomous recovery rates before production reliance.',
      actionLabel: 'Reliability',
      href: `/projects/${projectId}/reliability`,
    });
  }

  return steps.slice(0, 3);
}

export interface EvidenceSignal {
  id: string;
  type: 'neutral' | 'attention' | 'verified' | 'recovered';
  statement: string;
  detail?: string;
}

/**
 * Deterministically generates 2–4 meaningful project observations from canonical state.
 * Fully grounded on real project telemetry; zero synthetic assertions.
 */
export function generateEvidenceSignals(params: {
  totalDocs: number;
  readyDocsCount: number;
  failedDocsCount: number;
  totalChunks: number;
  totalClaims: number;
  verifiedClaims: number;
  recoveredClaims: number;
  flaggedClaims: number;
}): EvidenceSignal[] {
  const signals: EvidenceSignal[] = [];

  // Signal 1: Source breadth & cross-verification capability
  if (params.totalDocs === 1) {
    signals.push({
      id: 'single-source',
      type: 'neutral',
      statement: 'Your entire project currently depends on one source, so cross-source verification is not yet possible.',
      detail: 'Additional sources enable cross-document consistency checks.',
    });
  } else if (params.totalDocs > 1) {
    signals.push({
      id: 'multi-source',
      type: 'verified',
      statement: `Evidence is partitioned across ${params.totalDocs} sources, enabling cross-source verification.`,
      detail: `${params.readyDocsCount} of ${params.totalDocs} sources are indexed and available.`,
    });
  }

  // Signal 2: Autonomous recovery impact
  if (params.recoveredClaims > 0) {
    signals.push({
      id: 'recovered-claims',
      type: 'recovered',
      statement: `${params.recoveredClaims} ${
        params.recoveredClaims === 1 ? 'assertion was' : 'assertions were'
      } autonomously repaired and verified without manual intervention.`,
      detail: 'Autonomous recovery repaired neutral or contradicted assertions against passage evidence.',
    });
  }

  // Signal 3: Review workload
  if (params.flaggedClaims > 0) {
    const fraction = params.totalClaims > 0 ? Math.round((params.flaggedClaims / params.totalClaims) * 100) : 0;
    signals.push({
      id: 'review-workload',
      type: 'attention',
      statement: fraction >= 20
        ? `Nearly a third of evaluated claims (${params.flaggedClaims}) still require human review.`
        : `${params.flaggedClaims} claims require human review before relying on those assertions.`,
      detail: 'Inspect unverified statements in Reliability.',
    });
  } else if (params.totalClaims > 0 && params.flaggedClaims === 0) {
    signals.push({
      id: 'zero-review',
      type: 'verified',
      statement: 'All evaluated claims are verified with complete citation provenance.',
      detail: 'Zero unresolved contradictions or neutral assertions.',
    });
  }

  // Signal 4: Evidence density / grounding ratio
  if (params.totalChunks > 0 && params.totalClaims > 0) {
    signals.push({
      id: 'grounding-density',
      type: 'neutral',
      statement: `${params.totalChunks} indexed passages support ${params.totalClaims} evaluated claims across lexical and semantic retrieval.`,
      detail: 'Grounding anchors each assertion to specific passage text.',
    });
  }

  return signals.slice(0, 4);
}

/**
 * Format bytes into human-readable representation.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format timestamp into calm relative time string.
 */
export function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}
