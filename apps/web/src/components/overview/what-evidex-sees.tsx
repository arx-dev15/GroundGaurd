'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, MessageSquareCode, FileText, ArrowRight, Layers, ShieldCheck, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Document as GroundDocument, ProjectClaimItem } from '@groundguard/types';

interface WhatEvidexSeesProps {
  projectId: string;
  projectName: string;
  documents: GroundDocument[];
  claims: ProjectClaimItem[];
  totalChunks: number;
  onHoverConcept?: (
    conceptName: string | null,
    stats?: { total: number; verified: number; recovered: number; review: number }
  ) => void;
}

export interface SemanticConcept {
  id: string;
  label: string;
  frequency: number;
  evidenceCount: number;
  claimCount: number;
  sources: string[];
  statusMix: { verified: number; recovered: number; review: number };
  sampleQuery: string;
  isCenter?: boolean;
  x: number;
  y: number;
}

export interface SemanticEdge {
  id: string;
  source: string;
  target: string;
  verb: 'measures' | 'uses' | 'specifies' | 'upstream of' | 'contains' | 'detects' | 'depends on' | 'triggers' | 'supports';
  detail: string;
}

// Format clean human-readable source titles
function formatDisplayTitle(filename: string): string {
  return filename
    .replace(/\.[a-zA-Z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bPdf\b/g, '')
    .trim();
}

// Clean extracted entity strings
function cleanEntityPhrase(text: string): string {
  let cleaned = text
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\s+(across|including|by|for|to|with|in|on|of|at|from)\b.+$/i, '')
    .replace(/[.,;:"'()[\]{}]+$/, '')
    .trim();

  // Normalize case if all caps or all lowercase
  if (cleaned.length > 2) {
    if (cleaned === cleaned.toLowerCase()) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }
  return cleaned;
}

export function WhatEvidexSees({
  projectId,
  projectName,
  documents,
  claims,
  totalChunks,
  onHoverConcept,
}: WhatEvidexSeesProps) {
  const router = useRouter();
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);

  // Semantic concept and relationship extraction from real claims & evidence
  const { concepts, edges, dominantConcept, isFallback } = React.useMemo(() => {
    const verbRules: Array<{
      regex: RegExp;
      verb: SemanticEdge['verb'];
    }> = [
      { regex: /(.+?)\s+(?:measures|monitors|tracks)\s+(.+)/i, verb: 'measures' },
      { regex: /(.+?)\s+(?:uses|utilizes|combines|employs)\s+(.+)/i, verb: 'uses' },
      { regex: /(.+?)\s+is upstream of\s+(.+)/i, verb: 'upstream of' },
      { regex: /(.+?)\s+(?:operates at|specifies|has a rated|has a maximum)\s+(.+)/i, verb: 'specifies' },
      { regex: /(.+?)\s+(?:detects|forecasts|alerts on)\s+(.+)/i, verb: 'detects' },
      { regex: /(.+?)\s+(?:contains|integrates|includes)\s+(.+)/i, verb: 'contains' },
      { regex: /(.+?)\s+(?:depends on|relies on)\s+(.+)/i, verb: 'depends on' },
      { regex: /(.+?)\s+(?:triggers|activates)\s+(.+)/i, verb: 'triggers' },
      { regex: /(.+?)\s+(?:supports|validates)\s+(.+)/i, verb: 'supports' },
    ];

    interface CandidateConcept {
      label: string;
      frequency: number;
      evidenceCount: number;
      claims: ProjectClaimItem[];
      sources: Set<string>;
    }

    const candidateMap = new Map<string, CandidateConcept>();
    const rawEdges: Array<{
      source: string;
      target: string;
      verb: SemanticEdge['verb'];
      detail: string;
    }> = [];

    // Map doc IDs to clean display names
    const docNameMap = new Map<string, string>();
    documents.forEach((d) => {
      docNameMap.set(d.id, formatDisplayTitle(d.filename));
    });

    const registerCandidate = (label: string, claim: ProjectClaimItem, evidenceCount = 1) => {
      const key = label.toLowerCase();
      let existing = candidateMap.get(key);
      if (!existing) {
        existing = {
          label,
          frequency: 0,
          evidenceCount: 0,
          claims: [],
          sources: new Set<string>(),
        };
        candidateMap.set(key, existing);
      }
      existing.frequency += 1;
      existing.evidenceCount += evidenceCount;
      existing.claims.push(claim);

      // Collect source documents
      if (claim.evidence) {
        claim.evidence.forEach((ev) => {
          if (ev.documentId && docNameMap.has(ev.documentId)) {
            existing!.sources.add(docNameMap.get(ev.documentId)!);
          }
        });
      }
      if (existing.sources.size === 0 && documents.length > 0) {
        existing.sources.add(formatDisplayTitle(documents[0].filename));
      }
    };

    // 1. Parse claim texts for real entities and relations
    claims.forEach((claim) => {
      if (!claim.text) return;
      const evCount = claim.evidence?.length || 1;

      for (const rule of verbRules) {
        const match = claim.text.match(rule.regex);
        if (match) {
          const rawSubj = cleanEntityPhrase(match[1]);
          const rawObj = cleanEntityPhrase(match[2]);

          if (
            rawSubj.length >= 2 &&
            rawSubj.length <= 32 &&
            rawObj.length >= 2 &&
            rawObj.length <= 32 &&
            rawSubj.toLowerCase() !== rawObj.toLowerCase()
          ) {
            registerCandidate(rawSubj, claim, evCount);
            registerCandidate(rawObj, claim, evCount);

            rawEdges.push({
              source: rawSubj.toLowerCase(),
              target: rawObj.toLowerCase(),
              verb: rule.verb,
              detail: claim.text,
            });
            break; // Stop after first matched relation pattern
          }
        }
      }

      // Check section/heading metadata in evidence
      if (claim.evidence) {
        claim.evidence.forEach((ev) => {
          if (ev.heading && ev.heading.length >= 3 && ev.heading.length <= 30) {
            registerCandidate(ev.heading.trim(), claim, 1);
          }
        });
      }
    });

    // Determine if semantic graph extraction has enough data (target 5–8 nodes)
    const sortedCandidates = Array.from(candidateMap.values()).sort(
      (a, b) => b.frequency + b.evidenceCount - (a.frequency + a.evidenceCount)
    );

    // If fewer than 2 semantic entities exist, fall back to Evidence Concentration
    if (sortedCandidates.length < 2) {
      return {
        concepts: [],
        edges: [],
        dominantConcept: null,
        isFallback: true,
      };
    }

    // Select top 5 to 7 meaningful concepts (maximum 7+1 center = 8 nodes max)
    const topCandidates = sortedCandidates.slice(0, Math.min(7, sortedCandidates.length));
    const selectedKeySet = new Set(topCandidates.map((c) => c.label.toLowerCase()));

    // Central / dominant node: candidate with highest frequency and relations
    const dominant = topCandidates[0];

    // Compute intentional spatial coordinates (center-left dominant focal point, balanced satellites)
    // Canvas dimensions: 480 wide x 230 tall (reduced height by ~23%)
    const centerX = 160;
    const centerY = 115;

    // Satellites positioned in intentional spatial hierarchy
    const satelliteCount = topCandidates.length - 1;
    const conceptNodes: SemanticConcept[] = [];

    // 1. Dominant Center Node
    const dominantClaims = dominant.claims;
    const domVerified = dominantClaims.filter((c) => c.status === 'verified').length;
    const domRecovered = dominantClaims.filter((c) => c.status === 'recovered').length;
    const domReview = dominantClaims.filter((c) => c.status === 'flagged' || c.status === 'needs_review').length;

    conceptNodes.push({
      id: dominant.label.toLowerCase(),
      label: dominant.label,
      frequency: dominant.frequency,
      evidenceCount: dominant.evidenceCount,
      claimCount: dominant.claims.length,
      sources: Array.from(dominant.sources),
      statusMix: { verified: domVerified, recovered: domRecovered, review: domReview },
      sampleQuery: `How does ${dominant.label} operate according to verified specifications?`,
      isCenter: true,
      x: centerX,
      y: centerY,
    });

    // 2. Satellites arranged in an organic balanced arc/ellipse around dominant
    const orbitAngles = satelliteCount <= 4
      ? [30, 90, 270, 330]
      : [-60, -20, 25, 65, 120, 240];

    topCandidates.slice(1).forEach((cand, idx) => {
      const angleDeg = orbitAngles[idx % orbitAngles.length];
      const rad = (angleDeg * Math.PI) / 180;
      const rx = 180;
      const ry = 80;

      const x = Math.min(430, Math.max(50, centerX + Math.cos(rad) * rx));
      const y = Math.min(195, Math.max(35, centerY + Math.sin(rad) * ry));

      const candVerified = cand.claims.filter((c) => c.status === 'verified').length;
      const candRecovered = cand.claims.filter((c) => c.status === 'recovered').length;
      const candReview = cand.claims.filter((c) => c.status === 'flagged' || c.status === 'needs_review').length;

      conceptNodes.push({
        id: cand.label.toLowerCase(),
        label: cand.label,
        frequency: cand.frequency,
        evidenceCount: cand.evidenceCount,
        claimCount: cand.claims.length,
        sources: Array.from(cand.sources),
        statusMix: { verified: candVerified, recovered: candRecovered, review: candReview },
        sampleQuery: `What are the evidence-grounded parameters for ${cand.label}?`,
        isCenter: false,
        x,
        y,
      });
    });

    // Build verified relationships connecting these nodes
    const validEdges: SemanticEdge[] = [];
    const edgeKeySet = new Set<string>();

    rawEdges.forEach((e) => {
      if (selectedKeySet.has(e.source) && selectedKeySet.has(e.target)) {
        const key = `${e.source}->${e.target}`;
        if (!edgeKeySet.has(key)) {
          edgeKeySet.add(key);
          validEdges.push({
            id: `edge-${key}`,
            source: e.source,
            target: e.target,
            verb: e.verb,
            detail: e.detail,
          });
        }
      }
    });

    // If any satellite lacks an edge, connect it to the dominant node with 'supports' or 'contains'
    const connectedNodeIds = new Set<string>();
    validEdges.forEach((e) => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });

    conceptNodes.forEach((node) => {
      if (!node.isCenter && !connectedNodeIds.has(node.id)) {
        validEdges.push({
          id: `edge-${dominant.label.toLowerCase()}->${node.id}`,
          source: dominant.label.toLowerCase(),
          target: node.id,
          verb: 'supports',
          detail: `${dominant.label} grounds ${node.label} in project evidence`,
        });
      }
    });

    return {
      concepts: conceptNodes,
      edges: validEdges,
      dominantConcept: dominant.label,
      isFallback: false,
    };
  }, [claims, documents]);

  // Set initial selected node to dominant concept
  React.useEffect(() => {
    if (concepts.length > 0 && !selectedNodeId) {
      setSelectedNodeId(concepts[0].id);
    }
  }, [concepts, selectedNodeId]);

  // Handle hover and trigger cross-visual callback to TrustLandscape
  const handleNodeHover = (node: SemanticConcept | null) => {
    if (node) {
      setHoveredNodeId(node.id);
      onHoverConcept?.(node.label, {
        total: node.claimCount,
        verified: node.statusMix.verified,
        recovered: node.statusMix.recovered,
        review: node.statusMix.review,
      });
    } else {
      setHoveredNodeId(null);
      onHoverConcept?.(null);
    }
  };

  const activeNode = React.useMemo(() => {
    const id = hoveredNodeId || selectedNodeId;
    return concepts.find((c) => c.id === id) || concepts[0] || null;
  }, [hoveredNodeId, selectedNodeId, concepts]);

  // Identify connected neighbor node IDs for hover highlighting (creative interaction)
  const connectedNeighbors = React.useMemo(() => {
    if (!activeNode) return new Set<string>();
    const neighbors = new Set<string>([activeNode.id]);
    edges.forEach((e) => {
      if (e.source === activeNode.id) neighbors.add(e.target);
      if (e.target === activeNode.id) neighbors.add(e.source);
    });
    return neighbors;
  }, [activeNode, edges]);

  // Helper map for node positions
  const nodePositionMap = React.useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    concepts.forEach((c) => map.set(c.id, { x: c.x, y: c.y }));
    return map;
  }, [concepts]);

  // =========================================================================
  // FALLBACK: EVIDENCE CONCENTRATION / SOURCE STRUCTURE MAP (Rule 18)
  // Used if semantic concepts/relations cannot be reliably derived
  // =========================================================================
  if (isFallback) {
    return (
      <div className="space-y-3 select-none" role="region" aria-label="Evidence concentration">
        <div className="flex items-center justify-between pb-1 border-b border-border/30">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
              Evidence concentration
            </h2>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/50">
            Structural source map · Graph data pending
          </Badge>
        </div>

        <div className="rounded-2xl bg-gradient-to-b from-card/50 via-card/20 to-transparent p-4 sm:p-5 border border-border/30 space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>Semantic entity graph requires additional evaluation cycles. Visualizing grounded document structure:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {documents.slice(0, 6).map((doc) => {
              const cleanTitle = formatDisplayTitle(doc.filename);
              return (
                <div
                  key={doc.id}
                  className="p-3 rounded-xl border border-border/40 bg-card/60 space-y-2 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {cleanTitle}
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                      {doc.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                    <span>{doc.chunksCount || 0} passages indexed</span>
                    <span>Ready</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // PRIMARY: WHAT EVIDEX SEES — SEMANTIC INTELLIGENCE PORTRAIT (Rules 1-8, 13-16)
  // =========================================================================
  return (
    <div className="space-y-3 select-none" role="region" aria-label="What EVIDEX sees">
      {/* Editorial Title */}
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
            What EVIDEX sees
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
            Project semantic portrait
          </span>
          {dominantConcept && (
            <Badge variant="outline" className="text-[10px] font-mono text-primary border-primary/30 py-0 px-2">
              Core: {dominantConcept}
            </Badge>
          )}
        </div>
      </div>

      {/* Main Semantic Intelligence Canvas (~22% reduced height, composed spatial hierarchy) */}
      <div className="relative rounded-2xl bg-gradient-to-b from-card/45 via-card/20 to-transparent p-4 sm:p-5 border border-border/30 overflow-hidden">
        {/* Soft graphite backdrop with subtle concentric tonal rings */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute top-[50%] left-[33%] -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border border-primary/10" />
          <div className="absolute top-[50%] left-[33%] -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full border border-primary/5" />
          <div className="absolute top-[50%] left-[33%] -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-primary/[0.025] rounded-full blur-2xl" />
        </div>

        {/* Visual Map Area: Reduced height from 300px to ~230px for high visual density */}
        <div className="relative w-full h-[210px] sm:h-[230px] flex items-center justify-center">
          {/* SVG Semantic Relations Filament Layer */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 480 230"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.2" />
              </linearGradient>
            </defs>

            {edges.map((edge) => {
              const srcPos = nodePositionMap.get(edge.source);
              const tgtPos = nodePositionMap.get(edge.target);
              if (!srcPos || !tgtPos) return null;

              const isEdgeActive =
                activeNode?.id === edge.source || activeNode?.id === edge.target;
              const isUnrelated = activeNode && !isEdgeActive;

              const midX = (srcPos.x + tgtPos.x) / 2;
              const midY = (srcPos.y + tgtPos.y) / 2;

              return (
                <g key={edge.id} className="transition-opacity duration-200">
                  {/* Relation Filament Line */}
                  <line
                    x1={srcPos.x}
                    y1={srcPos.y}
                    x2={tgtPos.x}
                    y2={tgtPos.y}
                    stroke="currentColor"
                    strokeWidth={isEdgeActive ? 1.75 : 0.75}
                    strokeDasharray={edge.verb === 'upstream of' ? '4 3' : 'none'}
                    className={`transition-all duration-300 ${
                      isEdgeActive
                        ? 'text-primary/80 stroke-primary/80'
                        : isUnrelated
                        ? 'text-border/20 stroke-border/20 opacity-30'
                        : 'text-border/40 stroke-border/40'
                    }`}
                  />

                  {/* Active Relationship Verb Badge on Filament */}
                  {isEdgeActive && (
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x={-30}
                        y={-9}
                        width={60}
                        height={18}
                        rx={4}
                        fill="var(--background)"
                        stroke="currentColor"
                        strokeWidth={0.75}
                        className="text-primary/50"
                      />
                      <text
                        x={0}
                        y={3}
                        textAnchor="middle"
                        fill="currentColor"
                        className="text-[9px] font-mono fill-primary font-medium"
                      >
                        {edge.verb}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Interactive Semantic Concept Nodes */}
          {concepts.map((concept) => {
            const isSelected = selectedNodeId === concept.id;
            const isHovered = hoveredNodeId === concept.id;
            const isNeighbor = connectedNeighbors.has(concept.id);
            const isUnrelated = activeNode && !isNeighbor;

            return (
              <button
                key={concept.id}
                type="button"
                onClick={() => setSelectedNodeId(concept.id)}
                onMouseEnter={() => handleNodeHover(concept)}
                onMouseLeave={() => handleNodeHover(null)}
                onFocus={() => handleNodeHover(concept)}
                onBlur={() => handleNodeHover(null)}
                style={{
                  left: `${(concept.x / 480) * 100}%`,
                  top: `${(concept.y / 230) * 100}%`,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 group flex items-center gap-2 py-1.5 px-3 rounded-xl border outline-none text-left transition-all duration-200 cursor-pointer shadow-xs ${
                  concept.isCenter
                    ? 'ring-2 ring-primary/30 bg-card/95 border-primary/50 scale-105'
                    : isSelected
                    ? 'bg-primary/15 border-primary/60 text-foreground ring-2 ring-primary/20 scale-102'
                    : isHovered
                    ? 'bg-card/95 border-border/80 text-foreground scale-102'
                    : 'bg-card/75 border-border/40 text-muted-foreground hover:text-foreground'
                } ${isUnrelated ? 'opacity-30 scale-95' : 'opacity-100'}`}
              >
                {/* Status or Focal Indicator */}
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    concept.isCenter
                      ? 'bg-primary ring-2 ring-primary/30 animate-pulse'
                      : concept.statusMix.verified > 0
                      ? 'bg-emerald-400'
                      : concept.statusMix.recovered > 0
                      ? 'bg-sky-400'
                      : 'bg-amber-400'
                  }`}
                />

                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate max-w-[130px] sm:max-w-[150px]">
                    {concept.label}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground truncate">
                    {concept.evidenceCount} {concept.evidenceCount === 1 ? 'passage' : 'passages'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Lightweight Integrated Contextual Inspection Surface (Rule 6: replaces large detached card) */}
        {activeNode && (
          <div className="mt-3 pt-3 border-t border-border/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-background/40 p-3 rounded-xl">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-primary font-bold">
                  Concept
                </span>
                <span className="font-semibold text-foreground">{activeNode.label}</span>
              </div>

              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-[10px] font-mono uppercase tracking-wider">Grounding</span>
                <span className="font-mono text-foreground font-medium">
                  {activeNode.evidenceCount} passages · {activeNode.claimCount} assertions
                </span>
              </div>

              {activeNode.sources.length > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground truncate max-w-xs">
                  <span className="text-[10px] font-mono uppercase tracking-wider">Source</span>
                  <span className="truncate text-foreground font-medium">
                    {activeNode.sources[0]}
                  </span>
                </div>
              )}
            </div>

            {/* Contextual "Ask about this →" Action */}
            <Button
              size="sm"
              onClick={() =>
                router.push(
                  `/projects/${projectId}/ask?q=${encodeURIComponent(activeNode.sampleQuery)}`
                )
              }
              className="text-xs h-7 px-3 gap-1.5 shrink-0 self-start sm:self-center font-medium shadow-2xs"
            >
              <MessageSquareCode className="h-3 w-3" />
              <span>Ask about this</span>
              <ArrowRight className="h-3 w-3 ml-0.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
