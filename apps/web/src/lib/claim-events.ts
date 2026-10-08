import type { Claim } from '@groundguard/types';

/**
 * Normalizes an M3 claim verdict event (`sentence.verified` / `sentence.flagged` / `recovery.completed`).
 * Canonical M3 payload is FLAT: { claimId, text, status, label, groundingScore }.
 * A nested `{ claim: {...} }` payload (older shape) is still accepted.
 * Returns null when the event carries no claim identity.
 */
export type ClaimUpdate = Partial<Claim> & { claimId: string };

export function normalizeClaimEvent(data: any): ClaimUpdate | null {
  if (!data || typeof data !== 'object') return null;
  const src = data.claim && typeof data.claim === 'object' ? data.claim : data;
  if (typeof src.claimId !== 'string' || !src.claimId) return null;
  const update: ClaimUpdate = { claimId: src.claimId };
  if (typeof src.text === 'string') update.text = src.text;
  if (typeof src.status === 'string') update.status = src.status;
  if (src.verification && typeof src.verification === 'object') {
    update.verification = src.verification;
  } else if (typeof src.label === 'string') {
    // Flat event: only label + grounding score are sent; scores are not part of the event.
    update.verification = {
      label: src.label,
      scores: { entailment: 0, contradiction: 0, neutral: 0 },
      groundingScore: typeof src.groundingScore === 'number' ? src.groundingScore : 0,
      modelVersion: '',
    } as Claim['verification'];
  }
  return update;
}

/**
 * Merges a verdict update into the claim list of ONE generation by stable claimId:
 * repeated updates replace (never duplicate); fields missing from the event (evidence, scores, ordinal)
 * are preserved from the existing claim.
 */
export function mergeClaimUpdate(list: Claim[], update: ClaimUpdate): Claim[] {
  const idx = list.findIndex((c) => c.claimId === update.claimId);
  if (idx < 0) {
    return [...list, { text: '', status: 'pending', evidence: [], ...update } as Claim];
  }
  const prev = list[idx];
  const merged: Claim = {
    ...prev,
    ...update,
    evidence: update.evidence ?? prev.evidence,
    verification:
      update.verification && prev.verification && update.verification.modelVersion === ''
        ? { ...prev.verification, label: update.verification.label, groundingScore: update.verification.groundingScore }
        : update.verification ?? prev.verification,
  };
  const next = [...list];
  next[idx] = merged;
  return next;
}
