import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTHORED, CELL, GEOMETRY_KEYS, glyphDrawing, keylineUnits } from '../src/glyphShapes.js';

const GEOM = JSON.parse(readFileSync(new URL('../data/geometry.json', import.meta.url), 'utf8'));
const GLYPHS = JSON.parse(readFileSync(new URL('../data/glyphs.json', import.meta.url), 'utf8')).glyphs;
const PATHS = JSON.parse(readFileSync(new URL('../data/glyphPaths.json', import.meta.url), 'utf8')).paths;

test('every glyph in the pack yields something drawable', () => {
  for (const g of GLYPHS) {
    const d = glyphDrawing(g, GEOM, PATHS);
    assert.ok(['path', 'bars', 'dot'].includes(d.kind), `${g.id} drew as ${d.kind}`);
    if (d.kind === 'path') assert.ok(d.d.length > 0, `${g.id} has an empty path`);
    if (d.kind === 'bars') assert.equal(d.rects.length, 2);
    if (d.kind === 'dot') assert.ok(d.circle.r > 0);
  }
});

test('the two authored glyphs are the ones with no letter behind them', () => {
  const authored = GLYPHS.filter((g) => AUTHORED[g.letter]).map((g) => g.letter).sort();
  assert.deepEqual(authored, ['+', '.']);
});

test('a turn and a mirror are handed back rather than applied', () => {
  const turned = glyphDrawing({ letter: 'A', rot: 90 }, GEOM, PATHS);
  assert.equal(turned.rot, 90);
  assert.equal(turned.flip, false);
  const mirrored = glyphDrawing({ letter: 'r', flip: true }, GEOM, PATHS);
  assert.equal(mirrored.rot, 0);
  assert.equal(mirrored.flip, true);
});

test('a glyph with no baked path fails loudly', () => {
  assert.throws(() => glyphDrawing({ id: 'broken', letter: 'Q' }, GEOM, PATHS));
});

test('every letter the pack uses has been baked', () => {
  const used = new Set(GLYPHS.map((g) => g.letter).filter((l) => !AUTHORED[l]));
  for (const letter of used) {
    assert.ok(PATHS[letter], `no baked path for "${letter}" — rerun tools/bakeGlyphs.py`);
  }
});

test('the keyline is the same pixel width whatever the cell size', () => {
  for (const cellPx of [34, 92, 140]) {
    const units = keylineUnits(1, cellPx);
    // half the stroke sits outside the shape, so the visible edge is half the width
    assert.ok(Math.abs((units / 2) * (cellPx / CELL) - 1) < 1e-9, `${cellPx}px cell`);
  }
});

test('data/geometry.json carries every length the renderer asks for', () => {
  for (const key of GEOMETRY_KEYS) {
    assert.equal(typeof GEOM[key], 'number', `geometry is missing "${key}"`);
  }
  assert.ok(GEOM.dotDiameter > GEOM.stem, 'the dot reads wider than a bare stem');
});

test('data/gloss.json carries every knob the renderer asks for', () => {
  const gloss = JSON.parse(readFileSync(new URL('../data/gloss.json', import.meta.url), 'utf8'));
  const required = [
    'radius', 'cellShadowY', 'cellShadowBlur', 'cellShadowA',
    'sheen', 'sheenStop', 'bevel',
    'glyphShadowY', 'glyphShadowBlur', 'glyphShadowA',
  ];
  for (const key of required) {
    assert.equal(typeof gloss[key], 'number', `gloss is missing "${key}"`);
    assert.ok(gloss[key] >= 0, `${key} is negative`);
  }
  for (const key of ['cellShadowA', 'sheen', 'sheenStop', 'bevel', 'glyphShadowA']) {
    assert.ok(gloss[key] <= 100, `${key} is a percentage and must not exceed 100`);
  }
});

test('every glyph says how it leaves, by one of the three ways there are', () => {
  const pack = JSON.parse(
    readFileSync(new URL('../data/glyphs.json', import.meta.url), 'utf8'),
  ).glyphs;
  const STYLES = new Set(['beam', 'ghost', 'grow']);
  for (const glyph of pack) {
    assert.ok(STYLES.has(glyph.exit), `${glyph.id} leaves by "${glyph.exit}"`);
  }
  // Which glyphs may say "beam" is beamStyleFor's to decide, and tests/abilityFx.test.js
  // holds the pack to it. Restating the list here would be a second copy of that rule.
});
