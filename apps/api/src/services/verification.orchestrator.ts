import { generationRepository, DBClaim, DBEvidence } from '../repositories/generation.repository';
import { mlClient } from '../clients/ml.client';
import { technicalChecker, TechnicalCheckResult } from './technical-checks';
import { buildEvidenceContext } from './evidence-context';
import { ClaimStatus, VerificationLabel, Claim, Evidence } from '@groundguard/contracts';

export class VerificationOrchestrator {
  /**
   * Evaluates the Dual-Stage Decision Policy composing Stage 1 M1 inference with Stage 2 technical checks:
   * - Deterministic Technical Conflict always overrides M1 entailment to contradiction / flagged
   * - M1 entailment + Technical PASS -> entailment / verified
   * - M1 contradiction -> contradiction / flagged
   * - M1 neutral -> neutral / needs_review
   * - FORBIDDEN: recovered is never used in Phase 7
   */
  public composeDecision(
    m1Label: VerificationLabel,
    m1Scores: { entailment: number; contradiction: number; neutral: number },
    groundingScore: number,
    techCheck: TechnicalCheckResult | { passed: boolean; conflicts?: any[] }
  ): {
    finalStatus: ClaimStatus;
    finalLabel: VerificationLabel;
    scores: { entailment: number; contradiction: number; neutral: number };
    groundingScore: number;
  } {
    const rawEnt = Number(m1Scores?.entailment ?? 0);
    const rawContra = Number(m1Scores?.contradiction ?? 0);
    const rawNeut = Number(m1Scores?.neutral ?? 0);
    const sum = rawEnt + rawContra + rawNeut;

    let entailmentScore = 0.0;
    let contradictionScore = 0.0;
    let neutralScore = 1.0;

    if (Number.isFinite(sum) && sum > 0) {
      entailmentScore = Math.max(0, Math.min(1, rawEnt / sum));
      contradictionScore = Math.max(0, Math.min(1, rawContra / sum));
      neutralScore = Math.max(0, Math.min(1, rawNeut / sum));
    }

    let finalLabel: VerificationLabel = 'neutral';
    let finalStatus: ClaimStatus = 'needs_review';
    let finalGrounding = Number(groundingScore ?? 0);

    if (!techCheck.passed) {
      // Stage 2 Deterministic Conflict detected:
      // Hard failure: objective engineering discrepancies (units, numbers, signs, tags)
      // strictly override semantic similarity to contradiction
      finalLabel = 'contradiction';
      finalStatus = 'flagged';
      contradictionScore = 1.0;
      entailmentScore = 0.0;
      neutralScore = 0.0;
      finalGrounding = 0.0;
    } else {
      if (m1Label === 'entailment') {
        finalLabel = 'entailment';
        finalStatus = 'verified';
      } else if (m1Label === 'contradiction') {
        finalLabel = 'contradiction';
        finalStatus = 'flagged';
      } else {
        finalLabel = 'neutral';
        finalStatus = 'needs_review';
      }
    }

    return {
      finalStatus,
      finalLabel,
      scores: {
        entailment: Math.round(entailmentScore * 10000) / 10000,
        contradiction: Math.round(contradictionScore * 10000) / 10000,
        neutral: Math.round(neutralScore * 10000) / 10000,
      },
      groundingScore: Math.round(finalGrounding * 10000) / 10000,
    };
  }

  /**
   * Truthful resolution for claims that have zero candidate evidence:
   * Does NOT call M1 and does NOT fabricate synthetic grounding scores.
   * Maps to neutral / needs_review with zeroed scores.
   */
  public resolveZeroEvidence(): {
    finalStatus: ClaimStatus;
    finalLabel: VerificationLabel;
    scores: { entailment: number; contradiction: number; neutral: number };
    groundingScore: number;
    modelVersion: string;
  } {
    return {
      finalStatus: 'needs_review',
      finalLabel: 'neutral',
      scores: { entailment: 0.0, contradiction: 0.0, neutral: 1.0 },
      groundingScore: 0.0,
      modelVersion: 'groundguard-zero-evidence',
    };
  }

  /**
   * Dual-Stage Grounding Verification Orchestration:
   * Stage 1: Neural NLI Cross-Encoder verification against M1
   * Stage 2: Deterministic Technical Consistency checks
   * Decision Policy: Transparent composition -> Claim Status Transition -> Atomic Persistence
   */
  public async verifyGenerationClaims(
    generationId: string,
    requestId?: string
  ): Promise<Claim[]> {
    const startedAt = Date.now();
    const dbClaims = await generationRepository.listClaimsByGenerationId(generationId);

    if (dbClaims.length === 0) {
      return [];
    }

    // Load candidate evidence provenance for each claim
    const claimsWithEv: Array<{ claim: DBClaim; evidence: DBEvidence[] }> = await Promise.all(
      dbClaims.map(async (c) => ({
        claim: c,
        evidence: await generationRepository.listEvidenceByClaimId(c.id),
      }))
    );

    // Split between zero-evidence claims and claims with candidate evidence
    const zeroEvidenceClaims = claimsWithEv.filter((c) => c.evidence.length === 0);
    const activeClaims = claimsWithEv.filter((c) => c.evidence.length > 0);

    // 1. Truthful Zero-Evidence Resolution
    const zeroRes = this.resolveZeroEvidence();
    for (const item of zeroEvidenceClaims) {
      await generationRepository.updateClaimVerification(item.claim.id, {
        status: zeroRes.finalStatus,
        label: zeroRes.finalLabel,
        entailmentScore: zeroRes.scores.entailment,
        contradictionScore: zeroRes.scores.contradiction,
        neutralScore: zeroRes.scores.neutral,
        groundingScore: zeroRes.groundingScore,
        modelVersion: zeroRes.modelVersion,
      });
    }

    // 2. Active Verification for claims with evidence
    if (activeClaims.length > 0) {
      try {
        const batchPayload = {
          requestId: requestId || `req_verify_${generationId}`,
          items: activeClaims.map((item) => ({
            claimId: item.claim.id,
            claim: item.claim.text,
            evidence: item.evidence.map((ev) => ({
              chunkId: ev.chunkId,
              text: ev.text,
              context: buildEvidenceContext(ev.metadata),
            })),
          })),
        };

        const m1Batch = await mlClient.verifyBatch(batchPayload, requestId);
        const modelVersion = m1Batch.modelVersion || 'groundguard-deberta-v1-finetuned';
        const resultMap = new Map(m1Batch.results.map((r) => [r.claimId, r]));

        for (const item of activeClaims) {
          const m1Res = resultMap.get(item.claim.id);
          const fullEvText = item.evidence.map((ev) => ev.text).join(' ');

          // Stage 2: Deterministic Technical Consistency Checks
          const techCheck = technicalChecker.evaluate(item.claim.text, fullEvText);

          let decision = {
            finalStatus: 'needs_review' as ClaimStatus,
            finalLabel: 'neutral' as VerificationLabel,
            scores: { entailment: 0.0, contradiction: 0.0, neutral: 1.0 },
            groundingScore: 0.0,
          };

          if (m1Res) {
            decision = this.composeDecision(
              m1Res.label,
              m1Res.scores,
              m1Res.groundingScore,
              techCheck
            );
          }

          // Atomically persist verification result for claim
          await generationRepository.updateClaimVerification(item.claim.id, {
            status: decision.finalStatus,
            label: decision.finalLabel,
            entailmentScore: decision.scores.entailment,
            contradictionScore: decision.scores.contradiction,
            neutralScore: decision.scores.neutral,
            groundingScore: decision.groundingScore,
            modelVersion,
          });
        }
      } catch (err: any) {
        console.error(`[verification ${generationId}] M1 verification failed:`, err?.message || err);
        // Fail-closed: M1 unavailable path preserves truthfulness without mock/fake scores
        for (const item of activeClaims) {
          await generationRepository.updateClaimVerification(item.claim.id, {
            status: 'needs_review',
            label: 'neutral',
            entailmentScore: 0.0,
            contradictionScore: 0.0,
            neutralScore: 0.0,
            groundingScore: 0.0,
            modelVersion: 'groundguard-m1-unavailable',
          });
        }
      }
    }

    const verificationLatencyMs = Date.now() - startedAt;
    await generationRepository
      .updateGeneration(generationId, { verificationLatencyMs })
      .catch(() => {});

    return this.getHydratedClaims(generationId);
  }

  /**
   * Reads back fully hydrated claims including evidence and verification results.
   */
  public async getHydratedClaims(generationId: string): Promise<Claim[]> {
    const updatedClaims = await generationRepository.listClaimsByGenerationId(generationId);
    return Promise.all(
      updatedClaims.map(async (c) => {
        const evList = await generationRepository.listEvidenceByClaimId(c.id);
        const claimObj: Claim = {
          claimId: c.id,
          externalClaimId: c.externalClaimId ?? undefined,
          text: c.text,
          status: c.status,
          ordinal: c.claimIndex,
          evidence: evList.map((e) => {
            const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : (e.metadata ?? {});
            return {
              evidenceId: e.id,
              chunkId: e.chunkId,
              documentId: e.documentId ?? undefined,
              text: e.text,
              metadata: meta,
              pageNumber: (meta?.pageNumber as number) ?? undefined,
              section: (meta?.section as string) ?? undefined,
              heading: (meta?.heading as string) ?? undefined,
            } as Evidence;
          }),
        };

        if (c.label) {
          claimObj.verification = {
            label: c.label,
            scores: {
              entailment: c.entailmentScore ?? 0,
              contradiction: c.contradictionScore ?? 0,
              neutral: c.neutralScore ?? 0,
            },
            groundingScore: c.groundingScore ?? 0,
            modelVersion: c.modelVersion ?? '',
          };
        }
        return claimObj;
      })
    );
  }
}

export const verificationOrchestrator = new VerificationOrchestrator();
