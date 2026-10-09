'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import type { Document as GroundDocument, ProjectMetricsResponse } from '@groundguard/types';
import { cn } from '@/lib/utils';
import { transitions } from '@/lib/motion';
import { formatBytes, formatRelativeTime, type DocumentFingerprint, type FingerprintRegion, type ProjectReadinessState } from '@/lib/overview-helpers';
import {
  groupActivityByDay,
  ledgerCellSize,
  ledgerLayout,
  sharePercents,
  LEDGER_ORDER,
  splitLandscape,
  type ActivityItem,
  type ClaimBreakdown,
  type DocumentCounts,
  type LedgerStatus,
} from '@/lib/overview-activity';

/* =============================================================================================================
   Shared primitives
   ============================================================================================================= */

export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...transitions.state, delay: reduce ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeader({
  title,
  meta,
  action,
  aside,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: { href: string; label: string };
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
        {meta && <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{meta}</p>}
      </div>
      {aside}
      {action && (
        <Link
          href={action.href}
          className="group inline-flex shrink-0 items-center gap-1 rounded-sm text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {action.label}
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

const STATUS: Record<LedgerStatus, { label: string; fill: string; text: string; description: string; filter: string }> = {
  verified: {
    label: 'Verified',
    fill: 'bg-[hsl(var(--status-verified))]',
    text: 'text-[hsl(var(--status-verified))]',
    description: 'Supported by the retrieved evidence',
    filter: 'verified',
  },
  recovered: {
    label: 'Recovered',
    fill: 'bg-[hsl(var(--status-recovered))]',
    text: 'text-[hsl(var(--status-recovered))]',
    description: 'Revised, then re-verified',
    filter: 'recovered',
  },
  needsReview: {
    label: 'Needs review',
    fill: 'bg-[hsl(var(--status-needs-review))]',
    text: 'text-[hsl(var(--status-needs-review))]',
    description: 'Contradicted or not supported',
    filter: 'attention',
  },
  unresolved: {
    label: 'No final verdict',
    fill: 'bg-muted-foreground/35',
    text: 'text-muted-foreground',
    description: 'Checked, without a final status yet',
    filter: 'all',
  },
};

const READINESS: Record<ProjectReadinessState, { label: string; dot: string }> = {
  READY: { label: 'Ready to ask', dot: 'bg-[hsl(var(--status-verified))]' },
  PARTIALLY_READY: { label: 'Partially ready', dot: 'bg-[hsl(var(--status-recovered))]' },
  PREPARING: { label: 'Indexing', dot: 'bg-[hsl(var(--status-pending))]' },
  NEEDS_ATTENTION: { label: 'Needs attention', dot: 'bg-[hsl(var(--status-needs-review))]' },
};

export function ReadinessPill({ state }: { state: ProjectReadinessState }) {
  const cfg = READINESS[state];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 px-2 py-0.5 text-[12px] font-medium text-foreground/85">
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

/** Renders a factual sentence with its numbers set in the foreground weight (typographic emphasis only). */
export function EmphasizedNumbers({ text }: { text: string }) {
  const parts = text.split(/(\d[\d,]*)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\d/.test(p) ? (
          <span key={i} className="font-medium tabular-nums text-foreground">
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}


/* =============================================================================================================
   Signature: Evidence status panel — source readiness + claim ledger
   ============================================================================================================= */

function SourceReadiness({ docs }: { docs: DocumentCounts }) {
  const segs = [
    { key: 'ready', n: docs.ready, label: 'ready', fill: 'bg-foreground/80' },
    { key: 'processing', n: docs.processing, label: 'processing', fill: 'bg-[hsl(var(--status-pending))]' },
    { key: 'failed', n: docs.failed, label: 'failed', fill: 'bg-[hsl(var(--status-flagged))]' },
  ];
  const other = Math.max(0, docs.total - docs.ready - docs.processing - docs.failed);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-foreground">Sources</span>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {segs
            .filter((s) => s.n > 0)
            .map((s) => `${s.n} ${s.label}`)
            .join(' · ') || 'none yet'}
        </span>
      </div>
      <div
        className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`${docs.total} sources: ${docs.ready} ready, ${docs.processing} processing, ${docs.failed} failed`}
      >
        {segs
          .filter((s) => s.n > 0)
          .map((s) => (
            <span key={s.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', s.fill)} style={{ flexGrow: s.n }} />
          ))}
        {other > 0 && <span className="h-full rounded-r-full bg-muted" style={{ flexGrow: other }} />}
        {docs.total === 0 && <span className="h-full w-full rounded-full bg-muted" />}
      </div>
    </div>
  );
}

function ClaimLedger({ claims, projectId }: { claims: ClaimBreakdown; projectId: string }) {
  const reduce = !!useReducedMotion();
  const layout = React.useMemo(() => ledgerLayout(claims, 200), [claims]);
  const [active, setActive] = React.useState<LedgerStatus | null>(null);
  const [shown, setShown] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) return setShown(true);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [reduce]);

  // Per-group stagger: groups appear in ledger order; total reveal stays under ~450ms.
  const groupStart: Record<LedgerStatus, number> = { verified: 0, recovered: 0, needsReview: 0, unresolved: 0 };
  let offset = 0;
  for (const k of LEDGER_ORDER) {
    groupStart[k] = offset;
    offset += layout.cells.filter((c) => c === k).length;
  }
  const step = layout.cells.length > 0 ? Math.min(6, 420 / layout.cells.length) : 0;
  const shares = sharePercents(LEDGER_ORDER.map((k) => layout.counts[k]));

  return (
    <div onMouseLeave={() => setActive(null)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-foreground">Claims</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {layout.perCell === 1 ? '1 square = 1 claim' : `1 square ≈ ${layout.perCell} claims`}
        </span>
      </div>

      <div
        className="mt-3 grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${ledgerCellSize(layout.cells.length)}px, 1fr))` }}
        role="img"
        aria-label={LEDGER_ORDER.map((k) => `${layout.counts[k]} ${STATUS[k].label.toLowerCase()}`).join(', ') + ` of ${claims.total} checked claims`}
      >
        {layout.cells.map((status, i) => (
          <span
            key={i}
            className={cn(
              'aspect-square rounded-[2.5px] transition-[opacity,transform] ease-out',
              STATUS[status].fill,
              shown ? 'scale-100' : 'scale-50 opacity-0',
              active && active !== status ? 'opacity-[0.14]' : shown ? 'opacity-100' : ''
            )}
            style={{ transitionDuration: reduce ? '0ms' : '260ms', transitionDelay: shown && !reduce && !active ? `${Math.round(i * step)}ms` : '0ms' }}
            onMouseEnter={() => setActive(status)}
          />
        ))}
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1">
        {LEDGER_ORDER.filter((k) => k !== 'unresolved' || layout.counts.unresolved > 0).map((k) => {
          const n = layout.counts[k];
          const share = shares[LEDGER_ORDER.indexOf(k)];
          const s = STATUS[k];
          return (
            <li key={k}>
              <Link
                href={`/projects/${projectId}/reliability?status=${s.filter}`}
                onMouseEnter={() => setActive(k)}
                onFocus={() => setActive(k)}
                onBlur={() => setActive(null)}
                className={cn(
                  'group -mx-2 block rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  active && active !== k && 'opacity-50'
                )}
                aria-label={`${n} ${s.label.toLowerCase()} claims — open in Reliability`}
              >
                <span className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 shrink-0 rounded-[2px]', s.fill)} aria-hidden="true" />
                  <span className="text-[13px] text-muted-foreground group-hover:text-foreground">{s.label}</span>
                </span>
                <span className="mt-0.5 flex items-baseline gap-1.5 pl-4">
                  <span className={cn('text-xl font-semibold tracking-tight tabular-nums', k === 'needsReview' && n > 0 ? s.text : 'text-foreground')}>
                    {n.toLocaleString()}
                  </span>
                  <span className="text-[12px] tabular-nums text-muted-foreground">{share}%</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 min-h-[18px] text-[12px] text-muted-foreground" aria-live="polite">
        {active ? STATUS[active].description : 'Hover a status to isolate it. Select one to open those claims in Reliability.'}
      </p>
    </div>
  );
}

export function EvidenceStatusPanel({
  projectId,
  docs,
  claims,
  onRetry,
}: {
  projectId: string;
  docs: DocumentCounts;
  claims: ClaimBreakdown | null;
  onRetry: () => void;
}) {
  return (
    <section aria-label="Evidence status" className="rounded-2xl border border-border/80 bg-card/70 p-5 shadow-[0_1px_0_0_hsl(var(--border)/0.6),0_12px_32px_-18px_rgb(0_0_0/0.35)] sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Evidence status</h2>
        {claims && claims.total > 0 && (
          <span className="text-[13px] tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">{claims.total.toLocaleString()}</span> claims checked
          </span>
        )}
      </div>

      <div className="mt-5 space-y-6">
        <SourceReadiness docs={docs} />
        <div className="h-px bg-border/70" />
        {claims === null ? (
          <div className="rounded-lg border border-dashed border-border/80 px-4 py-6 text-center">
            <p className="text-sm text-foreground">Verification results are unavailable</p>
            <p className="mt-1 text-[13px] text-muted-foreground">The metrics service did not respond. Nothing is shown as zero.</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[13px] text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : claims.total === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 px-4 py-6 text-center">
            <p className="text-sm text-foreground">No claims checked yet</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Each answer’s claims are verified against the cited passages.</p>
            <Link href={`/projects/${projectId}/ask`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-foreground hover:underline">
              Ask a question <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <ClaimLedger claims={claims} projectId={projectId} />
        )}
      </div>
    </section>
  );
}

/* =============================================================================================================
   Facts row (typographic, not cards)
   ============================================================================================================= */

export function ProjectFacts({
  totalChunks,
  metrics,
  conversationsCount,
}: {
  totalChunks: number;
  metrics: ProjectMetricsResponse | null;
  conversationsCount: number;
}) {
  const facts = [
    { label: 'Indexed passages', value: totalChunks.toLocaleString(), sub: null as string | null },
    {
      label: 'Answers',
      value: metrics ? metrics.completedGenerations.toLocaleString() : '—',
      sub: metrics ? `of ${metrics.totalGenerations.toLocaleString()} requests` : 'unavailable',
    },
    { label: 'Conversations', value: conversationsCount.toLocaleString(), sub: null },
  ];
  return (
    <dl className="grid grid-cols-3 border-y border-border/70">
      {facts.map((f, i) => (
        <div key={f.label} className={cn('min-w-0 py-3.5', i > 0 && 'border-l border-border/70 pl-4 sm:pl-5')}>
          <dt className="truncate text-[12px] text-muted-foreground">{f.label}</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[22px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{f.value}</span>
            {f.sub && <span className="text-[12px] tabular-nums text-muted-foreground">{f.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* =============================================================================================================
   Evidence landscape (presentation over buildSourceFingerprints; page-located sources only are drawn)
   ============================================================================================================= */

function shortPageLabel(r: FingerprintRegion): string {
  return r.startUnit === r.endUnit ? String(r.startUnit) : `${r.startUnit}–${r.endUnit}`;
}

function SourceTrack({ fp, maxClaims, projectId }: { fp: DocumentFingerprint; maxClaims: number; projectId: string }) {
  const [active, setActive] = React.useState<FingerprintRegion | null>(null);
  const reduce = !!useReducedMotion();
  const BAR = 64;
  const dense = fp.regions.length > 12;
  const covered = fp.regions.filter((r) => r.claimCount > 0).length;

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-3 py-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-medium text-foreground [overflow-wrap:anywhere]" title={fp.filename}>
          {fp.displayTitle || fp.filename}
        </p>
        <p className="mt-1 text-[12px] tabular-nums text-muted-foreground">
          {fp.totalClaims.toLocaleString()} {fp.totalClaims === 1 ? 'claim' : 'claims'} · {covered} of {fp.regions.length}{' '}
          {fp.regions[0]?.startUnit === fp.regions[0]?.endUnit ? 'pages' : 'page ranges'} cited
        </p>
        {fp.hotspotRegion && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[hsl(var(--status-needs-review))]">
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            Most review in {fp.hotspotRegion.label.toLowerCase()}
          </p>
        )}
      </div>

      <div className="min-w-0" onMouseLeave={() => setActive(null)}>
        <div className="flex items-end gap-1" style={{ height: BAR + 10 }}>
          {fp.regions.map((r) => {
            const h = r.claimCount > 0 ? Math.max(6, Math.round((r.claimCount / maxClaims) * BAR)) : 2;
            const isActive = active?.id === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onMouseEnter={() => setActive(r)}
                onFocus={() => setActive(r)}
                onBlur={() => setActive(null)}
                aria-label={`${r.label}: ${r.claimCount} claims — ${r.verifiedCount} verified, ${r.recoveredCount} recovered, ${r.needsReviewCount} need review`}
                className={cn(
                  'group relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-[3px] outline-none transition-colors',
                  isActive ? 'bg-muted/70' : 'hover:bg-muted/40',
                  'focus-visible:ring-1 focus-visible:ring-ring'
                )}
              >
                {r.isHotspot && (
                  <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[hsl(var(--status-needs-review))]" aria-hidden="true" />
                )}
                <motion.span
                  className={cn('mx-auto flex w-full max-w-[34px] flex-col-reverse overflow-hidden rounded-[3px]', r.claimCount === 0 && 'max-w-[20px] bg-border')}
                  initial={reduce ? false : { height: 0 }}
                  animate={{ height: h }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  {r.verifiedCount > 0 && <span className={STATUS.verified.fill} style={{ flexGrow: r.verifiedCount }} />}
                  {r.recoveredCount > 0 && <span className={STATUS.recovered.fill} style={{ flexGrow: r.recoveredCount }} />}
                  {r.needsReviewCount > 0 && <span className={STATUS.needsReview.fill} style={{ flexGrow: r.needsReviewCount }} />}
                </motion.span>
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1" aria-hidden="true">
          {fp.regions.map((r, i) => (
            <span key={r.id} className="min-w-0 flex-1 truncate text-center font-mono text-[10px] text-muted-foreground/80">
              {!dense || i % 2 === 0 ? shortPageLabel(r) : ''}
            </span>
          ))}
        </div>
        <div className="mt-2 flex min-h-[20px] flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums" aria-live="polite">
          {active ? (
            <>
              <span className="font-medium text-foreground">{active.label}</span>
              <span className="text-muted-foreground">{active.claimCount} cited</span>
              {active.verifiedCount > 0 && <span className={STATUS.verified.text}>{active.verifiedCount} verified</span>}
              {active.recoveredCount > 0 && <span className={STATUS.recovered.text}>{active.recoveredCount} recovered</span>}
              {active.needsReviewCount > 0 && (
                <Link href={`/projects/${projectId}/reliability?status=attention`} className={cn('inline-flex items-center gap-0.5 hover:underline', STATUS.needsReview.text)}>
                  {active.needsReviewCount} need review <ArrowUpRight className="h-3 w-3" />
                </Link>
              )}
              {active.claimCount === 0 && <span className="text-muted-foreground">No checked claims cite this {active.startUnit === active.endUnit ? 'page' : 'range'}</span>}
            </>
          ) : (
            <span className="text-muted-foreground/80">Page {fp.regions[0]?.startUnit}–{fp.regions[fp.regions.length - 1]?.endUnit}. Bar height = claims citing that page.</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function EvidenceLandscape({
  fingerprints,
  projectId,
  loadedClaims,
  totalClaims,
}: {
  fingerprints: DocumentFingerprint[];
  projectId: string;
  loadedClaims: number;
  totalClaims: number | null;
}) {
  const { located, unlocated, uncovered } = React.useMemo(() => splitLandscape(fingerprints), [fingerprints]);
  if (located.length === 0 && unlocated.length === 0) return null; // nothing checked yet — the status panel already says so

  const maxClaims = Math.max(1, ...located.flatMap((f) => f.regions.map((r) => r.claimCount)));
  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground" aria-hidden="true">
      {(['verified', 'recovered', 'needsReview'] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-[2px]', STATUS[k].fill)} />
          {STATUS[k].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--status-needs-review))]" />
        Most review
      </span>
    </div>
  );

  return (
    <section aria-label="Evidence landscape">
      <SectionHeader
        title="Evidence landscape"
        meta={
          <>
            Where checked claims cite each source, page by page.
            {totalClaims !== null && loadedClaims < totalClaims && (
              <> Based on {loadedClaims.toLocaleString()} of {totalClaims.toLocaleString()} checked claims loaded for this view.</>
            )}
          </>
        }
        aside={legend}
      />
      <div className="divide-y divide-border/60 border-y border-border/70">
        {located.map((fp) => (
          <SourceTrack key={fp.documentId} fp={fp} maxClaims={maxClaims} projectId={projectId} />
        ))}
        {unlocated.map((fp) => (
          <div key={fp.documentId} className="grid grid-cols-1 gap-x-8 gap-y-1 py-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <p className="line-clamp-2 text-sm font-medium text-foreground [overflow-wrap:anywhere]" title={fp.filename}>
              {fp.displayTitle || fp.filename}
            </p>
            <p className="text-[12px] tabular-nums text-muted-foreground">
              {fp.totalClaims} {fp.totalClaims === 1 ? 'claim' : 'claims'} — <span className={STATUS.verified.text}>{fp.verifiedClaims} verified</span> ·{' '}
              <span className={STATUS.recovered.text}>{fp.recoveredClaims} recovered</span> ·{' '}
              <span className={STATUS.needsReview.text}>{fp.needsReviewClaims} need review</span>. Page locations aren’t recorded for this source’s evidence.
            </p>
          </div>
        ))}
      </div>
      {uncovered.length > 0 && (
        <p className="mt-3 text-[13px] text-muted-foreground">
          <span className="text-foreground">No checked claims cite </span>
          {uncovered
            .slice(0, 3)
            .map((f) => f.displayTitle || f.filename)
            .join(', ')}
          {uncovered.length > 3 ? ` and ${uncovered.length - 3} more` : ''} yet.{' '}
          <Link href={`/projects/${projectId}/ask`} className="text-foreground underline-offset-4 hover:underline">
            Ask about them
          </Link>
        </p>
      )}
    </section>
  );
}

/* =============================================================================================================
   Research timeline (real activity, grouped by day)
   ============================================================================================================= */

const TONE_DOT: Record<ActivityItem['tone'], string> = {
  neutral: 'bg-muted-foreground/60',
  ready: 'bg-[hsl(var(--status-verified))]',
  processing: 'bg-[hsl(var(--status-pending))]',
  failed: 'bg-[hsl(var(--status-flagged))]',
  review: 'bg-[hsl(var(--status-needs-review))]',
};

const KIND_LABEL: Record<ActivityItem['kind'], string> = { ask: 'Asked', document: 'Source', review: 'Verification' };

function clockTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function ResearchTimeline({ items, projectId }: { items: ActivityItem[]; projectId: string }) {
  const days = React.useMemo(() => groupActivityByDay(items), [items]);
  return (
    <section aria-label="Recent activity" className="min-w-0">
      <SectionHeader
        title="Research timeline"
        meta="Questions asked, sources processed and claims flagged, newest first"
        action={{ href: `/projects/${projectId}/ask`, label: 'Open Ask' }}
      />
      {days.length === 0 ? (
        <p className="border-t border-border/70 py-8 text-sm text-muted-foreground">
          Nothing yet.{' '}
          <Link href={`/projects/${projectId}/ask`} className="text-foreground underline-offset-4 hover:underline">
            Ask a question
          </Link>{' '}
          to start a verified session.
        </p>
      ) : (
        <div className="space-y-6 border-t border-border/70 pt-5">
          {days.map((day) => (
            <div key={day.key}>
              <h3 className="mb-1 flex items-baseline gap-2 text-[13px] font-medium text-foreground">
                {day.label}
                <span className="text-[12px] font-normal tabular-nums text-muted-foreground">{day.items.length}</span>
              </h3>
              <ol className="relative">
                <span className="absolute bottom-3 left-[7px] top-3 w-px bg-border/80" aria-hidden="true" />
                {day.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="group relative -mx-2 flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <span className="relative z-[1] mt-[5px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-background">
                        <span className={cn('h-[7px] w-[7px] rounded-full ring-2 ring-background', TONE_DOT[item.tone])} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground group-hover:underline group-hover:decoration-border group-hover:underline-offset-4" title={item.title}>
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                          <span className="text-muted-foreground/80">{KIND_LABEL[item.kind]}</span>
                          <span aria-hidden="true"> · </span>
                          <span
                            className={cn(
                              item.tone === 'failed' && 'text-[hsl(var(--status-flagged))]',
                              item.tone === 'review' && 'text-[hsl(var(--status-needs-review))]'
                            )}
                          >
                            {item.detail}
                          </span>
                        </span>
                      </span>
                      <time
                        dateTime={item.timestamp}
                        title={new Date(item.timestamp).toLocaleString()}
                        className="mt-0.5 shrink-0 text-[12px] tabular-nums text-muted-foreground"
                      >
                        {clockTime(item.timestamp)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* =============================================================================================================
   Sources (documents as research sources)
   ============================================================================================================= */

const DOC_STATUS: Record<string, { label: string; dot: string; text?: string }> = {
  ready: { label: 'Ready', dot: 'bg-[hsl(var(--status-verified))]' },
  processing: { label: 'Processing', dot: 'bg-[hsl(var(--status-pending))]' },
  uploaded: { label: 'Queued', dot: 'bg-[hsl(var(--status-pending))]' },
  failed: { label: 'Failed', dot: 'bg-[hsl(var(--status-flagged))]', text: 'text-[hsl(var(--status-flagged))]' },
};

function fileKind(d: GroundDocument): string {
  const ext = d.filename.match(/\.([a-z0-9]{1,5})$/i)?.[1];
  if (ext) return ext.toUpperCase();
  if (d.mimeType?.includes('pdf')) return 'PDF';
  return 'FILE';
}

export function SourceList({ documents, projectId, docs }: { documents: GroundDocument[]; projectId: string; docs: DocumentCounts }) {
  return (
    <section aria-label="Documents" className="min-w-0">
      <SectionHeader
        title="Sources"
        meta={`${docs.total.toLocaleString()} in this project · ${docs.ready.toLocaleString()} ready · newest first`}
        action={{ href: `/projects/${projectId}/knowledge`, label: 'Knowledge' }}
      />
      <ul className="divide-y divide-border/60 border-y border-border/70">
        {documents.map((d) => {
          const st = DOC_STATUS[d.status] ?? { label: d.status, dot: 'bg-muted-foreground/50' };
          return (
            <li key={d.id}>
              <Link
                href={`/projects/${projectId}/knowledge/${d.id}`}
                className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="mt-0.5 flex h-9 w-8 shrink-0 items-end justify-center rounded-[5px] border border-border/90 bg-background pb-1 font-mono text-[9px] font-medium tracking-wide text-muted-foreground transition-colors group-hover:border-foreground/30 group-hover:text-foreground">
                  {fileKind(d)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm leading-snug text-foreground [overflow-wrap:anywhere]" title={d.filename}>
                    {d.filename}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] tabular-nums text-muted-foreground">
                    <span className={cn('inline-flex items-center gap-1', st.text)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', st.dot)} aria-hidden="true" />
                      {st.label}
                    </span>
                    {d.status === 'ready' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {(d.chunksCount || 0).toLocaleString()} {d.chunksCount === 1 ? 'passage' : 'passages'}
                        </span>
                      </>
                    )}
                    {d.fileSize > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{formatBytes(d.fileSize)}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <time dateTime={d.createdAt} title={new Date(d.createdAt).toLocaleString()}>
                      {formatRelativeTime(d.createdAt)}
                    </time>
                  </span>
                  {d.status === 'failed' && d.errorMessage && (
                    <span className="mt-1 block text-[12px] leading-snug text-[hsl(var(--status-flagged))] [overflow-wrap:anywhere]">{d.errorMessage}</span>
                  )}
                </span>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
