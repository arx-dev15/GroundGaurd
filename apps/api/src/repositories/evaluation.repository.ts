import { dbManager } from '../plugins/database';
import { generateId } from '../utils/id';

export interface DBEvaluation {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  dataset: string | null;
  modelVersion: string | null;
  metrics: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface DBEvaluationResult {
  id: string;
  evaluationId: string;
  caseId: string;
  claim: string;
  expectedLabel: string | null;
  predictedLabel: string | null;
  groundingScore: number | null;
  passed: boolean;
  latencyMs: number | null;
  evidence: unknown;
  createdAt: Date;
}

const EVAL_COLS = `
  id,
  project_id AS "projectId",
  user_id AS "userId",
  name,
  status,
  dataset,
  model_version AS "modelVersion",
  metrics,
  error_message AS "errorMessage",
  created_at AS "createdAt",
  completed_at AS "completedAt"
`;

const RESULT_COLS = `
  id,
  evaluation_id AS "evaluationId",
  case_id AS "caseId",
  claim,
  expected_label AS "expectedLabel",
  predicted_label AS "predictedLabel",
  grounding_score AS "groundingScore",
  passed,
  latency_ms AS "latencyMs",
  evidence,
  created_at AS "createdAt"
`;

export class EvaluationRepository {
  public async createEvaluation(data: {
    projectId: string;
    userId: string;
    name: string;
    dataset?: string | null;
    modelVersion?: string | null;
  }): Promise<DBEvaluation> {
    const pool = dbManager.getPool();
    const id = generateId('eval');
    const now = new Date();

    const res = await pool.query(
      `INSERT INTO evaluations
        (id, project_id, user_id, name, status, dataset, model_version, created_at)
       VALUES ($1, $2, $3, $4, 'running', $5, $6, $7)
       RETURNING ${EVAL_COLS};`,
      [
        id,
        data.projectId,
        data.userId,
        data.name.trim(),
        data.dataset ?? 'golden-benchmark-v1',
        data.modelVersion ?? null,
        now,
      ]
    );
    return res.rows[0];
  }

  public async updateEvaluation(
    id: string,
    data: {
      status: 'completed' | 'failed';
      metrics?: Record<string, unknown> | null;
      modelVersion?: string | null;
      errorMessage?: string | null;
    }
  ): Promise<DBEvaluation | null> {
    const pool = dbManager.getPool();
    const now = new Date();

    const res = await pool.query(
      `UPDATE evaluations
       SET status = $1,
           metrics = $2,
           model_version = COALESCE($3, model_version),
           error_message = $4,
           completed_at = $5
       WHERE id = $6
       RETURNING ${EVAL_COLS};`,
      [
        data.status,
        data.metrics ? JSON.stringify(data.metrics) : null,
        data.modelVersion ?? null,
        data.errorMessage ?? null,
        now,
        id,
      ]
    );
    return res.rows[0] || null;
  }

  public async listEvaluationsByProjectId(projectId: string, userId: string): Promise<DBEvaluation[]> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `SELECT ${EVAL_COLS}
       FROM evaluations
       WHERE project_id = $1 AND user_id = $2
       ORDER BY created_at DESC;`,
      [projectId, userId]
    );
    return res.rows;
  }

  public async findEvaluationByIdAndUserId(id: string, userId: string): Promise<DBEvaluation | null> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `SELECT ${EVAL_COLS}
       FROM evaluations
       WHERE id = $1 AND user_id = $2;`,
      [id, userId]
    );
    return res.rows[0] || null;
  }

  public async createEvaluationResult(data: {
    evaluationId: string;
    caseId: string;
    claim: string;
    expectedLabel?: string | null;
    predictedLabel?: string | null;
    groundingScore?: number | null;
    passed: boolean;
    latencyMs?: number | null;
    evidence?: unknown;
  }): Promise<DBEvaluationResult> {
    const pool = dbManager.getPool();
    const id = generateId('res');
    const now = new Date();

    const res = await pool.query(
      `INSERT INTO evaluation_results
        (id, evaluation_id, case_id, claim, expected_label, predicted_label, grounding_score, passed, latency_ms, evidence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${RESULT_COLS};`,
      [
        id,
        data.evaluationId,
        data.caseId,
        data.claim,
        data.expectedLabel ?? null,
        data.predictedLabel ?? null,
        data.groundingScore ?? null,
        data.passed,
        data.latencyMs ?? null,
        JSON.stringify(data.evidence ?? []),
        now,
      ]
    );
    return res.rows[0];
  }

  public async listResultsByEvaluationId(evaluationId: string, userId: string): Promise<DBEvaluationResult[]> {
    const pool = dbManager.getPool();
    const res = await pool.query(
      `SELECT r.id, r.evaluation_id AS "evaluationId", r.case_id AS "caseId",
              r.claim, r.expected_label AS "expectedLabel", r.predicted_label AS "predictedLabel",
              r.grounding_score AS "groundingScore", r.passed, r.latency_ms AS "latencyMs",
              r.evidence, r.created_at AS "createdAt"
       FROM evaluation_results r
       JOIN evaluations e ON e.id = r.evaluation_id
       WHERE r.evaluation_id = $1 AND e.user_id = $2
       ORDER BY r.created_at ASC;`,
      [evaluationId, userId]
    );
    return res.rows;
  }

  public async computeProjectMetrics(projectId: string): Promise<{
    totalGenerations: number;
    completedGenerations: number;
    totalClaims: number;
    verifiedClaims: number;
    flaggedClaims: number;
    recoveredClaims: number;
    contradictionClaims: number;
    groundingPassRate: number;
    contradictionRate: number;
    recoverySuccessRate: number;
    averageLatencyMs: number;
  }> {
    const pool = dbManager.getPool();

    const genRes = await pool.query(
      `SELECT
        COUNT(id)::int AS total_generations,
        COUNT(id) FILTER (WHERE status = 'completed')::int AS completed_generations,
        COALESCE(AVG(total_latency_ms) FILTER (WHERE status = 'completed'), 0)::float AS avg_latency
       FROM generations
       WHERE project_id = $1;`,
      [projectId]
    );

    const claimRes = await pool.query(
      `SELECT
        COUNT(c.id)::int AS total_claims,
        COUNT(c.id) FILTER (WHERE c.status = 'verified')::int AS verified_claims,
        COUNT(c.id) FILTER (WHERE c.status IN ('flagged', 'needs_review'))::int AS flagged_claims,
        COUNT(c.id) FILTER (WHERE c.status = 'recovered')::int AS recovered_claims,
        COUNT(c.id) FILTER (WHERE c.label = 'contradiction')::int AS contradiction_claims
       FROM claims c
       JOIN generations g ON g.id = c.generation_id
       WHERE g.project_id = $1;`,
      [projectId]
    );

    const genRow = genRes.rows[0] || {};
    const claimRow = claimRes.rows[0] || {};

    const totalGenerations = genRow.total_generations || 0;
    const completedGenerations = genRow.completed_generations || 0;
    const averageLatencyMs = Math.round(genRow.avg_latency || 0);

    const totalClaims = claimRow.total_claims || 0;
    const verifiedClaims = claimRow.verified_claims || 0;
    const flaggedClaims = claimRow.flagged_claims || 0;
    const recoveredClaims = claimRow.recovered_claims || 0;
    const contradictionClaims = claimRow.contradiction_claims || 0;

    const passingClaims = verifiedClaims + recoveredClaims;
    const groundingPassRate = totalClaims > 0 ? Number((passingClaims / totalClaims).toFixed(4)) : 0;
    const contradictionRate = totalClaims > 0 ? Number((contradictionClaims / totalClaims).toFixed(4)) : 0;

    const recoveryCandidates = flaggedClaims + recoveredClaims;
    const recoverySuccessRate = recoveryCandidates > 0 ? Number((recoveredClaims / recoveryCandidates).toFixed(4)) : 0;

    return {
      totalGenerations,
      completedGenerations,
      totalClaims,
      verifiedClaims,
      flaggedClaims,
      recoveredClaims,
      contradictionClaims,
      groundingPassRate,
      contradictionRate,
      recoverySuccessRate,
      averageLatencyMs,
    };
  }
}

export const evaluationRepository = new EvaluationRepository();
