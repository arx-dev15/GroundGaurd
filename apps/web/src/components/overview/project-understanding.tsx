'use client';

import * as React from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';
import type { Document as GroundDocument, ProjectClaimItem } from '@groundguard/types';

interface ProjectUnderstandingProps {
  documents: GroundDocument[];
  claims: ProjectClaimItem[];
}

interface Relationship {
  subject: string;
  verb: string;
  object: string;
}

// Clean extracted entity strings
function cleanEntityPhrase(text: string): string {
  let cleaned = text
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\s+(across|including|by|for|to|with|in|on|of|at|from)\b.+$/i, '')
    .replace(/[.,;:"'()[\]{}]+$/, '')
    .trim();

  if (cleaned.length > 2) {
    if (cleaned === cleaned.toLowerCase()) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }
  return cleaned;
}

export function ProjectUnderstanding({ documents, claims }: ProjectUnderstandingProps) {
  const { themes, relationships } = React.useMemo(() => {
    if (!claims || claims.length === 0) {
      return { themes: [], relationships: [] };
    }

    const verbRules: Array<{ regex: RegExp; verb: string }> = [
      { regex: /(.+?)\s+(?:measures|monitors|tracks)\s+(.+)/i, verb: 'measures' },
      { regex: /(.+?)\s+(?:uses|utilizes|combines|employs)\s+(.+)/i, verb: 'uses' },
      { regex: /(.+?)\s+is upstream of\s+(.+)/i, verb: 'upstream of' },
      { regex: /(.+?)\s+(?:operates at|specifies|has a rated|has a maximum)\s+(.+)/i, verb: 'specifies' },
      { regex: /(.+?)\s+(?:detects|forecasts|alerts on)\s+(.+)/i, verb: 'detects' },
      { regex: /(.+?)\s+(?:contains|integrates|includes)\s+(.+)/i, verb: 'contains' },
      { regex: /(.+?)\s+(?:produces|generates)\s+(.+)/i, verb: 'produces' },
    ];

    const entityCounts = new Map<string, number>();
    const relList: Relationship[] = [];
    const seenRels = new Set<string>();

    claims.forEach((c) => {
      if (!c.text) return;
      for (const rule of verbRules) {
        const match = c.text.match(rule.regex);
        if (match) {
          const rawSubj = cleanEntityPhrase(match[1]);
          const rawObj = cleanEntityPhrase(match[2]);

          if (
            rawSubj.length >= 3 &&
            rawSubj.length <= 32 &&
            rawObj.length >= 3 &&
            rawObj.length <= 32 &&
            rawSubj.toLowerCase() !== rawObj.toLowerCase()
          ) {
            entityCounts.set(rawSubj, (entityCounts.get(rawSubj) || 0) + 1);
            entityCounts.set(rawObj, (entityCounts.get(rawObj) || 0) + 1);

            const relKey = `${rawSubj.toLowerCase()}::${rule.verb}::${rawObj.toLowerCase()}`;
            if (!seenRels.has(relKey) && relList.length < 3) {
              seenRels.add(relKey);
              relList.push({
                subject: rawSubj,
                verb: rule.verb,
                object: rawObj,
              });
            }
            break;
          }
        }
      }

      // Check evidence headings
      if (c.evidence) {
        c.evidence.forEach((ev) => {
          if (ev.heading && ev.heading.length >= 3 && ev.heading.length <= 32) {
            const h = cleanEntityPhrase(ev.heading);
            entityCounts.set(h, (entityCounts.get(h) || 0) + 1);
          }
        });
      }
    });

    const sortedThemes = Array.from(entityCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 5);

    return {
      themes: sortedThemes,
      relationships: relList,
    };
  }, [claims]);

  // If real semantic entities are not available, hide section per rule 3
  if (themes.length < 2) {
    return null;
  }

  return (
    <section className="space-y-3 select-none" aria-label="Project understanding">
      <div className="flex items-center gap-2 pb-1 border-b border-border/30">
        <BookOpen className="h-4 w-4 text-primary" />
        <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
          What this project is about
        </h2>
      </div>

      <div className="p-5 rounded-2xl bg-card/35 border border-border/30 space-y-4">
        {/* Real Core Themes */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
            Core Topics & Themes
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {themes.map((theme) => (
              <span
                key={theme}
                className="text-xs sm:text-sm font-medium text-foreground bg-muted/40 border border-border/50 px-3 py-1 rounded-lg"
              >
                {theme}
              </span>
            ))}
          </div>
        </div>

        {/* Real Grounded Relationships */}
        {relationships.length > 0 && (
          <div className="pt-2 border-t border-border/25 space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
              Observed Relationships
            </span>
            <div className="space-y-1.5 font-mono text-xs">
              {relationships.map((rel, idx) => (
                <div key={idx} className="flex items-center gap-2 text-foreground/90">
                  <span className="font-semibold text-foreground">{rel.subject}</span>
                  <span className="text-primary text-[11px] font-medium lowercase px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                    {rel.verb}
                  </span>
                  <span className="text-foreground/80">{rel.object}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
