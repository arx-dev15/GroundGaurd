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

test('CASE 10: Answer with file.pdf and page reference does not drop text', () => {
  const answer = 'The middle pin connects to Digital Pin 5 [DHT11 Notes for the Students.pdf, p. 1].';
  const claims: Claim[] = [
    {
      claimId: 'claim-pin',
      text: 'The middle pin connects to Digital Pin 5.',
      status: 'verified',
    },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  assert.strictEqual(blocks.length, 1);
  const items = blocks[0].items;
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].displayText, 'The middle pin connects to Digital Pin 5 [DHT11 Notes for the Students.pdf, p. 1].');
  assert.strictEqual(items[0].matchedClaims.length, 1);
  assert.strictEqual(items[0].matchedClaims[0].claimId, 'claim-pin');
});

test('CASE 11: Compound answer with multiple citations preserves 100% of text and maps claims', () => {
  const answer = 'Dr. Watson is an individual who is introduced to Sherlock Holmes by Stamford [A_Study_in_Scarlet-Arthur_Conan_Doyle.pdf, p. 8] and who has previously been in Afghanistan [A_Study_in_Scarlet-Arthur_Conan_Doyle.pdf, p. 8]. Additionally, he maintains a journal that records events related to their investigations [A_Study_in_Scarlet-Arthur_Conan_Doyle.pdf, p. 105].';
  const claims: Claim[] = [
    {
      claimId: 'c1',
      text: 'Dr. Watson is an individual who is introduced to Sherlock Holmes by Stamford.',
      status: 'flagged',
    },
    {
      claimId: 'c2',
      text: 'Dr. Watson has previously been in Afghanistan.',
      status: 'flagged',
    },
    {
      claimId: 'c3',
      text: 'Dr. Watson maintains a journal that records events related to their investigations.',
      status: 'flagged',
    },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  assert.strictEqual(blocks.length, 1);
  const items = blocks[0].items;
  assert.strictEqual(items.length, 2);

  // Both sentences are preserved completely without truncation
  assert.ok(items[0].displayText.includes('introduced to Sherlock Holmes by Stamford'));
  assert.ok(items[0].displayText.includes('previously been in Afghanistan'));
  assert.ok(items[1].displayText.includes('maintains a journal'));

  // Sentence 1 should have matched claims c1 and c2
  assert.ok(items[0].matchedClaims.some((c) => c.claimId === 'c1'));
  // Sentence 2 should have matched claim c3
  assert.ok(items[1].matchedClaims.some((c) => c.claimId === 'c3'));
});

test('CASE 12: Unmapped intro prose is retained and rendered without fake claim status', () => {
  const answer = 'Based on the provided documentation: Feedwater Pump P-101A has a maximum discharge pressure of 15.2 bar. The impeller is made of 316L stainless steel.';
  const claims: Claim[] = [
    {
      claimId: 'c-press',
      text: 'Feedwater Pump P-101A has a maximum discharge pressure of 15.2 bar.',
      status: 'verified',
    },
  ];

  const blocks = mapAnswerToClaims(answer, claims);
  assert.strictEqual(blocks.length, 1);
  const items = blocks[0].items;
  assert.strictEqual(items.length, 2);

  // Unmapped sentence 2 is preserved
  assert.ok(items[1].displayText.includes('impeller is made of 316L stainless steel'));
});

