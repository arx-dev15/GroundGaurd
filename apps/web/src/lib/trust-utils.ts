import type { Claim, ClaimStatus, GenerationStatus, VerificationLabel } from '@groundguard/types';

export interface TrustSummaryData {
  headline: string;
  subline: string;
  verifiedCount: number;
  recoveredCount: number;
  flaggedCount: number;
  reviewCount: number;
  pendingCount: number;
  totalCount: number;
  sourceCount: number;
  variant: 'success' | 'recovered' | 'warning' | 'neutral' | 'danger';
}

/**
 * Presentation mapping for canonical claim states.
 * Canonical backend states (pending, verified, flagged, recovered, needs_review)
 * are NEVER modified in domain logic.
 */
export const CLAIM_STATE_CONFIG: Record<
  ClaimStatus,
  {
    label: string;
    description: string;
    badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
    colorClasses: string;
    borderClasses: string;
  }
> = {
  verified: {
    label: 'Verified',
    description: 'Evidence directly entails this statement.',
    badgeVariant: 'secondary',
    colorClasses: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/15',
    borderClasses: 'border-emerald-500/30 dark:border-emerald-500/40',
  },
  recovered: {
    label: 'Recovered',
    description: 'Autonomously revised and re-verified against evidence.',
    badgeVariant: 'secondary',
    colorClasses: 'text-blue-700 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/15',
    borderClasses: 'border-blue-500/30 dark:border-blue-500/40',
  },
  flagged: {
    label: 'Contradicted',
    description: 'Contradicts retrieved project evidence.',
    badgeVariant: 'destructive',
    colorClasses: 'text-rose-700 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-500/15',
    borderClasses: 'border-rose-500/30 dark:border-rose-500/40',
  },
  needs_review: {
    label: 'Needs review',
    description: 'Inconclusive or insufficient supporting evidence.',
    badgeVariant: 'outline',
    colorClasses: 'text-amber-700 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/15',
    borderClasses: 'border-amber-500/30 dark:border-amber-500/40',
  },
  pending: {
    label: 'Pending',
    description: 'Awaiting verification by M1 cross-encoder.',
    badgeVariant: 'outline',
    colorClasses: 'text-muted-foreground bg-muted/40',
    borderClasses: 'border-border/60',
  },
};

/**
 * Deterministically derives the Trust Summary for a generation.
 * Follows F6 rules:
 * - NO fake accuracy percentage
 * - NO fake trust score
 * - Real claim counts only
 */
export function deriveTrustSummary(
  claims: Claim[] = [],
  generationStatus?: GenerationStatus,
  disposition?: string
): TrustSummaryData {
  const verifiedCount = claims.filter((c) => c.status === 'verified').length;
  const recoveredCount = claims.filter((c) => c.status === 'recovered').length;
  const flaggedCount = claims.filter((c) => c.status === 'flagged').length;
  const reviewCount = claims.filter((c) => c.status === 'needs_review').length;
  const pendingCount = claims.filter((c) => c.status === 'pending').length;
  const totalCount = claims.length;

  // Extract unique sources (by documentId or filename)
  const uniqueSources = new Set<string>();
  for (const c of claims) {
    for (const ev of c.evidence || []) {
      const src =
        ev.documentId ||
        (ev.metadata?.filename as string) ||
        (ev.metadata?.documentFilename as string) ||
        ev.chunkId;
      if (src) uniqueSources.add(src);
    }
  }
  const sourceCount = uniqueSources.size;

  // Derive deterministic headline and presentation variant
  if (generationStatus === 'cancelled') {
    return {
      headline: 'Cancelled',
      subline: 'Generation was cancelled by user',
      verifiedCount,
      recoveredCount,
      flaggedCount,
      reviewCount,
      pendingCount,
      totalCount,
      sourceCount,
      variant: 'neutral',
    };
  }

  if (generationStatus === 'failed') {
    return {
      headline: 'Generation failed',
      subline: 'Verification could not be completed',
      verifiedCount,
      recoveredCount,
      flaggedCount,
      reviewCount,
      pendingCount,
      totalCount,
      sourceCount,
      variant: 'danger',
    };
  }

  // Final trust disposition from the backend outranks claim-count heuristics.
  if (disposition === 'UNVERIFIED') {
    return {
      headline: 'Verification unavailable',
      subline: 'Claims in this answer could not be extracted or verified',
      verifiedCount: 0,
      recoveredCount,
      flaggedCount,
      reviewCount,
      pendingCount,
      totalCount,
      sourceCount,
      variant: 'warning',
    };
  }
  if (disposition === 'INSUFFICIENT') {
    return {
      headline: 'Insufficient evidence',
      subline: 'The project documents do not contain this information',
      verifiedCount: 0,
      recoveredCount: 0,
      flaggedCount: 0,
      reviewCount: 0,
      pendingCount: 0,
      totalCount: 0,
      sourceCount: 0,
      variant: 'neutral',
    };
  }

  if (totalCount === 0) {
    return {
      headline: 'Informational response',
      subline: 'No verifiable factual claims extracted',
      verifiedCount: 0,
      recoveredCount: 0,
      flaggedCount: 0,
      reviewCount: 0,
      pendingCount: 0,
      totalCount: 0,
      sourceCount: 0,
      variant: 'neutral',
    };
  }

  if (pendingCount > 0) {
    return {
      headline: 'Verification incomplete',
      subline: `${pendingCount} pending verification · ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`,
      verifiedCount,
      recoveredCount,
      flaggedCount,
      reviewCount,
      pendingCount,
      totalCount,
      sourceCount,
      variant: 'neutral',
    };
  }

  if (flaggedCount > 0 || reviewCount > 0) {
    const issues = [
      flaggedCount > 0 ? `${flaggedCount} flagged` : null,
      reviewCount > 0 ? `${reviewCount} review` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      headline: 'Review required',
      subline: `${issues} · ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`,
      verifiedCount,
      recoveredCount,
      flaggedCount,
      reviewCount,
      pendingCount,
      totalCount,
      sourceCount,
      variant: flaggedCount > 0 ? 'danger' : 'warning',
    };
  }

  if (recoveredCount > 0) {
    return {
      headline: 'Verified with recovery',
      subline: `${verifiedCount} verified · ${recoveredCount} recovered · ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`,
      verifiedCount,
      recoveredCount,
      flaggedCount,
      reviewCount,
      pendingCount,
      totalCount,
      sourceCount,
      variant: 'recovered',
    };
  }

  return {
    headline: 'All supported',
    subline: `${verifiedCount} verified · ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`,
    verifiedCount,
    recoveredCount,
    flaggedCount,
    reviewCount,
    pendingCount,
    totalCount,
    sourceCount,
    variant: 'success',
  };
}

/**
 * Format grounding score safely without false precision.
 * Grounding scores are premise-hypothesis NLI alignments, NOT truth probabilities.
 */
export function formatGroundingScore(score?: number): string {
  if (score === undefined || score === null || Number.isNaN(score)) {
    return 'N/A';
  }
  return Number(score).toFixed(2);
}

/**
 * Maps SSE events to user-friendly runtime state updates.
 */
export function mapSSEEventToStatus(
  event: string,
  data?: Record<string, unknown>
): {
  state: GenerationStatus;
  label: string;
  isTerminal: boolean;
} {
  switch (event) {
    case 'generation.started':
      return {
        state: 'generating',
        label: 'Preparing answer & retrieving knowledge...',
        isTerminal: false,
      };
    case 'sentence.verified':
      return {
        state: 'verifying',
        label: 'Verifying claims against evidence...',
        isTerminal: false,
      };
    case 'sentence.flagged':
      return {
        state: 'verifying',
        label: 'Discrepancy detected with evidence...',
        isTerminal: false,
      };
    case 'recovery.started':
      return {
        state: 'recovering',
        label: 'Autonomously revising contradictory claim...',
        isTerminal: false,
      };
    case 'recovery.completed':
      return {
        state: 'recovering',
        label: 'Recovery candidate verified...',
        isTerminal: false,
      };
    case 'generation.completed':
      return {
        state: 'completed',
        label: 'Generation completed',
        isTerminal: true,
      };
    case 'generation.failed':
      if (data?.code === 'GENERATION_CANCELLED') {
        return {
          state: 'cancelled',
          label: 'Cancelled by user',
          isTerminal: true,
        };
      }
      return {
        state: 'failed',
        label: (data?.message as string) || 'Generation failed',
        isTerminal: true,
      };
    default:
      return {
        state: 'generating',
        label: 'Processing...',
        isTerminal: false,
      };
  }
}
