/**
 * Stabilization Phase 04 -- deterministic M3 end-to-end trust-state test.
 *
 * question -> M2 (stubbed at the HTTP client boundary: retrieval/generation/claims) -> persistence
 * -> M1 NLI verification (stubbed client; payload inspected) -> bounded recovery -> final trust state
 * -> API read model -> frontend trust derivation.
 * Isolated in-memory PostgreSQL (pg-mem); no real user data, no LLM/provider calls.
 */
import assert from 'node:assert';
import { newDb } from 'pg-mem';
import { buildApp } from '../app';
import { dbManager } from '../plugins/database';
import { runMigrations } from '../plugins/migrate';
import { aiClient } from '../clients/ai.client';
import { mlClient } from '../clients/ml.client';
import { generationRepository } from '../repositories/generation.repository';
// Loaded at runtime so the API type-check does not pull web sources into its program (rootDir).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { deriveTrustSummary } = require('../../../web/src/lib/trust-utils');

type Scenario = {
  name: string;
  m2: Record<string, any>;
  m1Label?: 'entailment' | 'contradiction' | 'neutral';
  m1For?: (claimText: string) => 'entailment' | 'contradiction' | 'neutral';
  recover?: Record<string, any>;
};

const HOLMES = [
  'Sherlock Holmes concluded that the murderer was a man who was more than six feet high.',
  'Sherlock Holmes concluded that the murderer was in the prime of life.',
  'Sherlock Holmes concluded that the murderer had small feet for his height.',
  'Sherlock Holmes concluded that the murderer wore coarse, square-toed boots.',
  'Sherlock Holmes concluded that the murderer smoked a Trichinopoly cigar.',
  'Sherlock Holmes deduced that the murderer came to the scene with his victim in a four-wheeled cab.',
  'The four-wheeled cab was drawn by a horse with three old shoes and one new one on its off fore leg.',
  'Sherlock Holmes deduced that the murderer in all probability had a florid face.',
];

const EVIDENCE = {
  evidenceId: 'ev_1',
  chunkId: 'chk_pump_1',
  documentId: 'doc_pump',
  text: 'The pump is designed for hydrocarbon liquid transfer with a rated flow rate of 450 gpm.',
  pageNumber: 1,
  heading: 'Ratings',
  metadata: { filename: 'pump_p101a_specs.pdf', chunkIndex: 0 },
};

function claim(text: string) {
  return { claimId: 'claim_0', text, status: 'pending', ordinal: 0, evidence: [EVIDENCE] };
}

const SCENARIOS: Scenario[] = [
  {
    name: 'supported',
    m2: { answer: 'Pump P-101A has a rated flow rate of 450 gpm [pump_p101a_specs.pdf, p. 1].', claims: [claim('Pump P-101A has a rated flow rate of 450 gpm.')],
      evidence: [EVIDENCE], metadata: { abstention: false, disposition: 'SUPPORTED', verificationStatus: 'claims_pending_verification' } },
    m1Label: 'entailment',
  },
  {
    name: 'contradicted',
    m2: { answer: 'Pump P-101A has a rated flow rate of 900 gpm [pump_p101a_specs.pdf, p. 1].', claims: [claim('Pump P-101A has a rated flow rate of 900 gpm.')],
      evidence: [EVIDENCE], metadata: { abstention: false, disposition: 'SUPPORTED', verificationStatus: 'claims_pending_verification' } },
    m1Label: 'contradiction',
    recover: { action: 'abstain', candidateClaim: null, recoveryEvidence: [EVIDENCE], modelVersion: 'gemini/test', reason: 'silent' },
  },
  {
    name: 'insufficient',
    m2: { answer: "The available project evidence doesn't specify the design temperature of P-101A.", claims: [], evidence: [],
      metadata: { abstention: true, disposition: 'INSUFFICIENT', verificationStatus: 'abstained' } },
  },
  {
    name: 'unverified',
    m2: { answer: 'Pump P-101A has a rated flow rate of 450 gpm.', claims: [], evidence: [EVIDENCE],
      metadata: { abstention: false, disposition: 'UNVERIFIED', verificationStatus: 'claim_extraction_failed', claimExtraction: { status: 'failed' } } },
  },
  {
    name: 'provider-unavailable-recovery',
    m2: { answer: 'Pump P-101A has a rated flow rate of 900 gpm.', claims: [claim('Pump P-101A has a rated flow rate of 900 gpm.')],
      evidence: [EVIDENCE], metadata: { abstention: false, disposition: 'SUPPORTED' } },
    m1Label: 'neutral',
    recover: { action: 'abstain', candidateClaim: null, recoveryEvidence: [], modelVersion: 'llm-unavailable',
      reason: 'LLM provider unavailable: gemini provider unavailable (HTTP 429: rate limited); retry after 30s', failureType: 'provider_unavailable' },
  },
  {
    // Recorded gen_bd878a64 pattern: 8 claims, M1 entails only the cigar claim; the rest are neutral except
    // one false contradiction. Recovery always answers 'keep' (no revision) and re-verification is not entailed.
    name: 'holmes-8',
    m2: { answer: 'Holmes concluded the murderer was over six feet high ... [stud.pdf, p. 19].',
      claims: HOLMES.map((t, i) => ({ ...claim(t), claimId: `claim_${i}`, ordinal: i })),
      evidence: [EVIDENCE], metadata: { abstention: false, disposition: 'PARTIAL', verificationStatus: 'claims_pending_verification' } },
    m1For: (t: string) => (t.includes('Trichinopoly') ? 'entailment' : t.includes('square-toed') ? 'contradiction' : 'neutral'),
    recover: { action: 'keep', candidateClaim: null, recoveryEvidence: [EVIDENCE], modelVersion: 'gemini/test', reason: 'unchanged' },
  },
];

async function run() {
  console.log('=== Phase 04 M3 E2E trust-state test ===');
  process.env.JWT_SECRET = 'test-jwt-secret-for-groundguard-e2e-runs';
  process.env.RATE_LIMIT_DISABLED = 'true';
  const memDb = newDb();
  memDb.public.interceptQueries((q: string) => (q.includes('CREATE EXTENSION') ? [] : null));
  dbManager.setTestPool(new (memDb.adapters.createPg().Pool)() as any);
  await runMigrations(dbManager.getPool(), { isPgMem: true });
  const app = buildApp();
  await app.ready();

  const reg = async (email: string) =>
    JSON.parse((await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password: 'password123', name: email } })).payload);
  const a = await reg('e2e-a@example.com');
  const b = await reg('e2e-b@example.com');
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  const projectId = JSON.parse((await app.inject({ method: 'POST', url: '/v1/projects', headers: auth(a.token), payload: { name: 'E2E' } })).payload).project.id;
  const conv = JSON.parse((await app.inject({ method: 'POST', url: `/v1/projects/${projectId}/conversations`, headers: auth(a.token), payload: { title: 'e2e' } })).payload);
  const conversationId = conv.conversation?.id ?? conv.id;

  let scenario: Scenario = SCENARIOS[0];
  const m1Payloads: any[] = [];
  let recoverCalls = 0;
  let generateProjectIds: string[] = [];
  (aiClient as any).generateStream = async (payload: any, onEvent: (e: string, d: any) => void) => {
    generateProjectIds.push(payload.projectId);
    onEvent('answer.completed', { answer: scenario.m2.answer });
    return { requestId: 'req', generationId: payload.generationId, status: 'completed', modelVersion: 'gemini/test', ...scenario.m2 };
  };
  (mlClient as any).verifyBatch = async (payload: any) => {
    m1Payloads.push(payload);
    return { requestId: 'r', modelVersion: 'm1-test', results: payload.items.map((it: any) => {
      const label = scenario.m1For ? scenario.m1For(it.claim) : (scenario.m1Label ?? 'neutral');
      return { claimId: it.claimId, label, groundingScore: 0.9,
        scores: { entailment: label === 'entailment' ? 0.95 : 0.02, contradiction: label === 'contradiction' ? 0.95 : 0.02, neutral: label === 'neutral' ? 0.96 : 0.03 } };
    }) };
  };
  (aiClient as any).recover = async (req: any) => {
    recoverCalls++;
    return { requestId: 'r', claimId: req.claimId, ...(scenario.recover ?? { action: 'abstain', recoveryEvidence: [], modelVersion: 'x' }) };
  };

  const results: Record<string, string> = {};
  const completedEvents = new Set<string>();
  const { generationEvents } = await import('../services/generation-events');
  const origPublish = generationEvents.publish.bind(generationEvents);
  (generationEvents as any).publish = (id: string, type: string, data: any) => {
    if (type === 'generation.completed') completedEvents.add(id);
    return origPublish(id, type as any, data);
  };
  for (const sc of SCENARIOS) {
    scenario = sc;
    m1Payloads.length = 0;
    recoverCalls = 0;
    generateProjectIds = [];
    const res = await app.inject({
      method: 'POST', url: `/v1/projects/${projectId}/conversations/${conversationId}/messages`,
      headers: auth(a.token), payload: { content: `question for ${sc.name}` },
    });
    assert.ok(res.statusCode === 200, `${sc.name}: HTTP ${res.statusCode} ${res.payload.slice(0, 200)}`);
    const body = JSON.parse(res.payload);
    const generationId = body.generationId;
    assert.deepStrictEqual(generateProjectIds, [projectId], `${sc.name}: M2 call must be scoped to the caller's project`);

    const claimsRes = JSON.parse((await app.inject({ method: 'GET', url: `/v1/generations/${generationId}/claims`, headers: auth(a.token) })).payload);
    const ui = deriveTrustSummary(claimsRes.claims, 'completed', claimsRes.disposition);
    assert.strictEqual(claimsRes.disposition, sc.m2.metadata.disposition, `${sc.name}: persisted disposition`);

    switch (sc.name) {
      case 'supported': {
        assert.strictEqual(claimsRes.claims[0].status, 'verified');
        assert.strictEqual(ui.headline, 'All supported');
        const ev = m1Payloads[0].items[0].evidence[0];
        assert.strictEqual(ev.chunkId, 'chk_pump_1');
        assert.ok(String(ev.context).startsWith('Source document: pump p101a specs.'), `M1 context: ${ev.context}`);
        assert.ok(String(ev.context).includes('Section: Ratings'));
        break;
      }
      case 'contradicted': {
        assert.strictEqual(claimsRes.claims[0].status, 'flagged');
        assert.ok(recoverCalls >= 1 && recoverCalls <= 2, `recovery bounded by maxRecoveryAttempts=2 (got ${recoverCalls})`);
        const attempts = await generationRepository.listRecoveryAttemptsByClaimId?.(claimsRes.claims[0].claimId).catch(() => null);
        if (attempts) assert.ok(attempts.length <= 2);
        assert.strictEqual(ui.headline, 'Review required');
        break;
      }
      case 'insufficient':
        assert.strictEqual(m1Payloads.length, 0, 'no M1 call for an abstention');
        assert.strictEqual(claimsRes.claims.length, 0);
        assert.strictEqual(ui.headline, 'Insufficient evidence');
        assert.ok(!/\[[^\]]+\]/.test(body.answer), 'abstention carries no citation');
        break;
      case 'unverified':
        assert.strictEqual(ui.headline, 'Verification unavailable');
        assert.notStrictEqual(ui.variant, 'success');
        break;
      case 'holmes-8': {
        const byText = new Map(claimsRes.claims.map((c: any) => [c.text, c.status]));
        assert.strictEqual(byText.get(HOLMES[4]), 'verified', 'entailed claim verified, not recovered');
        assert.strictEqual(byText.get(HOLMES[3]), 'flagged', 'false contradiction NOT promoted to verified by recovery');
        for (const t of HOLMES.filter((_, i) => i !== 3 && i !== 4)) assert.strictEqual(byText.get(t), 'needs_review', `neutral stays needs_review: ${t}`);
        assert.ok(recoverCalls <= 6, `per-generation recovery budget (got ${recoverCalls})`);
        assert.strictEqual(recoverCalls, 6, "7 unverified claims, 1 attempt each after 'keep', capped at 6");
        const gen = await generationRepository.findGenerationById(generationId);
        assert.strictEqual(gen?.status, 'completed', 'generation reaches completed (not stuck recovering)');
        assert.ok((gen?.recoveryAttempts ?? 0) <= 6, 'persisted recovery attempts within budget');
        assert.ok(completedEvents.has(generationId), 'generation.completed event published');
        assert.notStrictEqual(ui.headline, 'All supported');
        break;
      }
      case 'provider-unavailable-recovery':
        assert.strictEqual(recoverCalls, 1, 'provider outage must stop recovery after one call');
        assert.strictEqual(claimsRes.claims[0].status, 'needs_review', 'provider outage never becomes verified');
        assert.notStrictEqual(ui.headline, 'All supported');
        break;
    }
    results[sc.name] = `PASS (disposition=${claimsRes.disposition}, ui="${ui.headline}", m1Calls=${m1Payloads.length}, recoverCalls=${recoverCalls})`;
  }

  // Cross-project isolation: user B cannot read user A's generation
  const anyGen = (await generationRepository.listClaimsByGenerationId as any) ? null : null;
  void anyGen;
  const lastGen = JSON.parse((await app.inject({
    method: 'POST', url: `/v1/projects/${projectId}/conversations/${conversationId}/messages`,
    headers: auth(a.token), payload: { content: 'isolation probe' },
  })).payload).generationId;
  const leak = await app.inject({ method: 'GET', url: `/v1/generations/${lastGen}/claims`, headers: auth(b.token) });
  assert.ok(leak.statusCode === 404 || leak.statusCode === 403, `cross-project read must be denied (got ${leak.statusCode})`);
  results['cross-project-isolation'] = `PASS (HTTP ${leak.statusCode})`;

  for (const [k, v] of Object.entries(results)) console.log(`[${k}] ${v}`);
  console.log('ALL PHASE 04 E2E TRUST-STATE CHECKS PASSED');
  await app.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('E2E FAILED:', err);
  process.exit(1);
});
