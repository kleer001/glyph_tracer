import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolvePalette, uncovered } from '../src/palette.js';

const PACK = JSON.parse(readFileSync(new URL('../data/palette.json', import.meta.url), 'utf8'));

test('the shipped palette resolves to the colours the file lists, in order', () => {
  const p = resolvePalette(PACK);
  assert.deepEqual(p.colors, PACK.colors, 'a board indexes into this, so the order is the file\'s');
  assert.ok(p.colors.length >= 2);
  assert.equal(p.core, PACK.core);
  assert.equal(p.key, PACK.key);
});

// A board names its colours by index and nothing else does, so a hex that cannot be
// parsed would paint nothing rather than paint wrongly.
test('a palette that cannot be drawn from fails loudly', () => {
  const bad = structuredClone(PACK);
  bad.colors[0].hex = 'red';
  assert.throws(() => resolvePalette(bad), /not a six-digit hex colour/);

  const noCore = structuredClone(PACK);
  delete noCore.core;
  assert.throws(() => resolvePalette(noCore), /"core" is not a six-digit hex colour/);

  assert.throws(() => resolvePalette({ colors: [] }), /at least two colours/);
  assert.throws(() => resolvePalette({}), /at least two colours/);
});

test('a palette that cannot paint a level says which', () => {
  const four = { colors: [1, 2, 3, 4] };
  const levels = [{ id: 1, colors: 4 }, { id: 2, colors: 6 }, { id: 3, colors: 2 }];
  assert.deepEqual(uncovered(four, levels, (l) => l.colors), [{ id: 2, needs: 6 }]);
  assert.deepEqual(uncovered({ colors: [1, 2, 3, 4, 5, 6] }, levels, (l) => l.colors), []);
});
