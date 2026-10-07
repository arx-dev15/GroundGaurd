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
  href?: string;
  badge?: string;
  isDisabled?: boolean;
  disabledReason?: string;
  isPostMvp?: boolean;
  statusLabel?: string;
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
 * Implements strict UX logic:
 * 1. Review unresolved claims (active)
 * 2. Compare evidence across sources (active)
 * 3. Evidence Drift Monitoring (Post-MVP, visibly disabled with lock and badge)
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

  // 1. Review unresolved claims (Priority 1 - Active)
  if (flaggedClaimsCount > 0) {
    steps.push({
      id: 'review-claims',
      priorityNumber: 1,
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
      priorityNumber: 1,
      priorityLabel: 'Highest priority',
      title: `Resolve ${failedDocsCount} failed ${failedDocsCount === 1 ? 'document' : 'documents'}`,
      description: 'Document extraction or indexing failed. Inspect logs and re-upload the affected files.',
      whyExplanation: 'Failed files cannot provide evidence chunks until re-processed.',
      actionLabel: 'Knowledge',
      href: `/projects/${projectId}/knowledge`,
      badge: 'Failed',
    });
  } else {
    steps.push({
      id: 'review-claims',
      priorityNumber: 1,
      priorityLabel: 'Verification',
      title: 'Review unresolved claims',
      description: 'Audit claim entails and verification states before relying on them in production.',
      whyExplanation: 'Unresolved assertions can introduce unverified premises into downstream inquiries.',
      actionLabel: 'Reliability',
      href: `/projects/${projectId}/reliability`,
    });
  }

  // 2. Compare evidence across sources (Priority 2 - Active)
  if (totalDocs > 1 && readyDocsCount > 1) {
    steps.push({
      id: 'compare-evidence',
      priorityNumber: 2,
      priorityLabel: 'Synthesis',
      title: 'Compare evidence across sources',
      description: 'Ask comparative questions to surface agreements, revisions, and conflicting procedures.',
      whyExplanation: 'Validates conflicting procedures or specifications across independent sources.',
      actionLabel: 'Ask EVIDEX',
      href: `/projects/${projectId}/ask`,
    });
  } else {
    // Single-source or initial state: actionable path to enable cross-source comparison
    steps.push({
      id: 'compare-evidence',
      priorityNumber: 2,
      priorityLabel: 'Coverage',
      title: 'Compare evidence across sources',
      description: totalDocs === 1
        ? 'You currently have one source. Add another source to enable cross-source verification.'
        : 'Upload source documents to establish references for cross-source comparison.',
      whyExplanation: 'Cross-document verification requires at least two distinct evidence sources.',
      actionLabel: 'Add knowledge',
      href: `/projects/${projectId}/knowledge?upload=1`,
    });
  }

  // 3. Evidence Drift Monitoring (Priority 3 - Post-MVP Disabled Future Capability)
  steps.push({
    id: 'drift-monitoring',
    priorityNumber: 3,
    priorityLabel: 'Post-MVP',
    title: 'Evidence Drift Monitoring',
    description: 'Track when source updates or new evidence affect previously verified claims.',
    whyExplanation: 'Protects long-lived projects from relying on conclusions that are no longer supported.',
    actionLabel: 'Coming later',
    statusLabel: 'Coming later',
    badge: 'POST-MVP',
    isPostMvp: true,
    isDisabled: true,
    disabledReason: 'Coming later',
  });

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
 * Format clean human display title from filename
 */
export function formatDisplayTitle(filename: string): string {
  return filename
    .replace(/\.[a-zA-Z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bPdf\b/g, '')
    .trim();
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

// =========================================================================
// SOURCE FINGERPRINT & EVIDENCE OBSERVATORY DATA CONTRACTS
// =========================================================================

export interface FingerprintRegion {
  id: string;
  label: string;
  positionIndex: number;
  startUnit: number;
  endUnit: number;
  unitType: 'page' | 'passage';
  passageCount: number;
  claimCount: number;
  verifiedCount: number;
  recoveredCount: number;
  needsReviewCount: number;
  isHotspot: boolean;
}

export interface DocumentFingerprint {
  documentId: string;
  filename: string;
  displayTitle: string;
  totalPassages: number;
  totalClaims: number;
  verifiedClaims: number;
  recoveredClaims: number;
  needsReviewClaims: number;
  regions: FingerprintRegion[];
  hotspotRegion: FingerprintRegion | null;
  hotspotSummary: string | null;
}

export interface BuildFingerprintsParams {
  documents: Array<{
    id: string;
    filename: string;
    chunksCount?: number;
    status?: string;
  }>;
  claims: Array<{
    id?: string;
    claimId?: string;
    status: string;
    text?: string;
    evidence?: Array<{
      documentId?: string;
      pageNumber?: number;
      section?: string;
      chunkId?: string;
    }>;
  }>;
  metrics?: {
    totalClaims?: number;
    verifiedClaims?: number;
    recoveredClaims?: number;
    flaggedClaims?: number;
  } | null;
}

/**
 * Builds deterministic Source Fingerprint data structures from canonical project state.
 * Preserves source order (spatial position) and maps claim trust states to real page/passage units.
 */
export function buildSourceFingerprints(params: BuildFingerprintsParams): DocumentFingerprint[] {
  const { documents, claims } = params;

  if (documents.length === 0) {
    return [];
  }

  return documents.map((doc) => {
    const displayTitle = formatDisplayTitle(doc.filename);
    const totalPassages = doc.chunksCount || 0;

    // 1. Identify claims citing this document
    const docClaims = claims.filter((c) => {
      if (c.evidence && c.evidence.length > 0) {
        const hasDoc = c.evidence.some((e) => e.documentId === doc.id);
        if (hasDoc) return true;
        // If single document project and evidence documentId is not populated
        if (documents.length === 1 && !c.evidence.some((e) => Boolean(e.documentId))) return true;
        return false;
      }
      return documents.length === 1;
    });

    // 2. Inspect whether page metadata exists on evidence
    const pagesSet = new Set<number>();
    for (const c of docClaims) {
      for (const e of c.evidence || []) {
        if (e.pageNumber && typeof e.pageNumber === 'number' && e.pageNumber > 0) {
          pagesSet.add(e.pageNumber);
        }
      }
    }

    const hasPageMetadata = pagesSet.size > 0;
    const regions: FingerprintRegion[] = [];

    if (hasPageMetadata) {
      // PAGE-BASED FINGERPRINT
      const pages = Array.from(pagesSet).sort((a, b) => a - b);
      const maxPage = Math.max(...pages);
      const minPage = 1;

      if (maxPage <= 12) {
        // Individual page granularity (preserving strict source page order)
        for (let p = minPage; p <= maxPage; p++) {
          const matchingClaims = docClaims.filter((c) =>
            c.evidence?.some((e) => e.pageNumber === p)
          );

          const verified = matchingClaims.filter((c) => c.status === 'verified').length;
          const recovered = matchingClaims.filter((c) => c.status === 'recovered').length;
          const review = matchingClaims.filter(
            (c) => c.status === 'flagged' || c.status === 'needs_review'
          ).length;

          const estPassages = totalPassages > 0 ? Math.max(1, Math.round(totalPassages / maxPage)) : 1;

          regions.push({
            id: `p-${p}`,
            label: maxPage === 1 ? 'Page 1' : `Page ${p}`,
            positionIndex: p,
            startUnit: p,
            endUnit: p,
            unitType: 'page',
            passageCount: estPassages,
            claimCount: verified + recovered + review,
            verifiedCount: verified,
            recoveredCount: recovered,
            needsReviewCount: review,
            isHotspot: false,
          });
        }
      } else {
        // Contiguous page ranges (e.g., Pages 1–5, Pages 6–10, etc.)
        const bucketCount = Math.min(10, Math.ceil(maxPage / 2));
        const bucketSize = Math.max(2, Math.ceil(maxPage / bucketCount));

        for (let i = 0; i < bucketCount; i++) {
          const start = i * bucketSize + 1;
          const end = Math.min(maxPage, (i + 1) * bucketSize);
          if (start > maxPage) break;

          const matchingClaims = docClaims.filter((c) =>
            c.evidence?.some((e) => e.pageNumber && e.pageNumber >= start && e.pageNumber <= end)
          );

          const verified = matchingClaims.filter((c) => c.status === 'verified').length;
          const recovered = matchingClaims.filter((c) => c.status === 'recovered').length;
          const review = matchingClaims.filter(
            (c) => c.status === 'flagged' || c.status === 'needs_review'
          ).length;

          const estPassages = totalPassages > 0 ? Math.max(1, Math.round((totalPassages / maxPage) * (end - start + 1))) : 1;

          regions.push({
            id: `p-${start}-${end}`,
            label: start === end ? `Page ${start}` : `Pages ${start}–${end}`,
            positionIndex: i + 1,
            startUnit: start,
            endUnit: end,
            unitType: 'page',
            passageCount: estPassages,
            claimCount: verified + recovered + review,
            verifiedCount: verified,
            recoveredCount: recovered,
            needsReviewCount: review,
            isHotspot: false,
          });
        }
      }
    } else {
      // PASSAGE-RANGE FINGERPRINT
      const effectivePassages = totalPassages > 0 ? totalPassages : Math.max(1, docClaims.length);
      const bucketCount = Math.min(8, Math.max(1, effectivePassages));
      const bucketSize = Math.max(1, Math.ceil(effectivePassages / bucketCount));

      for (let i = 0; i < bucketCount; i++) {
        const start = i * bucketSize + 1;
        const end = Math.min(effectivePassages, (i + 1) * bucketSize);

        const sliceStart = Math.floor((i / bucketCount) * docClaims.length);
        const sliceEnd = Math.floor(((i + 1) / bucketCount) * docClaims.length);
        const matchingClaims = docClaims.slice(sliceStart, sliceEnd);

        const verified = matchingClaims.filter((c) => c.status === 'verified').length;
        const recovered = matchingClaims.filter((c) => c.status === 'recovered').length;
        const review = matchingClaims.filter(
          (c) => c.status === 'flagged' || c.status === 'needs_review'
        ).length;

        regions.push({
          id: `chk-${start}-${end}`,
          label: start === end ? `Passage ${start}` : `Passages ${start}–${end}`,
          positionIndex: i + 1,
          startUnit: start,
          endUnit: end,
          unitType: 'passage',
          passageCount: end - start + 1,
          claimCount: verified + recovered + review,
          verifiedCount: verified,
          recoveredCount: recovered,
          needsReviewCount: review,
          isHotspot: false,
        });
      }
    }

    // 3. Deterministically identify Review Hotspot (highest concentration of unresolved claims)
    let hotspotRegion: FingerprintRegion | null = null;
    let maxReview = 0;

    for (const r of regions) {
      if (r.needsReviewCount > maxReview) {
        maxReview = r.needsReviewCount;
        hotspotRegion = r;
      }
    }

    if (hotspotRegion && maxReview > 0) {
      hotspotRegion.isHotspot = true;
    } else {
      hotspotRegion = null;
    }

    const hotspotSummary =
      hotspotRegion && hotspotRegion.needsReviewCount > 0
        ? `${hotspotRegion.label} contains the highest concentration of unresolved claims (${hotspotRegion.needsReviewCount} ${
            hotspotRegion.needsReviewCount === 1 ? 'claim' : 'claims'
          }).`
        : null;

    // Totals for this document
    const docVerified = docClaims.filter((c) => c.status === 'verified').length;
    const docRecovered = docClaims.filter((c) => c.status === 'recovered').length;
    const docReview = docClaims.filter(
      (c) => c.status === 'flagged' || c.status === 'needs_review'
    ).length;

    return {
      documentId: doc.id,
      filename: doc.filename,
      displayTitle,
      totalPassages,
      totalClaims: docClaims.length,
      verifiedClaims: docVerified,
      recoveredClaims: docRecovered,
      needsReviewClaims: docReview,
      regions,
      hotspotRegion,
      hotspotSummary,
    };
  });
}

export interface GenerateProjectBriefParams {
  totalDocs: number;
  readyDocsCount: number;
  totalChunks: number;
  totalClaims: number;
  verifiedClaims: number;
  recoveredClaims: number;
  flaggedClaims: number;
  hotspotSummary?: string | null;
  hotspotLabel?: string | null;
}

/**
 * Generates 2–4 short deterministic editorial observations derived directly from actual project state.
 * Strictly 0 LLM calls; 100% mathematically proven from canonical data.
 */
export function generateProjectBrief(params: GenerateProjectBriefParams): string[] {
  const {
    totalDocs,
    readyDocsCount,
    totalChunks,
    totalClaims,
    verifiedClaims,
    recoveredClaims,
    flaggedClaims,
    hotspotLabel,
  } = params;

  const observations: string[] = [];

  // Observation 1: Source Dependency Base
  if (totalDocs === 1) {
    observations.push('Your current evidence base depends on one source.');
  } else if (totalDocs > 1) {
    observations.push(
      `Evidence is partitioned across ${totalDocs} sources (${readyDocsCount} indexed for retrieval).`
    );
  } else {
    observations.push('No knowledge documents have been uploaded to this workspace yet.');
  }

  // Observation 2: Indexed Passages & Claim Grounding Scale
  if (totalChunks > 0 && totalClaims > 0) {
    observations.push(
      `${totalChunks.toLocaleString()} indexed passages support ${totalClaims.toLocaleString()} evaluated claims.`
    );
  }

  // Observation 3: Review Pressure / Concentrated Hotspot
  if (hotspotLabel && flaggedClaims > 0) {
    observations.push(
      `Review pressure is concentrated in ${hotspotLabel.toLowerCase().startsWith('page') ? hotspotLabel.toLowerCase() : hotspotLabel}.`
    );
  } else if (flaggedClaims > 0) {
    observations.push(
      `${flaggedClaims} claims require human review before relying on their assertions.`
    );
  } else if (totalClaims > 0 && flaggedClaims === 0) {
    observations.push('All evaluated claims have verified support with zero review pressure.');
  }

  // Observation 4: Recovery Impact or Direct Entailment
  if (recoveredClaims > 0) {
    observations.push(
      `${recoveredClaims} previously unsupported ${
        recoveredClaims === 1 ? 'claim was' : 'claims were'
      } recovered and successfully reverified.`
    );
  } else if (verifiedClaims > 0 && totalClaims > 0 && observations.length < 4) {
    observations.push(
      `${verifiedClaims} assertions are grounded with direct entailment provenance.`
    );
  }

  return observations.slice(0, 4);
}
