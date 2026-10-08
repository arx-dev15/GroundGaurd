import assert from 'node:assert';
import { buildEvidenceContext } from '../services/evidence-context';

// Stabilization Phase 02 (F8): NLI source context is built only from stored provenance.
function runEvidenceContextTests() {
  console.log('=== Running Evidence Context (NLI subject resolution) Tests ===');

  assert.strictEqual(
    buildEvidenceContext({ filename: 'dht11_datasheet.pdf' }),
    'Source document: dht11 datasheet.'
  );
  assert.strictEqual(
    buildEvidenceContext(JSON.stringify({ filename: 'pump_p101a_specs.pdf', heading: 'Ratings' })),
    'Source document: pump p101a specs. Section: Ratings.'
  );
  assert.strictEqual(
    buildEvidenceContext({ filename: 'stud.pdf', precedingText: 'Dr. Watson returned from Afghanistan.' }, 'Chapter I'),
    'Source document: stud. Section: Chapter I. Preceding text: Dr. Watson returned from Afghanistan.'
  );
  // No provenance -> no invented context
  assert.strictEqual(buildEvidenceContext({}), undefined);
  assert.strictEqual(buildEvidenceContext('not json'), undefined);
  assert.strictEqual(buildEvidenceContext(null), undefined);

  console.log('[OK] buildEvidenceContext uses only stored title/heading/preceding text');
}

runEvidenceContextTests();
