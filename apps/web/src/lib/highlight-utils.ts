import * as React from 'react';

// Deterministic token extraction for technical terms, quantities, units, and equipment IDs
const TOKEN_REGEX = /\b(?:\d+(?:\.\d+)?(?:\s*(?:%|V|volts|bar|kPa|MPa|m3\/h|m³\/h|C|°C|Hz|rpm|RH|kW|MW))?|[A-Z]{1,4}-[0-9]{1,4}[A-Z]?|DHT\d+|pin\s*\d+)\b/gi;

export interface HighlightSegment {
  text: string;
  isMatch?: boolean;
  isConflict?: boolean;
}

export function parseComparisonSegments(
  text: string,
  referenceText: string,
  isContradiction: boolean = false
): HighlightSegment[] {
  if (!text || !referenceText) {
    return [{ text }];
  }

  // Extract reference tokens normalized
  const refMatches = referenceText.match(TOKEN_REGEX) || [];
  const refTokens = new Set(refMatches.map((m) => m.trim().toLowerCase()));

  // Extract self tokens
  const selfMatches = Array.from(text.matchAll(TOKEN_REGEX));
  if (selfMatches.length === 0) {
    return [{ text }];
  }

  const segments: HighlightSegment[] = [];
  let lastIndex = 0;

  for (const match of selfMatches) {
    const matchText = match[0];
    const matchIndex = match.index!;

    // Non-matched preceding text
    if (matchIndex > lastIndex) {
      segments.push({ text: text.slice(lastIndex, matchIndex) });
    }

    const norm = matchText.trim().toLowerCase();
    const hasMatch = refTokens.has(norm);

    if (hasMatch) {
      segments.push({ text: matchText, isMatch: true });
    } else if (isContradiction && /\d/.test(matchText)) {
      // Numerical or quantity mismatch in a contradiction
      segments.push({ text: matchText, isConflict: true });
    } else {
      segments.push({ text: matchText });
    }

    lastIndex = matchIndex + matchText.length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments;
}
