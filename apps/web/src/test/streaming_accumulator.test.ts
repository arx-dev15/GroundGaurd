import assert from 'node:assert';

function testStreamingAccumulator() {
  console.log('=== Running M4 Streaming Accumulator & Replay Tests ===');

  let accumulatedText = '';
  let maxSequence = 0;

  function applyDelta(data: { delta: string; sequence: number }) {
    if (data.sequence > maxSequence) {
      maxSequence = data.sequence;
      accumulatedText += data.delta;
    }
  }

  // 1. In-order deltas: delta 1: "Campus ", delta 2: "Monitor ", delta 3: "is..."
  applyDelta({ delta: 'Campus ', sequence: 1 });
  applyDelta({ delta: 'Monitor ', sequence: 2 });
  applyDelta({ delta: 'is...', sequence: 3 });

  assert.strictEqual(
    accumulatedText,
    'Campus Monitor is...',
    'Rendered text must match concatenated deltas'
  );

  // 2. Replay safety: Replaying past events on SSE reconnect must NOT duplicate text
  applyDelta({ delta: 'Campus ', sequence: 1 });
  applyDelta({ delta: 'Monitor ', sequence: 2 });
  applyDelta({ delta: 'is...', sequence: 3 });

  assert.strictEqual(
    accumulatedText,
    'Campus Monitor is...',
    'Replay duplicate must be ignored, preventing "Campus Campus Monitor Monitor..."'
  );

  // 3. New subsequent delta resumes normally
  applyDelta({ delta: ' active.', sequence: 4 });
  assert.strictEqual(
    accumulatedText,
    'Campus Monitor is... active.',
    'Subsequent deltas should append smoothly'
  );

  // 4. Client-side buffered stream tokenization & progressive reveal tests
  console.log('=== Running Client-Side Buffered Stream Progressive Reveal Tests ===');

  function extractNextToken(
    text: string,
    isStreaming: boolean
  ): { token: string; rest: string } | null {
    if (!text) return null;

    const wsMatch = text.match(/^(\s+)/);
    if (wsMatch && wsMatch[0].length > 0) {
      const ws = wsMatch[0];
      return { token: ws, rest: text.slice(ws.length) };
    }

    const wordMatch = text.match(/^([^\s\n]+[^\S\r\n]*)/);
    if (wordMatch && wordMatch[0].length > 0) {
      const word = wordMatch[0];
      const rest = text.slice(word.length);
      if (!/[^\S\r\n]$/.test(word) && rest.length === 0 && isStreaming) {
        return null;
      }
      return { token: word, rest };
    }

    return { token: text.slice(0, 1), rest: text.slice(1) };
  }

  // Test Case A: Large single backend chunk is broken down into progressive word tokens
  const largeChunk = 'Based on the provided documentation, GroundGuard validates each claim.';
  let buffer = largeChunk;
  const tokens: string[] = [];

  while (buffer.length > 0) {
    const res = extractNextToken(buffer, false);
    if (!res) break;
    tokens.push(res.token);
    buffer = res.rest;
  }

  assert.strictEqual(
    tokens.join(''),
    largeChunk,
    'All characters and whitespace in the large chunk must be 100% preserved'
  );
  assert.strictEqual(tokens.length, 9, 'Should extract 9 distinct progressive tokens');
  assert.strictEqual(tokens[0], 'Based ');
  assert.strictEqual(tokens[1], 'on ');
  assert.strictEqual(tokens[2], 'the ');
  assert.strictEqual(tokens[3], 'provided ');
  assert.strictEqual(tokens[4], 'documentation, ');
  assert.strictEqual(tokens[5], 'GroundGuard ');
  assert.strictEqual(tokens[6], 'validates ');
  assert.strictEqual(tokens[7], 'each ');
  assert.strictEqual(tokens[8], 'claim.');

  // Test Case B: Boundary hold on partial word while active stream
  const partialRes = extractNextToken('Docu', true);
  assert.strictEqual(partialRes, null, 'Should hold incomplete token while stream is active');

  // When next packet arrives and completes the word
  const completedRes = extractNextToken('Documentation is ready', true);
  assert.notStrictEqual(completedRes, null);
  assert.strictEqual(completedRes?.token, 'Documentation ');

  console.log('=== All Buffered Stream Progressive Reveal Tests Passed Successfully! ===');
  console.log('=== All M4 Streaming Accumulator Tests Passed Successfully! ===');
}

testStreamingAccumulator();

