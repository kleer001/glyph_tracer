import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTHORED, CELL, GEOMETRY_KEYS, glyphDrawing, keylineUnits } from '../src/glyphShapes.js';

const GEOM = JSON.parse(readFileSync(new URL('../data/geometry.json', import.meta.url), 'utf8'));
const GLYPHS = JSON.parse(readFileSync(new URL('../data/glyphs.json', import.meta.url), 'utf8')).glyphs;

test('every glyph in the pack yields something drawable', () => {
  for (const g of GLYPHS) {
    const d = glyphDrawing(g, GEOM);
    assert.ok(['text', 'bars', 'dot'].includes(d.kind), `${g.id} drew as ${d.kind}`);
    if (d.kind === 'text') assert.equal(typeof d.letter, 'string');
    if (d.kind === 'bars') assert.equal(d.rects.length, 2);
    if (d.kind === 'dot') assert.ok(d.circle.r > 0);
  }
});

test('the two authored glyphs are the ones with no letter behind them', () => {
  const authored = GLYPHS.filter((g) => AUTHORED[g.letter]).map((g) => g.letter).sort();
  assert.deepEqual(authored, ['+', '.']);
});

test('a turn and a mirror are handed back rather than applied', () => {
  const turned = glyphDrawing({ letter: 'A', rot: 90 }, GEOM);
  assert.equal(turned.rot, 90);
  assert.equal(turned.flip, false);
  const mirrored = glyphDrawing({ letter: 'R', flip: true }, GEOM);
  assert.equal(mirrored.rot, 0);
  assert.equal(mirrored.flip, true);
});

test('a glyph with no letter fails loudly', () => {
  assert.throws(() => glyphDrawing({ id: 'broken', letter: '' }, GEOM));
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
