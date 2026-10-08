import { generationRepository, DBClaim, DBEvidence } from '../repositories/generation.repository';
import { aiClient } from '../clients/ai.client';
import { mlClient } from '../clients/ml.client';
import { technicalChecker } from './technical-checks';
import { buildEvidenceContext } from './evidence-context';
import { verificationOrchestrator } from './verification.orchestrator';
import { generationEvents } from './generation-events';
import { ClaimStatus, VerificationLabel, RecoveryFailureReason, Claim, Evidence } from '@groundguard/contracts';

export const MAX_RECOVERY_ATTEMPTS = 2;
// Total provider-backed recovery attempts allowed per generation (across all of its failed claims).
// Without it, N failed claims cost up to 2N sequential LLM calls (15 attempts / 63.5 s observed).
// Generation-wide wall-clock budget for recovery (checked before each claim/attempt; an in-flight call is
// never interrupted). Observed: 4 unproductive attempts took 23.5 s of a 48 s Ask.
export function recoveryTimeBudgetMs(): number {
  const v = Number(process.env.MAX_RECOVERY_SECONDS_PER_GENERATION ?? 10);
  return Number.isFinite(v) && v > 0 ? v * 1000 : 0;
}
export const MAX_RECOVERY_ATTEMPTS_PER_GENERATION = Math.max(
  0,
  Number(process.env.MAX_RECOVERY_ATTEMPTS_PER_GENERATION ?? 6) || 0
);

export class RecoveryOrchestrator {
  /**
   * Deterministically classifies a failed claim into one of the canonical failure categories:
   * CONTRADICTION, INSUFFICIENT_EVIDENCE, TECHNICAL_CONFLICT, ZERO_EVIDENCE, M1_UNAVAILABLE.
   */
  public diagnoseFailure(
    claim: DBClaim,
    evidence: DBEvidence[]
  ): RecoveryFailureReason {
    if (claim.modelVersion === 'groundguard-m1-unavailable') {
      return 'M1_UNAVAILABLE';
    }

    if (evidence.length === 0 || claim.modelVersion === 'groundguard-zero-evidence') {
      return 'ZERO_EVIDENCE';
    }

    // Check if Stage 2 technical checks flagged a conflict
    const combinedEvidenceText = evidence.map((e) => e.text).join(' ');
    const techCheck = technicalChecker.evaluate(claim.text, combinedEvidenceText);
    if (!techCheck.passed) {
      return 'TECHNICAL_CONFLICT';
    }

    if (claim.label === 'contradiction') {
      return 'CONTRADICTION';
    }

    if (claim.label === 'neutral') {
      return 'INSUFFICIENT_EVIDENCE';
    }

    return 'INSUFFICIENT_EVIDENCE';
  }

  /**
   * Recovers a single failed claim using a bounded, deterministic recovery loop.
   * Max 2 attempts, 1 retrieval & 1 LLM call per attempt.
   * Stop immediately when claim becomes entailment, Gemini abstains, or budget is exhausted.
   */
  public async recoverClaim(params: {
    projectId: string;
    generationId: string;
    claim: DBClaim;
    existingEvidence: DBEvidence[];
    requestId?: string;
    maxAttempts?: number;
    startAttempt?: number;
    deadline?: number; // epoch ms; no new attempt starts after it
  }): Promise<{ recovered: boolean; attempts: number; finalClaim: DBClaim; timedOut?: boolean }> {
    const { projectId, generationId, claim, existingEvidence, requestId } = params;
    const maxAttempts = params.maxAttempts ?? MAX_RECOVERY_ATTEMPTS;
    const startAttempt = params.startAttempt ?? 1;

    // Eligibility check (Section 3): Recovery applies ONLY to 'flagged' or 'needs_review'
    if (claim.status !== 'flagged' && claim.status !== 'needs_review') {
      console.log(`[recovery] Claim ${claim.id} status '${claim.status}' is not eligible for recovery.`);
      return { recovered: false, attempts: 0, finalClaim: claim };
    }

    if (startAttempt > MAX_RECOVERY_ATTEMPTS) {
      console.warn(`[recovery] Claim ${claim.id} startAttempt ${startAttempt} exceeds MAX_RECOVERY_ATTEMPTS (${MAX_RECOVERY_ATTEMPTS}).`);
      return { recovered: false, attempts: 0, finalClaim: claim };
    }

    // Failure diagnosis (Section 4)
    const diagnosis = this.diagnoseFailure(claim, existingEvidence);
    console.log(`[recovery] Diagnosed claim ${claim.id}: ${diagnosis}`);

    // Section 5: DO NOT recover infrastructure failures (fail-closed)
    if (diagnosis === 'M1_UNAVAILABLE') {
      console.warn(`[recovery] M1 unavailable for claim ${claim.id}. Failing closed without recovery.`);
      return { recovered: false, attempts: 0, finalClaim: claim };
    }

    let currentClaim = claim;
    let attemptsRun = 0;
    let timedOut = false;
    const endAttempt = startAttempt + maxAttempts - 1;

    for (let attempt = startAttempt; attempt <= endAttempt; attempt++) {
      // Stop recovery work (and provider calls) as soon as the user cancels the generation.
      if (params.deadline && Date.now() >= params.deadline) {
        console.log(`[recovery] Recovery time budget reached; not starting attempt ${attempt} for claim ${claim.id}`);
        break;
      }
      if (params.generationId && (await generationEvents.isCancelled(params.generationId))) {
        console.log(`[recovery] Generation ${params.generationId} cancelled; stopping recovery for claim ${claim.id}`);
        break;
      }
      attemptsRun++;
      console.log(
        `[recovery] Starting attempt ${attempt} for claim ${claim.id} (req: ${requestId})`
      );

      // 1. Invoke M2 /recover
      let recoverRes;
      // Bound the in-flight /recover wait by the remaining budget: on expiry the HTTP request is aborted and
      // its late response is never applied. (M2 may still finish its provider call server-side.)
      const remainingMs = params.deadline ? Math.max(1, params.deadline - Date.now()) : undefined;
      const deadlineSignal = remainingMs !== undefined ? AbortSignal.timeout(remainingMs) : undefined;
      try {
        recoverRes = await aiClient.recover(
          {
            requestId,
            projectId,
            claimId: claim.id,
            claim: currentClaim.text,
            failureReason: diagnosis,
            existingEvidence: existingEvidence.map((e) => ({
              evidenceId: e.id || e.chunkId,
              chunkId: e.chunkId,
              documentId: e.documentId ?? undefined,
              text: e.text,
            })),
            attempt,
            ...(remainingMs !== undefined ? { deadlineMs: Math.round(remainingMs) } : {}),
          },
          requestId,
          deadlineSignal
        );
      } catch (err: any) {
        if (deadlineSignal?.aborted) {
          console.log(`[recovery] Attempt ${attempt} for claim ${claim.id} aborted at the recovery time budget; result discarded.`);
          timedOut = true;
          break;
        }
        console.error(`[recovery] M2 /recover call failed on attempt ${attempt}:`, err?.message || err);
        // Section 4: System / transport / internal service exceptions should NOT consume
        // one of the 2 recovery attempts if no recovery execution completed.
        break; // Stop immediately on retrieval/AI infrastructure failure
      }

      const { action, candidateClaim, recoveryEvidence, modelVersion: recoveryModelVersion } = recoverRes;

      // Provider outage (e.g. Gemini 429/503) is not missing evidence: stop without consuming an attempt
      // and without immediately sending another request into a throttled provider.
      const failureType = recoverRes.failureType;
      if (failureType === 'provider_unavailable' || failureType === 'retrieval_unavailable') {
        console.warn(`[recovery] Attempt ${attempt}: M2 reported ${failureType} (${recoverRes.reason}). Stopping recovery.`);
        break;
      }

      // 2. Stop condition: Gemini returned abstain or no useful evidence
      if (action === 'abstain' || !recoveryEvidence || recoveryEvidence.length === 0) {
        console.log(`[recovery] Attempt ${attempt}: Recovery returned '${action}' or empty evidence. Recording valid completed attempt.`);
        await generationRepository.createRecoveryAttempt({
          claimId: claim.id,
          attemptNumber: attempt,
          failureReason: diagnosis,
          action: 'abstain',
          originalText: claim.text,
          candidateText: null, // Section 3: Valid recovery with no support must have candidate_text = null
          verificationLabel: null,
          modelVersion: null,
          recoveryModelVersion: recoveryModelVersion && recoveryModelVersion !== 'm2-error' ? recoveryModelVersion : 'gemini',
        }).catch(() => {});

        // If attempt 1 had insufficient evidence, attempt 2 may try reformulated retrieval
        if (attempt < maxAttempts && (diagnosis === 'INSUFFICIENT_EVIDENCE' || diagnosis === 'ZERO_EVIDENCE')) {
          continue;
        }
        break;
      }

      // 3. Re-verification (Section 19: Mandatory Phase 7 dual-stage verification)
      const targetClaimText = action === 'revise' && candidateClaim ? candidateClaim : claim.text;
      const fullRecoveryEvText = recoveryEvidence.map((e) => e.text).join(' ');

      let m1Batch;
      try {
        const batchPayload = {
          requestId: requestId || `req_reverify_${claim.id}`,
          items: [
            {
              claimId: claim.id,
              claim: targetClaimText,
              evidence: recoveryEvidence.map((e) => ({
                chunkId: e.chunkId,
                text: e.text,
                context: buildEvidenceContext((e as any).metadata, (e as any).heading),
              })),
            },
          ],
        };

        m1Batch = await mlClient.verifyBatch(batchPayload, requestId);
      } catch (m1Err: any) {
        console.error(`[recovery] Reverification M1 call failed on attempt ${attempt}:`, m1Err?.message || m1Err);
        break; // Service failure should not consume attempt budget
      }

      const m1Res = m1Batch.results[0];
      const m1ModelVersion = m1Batch.modelVersion || 'groundguard-deberta-v1-finetuned';

      // Stage 2 Deterministic Technical Consistency Checks
      const techCheck = technicalChecker.evaluate(targetClaimText, fullRecoveryEvText);

      // Decision Policy Composition
      const decision = verificationOrchestrator.composeDecision(
        m1Res.label,
        m1Res.scores,
        m1Res.groundingScore,
        techCheck
      );

      console.log(`[recovery reverify debug] m1Label=${m1Res.label} m1Scores=${JSON.stringify(m1Res.scores)} techCheckPassed=${techCheck.passed} conflicts=${JSON.stringify((techCheck as any).conflicts)} finalStatus=${decision.finalStatus} finalLabel=${decision.finalLabel}`);

      // 4. Record audit attempt in claim_recovery_attempts
      await generationRepository.createRecoveryAttempt({
        claimId: claim.id,
        attemptNumber: attempt,
        failureReason: diagnosis,
        action,
        originalText: claim.text,
        candidateText: targetClaimText,
        verificationLabel: decision.finalLabel,
        entailmentScore: decision.scores.entailment,
        contradictionScore: decision.scores.contradiction,
        neutralScore: decision.scores.neutral,
        groundingScore: decision.groundingScore,
        modelVersion: m1ModelVersion,
        recoveryModelVersion,
        recoveryEvidence,
      });

      // 5. Section 19 & 20: Only if final result is entailment -> status = recovered
      if (decision.finalLabel === 'entailment' && decision.finalStatus === 'verified') {
        console.log(`[recovery] Claim ${claim.id} RECOVERED successfully on attempt ${attempt}!`);

        const updated = await generationRepository.updateClaimRecovered(claim.id, {
          text: targetClaimText,
          label: 'entailment',
          entailmentScore: decision.scores.entailment,
          contradictionScore: decision.scores.contradiction,
          neutralScore: decision.scores.neutral,
          groundingScore: decision.groundingScore,
          modelVersion: m1ModelVersion,
        });

        // Persist new recovery evidence chunks in claim_evidence if not already present
        const existingChunkIds = new Set(existingEvidence.map((e) => e.chunkId));
        for (const ev of recoveryEvidence) {
          if (!existingChunkIds.has(ev.chunkId)) {
            await generationRepository.createEvidence({
              claimId: claim.id,
              chunkId: ev.chunkId,
              documentId: ev.documentId,
              text: ev.text,
              retrievalScore: ev.score ?? ev.rerankScore ?? null,
              metadata: (ev.metadata as Record<string, unknown>) ?? {},
            }).catch(() => {});
            existingChunkIds.add(ev.chunkId);
          }
        }

        return {
          recovered: true,
          attempts: attemptsRun,
          finalClaim: updated || currentClaim,
        };
      }

      console.log(
        `[recovery] Attempt ${attempt} reverification result was '${decision.finalLabel}' (not entailment).`
      );
      // 'keep' = the recovery model proposes no revision. Re-trying the same unchanged claim is wasted
      // provider work (0/6 later successes observed); the claim keeps its honest unverified status.
      if (action === 'keep') {
        console.log(`[recovery] Claim ${claim.id}: unchanged claim not entailed after 'keep'; stopping recovery for this claim.`);
        break;
      }
    }

    // Exhausted recovery budget or stopped: retains original flagged / needs_review status
    return {
      recovered: false,
      attempts: attemptsRun,
      finalClaim: currentClaim,
      timedOut,
    };
  }

  /**
   * Orchestrates claim-level recovery for all failed claims in a generation.
   */
  public async recoverGenerationClaims(
    generationId: string,
    requestId?: string
  ): Promise<{ recoveredCount: number; totalAttempts: number; stoppedReason?: 'time_budget' | 'attempt_budget' | 'cancelled' }> {
    const generation = await generationRepository.findGenerationById(generationId);
    if (!generation) return { recoveredCount: 0, totalAttempts: 0 };

    const maxAttempts = generation.maxRecoveryAttempts ?? MAX_RECOVERY_ATTEMPTS;
    if (maxAttempts <= 0) {
      console.log(`[recovery] maxRecoveryAttempts is 0 for generation ${generationId}. Skipping recovery.`);
      return { recoveredCount: 0, totalAttempts: 0 };
    }

    const claims = await generationRepository.listClaimsByGenerationId(generationId);
    const failedClaims = claims.filter(
      (c) => c.status === 'flagged' || c.status === 'needs_review'
    );

    if (failedClaims.length === 0) {
      return { recoveredCount: 0, totalAttempts: 0 };
    }

    console.log(
      `[recovery] Found ${failedClaims.length} failed claims for generation ${generationId}. Running recovery.`
    );

    let recoveredCount = 0;
    let totalAttempts = 0;
    let stoppedReason: 'time_budget' | 'attempt_budget' | 'cancelled' | undefined;
    const budgetMs = recoveryTimeBudgetMs();
    const deadline = budgetMs > 0 ? Date.now() + budgetMs : undefined;
    // Contradicted (flagged) claims are the most important to resolve: recover them first.
    failedClaims.sort((a, b) => Number(b.status === 'flagged') - Number(a.status === 'flagged'));

    for (const c of failedClaims) {
      const remainingBudget = MAX_RECOVERY_ATTEMPTS_PER_GENERATION - totalAttempts;
      if (remainingBudget <= 0) {
        console.log(`[recovery] Generation ${generationId}: recovery budget (${MAX_RECOVERY_ATTEMPTS_PER_GENERATION}) exhausted; remaining claims keep their verification status.`);
        stoppedReason = 'attempt_budget';
        break;
      }
      if (await generationEvents.isCancelled(generationId)) {
        console.log(`[recovery] Generation ${generationId} cancelled; skipping remaining claim recovery`);
        stoppedReason = 'cancelled';
        break;
      }
      if (deadline && Date.now() >= deadline) {
        console.log(`[recovery] Generation ${generationId}: recovery time budget (${budgetMs} ms) reached; remaining claims keep their verification status.`);
        stoppedReason = 'time_budget';
        break;
      }
      const existingEv = await generationRepository.listEvidenceByClaimId(c.id);
      const res = await this.recoverClaim({
        projectId: generation.projectId,
        generationId,
        claim: c,
        existingEvidence: existingEv,
        requestId,
        maxAttempts: Math.min(maxAttempts, remainingBudget),
        deadline,
      });

      totalAttempts += res.attempts;
      if (res.recovered) {
        recoveredCount++;
      }
      if (res.timedOut) {
        stoppedReason = 'time_budget';
        break;
      }
    }

    await generationRepository.updateGeneration(generationId, {
      recoveryAttempts: totalAttempts,
    }).catch(() => {});

    return { recoveredCount, totalAttempts, stoppedReason };
  }
}

export const recoveryOrchestrator = new RecoveryOrchestrator();
