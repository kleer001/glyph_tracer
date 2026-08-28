import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paletteNames, resolvePalette, uncovered } from '../src/palette.js';

const PACK = JSON.parse(readFileSync(new URL('../data/palette.json', import.meta.url), 'utf8'));

test('the file names a default, and it resolves', () => {
  const p = resolvePalette(PACK);
  assert.equal(p.id, PACK.default);
  assert.ok(p.colors.length >= 2);
  assert.equal(p.core, PACK.core);
  assert.equal(p.key, PACK.key);
});

test('every palette the file offers can be resolved', () => {
  const names = paletteNames(PACK);
  assert.ok(names.length > 1, 'the file exists to hold more than one');
  for (const { id, name } of names) {
    const p = resolvePalette(PACK, id);
    assert.equal(p.id, id);
    assert.equal(p.name, name);
    assert.ok(p.colors.length >= 2, `${id} has too few live colours`);
    // `use` is what decides which colours a board's indices land on
    assert.equal(p.colors.length, p.use.length);
    p.use.forEach((i, n) => assert.deepEqual(p.colors[n], p.defined[i]));
  }
});

// A level names its colours by index, so two palettes of different lengths would make
// the same board a different puzzle — and a bad hex would paint nothing at all.
test('a palette that cannot be drawn from fails loudly', () => {
  assert.throws(() => resolvePalette(PACK, 'nope'), /no palette named "nope"/);
  assert.throws(() => resolvePalette({ palettes: {} }), /no palette named/);
  const bad = structuredClone(PACK);
  bad.palettes[bad.default].colors[0].hex = 'red';
  assert.throws(() => resolvePalette(bad), /not a six-digit hex colour/);
  const noCore = structuredClone(PACK);
  delete noCore.core;
  assert.throws(() => resolvePalette(noCore), /"core" is not a six-digit hex colour/);
});

// `use` is why a palette can define six colours and be played as four.
test('a palette shows only the colours its `use` names', () => {
  const pack = {
    core: '#101216',
    key: '#000000',
    default: 'x',
    palettes: {
      x: {
        name: 'X',
        colors: [
          { name: 'a', hex: '#111111' }, { name: 'b', hex: '#222222' },
          { name: 'c', hex: '#333333' }, { name: 'd', hex: '#444444' },
        ],
        use: [0, 3],
      },
    },
  };
  const p = resolvePalette(pack);
  assert.deepEqual(p.colors.map((c) => c.hex), ['#111111', '#444444']);
  assert.equal(p.defined.length, 4, 'the other two are still defined');

  const bad = (use) => ({ ...pack, palettes: { x: { ...pack.palettes.x, use } } });
  assert.throws(() => resolvePalette(bad([0, 0])), /names the same colour twice/);
  assert.throws(() => resolvePalette(bad([0, 9])), /names colour 9, which it does not have/);
  assert.throws(() => resolvePalette(bad([])), /must name which colours are live/);
});

// Narrowing `use` decides which levels can be painted at all, so it has to be checkable.
test('a palette that cannot paint a level says which', () => {
  const four = { colors: [1, 2, 3, 4] };
  const levels = [{ id: 1, colors: 4 }, { id: 2, colors: 6 }, { id: 3, colors: 2 }];
  assert.deepEqual(uncovered(four, levels, (l) => l.colors), [{ id: 2, needs: 6 }]);
  assert.deepEqual(uncovered({ colors: [1, 2, 3, 4, 5, 6] }, levels, (l) => l.colors), []);
});
