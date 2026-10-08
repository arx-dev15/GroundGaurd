import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPageTextIndex,
  findExcerpt,
  segmentItem,
  textLayerStyleVars,
  normalizeComparable,
  MIN_PARTIAL_CHARS,
} from '../lib/pdf-text-match.ts';

/** Text-layer items as PDF.js emits them: one string per positioned span, lines split arbitrarily. */
const PAGE = [
  'Feed pump P-101A maximum discharge',
  ' pressure is 15.2 bar. The pump is',
  'rated for continuous duty at 1450 rpm and',
  'operates within design limits.',
  'Boiler B-201 design temperature is 450 °C.',
];

function highlighted(items: string[], excerpt: string) {
  const m = findExcerpt(buildPageTextIndex(items), excerpt, items);
  return { m, text: m.ranges.map((r) => items[r.item].slice(r.start, r.end)) };
}

test('exact multi-line excerpt maps to every source line, including partial first/last lines', () => {
  const { m, text } = highlighted(PAGE, 'maximum discharge pressure is 15.2 bar. The pump is rated for continuous duty');
  assert.equal(m.kind, 'exact');
  assert.deepEqual(m.ranges.map((r) => r.item), [0, 1, 2]);
  assert.deepEqual(text, ['maximum discharge', 'pressure is 15.2 bar. The pump is', 'rated for continuous duty']);
  assert.equal(m.coverage, 1);
});

test('whitespace, punctuation, quote/dash and unicode variants still match exactly', () => {
  const items = ['The “KC-450” motor — rated at 310 kW', '— uses a ﬁltered supply.'];
  const { m, text } = highlighted(items, 'the "KC 450" motor - rated at 310kW - uses a filtered supply');
  assert.equal(m.kind, 'exact');
  assert.equal(text.length, 2);
  assert.equal(normalizeComparable('Café ﬁ'), 'cafefi');
});

test('hyphenated line break matches the dehyphenated chunk text', () => {
  const items = ['Holmes applied his powers of verifica-', 'tion to the bloodstains on the floor.'];
  const { m, text } = highlighted(items, 'Holmes applied his powers of verification to the bloodstains');
  assert.equal(m.kind, 'exact');
  assert.deepEqual(text, ['Holmes applied his powers of verifica-', 'tion to the bloodstains']);
});

test('repeated phrase: occurrences counted, first occurrence chosen, ranges stay exact', () => {
  const items = ['The valve is normally closed during startup.', 'Later:', 'The valve is normally closed during startup.'];
  const { m } = highlighted(items, 'The valve is normally closed during startup');
  assert.equal(m.kind, 'exact');
  assert.equal(m.occurrences, 2);
  assert.deepEqual(m.ranges.map((r) => r.item), [0]);
});

test('missing passage produces no highlight (never highlights unrelated text)', () => {
  const { m } = highlighted(PAGE, 'The cooling tower fan operates at 900 rpm during the summer season.');
  assert.equal(m.kind, 'none');
  assert.equal(m.reason, 'not_found');
  assert.deepEqual(m.ranges, []);
});

test('semantically similar but textually different passage is not highlighted', () => {
  const { m } = highlighted(PAGE, 'The feed pump P-101A has a peak discharge pressure of 15.2 bar and runs at 1450 rpm.');
  assert.equal(m.kind, 'none');
});

test('too-short excerpts are refused', () => {
  const { m } = highlighted(PAGE, 'pump');
  assert.equal(m.kind, 'none');
  assert.equal(m.reason, 'too_short');
});

test('passage continuing on the next page → anchored partial match with honest coverage', () => {
  const excerpt =
    'Boiler B-201 design temperature is 450 °C. The boiler feedwater must be treated before entering the economizer section to prevent scaling.';
  const { m, text } = highlighted(PAGE, excerpt);
  // Only the first sentence is on this page; it is shorter than MIN_PARTIAL_CHARS -> refused.
  assert.ok(normalizeComparable('Boiler B-201 design temperature is 450 °C.').length < MIN_PARTIAL_CHARS);
  assert.equal(m.kind, 'none');

  const longPage = [...PAGE, 'The boiler feedwater must be treated before entering'];
  const r = highlighted(longPage, excerpt);
  assert.equal(r.m.kind, 'partial');
  assert.equal(r.m.anchor, 'start');
  assert.ok(r.m.coverage > 0.4 && r.m.coverage < 1);
  assert.deepEqual(r.text, ['Boiler B-201 design temperature is 450 °C.', 'The boiler feedwater must be treated before entering']);
  void text;
});

test('passage that began on the previous page → end-anchored partial match', () => {
  const excerpt = 'Earlier text that was printed on the previous page of the manual. Feed pump P-101A maximum discharge pressure is 15.2 bar. The pump is rated for continuous duty';
  const { m } = highlighted(PAGE, excerpt);
  assert.equal(m.kind, 'partial');
  assert.equal(m.anchor, 'end');
  assert.equal(m.ranges[0].item, 0);
});

test('segmentItem reproduces the original text exactly and lets active win over muted', () => {
  const text = 'pressure is 15.2 bar. The pump is';
  const segs = segmentItem(text, [
    { start: 0, end: 20, kind: 'muted' },
    { start: 12, end: 33, kind: 'active' },
  ]);
  assert.equal(segs.map((s) => s.text).join(''), text);
  assert.deepEqual(segs.map((s) => s.kind), ['muted', 'active']);
  assert.equal(segs[1].text, '15.2 bar. The pump is');
  assert.deepEqual(segmentItem('abc', []), [{ text: 'abc', kind: null }]);
});

test('character ranges are scale-independent; text-layer CSS vars track the render scale', () => {
  const at1 = highlighted(PAGE, 'maximum discharge pressure is 15.2 bar').m.ranges;
  const at2 = highlighted(PAGE, 'maximum discharge pressure is 15.2 bar').m.ranges;
  assert.deepEqual(at1, at2); // geometry comes from the re-rendered spans, not from cached pixels
  const v = textLayerStyleVars(1.85);
  assert.equal(v['--total-scale-factor'], '1.85');
  assert.equal(v['--scale-factor'], '1.85');
  assert.equal(v['--scale-round-x'], '1px');
});
