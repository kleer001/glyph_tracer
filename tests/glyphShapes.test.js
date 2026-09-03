import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTHORED, CELL, GEOMETRY_KEYS, glyphDrawing, keylineUnits } from '../src/glyphShapes.js';
import { WELL_KEYS } from '../src/render.js';

const GEOM = JSON.parse(readFileSync(new URL('../data/geometry.json', import.meta.url), 'utf8'));
const GLYPHS = JSON.parse(readFileSync(new URL('../data/glyphs.json', import.meta.url), 'utf8')).glyphs;
const PATHS = JSON.parse(readFileSync(new URL('../data/glyphPaths.json', import.meta.url), 'utf8')).paths;

test('every glyph in the pack yields something drawable', () => {
  for (const g of GLYPHS) {
    const d = glyphDrawing(g, GEOM, PATHS);
    assert.ok(['path', 'bars', 'dot'].includes(d.kind), `${g.id} drew as ${d.kind}`);
    if (d.kind === 'path') assert.ok(d.d.length > 0, `${g.id} has an empty path`);
    if (d.kind === 'bars') assert.ok(d.rects.length === 1 || d.rects.length === 2);
    if (d.kind === 'dot') assert.ok(d.circle.r > 0);
  }
});

test('the authored glyphs are the ones with no letter behind them', () => {
  const authored = new Set(GLYPHS.filter((g) => AUTHORED[g.letter]).map((g) => g.letter));
  assert.deepEqual([...authored].sort(), ['+', '.', '|']);
});

// The swap family is compositional: the cross does what the bar and the turned bar do
// between them, and it is drawn as exactly those two rects. If that stops being true
// the drawing has started lying about the rules.
test('the cross is the bar and the bar turned, drawn at once', () => {
  const bar = glyphDrawing({ letter: '|', rot: 0 }, GEOM, PATHS);
  const turned = glyphDrawing({ letter: '|', rot: 90 }, GEOM, PATHS);
  const cross = glyphDrawing({ letter: '+' }, GEOM, PATHS);
  assert.equal(bar.rects.length, 1);
  assert.equal(cross.rects.length, 2);
  assert.deepEqual(cross.rects[0], bar.rects[0], 'the upright arm is the bar');

  // A turn is handed to the caller rather than applied, so the turned bar is the same
  // rect wearing a rotation -- which is why the cross has to carry both arms itself.
  assert.deepEqual(turned.rects[0], bar.rects[0]);
  assert.equal(turned.rot, 90);

  // The second arm is the first with its sides exchanged, on the same centre. Not a
  // literal transpose: the cap-height offset is an optical drop and stays vertical for
  // both arms, or the flat arm would sit off to one side.
  const mid = (r) => [r.x + r.w / 2, r.y + r.h / 2];
  assert.deepEqual(mid(cross.rects[1]), mid(cross.rects[0]), 'both arms on one centre');
  assert.equal(cross.rects[1].w, cross.rects[0].h);
  assert.equal(cross.rects[1].h, cross.rects[0].w);
});

test('a bar on a diagonal spans the same box corner to corner', () => {
  const upright = glyphDrawing({ letter: '|', rot: 0 }, GEOM, PATHS).rects[0];
  const rising = glyphDrawing({ letter: '|', rot: 45 }, GEOM, PATHS).rects[0];
  assert.ok(Math.abs(rising.h - upright.h * Math.SQRT2) < 1e-9,
    'a diagonal bar shorter than this reads shorter than the cross it composes with');
  assert.equal(rising.w, upright.w, 'and no thicker');
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
  // The well is the board's tray, not a knob on one cell, so it is its own group. The
  // list comes from the renderer rather than being retyped here, or the constant that
  // exists to stop drift is the thing that drifts.
  for (const key of WELL_KEYS) {
    assert.equal(typeof gloss.well[key], 'number', `gloss.well is missing "${key}"`);
    assert.ok(gloss.well[key] >= 0, `well.${key} is negative`);
  }
  for (const key of ['tintA', 'shadowA', 'divotA']) {
    assert.ok(gloss.well[key] <= 100, `well.${key} is a percentage and must not exceed 100`);
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
