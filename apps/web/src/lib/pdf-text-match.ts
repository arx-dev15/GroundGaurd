/**
 * Exact source-span alignment between a cited evidence excerpt and a PDF.js text layer.
 *
 * Matching runs on a "comparable" projection of the text: Unicode NFKD, combining marks removed, lower-cased,
 * letters and digits only. Whitespace, punctuation, quote/dash variants, ligatures (ﬁ → fi) and hyphenated
 * line breaks ("verifica-" + "tion") therefore never block a match, while the actual characters must still agree
 * in order. Every comparable character keeps a pointer back to (text item, raw offset), so a match maps to exact
 * character ranges inside the rendered text-layer spans — no ratios, no pixel estimates, no semantic similarity.
 */

export interface PageTextIndex {
  /** Comparable projection of the whole page. */
  norm: string;
  /** For norm[k]: index of the source text item. */
  itemOf: number[];
  /** For norm[k]: raw character offset inside that item's string. */
  offsetOf: number[];
  itemCount: number;
}

export interface ItemRange {
  item: number;
  /** Raw [start, end) offsets inside the item string. */
  start: number;
  end: number;
}

export type MatchKind = 'exact' | 'partial' | 'none';

export interface ExcerptMatch {
  kind: MatchKind;
  ranges: ItemRange[];
  /** Number of exact occurrences on the page (exact matches only). */
  occurrences: number;
  /** Share of the excerpt (comparable characters) covered by the highlighted range, 0..1. */
  coverage: number;
  /** For partial matches: which end of the excerpt was found on this page. */
  anchor?: 'start' | 'end';
  /** Why no highlight was produced. */
  reason?: 'empty' | 'too_short' | 'not_found';
}

/** Minimum comparable characters for an excerpt to be highlighted at all (shorter strings are ambiguous). */
export const MIN_EXCERPT_CHARS = 12;
/** Minimum comparable characters for an anchored partial (cross-page) match. */
export const MIN_PARTIAL_CHARS = 60;

const COMBINING = /\p{M}/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Comparable projection of one raw character (may expand, e.g. ligatures; may be empty). */
function projectChar(ch: string): string {
  let out = '';
  for (const c of ch.normalize('NFKD')) {
    if (COMBINING.test(c)) continue;
    const lower = c.toLowerCase();
    for (const l of lower) if (WORD_CHAR.test(l)) out += l;
  }
  return out;
}

export function normalizeComparable(text: string): string {
  let out = '';
  for (const ch of text || '') out += projectChar(ch);
  return out;
}

/** Builds the comparable index for a page from its text-layer item strings (in rendering order). */
export function buildPageTextIndex(items: readonly string[]): PageTextIndex {
  let norm = '';
  const itemOf: number[] = [];
  const offsetOf: number[] = [];
  items.forEach((raw, item) => {
    const str = raw || '';
    let offset = 0;
    for (const ch of str) {
      const p = projectChar(ch);
      for (let k = 0; k < p.length; k++) {
        itemOf.push(item);
        offsetOf.push(offset);
      }
      norm += p;
      offset += ch.length;
    }
  });
  return { norm, itemOf, offsetOf, itemCount: items.length };
}

function allOccurrences(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return out;
}

/** Converts a comparable range [s, e) into per-item raw ranges (covering punctuation/spaces inside the span). */
export function toItemRanges(index: PageTextIndex, s: number, e: number, items: readonly string[]): ItemRange[] {
  const ranges: ItemRange[] = [];
  for (let k = s; k < e; k++) {
    const item = index.itemOf[k];
    const off = index.offsetOf[k];
    const ch = (items[item] || '').codePointAt(off);
    const width = ch !== undefined && ch > 0xffff ? 2 : 1;
    const last = ranges[ranges.length - 1];
    if (last && last.item === item) {
      last.end = Math.max(last.end, off + width);
    } else {
      ranges.push({ item, start: off, end: off + width });
    }
  }
  // Include punctuation adjacent to the matched words (line-end hyphens, closing full stops/quotes) so a highlight
  // covers the visible passage, never extending into another word.
  ranges.forEach((r, i) => {
    const str = items[r.item] || '';
    if (i < ranges.length - 1 && !/[\p{L}\p{N}]/u.test(str.slice(r.end))) {
      r.end = str.length;
      return;
    }
    while (r.end < str.length && /[^\p{L}\p{N}\s]/u.test(str[r.end])) r.end++;
  });
  return ranges;
}

/** Longest prefix (or suffix) of `needle` contained in `hay`. Containment is monotonic in length → binary search. */
function longestAnchored(hay: string, needle: string, side: 'start' | 'end'): { len: number; at: number } {
  const piece = (len: number) => (side === 'start' ? needle.slice(0, len) : needle.slice(needle.length - len));
  let lo = 0;
  let hi = needle.length;
  let at = -1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const idx = hay.indexOf(piece(mid));
    if (idx !== -1) {
      lo = mid;
      at = idx;
    } else {
      hi = mid - 1;
    }
  }
  if (lo > 0 && at === -1) at = hay.indexOf(piece(lo));
  return { len: lo, at };
}

/**
 * Locates an excerpt on a page.
 * - exact: the full excerpt occurs verbatim (in comparable form); the first occurrence is returned.
 * - partial: only the excerpt's beginning or end occurs (a passage continuing across a page break), and that
 *   anchored exact run is at least MIN_PARTIAL_CHARS long.
 * - none: nothing reliable — callers must not highlight anything.
 */
export function findExcerpt(index: PageTextIndex, excerpt: string, items: readonly string[]): ExcerptMatch {
  const ex = normalizeComparable(excerpt);
  if (!ex) return { kind: 'none', ranges: [], occurrences: 0, coverage: 0, reason: 'empty' };
  if (ex.length < MIN_EXCERPT_CHARS) return { kind: 'none', ranges: [], occurrences: 0, coverage: 0, reason: 'too_short' };

  const occ = allOccurrences(index.norm, ex);
  if (occ.length > 0) {
    return { kind: 'exact', ranges: toItemRanges(index, occ[0], occ[0] + ex.length, items), occurrences: occ.length, coverage: 1 };
  }

  const head = longestAnchored(index.norm, ex, 'start');
  const tail = longestAnchored(index.norm, ex, 'end');
  const best = head.len >= tail.len ? { ...head, anchor: 'start' as const } : { ...tail, anchor: 'end' as const };
  if (best.len >= MIN_PARTIAL_CHARS && best.at !== -1) {
    return {
      kind: 'partial',
      ranges: toItemRanges(index, best.at, best.at + best.len, items),
      occurrences: 1,
      coverage: best.len / ex.length,
      anchor: best.anchor,
    };
  }
  return { kind: 'none', ranges: [], occurrences: 0, coverage: 0, reason: 'not_found' };
}

export type HighlightKind = 'active' | 'muted';

export interface Segment {
  text: string;
  kind: HighlightKind | null;
}

/**
 * Splits one text item into plain / highlighted segments. Active ranges win over muted ones where they overlap.
 * Concatenating the segment texts always reproduces the original string exactly.
 */
export function segmentItem(text: string, ranges: Array<{ start: number; end: number; kind: HighlightKind }>): Segment[] {
  if (!text) return [];
  const marks: Array<HighlightKind | null> = new Array(text.length).fill(null);
  for (const kind of ['muted', 'active'] as const) {
    for (const r of ranges) {
      if (r.kind !== kind) continue;
      for (let i = Math.max(0, r.start); i < Math.min(text.length, r.end); i++) marks[i] = kind;
    }
  }
  const out: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.kind === marks[i]) last.text += text[i];
    else out.push({ text: text[i], kind: marks[i] });
  }
  return out;
}

/** CSS custom properties PDF.js (v4+) text layers require so span boxes match the canvas glyphs at any scale. */
export function textLayerStyleVars(scale: number): Record<string, string> {
  return {
    '--scale-factor': String(scale),
    '--total-scale-factor': String(scale),
    '--user-unit': '1',
    '--scale-round-x': '1px',
    '--scale-round-y': '1px',
  };
}
