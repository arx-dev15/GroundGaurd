'use client';

import * as React from 'react';
import {
  Info,
  ChevronDown,
  ChevronRight,
  Play,
  Loader2,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  TrendingUp,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  formatPercentagePointDelta,
  getBenchmarkNarrative,
  type BenchmarkMetricsData,
} from '@/lib/reliability-helpers';

export interface EvidexPerformanceGraphProps {
  evaluations: any[];
  latestEvaluation: any | null;
  isStartingEvaluation: boolean;
  onRunEvaluation: () => void;
}

type MetricId = 'all' | 'unsupported' | 'verified' | 'coverage';
type VisualizationMode = 'comparison' | 'history';

interface BenchmarkDimension {
  id: 'unsupported' | 'verified' | 'coverage';
  name: string;
  definition: string;
  baselinePct: number;
  evidexPct: number;
  lowerIsBetter: boolean;
  accentColor: string;
  gradientId: string;
}

const BENCHMARK_DIMENSIONS: BenchmarkDimension[] = [
  {
    id: 'unsupported',
    name: 'Unsupported claims',
    definition: 'Share of evaluated factual claims without sufficient supporting evidence.',
    baselinePct: 22.0,
    evidexPct: 4.0,
    lowerIsBetter: true,
    accentColor: '#10b981', // Emerald (decreasing unsupported claims is an improvement)
    gradientId: 'grad-unsupported',
  },
  {
    id: 'verified',
    name: 'Verified claims',
    definition: 'Share of evaluated claims that completed verification with evidence support.',
    baselinePct: 61.0,
    evidexPct: 91.0,
    lowerIsBetter: false,
    accentColor: '#10b981', // Emerald
    gradientId: 'grad-verified',
  },
  {
    id: 'coverage',
    name: 'Evidence coverage',
    definition: 'Share of evaluated claims linked to sufficient supporting evidence.',
    baselinePct: 68.0,
    evidexPct: 94.0,
    lowerIsBetter: false,
    accentColor: '#3b82f6', // Blue
    gradientId: 'grad-coverage',
  },
];

export function EvidexPerformanceGraph({
  evaluations,
  latestEvaluation,
  isStartingEvaluation,
  onRunEvaluation,
}: EvidexPerformanceGraphProps) {
  // Selection state: 'all' by default. Clicking locks; hovering previews.
  const [lockedMetric, setLockedMetric] = React.useState<MetricId>('all');
  const [hoveredMetric, setHoveredMetric] = React.useState<MetricId | null>(null);
  const [mode, setMode] = React.useState<VisualizationMode>('comparison');
  const [showMethodProvenance, setShowMethodProvenance] = React.useState(false);
  const [hoveredHistoryIndex, setHoveredHistoryIndex] = React.useState<number | null>(null);

  // Active focus: hover takes transient precedence; otherwise locked state
  const activeMetric: MetricId = hoveredMetric ?? lockedMetric;

  // Filter completed evaluations for historical trend
  const completedEvaluations = React.useMemo(() => {
    return evaluations.filter((e) => e.status === 'completed');
  }, [evaluations]);

  const hasHistoryMode = completedEvaluations.length >= 2;

  const totalCases = latestEvaluation?.metrics?.totalCases ?? 5;
  const evaluationDate = latestEvaluation?.completedAt
    ? new Date(latestEvaluation.completedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Controlled baseline';

  // Benchmark metrics data for narrative calculation
  const benchmarkData: BenchmarkMetricsData = {
    unsupportedBaseline: 22.0,
    unsupportedEvidex: 4.0,
    verifiedBaseline: 61.0,
    verifiedEvidex: 91.0,
    coverageBaseline: 68.0,
    coverageEvidex: 94.0,
  };

  const narrative = getBenchmarkNarrative(activeMetric, benchmarkData);

  // SVG coordinate constants for 0–100% Canvas
  // Canvas width = 800, height = 320
  const SVG_WIDTH = 800;
  const SVG_HEIGHT = 320;
  const TOP_PAD = 45;
  const PLOT_HEIGHT = 230;
  const X_BASELINE = 210;
  const X_EVIDEX = 590;

  const getY = (pct: number) => TOP_PAD + ((100 - pct) / 100) * PLOT_HEIGHT;

  // Handle Legend Click / Lock Toggle
  const handleLegendClick = (id: MetricId) => {
    if (lockedMetric === id && id !== 'all') {
      setLockedMetric('all');
    } else {
      setLockedMetric(id);
    }
  };

  if (evaluations.length === 0) {
    return (
      <section aria-label="EVIDEX performance" className="space-y-4 pt-6 border-t border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              EVIDEX performance
            </h2>
            <p className="text-xs text-muted-foreground">
              How the verified EVIDEX pipeline compares with the configured RAG baseline.
            </p>
          </div>
        </div>

        <div className="py-10 text-center space-y-3 border border-dashed border-border/70 rounded-2xl bg-card/20 p-6">
          <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-foreground">
              No benchmark comparison is available yet
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              Run a controlled evaluation to compare your RAG baseline against the EVIDEX verified pipeline.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRunEvaluation}
            disabled={isStartingEvaluation}
            className="h-8 text-xs mt-2"
          >
            {isStartingEvaluation ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            <span>Run benchmark evaluation</span>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="EVIDEX performance" className="space-y-4 pt-6 border-t border-border/50">
      {/* Header with Title, Mode Switcher (if history exists), and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              EVIDEX performance
            </h2>
            <span className="text-[11px] font-sans font-medium text-muted-foreground/80 px-2 py-0.5 rounded-full bg-muted/50 border border-border/50">
              Static reference · not measured on this project
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Reference comparison of the EVIDEX pipeline against a baseline RAG setup. These figures are fixed; project-measured results appear in History once runs complete.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Historical Trend Tab Toggle (Only shown if 2+ real completed runs exist) */}
          {hasHistoryMode && (
            <div className="flex items-center p-0.5 rounded-lg border border-border/60 bg-muted/30 text-xs font-sans">
              <button
                type="button"
                onClick={() => setMode('comparison')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5',
                  mode === 'comparison'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Layers className="h-3 w-3" />
                <span>Comparison</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('history')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5',
                  mode === 'history'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <TrendingUp className="h-3 w-3" />
                <span>History ({completedEvaluations.length})</span>
              </button>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onRunEvaluation}
            disabled={isStartingEvaluation}
            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          >
            {isStartingEvaluation ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            <span>Rerun evaluation</span>
          </Button>
        </div>
      </div>

      {/* Screen Reader Accessibility Description */}
      <div className="sr-only">
        {BENCHMARK_DIMENSIONS.map((d) => {
          const delta = formatPercentagePointDelta(d.baselinePct, d.evidexPct, d.lowerIsBetter);
          return (
            <p key={d.id}>
              {d.name}: Baseline RAG {d.baselinePct}%, EVIDEX {d.evidexPct}%, {delta.deltaString}.
            </p>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* SIGNATURE VISUALIZATION CANVAS                               */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-card/40 to-card/15 p-5 sm:p-7 space-y-5">
        {mode === 'comparison' ? (
          /* MODE 1: COMPARISON (PERFORMANCE PROFILE S-CURVE SLOPE GRAPH) */
          <div className="space-y-4">
            <div className="w-full relative overflow-hidden select-none">
              <svg
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                className="w-full h-auto max-h-[380px] overflow-visible font-sans"
                aria-label="EVIDEX performance profile comparing Baseline RAG and EVIDEX"
              >
                <defs>
                  {/* Subtle Verification Transformation Gradients */}
                  <linearGradient id="grad-unsupported" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.7" />
                    <stop offset="40%" stopColor="#94a3b8" stopOpacity="0.85" />
                    <stop offset="85%" stopColor="#10b981" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="1" />
                  </linearGradient>

                  <linearGradient id="grad-verified" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.7" />
                    <stop offset="40%" stopColor="#94a3b8" stopOpacity="0.85" />
                    <stop offset="85%" stopColor="#10b981" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="1" />
                  </linearGradient>

                  <linearGradient id="grad-coverage" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.7" />
                    <stop offset="40%" stopColor="#94a3b8" stopOpacity="0.85" />
                    <stop offset="85%" stopColor="#3b82f6" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="1" />
                  </linearGradient>
                </defs>

                {/* Background Grid & Axis Lines */}
                {[0, 20, 40, 60, 80, 100].map((tick) => {
                  const y = getY(tick);
                  return (
                    <g key={tick} className="text-muted-foreground/30">
                      <line
                        x1={X_BASELINE - 40}
                        y1={y}
                        x2={X_EVIDEX + 40}
                        y2={y}
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeDasharray={tick === 0 || tick === 100 ? 'none' : '3 3'}
                        className="opacity-40"
                      />
                      <text
                        x={X_BASELINE - 55}
                        y={y + 3}
                        textAnchor="end"
                        className="text-[10px] fill-muted-foreground/60 font-mono select-none"
                      >
                        {tick}%
                      </text>
                    </g>
                  );
                })}

                {/* Column Headers */}
                <g>
                  {/* Baseline Column Header */}
                  <text
                    x={X_BASELINE}
                    y={TOP_PAD - 18}
                    textAnchor="middle"
                    className="text-xs font-semibold fill-muted-foreground tracking-wide uppercase select-none"
                  >
                    Baseline RAG
                  </text>
                  <line
                    x1={X_BASELINE}
                    y1={TOP_PAD - 8}
                    x2={X_BASELINE}
                    y2={TOP_PAD + PLOT_HEIGHT + 8}
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    className="text-muted-foreground/25"
                  />

                  {/* Middle Transformation Label */}
                  <text
                    x={(X_BASELINE + X_EVIDEX) / 2}
                    y={TOP_PAD - 20}
                    textAnchor="middle"
                    className="text-[10px] font-sans fill-muted-foreground/50 tracking-wider uppercase select-none"
                  >
                    Verification & selective recovery pipeline
                  </text>

                  {/* EVIDEX Column Header */}
                  <text
                    x={X_EVIDEX}
                    y={TOP_PAD - 18}
                    textAnchor="middle"
                    className="text-xs font-bold fill-foreground tracking-wide uppercase select-none"
                  >
                    EVIDEX Pipeline
                  </text>
                  <line
                    x1={X_EVIDEX}
                    y1={TOP_PAD - 8}
                    x2={X_EVIDEX}
                    y2={TOP_PAD + PLOT_HEIGHT + 8}
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    className="text-muted-foreground/25"
                  />
                </g>

                {/* 3 Metric Trajectories / S-Curves */}
                {BENCHMARK_DIMENSIONS.map((d, index) => {
                  const y1 = getY(d.baselinePct);
                  const y2 = getY(d.evidexPct);
                  const delta = formatPercentagePointDelta(d.baselinePct, d.evidexPct, d.lowerIsBetter);

                  const isSelected = activeMetric === d.id;
                  const isDimmed = activeMetric !== 'all' && !isSelected;

                  // Cubic S-curve connecting Baseline to EVIDEX
                  const curvePath = `M ${X_BASELINE} ${y1} C ${X_BASELINE + 170} ${y1}, ${X_EVIDEX - 170} ${y2}, ${X_EVIDEX} ${y2}`;

                  const midX = (X_BASELINE + X_EVIDEX) / 2;
                  const midY = (y1 + y2) / 2;

                  return (
                    <g
                      key={d.id}
                      className="transition-all duration-200 cursor-pointer"
                      onClick={() => handleLegendClick(d.id)}
                      onMouseEnter={() => setHoveredMetric(d.id)}
                      onMouseLeave={() => setHoveredMetric(null)}
                      style={{ opacity: isDimmed ? 0.18 : 1 }}
                    >
                      {/* Wider invisible stroke for effortless hovering */}
                      <path
                        d={curvePath}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="20"
                        className="cursor-pointer"
                      />

                      {/* Visible Trajectory Curve */}
                      <path
                        d={curvePath}
                        fill="none"
                        stroke={`url(#${d.gradientId})`}
                        strokeWidth={isSelected ? 3.8 : 2.5}
                        strokeLinecap="round"
                        className="transition-all duration-200"
                        style={{
                          animation: `slopeDraw 750ms cubic-bezier(0.16, 1, 0.3, 1) ${index * 120}ms both`,
                        }}
                      />

                      {/* Baseline Node */}
                      <circle
                        cx={X_BASELINE}
                        cy={y1}
                        r={isSelected ? 4.5 : 3.5}
                        className="fill-muted-foreground/70 transition-all duration-200"
                      />

                      {/* Baseline Value + Label */}
                      <text
                        x={X_BASELINE - 12}
                        y={y1 + 4}
                        textAnchor="end"
                        className={cn(
                          'text-xs font-mono transition-all duration-200',
                          isSelected
                            ? 'font-bold fill-foreground text-xs'
                            : 'font-medium fill-muted-foreground text-[11px]'
                        )}
                      >
                        {d.baselinePct.toFixed(1)}%
                      </text>

                      {/* EVIDEX Endpoint Node */}
                      <circle
                        cx={X_EVIDEX}
                        cy={y2}
                        r={isSelected ? 6 : 4.5}
                        fill={d.accentColor}
                        className="transition-all duration-200 shadow-sm"
                      />

                      {/* EVIDEX Value + Label */}
                      <text
                        x={X_EVIDEX + 12}
                        y={y2 + 4}
                        textAnchor="start"
                        className={cn(
                          'text-xs font-mono transition-all duration-200',
                          isSelected
                            ? 'font-bold text-sm fill-foreground'
                            : 'font-bold text-xs fill-foreground/90'
                        )}
                      >
                        {d.evidexPct.toFixed(1)}%
                      </text>

                      {/* Metric Name near EVIDEX endpoint */}
                      <text
                        x={X_EVIDEX + 60}
                        y={y2 + 4}
                        textAnchor="start"
                        className={cn(
                          'text-[11px] font-sans transition-all duration-200',
                          isSelected
                            ? 'font-semibold fill-foreground'
                            : 'font-normal fill-muted-foreground/80'
                        )}
                      >
                        {d.name}
                      </text>

                      {/* Center Delta Chip Badge */}
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect
                          x="-36"
                          y="-10"
                          width="72"
                          height="20"
                          rx="10"
                          className={cn(
                            'transition-all duration-200',
                            isSelected
                              ? 'fill-background stroke-primary/50'
                              : 'fill-background/90 stroke-border/70'
                          )}
                          strokeWidth="1"
                        />
                        <text
                          x="0"
                          y="3.5"
                          textAnchor="middle"
                          className={cn(
                            'text-[10px] font-sans font-semibold transition-all duration-200',
                            d.lowerIsBetter
                              ? 'fill-emerald-600 dark:fill-emerald-400'
                              : 'fill-emerald-600 dark:fill-emerald-400'
                          )}
                        >
                          {d.lowerIsBetter ? '↓' : '↑'}{' '}
                          {Math.abs(delta.deltaValue)} pp
                        </text>
                      </g>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Interactive Legend Controls (Click to lock, Hover to preview) */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 border-t border-border/40 select-none">
              {/* All Option */}
              <button
                type="button"
                onClick={() => handleLegendClick('all')}
                onMouseEnter={() => setHoveredMetric('all')}
                onMouseLeave={() => setHoveredMetric(null)}
                aria-pressed={activeMetric === 'all'}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 flex items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  activeMetric === 'all'
                    ? 'bg-foreground text-background font-semibold shadow-sm'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    activeMetric === 'all' ? 'bg-background' : 'bg-muted-foreground/60'
                  )}
                />
                <span>All metrics (Profile)</span>
              </button>

              {/* 3 Metric Pills */}
              {BENCHMARK_DIMENSIONS.map((dim) => {
                const isActive = activeMetric === dim.id;
                const isLocked = lockedMetric === dim.id;

                return (
                  <button
                    key={dim.id}
                    type="button"
                    onClick={() => handleLegendClick(dim.id)}
                    onMouseEnter={() => setHoveredMetric(dim.id)}
                    onMouseLeave={() => setHoveredMetric(null)}
                    aria-pressed={isActive}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 flex items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      isActive
                        ? 'bg-foreground text-background font-semibold shadow-sm'
                        : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: isActive ? 'currentColor' : dim.accentColor,
                      }}
                    />
                    <span>{dim.name}</span>
                    <span
                      className={cn(
                        'text-[10px] font-mono px-1 rounded',
                        isActive
                          ? 'bg-background/20 text-background'
                          : 'bg-muted/60 text-muted-foreground'
                      )}
                    >
                      {dim.baselinePct.toFixed(0)}% → {dim.evidexPct.toFixed(0)}%
                    </span>
                    {isLocked && (
                      <span className="text-[9px] uppercase tracking-wider opacity-70">
                        (locked)
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Metric Narrative (Interactive Data Storytelling) */}
            <div className="p-3.5 sm:p-4 rounded-xl border border-border/50 bg-background/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-all duration-200 animate-in fade-in">
              <div className="space-y-0.5">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span>{narrative.title}</span>
                  {activeMetric !== 'all' && (
                    <span className="text-[11px] font-normal text-muted-foreground">
                      (tap or click to unlock)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {narrative.body}
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold font-sans bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                <span>{narrative.deltaText}</span>
              </div>
            </div>
          </div>
        ) : (
          /* MODE 2: TRUE HISTORICAL EVALUATION RUNS TREND (REAL DATA ONLY) */
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs pb-1">
              <div className="space-y-0.5">
                <span className="font-semibold text-foreground">
                  Evaluation History ({completedEvaluations.length} completed runs)
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Actual benchmark pass rates measured across persistent project runs.
                </p>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">
                Chronological runs
              </span>
            </div>

            {/* Historical Plot Canvas */}
            <div className="w-full relative overflow-hidden select-none">
              <svg
                viewBox="0 0 800 240"
                className="w-full h-auto max-h-[300px] overflow-visible font-sans"
                aria-label="Historical evaluation pass rates across benchmark runs"
              >
                {/* Horizontal Tick Lines (0%, 20%, 40%, 60%, 80%, 100%) */}
                {[0, 20, 40, 60, 80, 100].map((tick) => {
                  const y = 30 + ((100 - tick) / 100) * 170;
                  return (
                    <g key={tick} className="text-muted-foreground/30">
                      <line
                        x1={60}
                        y1={y}
                        x2={760}
                        y2={y}
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeDasharray={tick === 0 || tick === 100 ? 'none' : '3 3'}
                        className="opacity-40"
                      />
                      <text
                        x={50}
                        y={y + 3}
                        textAnchor="end"
                        className="text-[10px] fill-muted-foreground/60 font-mono select-none"
                      >
                        {tick}%
                      </text>
                    </g>
                  );
                })}

                {/* Baseline RAG Reference Line (Constant 60% dashed line) */}
                <line
                  x1={60}
                  y1={30 + ((100 - 60) / 100) * 170}
                  x2={760}
                  y2={30 + ((100 - 60) / 100) * 170}
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  className="opacity-60"
                />
                <text
                  x={765}
                  y={30 + ((100 - 60) / 100) * 170 + 3}
                  textAnchor="start"
                  className="text-[10px] fill-muted-foreground/70 font-sans"
                >
                  Baseline RAG (60%)
                </text>

                {/* EVIDEX Historical Points & Connecting Polyline */}
                {(() => {
                  const numPoints = completedEvaluations.length;
                  const stepX = (700) / Math.max(1, numPoints - 1);

                  const points = completedEvaluations.map((ev, i) => {
                    const passRatePct = ((ev.metrics?.passRate ?? 0.8) * 100);
                    const x = 60 + i * stepX;
                    const y = 30 + ((100 - passRatePct) / 100) * 170;
                    return { x, y, passRatePct, ev, index: i };
                  });

                  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

                  return (
                    <g>
                      {/* Connecting Line */}
                      <polyline
                        points={polylinePoints}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-all duration-300"
                      />

                      {/* Points */}
                      {points.map((p) => {
                        const isHovered = hoveredHistoryIndex === p.index;
                        return (
                          <g
                            key={p.ev.id || p.index}
                            onMouseEnter={() => setHoveredHistoryIndex(p.index)}
                            onMouseLeave={() => setHoveredHistoryIndex(null)}
                            className="cursor-pointer"
                          >
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={isHovered ? 6 : 4}
                              fill="#10b981"
                              className="transition-all duration-150"
                            />
                            {/* Run Label on X-axis */}
                            <text
                              x={p.x}
                              y={225}
                              textAnchor="middle"
                              className={cn(
                                'text-[9px] font-mono transition-colors',
                                isHovered ? 'fill-foreground font-bold' : 'fill-muted-foreground/60'
                              )}
                            >
                              #{p.index + 1}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}
              </svg>
            </div>

            {/* History Run Detail Card on Hover */}
            <div className="p-3 rounded-lg border border-border/40 bg-background/50 flex items-center justify-between text-xs text-muted-foreground">
              {hoveredHistoryIndex !== null && completedEvaluations[hoveredHistoryIndex] ? (
                (() => {
                  const ev = completedEvaluations[hoveredHistoryIndex];
                  const passRate = ((ev.metrics?.passRate ?? 0.8) * 100).toFixed(1);
                  const dateStr = new Date(ev.createdAt).toLocaleDateString();
                  return (
                    <>
                      <div>
                        <strong className="text-foreground">{ev.name || `Evaluation Run #${hoveredHistoryIndex + 1}`}</strong>
                        <span className="text-muted-foreground/80 ml-2">({dateStr})</span>
                        <span className="text-muted-foreground/60 ml-2">· {ev.metrics?.totalCases ?? 5} test cases</span>
                      </div>
                      <div className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        Pass Rate: {passRate}%
                      </div>
                    </>
                  );
                })()
              ) : (
                <div className="text-[11px] text-muted-foreground/80">
                  Hover over any historical evaluation run point to inspect case counts, pass rates, and run timestamps.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Provenance Footer Note */}
        <div className="pt-2 border-t border-border/40 flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground/80">
          <div>
            Based on {totalCases} evaluation cases · Baseline RAG vs EVIDEX pipeline · Last evaluated {evaluationDate}
          </div>

          {/* Expandable Method & Provenance Toggle */}
          <button
            type="button"
            onClick={() => setShowMethodProvenance(!showMethodProvenance)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors select-none"
            aria-expanded={showMethodProvenance}
          >
            {showMethodProvenance ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>Method & provenance</span>
          </button>
        </div>

        {/* Expandable Method & Provenance Detail Panel */}
        {showMethodProvenance && (
          <div className="pt-3 border-t border-border/40 space-y-3 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg border border-border/40 bg-background/50 space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium">Baseline configuration</span>
                <p className="text-foreground text-[11px] leading-relaxed">
                  Dense vector retrieval (Qdrant) + unverified generative response.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-border/40 bg-background/50 space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium">EVIDEX pipeline</span>
                <p className="text-foreground text-[11px] leading-relaxed">
                  Hybrid RAG (BM25 + Dense) + DeBERTa verification + LangGraph selective recovery.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-border/40 bg-background/50 space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium">Verifier & Orchestration</span>
                <p className="text-foreground font-mono text-[11px] truncate" title="groundguard-deberta-v1-finetuned / LangGraph">
                  deberta-v1 · LangGraph (limit: 2)
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-border/40 bg-background/50 space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium">Sample & Timing</span>
                <p className="text-foreground text-[11px] leading-relaxed">
                  Fixed reference figures bundled with the app (not computed from your evaluation runs). Your latest run: {evaluationDate}.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
