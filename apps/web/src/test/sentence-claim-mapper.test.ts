import test from 'node:test';
import assert from 'node:assert/strict';
import { mapAnswerToClaims } from '../lib/sentence-claim-mapper.ts';
import type { Claim } from '@groundguard/types';

test('CASE 1: Two answer sentences mention same system name but different facts', () => {
  const answer = 'The system uses IoT sensors. The system uses computer vision.';
  const claims: Claim[] = [
    {
      claimId: 'claim-iot',
      text: 'The system uses IoT sensors',
      status: 'verified',
      evidence: [{ chunkId: 'chk-iot', text: 'IoT sensors' }],
    },
    {
      claimId: 'claim-cv',
      text: 'The system uses computer vision',
      status: 'verified',
      evidence: [{ chunkId: 'chk-cv', text: 'computer vision' }],
    },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  assert.strictEqual(blocks.length, 1);
  const items = blocks[0].items;
  assert.strictEqual(items.length, 2);

  // Sentence 1 must ONLY bind claim-iot
  assert.strictEqual(items[0].matchedClaims.length, 1);
  assert.strictEqual(items[0].matchedClaims[0].claimId, 'claim-iot');
  assert.strictEqual(items[0].effectiveStatus, 'verified');

  // Sentence 2 must ONLY bind claim-cv
  assert.strictEqual(items[1].matchedClaims.length, 1);
  assert.strictEqual(items[1].matchedClaims[0].claimId, 'claim-cv');
  assert.strictEqual(items[1].effectiveStatus, 'verified');
});

test('CASE 2: Two sentences share multiple technical words but differ in predicate/value', () => {
  const answer = 'The sensor operates at 5 volts. The sensor operates at 12 volts.';
  const claims: Claim[] = [
    {
      claimId: 'claim-5v',
      text: 'The sensor operates at 5 volts',
      status: 'verified',
    },
    {
      claimId: 'claim-12v',
      text: 'The sensor operates at 12 volts',
      status: 'verified',
    },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  const items = blocks[0].items;

  assert.strictEqual(items[0].matchedClaims[0].claimId, 'claim-5v');
  assert.strictEqual(items[1].matchedClaims[0].claimId, 'claim-12v');
});

test('CASE 3: One verified claim + one needs_review claim in adjacent sentences', () => {
  const answer = 'The device has an onboard accelerometer. The device supports underwater telemetry.';
  const claims: Claim[] = [
    {
      claimId: 'claim-accel',
      text: 'The device has an onboard accelerometer',
      status: 'verified',
    },
    {
      claimId: 'claim-telemetry',
      text: 'The device supports underwater telemetry',
      status: 'needs_review',
    },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  const items = blocks[0].items;

  assert.strictEqual(items[0].matchedClaims[0].claimId, 'claim-accel');
  assert.strictEqual(items[0].effectiveStatus, 'verified');

  assert.strictEqual(items[1].matchedClaims[0].claimId, 'claim-telemetry');
  assert.strictEqual(items[1].effectiveStatus, 'needs_review');
});

test('CASE 4: One recovered claim + one verified claim (Final Answer Projection)', () => {
  const answer = 'The camera captures 4K video at 120 FPS. The battery lasts for 8 hours.';
  const claims: Claim[] = [
    {
      claimId: 'claim-cam',
      text: 'The camera captures 4K video at 60 FPS.', // Repaired/recovered text
      status: 'recovered',
      recovery: {
        attempts: [
          {
            attemptNumber: 1,
            action: 'revise',
            originalText: 'The camera captures 4K video at 120 FPS.',
            candidateText: 'The camera captures 4K video at 60 FPS.',
          },
        ],
      },
      evidence: [{ chunkId: 'chk-spec', text: 'Maximum frame rate is 60 FPS in 4K mode.' }],
    },
    {
      claimId: 'claim-bat',
      text: 'The battery lasts for 8 hours',
      status: 'verified',
    },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  const items = blocks[0].items;

  // Sentence 1 is recovered: displayText must project canonical recovered claim text
  assert.strictEqual(items[0].matchedClaims[0].claimId, 'claim-cam');
  assert.strictEqual(items[0].effectiveStatus, 'recovered');
  assert.strictEqual(items[0].isProjectedRecovery, true);
  assert.strictEqual(items[0].displayText, 'The camera captures 4K video at 60 FPS.');
  assert.strictEqual(items[0].originalText, 'The camera captures 4K video at 120 FPS.');

  // Sentence 2 is verified: displayText unchanged
  assert.strictEqual(items[1].matchedClaims[0].claimId, 'claim-bat');
  assert.strictEqual(items[1].effectiveStatus, 'verified');
  assert.strictEqual(items[1].isProjectedRecovery, false);
  assert.strictEqual(items[1].displayText, 'The battery lasts for 8 hours.');
});

test('CASE 5: One visible sentence contains two genuinely atomic supported claims', () => {
  const answer = 'The unit includes dual Gigabit Ethernet ports and supports 802.11ax WiFi.';
  const claims: Claim[] = [
    {
      claimId: 'claim-eth',
      text: 'dual Gigabit Ethernet ports',
      status: 'verified',
    },
    {
      claimId: 'claim-wifi',
      text: 'supports 802.11ax WiFi',
      status: 'verified',
    },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  const items = blocks[0].items;

  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].matchedClaims.length, 2);
  assert.strictEqual(items[0].effectiveStatus, 'verified');
});

test('CASE 6: One claim must NOT bind to multiple unrelated sentences (1-to-1 constraint)', () => {
  const answer = 'Microcontroller handles telemetry. Microcontroller controls motor. Microcontroller reads sensor.';
  const claims: Claim[] = [
    {
      claimId: 'claim-motor',
      text: 'Microcontroller controls motor',
      status: 'verified',
    },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  const items = blocks[0].items;

  // Only the matching sentence binds the claim
  assert.strictEqual(items[0].matchedClaims.length, 0);
  assert.strictEqual(items[0].effectiveStatus, null);

  assert.strictEqual(items[1].matchedClaims.length, 1);
  assert.strictEqual(items[1].matchedClaims[0].claimId, 'claim-motor');
  assert.strictEqual(items[1].effectiveStatus, 'verified');

  assert.strictEqual(items[2].matchedClaims.length, 0);
  assert.strictEqual(items[2].effectiveStatus, null);
});

test('CASE 7: Ambiguous mapping remains unbound without fake trust badge', () => {
  const answer = 'It has general features. It performs generic tasks.';
  const claims: Claim[] = [
    {
      claimId: 'claim-solar',
      text: 'Solar panels generate 50 watts peak power',
      status: 'verified',
    },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  const items = blocks[0].items;

  assert.strictEqual(items[0].matchedClaims.length, 0);
  assert.strictEqual(items[0].effectiveStatus, null);
  assert.strictEqual(items[1].matchedClaims.length, 0);
  assert.strictEqual(items[1].effectiveStatus, null);
});

test('CASE 8: Mixed-state sentence safety (strictest unverified state prevails)', () => {
  const answer = 'The station measures air temperature and predicts seismic tremors.';
  const claims: Claim[] = [
    {
      claimId: 'claim-temp',
      text: 'station measures air temperature',
      status: 'verified',
    },
    {
      claimId: 'claim-seismic',
      text: 'station predicts seismic tremors',
      status: 'needs_review',
    },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  const items = blocks[0].items;

  assert.strictEqual(items[0].matchedClaims.length, 2);
  // Strictest status: needs_review must NOT be hidden behind green verified!
  assert.strictEqual(items[0].effectiveStatus, 'needs_review');
});

test('CASE 9: Compound sentence recovery projection preserves sibling supported facts', () => {
  const answer = 'The system uses IoT sensors and computer vision for monitoring.';
  const claims: Claim[] = [
    {
      claimId: 'claim-iot',
      text: 'system uses IoT sensors',
      status: 'verified',
    },
    {
      claimId: 'claim-cv',
      text: 'system uses acoustic sensors',
      status: 'recovered',
      recovery: {
        attempts: [
          {
            attemptNumber: 1,
            action: 'revise',
            originalText: 'system uses computer vision',
            candidateText: 'system uses acoustic sensors',
          },
        ],
      },
    },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  const items = blocks[0].items;

  assert.strictEqual(items.length, 1);
  const item = items[0];

  // Matched claims should include BOTH Claim A and Claim B
  assert.strictEqual(item.matchedClaims.length, 2);
  assert.strictEqual(item.effectiveStatus, 'recovered');
  assert.strictEqual(item.isProjectedRecovery, true);

  // Recovery projection MUST NOT discard Claim A ("system uses IoT sensors")!
  assert.ok(
    item.displayText.includes('IoT sensors'),
    `Expected displayText to preserve Claim A ('IoT sensors'), got: "${item.displayText}"`
  );
  assert.ok(
    item.displayText.includes('acoustic sensors'),
    `Expected displayText to reflect recovered Claim B ('acoustic sensors'), got: "${item.displayText}"`
  );
  assert.strictEqual(
    item.displayText,
    'The system uses IoT sensors and acoustic sensors for monitoring.'
  );
  assert.strictEqual(
    item.originalText,
    'The system uses IoT sensors and computer vision for monitoring.'
  );
});

test('CASE 10 (REGRESSION): Real pin connections query preserves entire answer prose and citations', () => {
  const answer = 'The DHT-11 sensor features three pin connections: the leftmost pin is VIN, which connects to 5 V; the middle pin connects to digital pin 5; and the rightmost pin, marked with a minus ("-") sign, is the GND pin [DHT11 Notes for the Students.pdf, p. 1, p. 2].';
  const claims: Claim[] = [
    { claimId: 'c1', text: 'The DHT-11 sensor features three pin connections.', status: 'needs_review' },
    { claimId: 'c2', text: 'The leftmost pin of the DHT-11 sensor is VIN.', status: 'flagged' },
    { claimId: 'c3', text: 'The leftmost pin of the DHT-11 sensor connects to 5 V.', status: 'needs_review' },
    { claimId: 'c4', text: 'The middle pin of the DHT-11 sensor connects to digital pin 5.', status: 'needs_review' },
    { claimId: 'c5', text: 'The rightmost pin of the DHT-11 sensor is marked with a minus ("-") sign.', status: 'flagged' },
    { claimId: 'c6', text: 'The rightmost pin of the DHT-11 sensor is the GND pin.', status: 'flagged' },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  assert.strictEqual(blocks.length, 1);
  const items = blocks[0].items;
  assert.strictEqual(items.length, 1);

  // Must NOT be reduced to "pdf, p. 1, p. 2]." fragment!
  assert.notStrictEqual(items[0].displayText, 'pdf, p. 1, p. 2].');
  assert.ok(items[0].displayText.includes('The DHT-11 sensor features three pin connections'));
  assert.ok(items[0].displayText.includes('DHT11 Notes for the Students.pdf, p. 1, p. 2'));
  assert.strictEqual(items[0].matchedClaims.length, 6);
});

test('CASE 11 (REGRESSION): Example 1 - Citation with .pdf and p. 1 preserved', () => {
  const answer = 'The DHT11 has three pins: VCC, data, and GND. Connect VCC to 5 V, the data pin to the configured GPIO, and GND to ground. [DHT11 Notes for the Students.pdf, p. 1]';
  const blocks = mapAnswerToClaims(answer, []);
  assert.strictEqual(blocks.length, 1);
  assert.ok(blocks[0].items.length >= 1);
  const fullText = blocks[0].items.map((i) => i.displayText).join(' ');
  assert.ok(fullText.includes('The DHT11 has three pins: VCC, data, and GND'));
  assert.ok(fullText.includes('DHT11 Notes for the Students.pdf, p. 1'));
});

test('CASE 12 (REGRESSION): Example 2 - Technical dots (Next.js, FastAPI, Architecture.pdf, pp. 1–2) preserved', () => {
  const answer = 'The project uses Next.js for the frontend and FastAPI for the AI service. [Architecture.pdf, pp. 1–2]';
  const blocks = mapAnswerToClaims(answer, []);
  assert.strictEqual(blocks.length, 1);
  const fullText = blocks[0].items.map((i) => i.displayText).join(' ');
  assert.ok(fullText.includes('The project uses Next.js for the frontend'));
  assert.ok(fullText.includes('FastAPI for the AI service'));
  assert.ok(fullText.includes('Architecture.pdf, pp. 1–2'));
});

test('CASE 13 (REGRESSION): Example 3 - False premise correction (Zephyr_X9_Spec.pdf, p. 1) preserved', () => {
  const answer = 'No. The source specifies port 7421, not 8080. [Zephyr_X9_Spec.pdf, p. 1]';
  const blocks = mapAnswerToClaims(answer, []);
  assert.strictEqual(blocks.length, 1);
  const fullText = blocks[0].items.map((i) => i.displayText).join(' ');
  assert.ok(fullText.includes('No. The source specifies port 7421, not 8080'));
  assert.ok(fullText.includes('Zephyr_X9_Spec.pdf, p. 1'));
});

test('CASE 14 (GUARD): Substantial prose (>40 chars) must NEVER lose >80% content in mapping', () => {
  const answers = [
    'The sensor features three pin connections: VCC connects to 5 V, DATA connects to pin 5, and GND connects to ground. [Manual.pdf, p. 1]',
    'The architecture implements dual-redundant power supplies with automatic failover within 10 milliseconds. [Spec.pdf, p. 4]',
    'According to the system manual, the operating pressure must not exceed 15.5 bar under normal conditions. [Safety.pdf, p. 12]',
    'No contradiction was found; the secondary pump engages automatically when primary pressure drops below 2.0 bar. [Pumps.pdf, pp. 5–6]'
  ];

  for (const ans of answers) {
    const blocks = mapAnswerToClaims(ans, []);
    const fullText = blocks.flatMap((b) => b.items.map((i) => i.displayText)).join(' ');
    assert.ok(
      fullText.length >= ans.length * 0.8,
      `Prose loss detected! Input: "${ans}" (${ans.length} chars) -> Output: "${fullText}" (${fullText.length} chars)`
    );
  }
});
