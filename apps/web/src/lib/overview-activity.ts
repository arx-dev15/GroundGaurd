/**
 * Pure, deterministic derivations for the Overview dashboard (unit-tested).
 * Every value is a direct count or ordering of data returned by the M3 API — nothing is estimated or synthesized.
 */
import type {
  Conversation,
  Document as GroundDocument,
  ProjectClaimItem,
  ProjectMetricsResponse,
} from '@groundguard/types';

// ---------------------------------------------------------------------------------------------------------------
// Claim breakdown
// ---------------------------------------------------------------------------------------------------------------

export interface ClaimBreakdown {
  total: number;
  verified: number;
  recovered: number;
  /** M3 `flaggedClaims` = claims with status flagged OR needs_review. */
  needsReview: number;
  /** Claims in no terminal bucket yet (e.g. pending/unverified) = total − verified − recovered − needsReview. */
  unresolved: number;
}

/** Returns null when the metrics endpoint was unavailable — callers must show "unavailable", never zero. */
export function claimBreakdown(metrics: ProjectMetricsResponse | null): ClaimBreakdown | null {
  if (!metrics) return null;
  const total = Math.max(0, metrics.totalClaims || 0);
  const verified = Math.max(0, metrics.verifiedClaims || 0);
  const recovered = Math.max(0, metrics.recoveredClaims || 0);
  const needsReview = Math.max(0, metrics.flaggedClaims || 0);
  return { total, verified, recovered, needsReview, unresolved: Math.max(0, total - verified - recovered - needsReview) };
}

// ---------------------------------------------------------------------------------------------------------------
// Summary sentence
// ---------------------------------------------------------------------------------------------------------------

export interface DocumentCounts {
  total: number;
  ready: number;
  processing: number;
  failed: number;
}

export function documentCounts(documents: GroundDocument[]): DocumentCounts {
  let ready = 0;
  let processing = 0;
  let failed = 0;
  for (const d of documents) {
    if (d.status === 'ready') ready++;
    else if (d.status === 'processing' || d.status === 'uploaded') processing++;
    else if (d.status === 'failed') failed++;
  }
  return { total: documents.length, ready, processing, failed };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** One or two factual sentences describing the project's current state. */
export function overviewSummary(docs: DocumentCounts, claims: ClaimBreakdown | null): string {
  const parts: string[] = [];
  if (docs.ready > 0) {
    parts.push(`${plural(docs.ready, 'document is', 'documents are')} ready to ask`);
  } else if (docs.processing > 0) {
    parts.push('No documents are ready yet');
  }
  if (docs.processing > 0) parts.push(`${plural(docs.processing, 'is', 'are')} still processing`);
  if (docs.failed > 0) parts.push(`${plural(docs.failed, 'failed', 'failed')} to process`);
  let sentence = parts.length ? `${parts.join(', ')}.` : 'No documents are ready yet.';

  if (claims === null) {
    sentence += ' Verification results are unavailable right now.';
  } else if (claims.total === 0) {
    sentence += ' No answers have been verified yet.';
  } else {
    sentence += ` ${plural(claims.total, 'claim has', 'claims have')} been checked`;
    sentence += claims.needsReview > 0 ? `; ${plural(claims.needsReview, 'needs', 'need')} review.` : '.';
  }
  return sentence;
}

// ---------------------------------------------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------------------------------------------

export type ActivityKind = 'ask' | 'document' | 'review';
export type ActivityTone = 'neutral' | 'ready' | 'processing' | 'failed' | 'review';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  tone: ActivityTone;
  /** ISO timestamp taken verbatim from the API record. */
  timestamp: string;
  href: string;
}

function time(ts?: string): number {
  const t = ts ? Date.parse(ts) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
}

/**
 * Merges real records into one feed, newest first:
 * - Ask sessions (conversation.updatedAt)
 * - Documents (document.updatedAt — last status change — with their actual status)
 * - Verification results needing review: claims with status flagged/needs_review grouped by their generation,
 *   timestamped by the newest such claim. Only claims actually returned by the API are counted.
 */
export function buildActivityFeed(params: {
  projectId: string;
  conversations: Conversation[];
  documents: GroundDocument[];
  claims: ProjectClaimItem[];
  limit?: number;
}): ActivityItem[] {
  const { projectId, conversations, documents, claims, limit = 8 } = params;
  const items: ActivityItem[] = [];

  for (const c of conversations) {
    items.push({
      id: `ask:${c.id}`,
      kind: 'ask',
      title: c.title || 'Untitled conversation',
      detail: 'Ask session',
      tone: 'neutral',
      timestamp: c.updatedAt || c.createdAt,
      href: `/projects/${projectId}/ask?c=${encodeURIComponent(c.id)}`,
    });
  }

  for (const d of documents) {
    const tone: ActivityTone =
      d.status === 'ready' ? 'ready' : d.status === 'failed' ? 'failed' : d.status === 'processing' || d.status === 'uploaded' ? 'processing' : 'neutral';
    const detail =
      d.status === 'ready'
        ? `Indexed · ${plural(d.chunksCount || 0, 'passage', 'passages')}`
        : d.status === 'failed'
          ? 'Processing failed'
          : d.status === 'processing' || d.status === 'uploaded'
            ? 'Processing'
            : d.status;
    items.push({
      id: `doc:${d.id}`,
      kind: 'document',
      title: d.filename,
      detail,
      tone,
      timestamp: d.updatedAt || d.createdAt,
      href: `/projects/${projectId}/knowledge/${encodeURIComponent(d.id)}`,
    });
  }

  const groups = new Map<string, { count: number; latest: string; title: string }>();
  for (const cl of claims) {
    if (cl.status !== 'flagged' && cl.status !== 'needs_review') continue;
    const key = cl.generationId || cl.conversationId;
    if (!key) continue;
    const g = groups.get(key);
    const ts = cl.createdAt || '';
    if (!g) {
      groups.set(key, { count: 1, latest: ts, title: cl.conversationTitle || cl.query || 'Ask session' });
    } else {
      g.count++;
      if (time(ts) > time(g.latest)) g.latest = ts;
    }
  }
  for (const [key, g] of groups) {
    if (!g.latest) continue; // no reliable timestamp → not placed on a timeline
    items.push({
      id: `review:${key}`,
      kind: 'review',
      title: g.title,
      detail: `${plural(g.count, 'claim needs', 'claims need')} review`,
      tone: 'review',
      timestamp: g.latest,
      href: `/projects/${projectId}/reliability?status=attention`,
    });
  }

  return items
    .filter((i) => time(i.timestamp) !== -Infinity)
    .sort((a, b) => time(b.timestamp) - time(a.timestamp))
    .slice(0, limit);
}

/** Documents ordered newest first by upload time (the API order is not guaranteed). */
export function documentsByRecency(documents: GroundDocument[]): GroundDocument[] {
  return [...documents].sort((a, b) => time(b.createdAt) - time(a.createdAt));
}

// ---------------------------------------------------------------------------------------------------------------
// Verification ledger (one square per claim, or per k claims for large projects)
// ---------------------------------------------------------------------------------------------------------------

export type LedgerStatus = 'verified' | 'recovered' | 'needsReview' | 'unresolved';
export const LEDGER_ORDER: LedgerStatus[] = ['verified', 'recovered', 'needsReview', 'unresolved'];

export interface LedgerLayout {
  /** Claims represented by one square (1 when every claim gets its own square). */
  perCell: number;
  cells: LedgerStatus[];
  /** Exact counts per status — the legend always shows these, never the rounded square counts. */
  counts: Record<LedgerStatus, number>;
}

/**
 * Lays out claim squares in status order. When the project has more claims than `maxCells`, one square stands for
 * `perCell` claims and each non-empty status is rounded UP so a small but real group (e.g. 1 claim needing review)
 * is never hidden. Exact counts are returned separately for labels.
 */
export function ledgerLayout(b: ClaimBreakdown, maxCells = 200): LedgerLayout {
  const counts: Record<LedgerStatus, number> = {
    verified: b.verified,
    recovered: b.recovered,
    needsReview: b.needsReview,
    unresolved: b.unresolved,
  };
  const total = LEDGER_ORDER.reduce((s, k) => s + counts[k], 0);
  const perCell = total <= maxCells ? 1 : Math.ceil(total / maxCells);
  const cells: LedgerStatus[] = [];
  for (const k of LEDGER_ORDER) {
    const n = counts[k] === 0 ? 0 : Math.ceil(counts[k] / perCell);
    for (let i = 0; i < n; i++) cells.push(k);
  }
  return { perCell, cells, counts };
}

// ---------------------------------------------------------------------------------------------------------------
// Activity grouped by calendar day
// ---------------------------------------------------------------------------------------------------------------

export interface ActivityDay {
  key: string;
  label: string;
  items: ActivityItem[];
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Groups an already newest-first feed by local calendar day: "Today", "Yesterday", or a date. */
export function groupActivityByDay(items: ActivityItem[], now: Date = new Date()): ActivityDay[] {
  const today = dayKey(now);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const yesterday = dayKey(y);
  const days: ActivityDay[] = [];
  for (const item of items) {
    const d = new Date(item.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    const key = dayKey(d);
    let group = days[days.length - 1];
    if (!group || group.key !== key) {
      const label =
        key === today
          ? 'Today'
          : key === yesterday
            ? 'Yesterday'
            : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
      group = { key, label, items: [] };
      days.push(group);
    }
    group.items.push(item);
  }
  return days;
}

// ---------------------------------------------------------------------------------------------------------------
// Evidence landscape (presentation over buildSourceFingerprints — calculations unchanged)
// ---------------------------------------------------------------------------------------------------------------

export interface LandscapeRegionLike {
  unitType: 'page' | 'passage';
  claimCount: number;
}
export interface LandscapeSourceLike {
  totalClaims: number;
  regions: LandscapeRegionLike[];
}

export interface LandscapeSplit<T> {
  /** Sources whose claims carry real page numbers → positions can be drawn. */
  located: T[];
  /** Sources with checked claims but no page metadata → totals only (fingerprint passage buckets are by list order, not location). */
  unlocated: T[];
  /** Sources with no checked claims yet (a real coverage gap) → named, never drawn as empty strips. */
  uncovered: T[];
}

export function splitLandscape<T extends LandscapeSourceLike>(sources: T[]): LandscapeSplit<T> {
  const out: LandscapeSplit<T> = { located: [], unlocated: [], uncovered: [] };
  for (const s of sources) {
    if (s.totalClaims === 0) out.uncovered.push(s);
    else if (s.regions.length > 0 && s.regions.every((r) => r.unitType === 'page')) out.located.push(s);
    else out.unlocated.push(s);
  }
  out.located.sort((a, b) => b.totalClaims - a.totalClaims);
  out.unlocated.sort((a, b) => b.totalClaims - a.totalClaims);
  return out;
}

/** Whole-number shares that always sum to exactly 100 (largest-remainder method); all zeros when total is 0. */
export function sharePercents(counts: number[]): number[] {
  const total = counts.reduce((s, n) => s + n, 0);
  if (total <= 0) return counts.map(() => 0);
  const raw = counts.map((n) => (n / total) * 100);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((s, n) => s + n, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remaining <= 0) break;
    if (counts[i] > 0) {
      floors[i]++;
      remaining--;
    }
  }
  return floors;
}

/** Square size for the ledger: fewer claims → larger squares, so small projects still read clearly. */
export function ledgerCellSize(cellCount: number): number {
  if (cellCount <= 48) return 20;
  if (cellCount <= 96) return 16;
  if (cellCount <= 150) return 13;
  return 11;
}
