import { dbManager } from '../plugins/database';
import { generateId } from '../utils/id';
import { GenerationStatus, ClaimStatus, VerificationLabel, Claim, Message } from '@groundguard/contracts';

export interface DBGeneration {
  id: string;
  requestId: string;
  projectId: string;
  conversationId: string | null;
  query: string;
  answer: string | null;
  status: GenerationStatus;
  errorCode: string | null;
  errorMessage: string | null;
  modelVersion: string | null;
  metadata: Record<string, unknown> | null;
  maxRecoveryAttempts: number;
  recoveryAttempts: number;
  retrievalLatencyMs: number | null;
  generationLatencyMs: number | null;
  verificationLatencyMs: number | null;
  totalLatencyMs: number | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface DBClaim {
  id: string;
  generationId: string;
  externalClaimId: string | null;
  claimIndex: number;
  text: string;
  status: ClaimStatus;
  label: VerificationLabel | null;
  entailmentScore: number | null;
  contradictionScore: number | null;
  neutralScore: number | null;
  groundingScore: number | null;
  modelVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DBEvidence {
  id: string;
  claimId: string;
  chunkId: string;
  documentId: string | null;
  text: string;
  retrievalScore: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface DBRecoveryAttempt {
  id: string;
  claimId: string;
  attemptNumber: number;
  failureReason: string;
  action: string;
  originalText: string;
  candidateText: string | null;
  verificationLabel: VerificationLabel | null;
  entailmentScore: number | null;
  contradictionScore: number | null;
  neutralScore: number | null;
  groundingScore: number | null;
  modelVersion: string | null;
  recoveryModelVersion: string | null;
  createdAt: Date;
}

const GEN_COLS = `id, request_id AS "requestId", project_id AS "projectId", conversation_id AS "conversationId",
  query, answer, status, error_code AS "errorCode", error_message AS "errorMessage",
  model_version AS "modelVersion", metadata,
  max_recovery_attempts AS "maxRecoveryAttempts", recovery_attempts AS "recoveryAttempts",
  retrieval_latency_ms AS "retrievalLatencyMs", generation_latency_ms AS "generationLatencyMs",
  verification_latency_ms AS "verificationLatencyMs", total_latency_ms AS "totalLatencyMs",
  created_at AS "createdAt", updated_at AS "updatedAt", completed_at AS "completedAt"`;

const GEN_COLS_ALIASED = `g.id, g.request_id AS "requestId", g.project_id AS "projectId", g.conversation_id AS "conversationId",
  g.query, g.answer, g.status, g.error_code AS "errorCode", g.error_message AS "errorMessage",
  g.model_version AS "modelVersion", g.metadata,
  g.max_recovery_attempts AS "maxRecoveryAttempts", g.recovery_attempts AS "recoveryAttempts",
  g.retrieval_latency_ms AS "retrievalLatencyMs", g.generation_latency_ms AS "generationLatencyMs",
  g.verification_latency_ms AS "verificationLatencyMs", g.total_latency_ms AS "totalLatencyMs",
  g.created_at AS "createdAt", g.updated_at AS "updatedAt", g.completed_at AS "completedAt"`;

const CLAIM_COLS = `id, generation_id AS "generationId", external_claim_id AS "externalClaimId", claim_index AS "claimIndex",
  text, status, label, entailment_score AS "entailmentScore", contradiction_score AS "contradictionScore",
  neutral_score AS "neutralScore", grounding_score AS "groundingScore", model_version AS "modelVersion",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const CLAIM_COLS_ALIASED = `c.id, c.generation_id AS "generationId", c.external_claim_id AS "externalClaimId", c.claim_index AS "claimIndex",
  c.text, c.status, c.label, c.entailment_score AS "entailmentScore", c.contradiction_score AS "contradictionScore",
  c.neutral_score AS "neutralScore", c.grounding_score AS "groundingScore", c.model_version AS "modelVersion",
  c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;

const EVIDENCE_COLS = `id, claim_id AS "claimId", chunk_id AS "chunkId", document_id AS "documentId", text,
  retrieval_score AS "retrievalScore", metadata, created_at AS "createdAt"`;

const RECOVERY_ATTEMPT_COLS = `id, claim_id AS "claimId", attempt_number AS "attemptNumber",
  failure_reason AS "failureReason", action, original_text AS "originalText",
  candidate_text AS "candidateText", verification_label AS "verificationLabel",
  entailment_score AS "entailmentScore", contradiction_score AS "contradictionScore",
  neutral_score AS "neutralScore", grounding_score AS "groundingScore",
  model_version AS "modelVersion", recovery_model_version AS "recoveryModelVersion",
  created_at AS "createdAt"`;

export class GenerationRepository {
  // ---------- Generations ----------

  public async createGeneration(data: {
    requestId: string;
    projectId: string;
    conversationId?: string | null;
    query: string;
    maxRecoveryAttempts: number;
  }): Promise<DBGeneration> {
    const pool = dbManager.getPool();
    const id = generateId('gen');
    const now = new Date();

    const res = await pool.query(
      `INSERT INTO generations
        (id, request_id, project_id, conversation_id, query, status, max_recovery_attempts, recovery_attempts, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'queued', $6, 0, $7, $7)
       RETURNING ${GEN_COLS};`,
      [id, data.requestId, data.projectId, data.conversationId ?? null, data.query, data.maxRecoveryAttempts, now]
    );
    return res.rows[0];
  }

  /** Internal lookup by id only, no ownership check. Used by the background pipeline, which trusts the id it was given at creation time. */
  public async findGenerationById(id: string): Promise<DBGeneration | null> {
    const pool = dbManager.getPool();
    const res = await pool.query(`SELECT ${GEN_COLS} FROM generations WHERE id = $1;`, [id]);
    return res.rows[0] || null;
  }

  public async findGenerationByIdAndUserId(id: string, userId: string): Promise<DBGeneration | null> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `SELECT ${GEN_COLS_ALIASED}
       FROM generations g
       JOIN projects p ON p.id = g.project_id
       WHERE g.id = $1 AND p.user_id = $2;`,
      [id, userId]
    );
    return res.rows[0] || null;
  }

  public async updateGeneration(
    id: string,
    updates: Partial<{
      status: GenerationStatus;
      answer: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      modelVersion: string | null;
      metadata: Record<string, unknown> | null;
      recoveryAttempts: number;
      retrievalLatencyMs: number;
      generationLatencyMs: number;
      verificationLatencyMs: number;
      totalLatencyMs: number;
      completedAt: Date;
    }>
  ): Promise<DBGeneration | null> {
    const pool = dbManager.getPool();
    const colMap: Record<string, string> = {
      status: 'status',
      answer: 'answer',
      errorCode: 'error_code',
      errorMessage: 'error_message',
      modelVersion: 'model_version',
      metadata: 'metadata',
      recoveryAttempts: 'recovery_attempts',
      retrievalLatencyMs: 'retrieval_latency_ms',
      generationLatencyMs: 'generation_latency_ms',
      verificationLatencyMs: 'verification_latency_ms',
      totalLatencyMs: 'total_latency_ms',
      completedAt: 'completed_at',
    };

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, col] of Object.entries(colMap)) {
      const val = (updates as Record<string, unknown>)[key];
      if (val !== undefined) {
        sets.push(`${col} = $${i}`);
        values.push(val);
        i++;
      }
    }
    sets.push(`updated_at = $${i}`);
    values.push(new Date());
    i++;
    values.push(id);
    const isCancelling = updates.status === 'cancelled';
    const whereClause = isCancelling
      ? `WHERE id = $${i}`
      : `WHERE id = $${i} AND status != 'cancelled'`;

    const res = await pool.query(
      `UPDATE generations SET ${sets.join(', ')} ${whereClause} RETURNING ${GEN_COLS};`,
      values
    );
    if (!res.rows[0]) {
      return this.findGenerationById(id);
    }
    return res.rows[0];
  }

  // ---------- Claims ----------

  public async createClaim(data: {
    generationId: string;
    externalClaimId?: string | null;
    claimIndex: number;
    text: string;
    status: ClaimStatus;
    label?: VerificationLabel | null;
    entailmentScore?: number | null;
    contradictionScore?: number | null;
    neutralScore?: number | null;
    groundingScore?: number | null;
    modelVersion?: string | null;
  }): Promise<DBClaim> {
    const pool = dbManager.getPool();
    const id = generateId('claim');
    const now = new Date();

    const res = await pool.query(
      `INSERT INTO claims
        (id, generation_id, external_claim_id, claim_index, text, status, label,
         entailment_score, contradiction_score, neutral_score, grounding_score, model_version,
         created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
       RETURNING ${CLAIM_COLS};`,
      [
        id, data.generationId, data.externalClaimId ?? null, data.claimIndex, data.text, data.status,
        data.label ?? null, data.entailmentScore ?? null, data.contradictionScore ?? null,
        data.neutralScore ?? null, data.groundingScore ?? null, data.modelVersion ?? null, now,
      ]
    );
    return res.rows[0];
  }

  public async updateClaimVerification(
    claimId: string,
    data: {
      status: ClaimStatus;
      label: VerificationLabel;
      entailmentScore?: number | null;
      contradictionScore?: number | null;
      neutralScore?: number | null;
      groundingScore?: number | null;
      modelVersion?: string | null;
    }
  ): Promise<DBClaim | null> {
    const pool = dbManager.getPool();
    const now = new Date();
    const res = await pool.query(
      `UPDATE claims
       SET status = $1,
           label = $2,
           entailment_score = $3,
           contradiction_score = $4,
           neutral_score = $5,
           grounding_score = $6,
           model_version = $7,
           updated_at = $8
       WHERE id = $9
       RETURNING ${CLAIM_COLS};`,
      [
        data.status,
        data.label,
        data.entailmentScore ?? null,
        data.contradictionScore ?? null,
        data.neutralScore ?? null,
        data.groundingScore ?? null,
        data.modelVersion ?? null,
        now,
        claimId,
      ]
    );
    return res.rows[0] || null;
  }

  public async listClaimsByGenerationId(generationId: string): Promise<DBClaim[]> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `SELECT ${CLAIM_COLS} FROM claims WHERE generation_id = $1 ORDER BY claim_index ASC;`,
      [generationId]
    );
    return res.rows;
  }

  public async findClaimsByGenerationId(generationId: string): Promise<Claim[]> {
    const dbClaims = await this.listClaimsByGenerationId(generationId);
    return Promise.all(
      dbClaims.map(async (c) => {
        const dbEv = await this.listEvidenceByClaimId(c.id);
        return {
          claimId: c.id,
          ordinal: c.claimIndex,
          text: c.text,
          status: c.status,
          evidence: dbEv.map((e) => {
            const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : (e.metadata ?? {});
            return {
              chunkId: e.chunkId,
              documentId: e.documentId ?? undefined,
              text: e.text,
              metadata: meta,
              pageNumber: (meta?.pageNumber as number) ?? undefined,
              section: (meta?.section as string) ?? undefined,
              heading: (meta?.heading as string) ?? undefined,
            };
          }),
        };
      })
    );
  }

  public async findClaimByIdAndUserId(id: string, userId: string): Promise<DBClaim | null> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `SELECT ${CLAIM_COLS_ALIASED}
       FROM claims c
       JOIN generations g ON g.id = c.generation_id
       JOIN projects p ON p.id = g.project_id
       WHERE c.id = $1 AND p.user_id = $2;`,
      [id, userId]
    );
    return res.rows[0] || null;
  }

  // ---------- Evidence ----------

  public async createEvidence(data: {
    claimId: string;
    chunkId: string;
    documentId?: string | null;
    text: string;
    retrievalScore?: number | null;
    metadata?: Record<string, unknown>;
  }): Promise<DBEvidence> {
    const pool = dbManager.getPool();
    const id = generateId('ev');
    const now = new Date();

    const res = await pool.query(
      `INSERT INTO claim_evidence (id, claim_id, chunk_id, document_id, text, retrieval_score, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING ${EVIDENCE_COLS};`,
      [id, data.claimId, data.chunkId, data.documentId ?? null, data.text, data.retrievalScore ?? null, JSON.stringify(data.metadata ?? {}), now]
    );
    return res.rows[0];
  }

  public async listEvidenceByClaimId(claimId: string): Promise<DBEvidence[]> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `SELECT ${EVIDENCE_COLS} FROM claim_evidence WHERE claim_id = $1 ORDER BY created_at ASC;`,
      [claimId]
    );
    return res.rows;
  }

  /** Ownership-safe: confirms the claim belongs to the requesting user before returning its evidence. */
  public async findClaimOwnerCheck(claimId: string, userId: string): Promise<boolean> {
    const claim = await this.findClaimByIdAndUserId(claimId, userId);
    return claim !== null;
  }

  /**
   * Phase 6 Atomic Transactional Persistence:
   * Atomically commits generation update, optional assistant message, extracted claims,
   * and claim evidence provenance in a single database transaction.
   */
  public async persistCompletedGeneration(data: {
    generationId: string;
    projectId: string;
    status?: GenerationStatus;
    answer?: string | null;
    modelVersion?: string | null;
    metadata?: Record<string, unknown> | null;
    totalLatencyMs?: number | null;
    claims?: Claim[];
    conversationId?: string | null;
  }): Promise<{
    generation: DBGeneration;
    claims: Array<{ claim: DBClaim; evidence: DBEvidence[] }>;
    assistantMessage?: Message;
  }> {
    const pool = dbManager.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const targetStatus = data.status ?? 'verifying';
      const completedAt = targetStatus === 'completed' ? new Date() : null;

      // 1. Update generation to target status (default 'verifying')
      // Cancellation invariant: do not overwrite cancelled status
      const genRes = await client.query(
        `UPDATE generations
         SET status = $1,
             answer = $2,
             model_version = $3,
             metadata = $4,
             total_latency_ms = $5,
             generation_latency_ms = $5,
             completed_at = $6,
             updated_at = $7
         WHERE id = $8 AND status != 'cancelled'
         RETURNING ${GEN_COLS};`,
        [
          targetStatus,
          data.answer ?? null,
          data.modelVersion ?? null,
          JSON.stringify(data.metadata ?? {}),
          data.totalLatencyMs ?? null,
          completedAt,
          new Date(),
          data.generationId,
        ]
      );
      if (genRes.rows.length === 0) {
        await client.query('ROLLBACK');
        const existing = await this.findGenerationById(data.generationId);
        return {
          generation: existing!,
          claims: [],
        };
      }
      const generation: DBGeneration = genRes.rows[0];

      // 2. Persist assistant message if conversationId and answer provided
      let assistantMessage: Message | undefined;
      if (data.conversationId && data.answer) {
        const msgId = generateId('msg');
        const now = new Date();
        const msgRes = await client.query(
          `INSERT INTO messages (id, conversation_id, role, content, generation_id, created_at)
           VALUES ($1, $2, 'assistant', $3, $4, $5)
           RETURNING id, conversation_id AS "conversationId", role, content, generation_id AS "generationId", created_at AS "createdAt";`,
          [msgId, data.conversationId, data.answer, data.generationId, now]
        );
        const r = msgRes.rows[0];
        assistantMessage = {
          id: r.id,
          conversationId: r.conversationId,
          role: r.role,
          content: r.content,
          generationId: r.generationId || undefined,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        };
      }

      // 3. Persist claims and candidate evidence provenance
      const persistedClaims: Array<{ claim: DBClaim; evidence: DBEvidence[] }> = [];
      const claimsList = data.claims ?? [];

      for (let idx = 0; idx < claimsList.length; idx++) {
        const c = claimsList[idx];
        const claimId = generateId('claim');
        const now = new Date();

        const claimRes = await client.query(
          `INSERT INTO claims
            (id, generation_id, external_claim_id, claim_index, text, status, label,
             entailment_score, contradiction_score, neutral_score, grounding_score, model_version,
             created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'pending', NULL, NULL, NULL, NULL, NULL, NULL, $6, $6)
           RETURNING ${CLAIM_COLS};`,
          [
            claimId,
            data.generationId,
            c.claimId ?? `claim_${idx}`,
            c.ordinal ?? idx,
            c.text,
            now,
          ]
        );
        const dbClaim: DBClaim = claimRes.rows[0];

        const dbEvidenceList: DBEvidence[] = [];
        for (const ev of c.evidence ?? []) {
          const evId = generateId('ev');
          const evMetadata = {
            ...(typeof ev.metadata === 'object' && ev.metadata !== null ? ev.metadata : {}),
            pageNumber: ev.pageNumber,
            section: ev.section,
            heading: ev.heading,
          };
          const evRes = await client.query(
            `INSERT INTO claim_evidence
              (id, claim_id, chunk_id, document_id, text, retrieval_score, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING ${EVIDENCE_COLS};`,
            [
              evId,
              dbClaim.id,
              ev.chunkId,
              ev.documentId ?? null,
              ev.text,
              ev.score ?? ev.rerankScore ?? null,
              JSON.stringify(evMetadata),
              now,
            ]
          );
          dbEvidenceList.push(evRes.rows[0]);
        }

        persistedClaims.push({ claim: dbClaim, evidence: dbEvidenceList });
      }

      await client.query('COMMIT');
      return { generation, claims: persistedClaims, assistantMessage };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------- Recovery Attempts ----------

  public async createRecoveryAttempt(data: {
    claimId: string;
    attemptNumber: number;
    failureReason: string;
    action: string;
    originalText: string;
    candidateText?: string | null;
    verificationLabel?: VerificationLabel | null;
    entailmentScore?: number | null;
    contradictionScore?: number | null;
    neutralScore?: number | null;
    groundingScore?: number | null;
    modelVersion?: string | null;
    recoveryModelVersion?: string | null;
  }): Promise<DBRecoveryAttempt> {
    const pool = dbManager.getPool();
    const id = generateId('rcv');
    const now = new Date();

    const res = await pool.query(
      `INSERT INTO claim_recovery_attempts
        (id, claim_id, attempt_number, failure_reason, action, original_text, candidate_text,
         verification_label, entailment_score, contradiction_score, neutral_score, grounding_score,
         model_version, recovery_model_version, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (claim_id, attempt_number) DO UPDATE
         SET action = EXCLUDED.action,
             candidate_text = EXCLUDED.candidate_text,
             verification_label = EXCLUDED.verification_label,
             entailment_score = EXCLUDED.entailment_score,
             contradiction_score = EXCLUDED.contradiction_score,
             neutral_score = EXCLUDED.neutral_score,
             grounding_score = EXCLUDED.grounding_score,
             model_version = EXCLUDED.model_version,
             recovery_model_version = EXCLUDED.recovery_model_version
       RETURNING ${RECOVERY_ATTEMPT_COLS};`,
      [
        id, data.claimId, data.attemptNumber, data.failureReason, data.action, data.originalText,
        data.candidateText ?? null, data.verificationLabel ?? null, data.entailmentScore ?? null,
        data.contradictionScore ?? null, data.neutralScore ?? null, data.groundingScore ?? null,
        data.modelVersion ?? null, data.recoveryModelVersion ?? null, now,
      ]
    );
    return res.rows[0];
  }

  public async listRecoveryAttemptsByClaimId(claimId: string): Promise<DBRecoveryAttempt[]> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `SELECT ${RECOVERY_ATTEMPT_COLS} FROM claim_recovery_attempts WHERE claim_id = $1 ORDER BY attempt_number ASC;`,
      [claimId]
    );
    return res.rows;
  }

  public async updateClaimRecovered(
    claimId: string,
    data: {
      text: string;
      label: VerificationLabel;
      entailmentScore: number;
      contradictionScore: number;
      neutralScore: number;
      groundingScore: number;
      modelVersion: string;
    }
  ): Promise<DBClaim | null> {
    const pool = dbManager.getPool();
    const now = new Date();
    const res = await pool.query(
      `UPDATE claims
       SET status = 'recovered',
           text = $1,
           label = $2,
           entailment_score = $3,
           contradiction_score = $4,
           neutral_score = $5,
           grounding_score = $6,
           model_version = $7,
           updated_at = $8
       WHERE id = $9
       RETURNING ${CLAIM_COLS};`,
      [
        data.text,
        data.label,
        data.entailmentScore,
        data.contradictionScore,
        data.neutralScore,
        data.groundingScore,
        data.modelVersion,
        now,
        claimId,
      ]
    );
    return res.rows[0] || null;
  }
}

export const generationRepository = new GenerationRepository();