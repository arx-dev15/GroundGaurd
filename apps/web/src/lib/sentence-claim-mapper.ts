import type { Claim, EvidenceItem, ClaimStatus } from '@groundguard/types';

export const STANDARD_STOP_WORDS = new Set([
  'the', 'is', 'a', 'an', 'to', 'of', 'and', 'in', 'on', 'for', 'as', 'with', 'it', 'that', 'this',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'at', 'by',
  'from', 'also', 'such', 'more', 'than', 'into', 'their', 'which', 'there', 'they', 'them', 'these',
  'those', 'about', 'over', 'both', 'between', 'through', 'during', 'can', 'could', 'will', 'would',
  'should', 'may', 'might', 'must', 'but', 'or', 'nor', 'so', 'yet'
]);

export interface MappedSentenceItem {
  id: string;
  raw: string;
  originalText: string;
  displayText: string;
  isProjectedRecovery: boolean;
  matchedClaims: Claim[];
  effectiveStatus: ClaimStatus | null;
  evidence: EvidenceItem[];
}

export interface MappedContentBlock {
  type: 'paragraph' | 'list';
  items: MappedSentenceItem[];
}

export function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STANDARD_STOP_WORDS.has(w));
}

function cleanString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Safe deterministic sentence-claim mapper:
 * Best-match mapping with ambiguity rejection.
 *
 * Invariants:
 * 1. Safe deterministic mapping (no heuristic labeled as authoritative).
 * 2. Ambiguity rejection: if claim matches multiple sentences without clear dominance, mapping is rejected (no trust badge).
 * 3. 1-to-1 claim constraint: each claim binds to at most one sentence.
 * 4. Strictest unverified state prevails (never display green badge for mixed-state unverified sentence).
 * 5. Compound sentence recovery projection: preserves unaffected supported sibling facts.
 */

function projectRecovery(cleanText: string, matchedClaims: Claim[]): { displayText: string; isProjectedRecovery: boolean } {
  const recoveredClaim = matchedClaims.find((c) => c.status === 'recovered');
  if (!recoveredClaim) {
    return { displayText: cleanText, isProjectedRecovery: false };
  }

  const siblingClaims = matchedClaims.filter((c) => c.claimId !== recoveredClaim.claimId);

  // If there are NO sibling claims, it's a single-claim sentence.
  if (siblingClaims.length === 0) {
    if (recoveredClaim.text) {
      return { displayText: recoveredClaim.text, isProjectedRecovery: true };
    }
    return { displayText: cleanText, isProjectedRecovery: false };
  }

  // SIBLING CLAIMS EXIST: Must preserve unaffected supported facts (Section 4)
  const originalClaimText =
    recoveredClaim.recovery?.attempts?.[0]?.originalText ||
    (recoveredClaim as any).originalText ||
    null;
  const revisedClaimText = recoveredClaim.text;

  if (originalClaimText && revisedClaimText) {
    // 1. Direct substring replacement if original text exists verbatim
    if (cleanText.toLowerCase().includes(originalClaimText.toLowerCase())) {
      const regex = new RegExp(originalClaimText.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
      const projected = cleanText.replace(regex, revisedClaimText);
      return { displayText: projected, isProjectedRecovery: true };
    }

    // 2. Token-level diff isolation (common prefix & suffix stripping)
    const origTokens = originalClaimText.split(/\s+/);
    const revTokens = revisedClaimText.split(/\s+/);

    let prefixLen = 0;
    while (
      prefixLen < origTokens.length &&
      prefixLen < revTokens.length &&
      origTokens[prefixLen].toLowerCase() === revTokens[prefixLen].toLowerCase()
    ) {
      prefixLen++;
    }

    let suffixLen = 0;
    while (
      suffixLen < origTokens.length - prefixLen &&
      suffixLen < revTokens.length - prefixLen &&
      origTokens[origTokens.length - 1 - suffixLen].toLowerCase() ===
        revTokens[revTokens.length - 1 - suffixLen].toLowerCase()
    ) {
      suffixLen++;
    }

    const origDiff = origTokens.slice(prefixLen, origTokens.length - suffixLen).join(' ');
    const revDiff = revTokens.slice(prefixLen, revTokens.length - suffixLen).join(' ');

    if (origDiff && revDiff && cleanText.toLowerCase().includes(origDiff.toLowerCase())) {
      const collidesWithSibling = siblingClaims.some((sc) =>
        sc.text.toLowerCase().includes(origDiff.toLowerCase())
      );
      if (!collidesWithSibling) {
        const regex = new RegExp(origDiff.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
        const projected = cleanText.replace(regex, revDiff);
        return { displayText: projected, isProjectedRecovery: true };
      }
    }
  }

  // 3. Fallback for compound sentence:
  // If we cannot safely replace only the recovered claim without mutating/discarding sibling claims,
  // NEVER discard sibling claims by replacing the whole sentence.
  // Leave cleanText intact to preserve supported facts (Section 4).
  return { displayText: cleanText, isProjectedRecovery: false };
}

export function splitParagraphIntoSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  const trimmed = text.trim();
  const DOT_SENTINEL = '___DOT_SENTINEL___';

  // 1. Protect bracketed citation contents e.g. [DHT11 Notes for the Students.pdf, p. 1, p. 2]
  let masked = trimmed.replace(/\[([^\]]+)\]/g, (_m, inside) => {
    return '[' + inside.replaceAll('.', DOT_SENTINEL) + ']';
  });

  // 2. Protect filenames and alphanumeric extensions/identifiers e.g. file.pdf, Next.js, API.610
  masked = masked.replace(/([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/g, `$1${DOT_SENTINEL}$2`);

  // 3. Protect numbers with decimals e.g. 5.0, 3.14
  masked = masked.replace(/(\d+)\.(\d+)/g, `$1${DOT_SENTINEL}$2`);

  // 4. Protect common abbreviations: e.g., i.e., p., pp., vs., etc.
  masked = masked.replace(/\b(e\.g|i\.e|p|pp|fig|vs|dr|mr|mrs|ms|prof|inc|ltd|approx|dept|no|vol|sec)\./gi, `$1${DOT_SENTINEL}`);

  // 5. Split on true sentence boundaries: terminators [.!?] optionally followed by quote/bracket,
  // then whitespace followed by a capital letter or start of next sentence (never split before citations)
  const parts = masked.split(/(?<=[.!?][)"'\]]?)\s+(?=[A-Z0-9"'(])/);

  const sentences = parts
    .map((p) => p.replaceAll(DOT_SENTINEL, '.').trim())
    .filter(Boolean);

  // Safety invariant: If split somehow dropped substantive prose (>20% loss), fallback to [trimmed]
  const totalLength = sentences.reduce((acc, s) => acc + s.length, 0);
  if (sentences.length === 0 || (trimmed.length > 40 && totalLength < trimmed.length * 0.8)) {
    return [trimmed];
  }

  return sentences;
}

export function mapAnswerToClaims(answerText: string, claims: Claim[] = []): MappedContentBlock[] {
  if (!answerText) return [];

  // 1. Parse text into raw paragraphs and list blocks
  const rawBlocks = answerText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

  interface RawSentenceRef {
    blockIdx: number;
    itemIdx: number;
    raw: string;
    cleanText: string;
    tokens: string[];
    tokenSet: Set<string>;
  }

  const allSentences: RawSentenceRef[] = [];
  const blockStructures: Array<{ type: 'paragraph' | 'list'; items: string[] }> = [];

  rawBlocks.forEach((block, bIdx) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const isBulletList = lines.length > 1 && lines.every((l) => /^[*•\-]|\d+\./.test(l));

    if (isBulletList) {
      const items: string[] = [];
      lines.forEach((line, iIdx) => {
        const cleanLine = line.replace(/^[*•\-]\s*|\d+\.\s*/, '').trim();
        items.push(cleanLine);
        allSentences.push({
          blockIdx: bIdx,
          itemIdx: iIdx,
          raw: line,
          cleanText: cleanLine,
          tokens: normalizeTokens(cleanLine),
          tokenSet: new Set(normalizeTokens(cleanLine)),
        });
      });
      blockStructures.push({ type: 'list', items });
    } else {
      const sentences = splitParagraphIntoSentences(block);
      blockStructures.push({ type: 'paragraph', items: sentences });

      sentences.forEach((sent, iIdx) => {
        allSentences.push({
          blockIdx: bIdx,
          itemIdx: iIdx,
          raw: sent,
          cleanText: sent,
          tokens: normalizeTokens(sent),
          tokenSet: new Set(normalizeTokens(sent)),
        });
      });
    }
  });

  // 2. Score candidate matches between all claims and sentences
  interface CandidateMatch {
    claim: Claim;
    sentenceIdx: number;
    score: number;
  }

  const candidates: CandidateMatch[] = [];

  claims.forEach((claim) => {
    const claimClean = cleanString(claim.text);
    const claimTokens = normalizeTokens(claim.text);

    allSentences.forEach((sent, sIdx) => {
      const sentClean = cleanString(sent.cleanText);

      // Level 1: Substring containment (atomic claim wholly within sentence)
      if (sentClean.includes(claimClean)) {
        candidates.push({ claim, sentenceIdx: sIdx, score: 900 });
        return;
      }
      if (claimClean.includes(sentClean)) {
        const ratio = sentClean.length / claimClean.length;
        if (ratio >= 0.5) {
          candidates.push({ claim, sentenceIdx: sIdx, score: 800 + ratio * 100 });
          return;
        }
      }

      // Level 2: Token / Predicate similarity
      if (claimTokens.length === 0 || sent.tokens.length === 0) return;

      const overlap = claimTokens.filter((w) => sent.tokenSet.has(w));
      const diceSimilarity = (2 * overlap.length) / (claimTokens.length + sent.tokens.length);

      // Require meaningful non-stopword overlap
      const passesThreshold =
        (overlap.length >= 2 && diceSimilarity >= 0.3) ||
        (claimTokens.length === 1 && overlap.length === 1 && diceSimilarity >= 0.5);

      if (passesThreshold) {
        const score = 100 + diceSimilarity * 200 + overlap.length * 15;
        candidates.push({ claim, sentenceIdx: sIdx, score });
      }
    });
  });

  // 3. Ambiguity Rejection (Section 3: ambiguous mapping -> no trust badge, never guess)
  const claimCandidateMap = new Map<string, CandidateMatch[]>();
  for (const c of candidates) {
    const list = claimCandidateMap.get(c.claim.claimId) || [];
    list.push(c);
    claimCandidateMap.set(c.claim.claimId, list);
  }

  const unambiguousCandidates: CandidateMatch[] = [];
  for (const [, list] of claimCandidateMap.entries()) {
    if (list.length === 1) {
      unambiguousCandidates.push(list[0]);
    } else {
      list.sort((a, b) => b.score - a.score);
      const top = list[0];
      const second = list[1];
      // Require clear dominance (e.g. top is substring >= 800 vs token match, or top > 1.25x second)
      if (top.score >= 800 && second.score < 800) {
        unambiguousCandidates.push(top);
      } else if (top.score > second.score * 1.25) {
        unambiguousCandidates.push(top);
      }
      // Otherwise: ambiguous candidate rejected -> remains unmapped
    }
  }

  // 4. Stable 1-to-1 deterministic assignment:
  unambiguousCandidates.sort((a, b) => b.score - a.score);

  const assignedClaimIds = new Set<string>();
  const sentenceToClaimsMap = new Map<number, Claim[]>();

  for (const match of unambiguousCandidates) {
    if (assignedClaimIds.has(match.claim.claimId)) {
      continue;
    }

    assignedClaimIds.add(match.claim.claimId);
    const currentList = sentenceToClaimsMap.get(match.sentenceIdx) || [];
    currentList.push(match.claim);
    sentenceToClaimsMap.set(match.sentenceIdx, currentList);
  }

  // 5. Construct final mapped content blocks with projection & mixed-state resolution
  let globalSentIdx = 0;
  return blockStructures.map((block) => {
    const items: MappedSentenceItem[] = block.items.map((cleanText) => {
      const sentRef = allSentences[globalSentIdx];
      const matchedClaims = sentenceToClaimsMap.get(globalSentIdx) || [];
      globalSentIdx++;

      // Strictest status calculation (never hide unverified claim behind green marker)
      let effectiveStatus: ClaimStatus | null = null;
      if (matchedClaims.length > 0) {
        if (matchedClaims.some((c) => c.status === 'flagged')) {
          effectiveStatus = 'flagged';
        } else if (matchedClaims.some((c) => c.status === 'needs_review')) {
          effectiveStatus = 'needs_review';
        } else if (matchedClaims.some((c) => c.status === 'recovered')) {
          effectiveStatus = 'recovered';
        } else if (matchedClaims.every((c) => c.status === 'verified')) {
          effectiveStatus = 'verified';
        } else {
          effectiveStatus = matchedClaims[0].status;
        }
      }

      // Recovered Answer Projection (Section 4: preserves unaffected supported facts)
      const { displayText, isProjectedRecovery } =
        effectiveStatus === 'recovered'
          ? projectRecovery(cleanText, matchedClaims)
          : { displayText: cleanText, isProjectedRecovery: false };

      // Aggregate deduped evidence items
      const evidenceList: EvidenceItem[] = [];
      const seenEv = new Set<string>();
      for (const c of matchedClaims) {
        for (const ev of c.evidence || []) {
          const id = ev.chunkId || ev.evidenceId || ev.text;
          if (!seenEv.has(id)) {
            seenEv.add(id);
            evidenceList.push(ev);
          }
        }
      }

      return {
        id: `sent-${sentRef.blockIdx}-${sentRef.itemIdx}`,
        raw: sentRef.raw,
        originalText: cleanText,
        displayText,
        isProjectedRecovery,
        matchedClaims,
        effectiveStatus,
        evidence: evidenceList,
      };
    });

    return {
      type: block.type,
      items,
    };
  });
}
