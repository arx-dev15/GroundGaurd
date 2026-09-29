import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { evaluationRepository, DBEvaluation, DBEvaluationResult } from '../repositories/evaluation.repository';
import { projectRepository } from '../repositories/project.repository';
import { mlClient } from '../clients/ml.client';
import { technicalChecker } from '../services/technical-checks';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { Evaluation, EvaluationResultCase, ProjectMetricsResponse } from '@groundguard/contracts';

const GOLDEN_BENCHMARK_CASES = [
  {
    caseId: 'case_001_entailment_direct',
    claim: 'The project budget for 2024 is ₹50 Cr.',
    evidence: [{ chunkId: 'chk_bench_1', text: 'According to the financial statement, the project budget for 2024 is ₹50 Cr.' }],
    expectedLabel: 'entailment',
  },
  {
    caseId: 'case_002_contradiction_numeric',
    claim: 'The pump operating pressure is 150 psi.',
    evidence: [{ chunkId: 'chk_bench_2', text: 'Operating pressure must not exceed 90 psi under nominal conditions.' }],
    expectedLabel: 'contradiction',
  },
  {
    caseId: 'case_003_neutral_unsupported',
    claim: 'The cooling system was upgraded in September 2023.',
    evidence: [{ chunkId: 'chk_bench_3', text: 'The plant operates three cooling units.' }],
    expectedLabel: 'neutral',
  },
  {
    caseId: 'case_004_technical_conflict_units',
    claim: 'Maximum temperature limit is 120°C.',
    evidence: [{ chunkId: 'chk_bench_4', text: 'Maximum operating temperature is 100°C.' }],
    expectedLabel: 'contradiction',
  },
  {
    caseId: 'case_005_exact_match_spec',
    claim: 'Valve V-204 connects to Pump P-101A.',
    evidence: [{ chunkId: 'chk_bench_5', text: 'Vessel V-204 connects to pump P-101A via line L-12.' }],
    expectedLabel: 'entailment',
  },
];

function toPublicEvaluation(e: DBEvaluation): Evaluation {
  return {
    id: e.id,
    projectId: e.projectId,
    name: e.name,
    status: e.status,
    dataset: e.dataset ?? undefined,
    modelVersion: e.modelVersion ?? undefined,
    metrics: (e.metrics as any) ?? undefined,
    errorMessage: e.errorMessage ?? undefined,
    createdAt: e.createdAt.toISOString(),
    completedAt: e.completedAt ? e.completedAt.toISOString() : undefined,
  };
}

function toPublicEvaluationResult(r: DBEvaluationResult): EvaluationResultCase {
  return {
    id: r.id,
    evaluationId: r.evaluationId,
    caseId: r.caseId,
    claim: r.claim,
    expectedLabel: r.expectedLabel ?? undefined,
    predictedLabel: r.predictedLabel ?? undefined,
    groundingScore: r.groundingScore ?? undefined,
    passed: r.passed,
    latencyMs: r.latencyMs ?? undefined,
    evidence: r.evidence,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function evaluationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // GET /v1/projects/:projectId/metrics
  fastify.get('/v1/projects/:projectId/metrics', async (request, reply) => {
    const userId = request.user!.id;
    const { projectId } = request.params as { projectId: string };

    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const metrics = await evaluationRepository.computeProjectMetrics(projectId);
    const res: ProjectMetricsResponse = {
      projectId,
      totalGenerations: metrics.totalGenerations,
      completedGenerations: metrics.completedGenerations,
      totalClaims: metrics.totalClaims,
      verifiedClaims: metrics.verifiedClaims,
      flaggedClaims: metrics.flaggedClaims,
      recoveredClaims: metrics.recoveredClaims,
      groundingPassRate: metrics.groundingPassRate,
      contradictionRate: metrics.contradictionRate,
      recoverySuccessRate: metrics.recoverySuccessRate,
      averageLatencyMs: metrics.averageLatencyMs,
    };

    return reply.status(200).send(res);
  });

  // GET /v1/projects/:projectId/evaluations
  fastify.get('/v1/projects/:projectId/evaluations', async (request, reply) => {
    const userId = request.user!.id;
    const { projectId } = request.params as { projectId: string };

    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const evaluations = await evaluationRepository.listEvaluationsByProjectId(projectId, userId);
    return reply.status(200).send({ evaluations: evaluations.map(toPublicEvaluation) });
  });

  // POST /v1/projects/:projectId/evaluations
  fastify.post('/v1/projects/:projectId/evaluations', async (request, reply) => {
    const userId = request.user!.id;
    const { projectId } = request.params as { projectId: string };

    const project = await projectRepository.findProjectByIdAndUserId(projectId, userId);
    if (!project) throw new NotFoundError('Project not found');

    const body = request.body as { name?: unknown; dataset?: unknown };
    if (!body || typeof body !== 'object') {
      throw new BadRequestError('Request body must be a JSON object');
    }
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new BadRequestError('name is required and must be a non-empty string');
    }

    const evalRecord = await evaluationRepository.createEvaluation({
      projectId,
      userId,
      name: body.name.trim(),
      dataset: typeof body.dataset === 'string' ? body.dataset : 'golden-benchmark-v1',
    });

    // Run benchmark evaluation cases
    let passedCount = 0;
    let totalLatency = 0;
    let modelVersion = 'groundguard-deberta-v1-finetuned';

    // Try batch verification via M1 if available
    let mlResults: Map<string, { label: string; score: number }> = new Map();
    try {
      const batchPayload = {
        requestId: `eval_${evalRecord.id}`,
        items: GOLDEN_BENCHMARK_CASES.map((c) => ({
          claimId: c.caseId,
          claim: c.claim,
          evidence: c.evidence,
        })),
      };
      const m1Batch = await mlClient.verifyBatch(batchPayload);
      modelVersion = m1Batch.modelVersion || modelVersion;
      for (const item of m1Batch.results) {
        mlResults.set(item.claimId, { label: item.label, score: item.groundingScore });
      }
    } catch {
      // Fallback to deterministic technicalChecker evaluation if M1 is offline
      modelVersion = 'groundguard-deterministic-baseline';
    }

    for (const testCase of GOLDEN_BENCHMARK_CASES) {
      const caseStart = Date.now();
      let predictedLabel: string;
      let groundingScore: number;

      if (mlResults.has(testCase.caseId)) {
        const ml = mlResults.get(testCase.caseId)!;
        predictedLabel = ml.label;
        groundingScore = ml.score;
      } else {
        const evidenceText = testCase.evidence.map((e) => e.text).join(' ');
        const techCheck = technicalChecker.evaluate(testCase.claim, evidenceText);
        if (!techCheck.passed) {
          predictedLabel = 'contradiction';
          groundingScore = 0.05;
        } else if (evidenceText.toLowerCase().includes(testCase.claim.toLowerCase().substring(0, 15))) {
          predictedLabel = 'entailment';
          groundingScore = 0.95;
        } else {
          predictedLabel = 'neutral';
          groundingScore = 0.5;
        }
      }

      const caseLatency = Date.now() - caseStart;
      totalLatency += caseLatency;
      const passed = predictedLabel === testCase.expectedLabel;
      if (passed) passedCount++;

      await evaluationRepository.createEvaluationResult({
        evaluationId: evalRecord.id,
        caseId: testCase.caseId,
        claim: testCase.claim,
        expectedLabel: testCase.expectedLabel,
        predictedLabel,
        groundingScore,
        passed,
        latencyMs: caseLatency,
        evidence: testCase.evidence,
      });
    }

    const totalCases = GOLDEN_BENCHMARK_CASES.length;
    const passRate = totalCases > 0 ? Number((passedCount / totalCases).toFixed(4)) : 0;
    const avgLatency = totalCases > 0 ? Math.round(totalLatency / totalCases) : 0;

    const summaryMetrics = {
      totalCases,
      passedCases: passedCount,
      passRate,
      groundingPassRate: passRate,
      averageLatencyMs: avgLatency,
    };

    const completed = await evaluationRepository.updateEvaluation(evalRecord.id, {
      status: 'completed',
      modelVersion,
      metrics: summaryMetrics,
    });

    return reply.status(201).send({ evaluation: toPublicEvaluation(completed || evalRecord) });
  });

  // GET /v1/evaluations/:evaluationId
  fastify.get('/v1/evaluations/:evaluationId', async (request, reply) => {
    const userId = request.user!.id;
    const { evaluationId } = request.params as { evaluationId: string };

    const evaluation = await evaluationRepository.findEvaluationByIdAndUserId(evaluationId, userId);
    if (!evaluation) throw new NotFoundError('Evaluation not found');

    return reply.status(200).send({ evaluation: toPublicEvaluation(evaluation) });
  });

  // GET /v1/evaluations/:evaluationId/results
  fastify.get('/v1/evaluations/:evaluationId/results', async (request, reply) => {
    const userId = request.user!.id;
    const { evaluationId } = request.params as { evaluationId: string };

    const evaluation = await evaluationRepository.findEvaluationByIdAndUserId(evaluationId, userId);
    if (!evaluation) throw new NotFoundError('Evaluation not found');

    const results = await evaluationRepository.listResultsByEvaluationId(evaluationId, userId);
    return reply.status(200).send({ results: results.map(toPublicEvaluationResult) });
  });
}

