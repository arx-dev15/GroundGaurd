/**
 * Ask progress state driven ONLY by real SSE events from M3 (pure; unit-tested).
 */
export interface SourcePreview {
  chunkId: string;
  documentId?: string;
  documentName: string;
  pageNumber?: number | null;
  excerpt: string;
}

const MAX_PREVIEWS = 5;
const MAX_EXCERPT = 240;

/** Accepts only well-formed, bounded previews from the optional retrieval.completed `sources` field. */
export function parseSourcePreviews(raw: unknown): SourcePreview[] {
  if (!Array.isArray(raw)) return [];
  const out: SourcePreview[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object' || typeof (s as any).chunkId !== 'string') continue;
    const name = (s as any).documentName ?? (s as any).filename;
    if (typeof name !== 'string' || !name) continue;
    const ex = typeof (s as any).excerpt === 'string' ? (s as any).excerpt : '';
    out.push({
      chunkId: (s as any).chunkId,
      documentId: typeof (s as any).documentId === 'string' ? (s as any).documentId : undefined,
      documentName: name,
      pageNumber: typeof (s as any).pageNumber === 'number' ? (s as any).pageNumber : null,
      excerpt: ex.length > MAX_EXCERPT ? ex.slice(0, MAX_EXCERPT) + '…' : ex,
    });
    if (out.length >= MAX_PREVIEWS) break;
  }
  return out;
}

export interface AskProgress {
  submittedAt: number;
  planning: 'unknown' | 'active' | 'done';
  plannerSource?: string;
  sources: SourcePreview[];
  retrievalCompleted: boolean;
  evidenceCount?: number;
  answerStarted: boolean;
  answerCompleted: boolean;
  claimsSupported: number;
  claimsNeedReview: number;
  recoveryStarted: boolean;
  recoveryCompleted: boolean;
  /** Why recovery ended early, as reported by M3: 'time_budget' | 'attempt_budget' | 'cancelled'. */
  recoveryStopReason?: string;
}

export const initialAskProgress = (): AskProgress => ({
  submittedAt: Date.now(),
  planning: 'unknown',
  sources: [],
  retrievalCompleted: false,
  answerStarted: false,
  answerCompleted: false,
  claimsSupported: 0,
  claimsNeedReview: 0,
  recoveryStarted: false,
  recoveryCompleted: false,
});

/** Pure reducer: applies one real SSE event to the progress state (exported for tests). */
export function applyAskEvent(p: AskProgress, event: string, data: any): AskProgress {
  switch (event) {
    case 'planning.started':
      return { ...p, planning: 'active' };
    case 'planning.completed':
      return { ...p, planning: 'done', plannerSource: typeof data?.plannerSource === 'string' ? data.plannerSource : undefined };
    case 'retrieval.completed':
      return {
        ...p,
        planning: p.planning === 'unknown' ? 'unknown' : 'done',
        retrievalCompleted: true,
        evidenceCount: typeof data?.evidenceCount === 'number' ? data.evidenceCount : p.evidenceCount,
        sources: parseSourcePreviews(data?.sources),
      };
    case 'answer.started':
      return { ...p, retrievalCompleted: true, answerStarted: true };
    case 'answer.delta':
      return p.answerStarted ? p : { ...p, retrievalCompleted: true, answerStarted: true };
    case 'answer.completed':
      return { ...p, retrievalCompleted: true, answerStarted: true, answerCompleted: true };
    case 'sentence.verified':
      return { ...p, answerCompleted: true, claimsSupported: p.claimsSupported + 1 };
    case 'sentence.flagged':
      return { ...p, answerCompleted: true, claimsNeedReview: p.claimsNeedReview + 1 };
    case 'recovery.started':
      return { ...p, answerCompleted: true, recoveryStarted: true, claimsSupported: 0, claimsNeedReview: 0 };
    case 'recovery.completed':
      return { ...p, recoveryCompleted: true, recoveryStopReason: typeof data?.stoppedReason === 'string' ? data.stoppedReason : undefined };
    default:
      return p;
  }
}

