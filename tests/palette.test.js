import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paletteNames, resolvePalette } from '../src/palette.js';

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
    assert.equal(p.colors.length, resolvePalette(PACK).colors.length,
      `${id} has a different number of colours to the default`);
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
