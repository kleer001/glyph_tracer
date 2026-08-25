import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL, FORMS, MARKS, RADIUS, fillClips, markGeometry, outline } from '../src/glyphShapes.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

test('a form has as many vertices as it has sides', () => {
  for (const [form, spec] of Object.entries(FORMS)) {
    const shape = outline(form);
    if (spec.sides === null) assert.equal(shape.kind, 'circle');
    else assert.equal(shape.points.length, spec.sides);
  }
});

test('every vertex sits on the inscribing circle', () => {
  for (const form of Object.keys(FORMS)) {
    const shape = outline(form, 37);
    if (shape.kind === 'circle') continue;
    for (const [x, y] of shape.points) near(Math.hypot(x - 50, y - 50), RADIUS);
  }
});

test('a triangle points up at rotation 0, and its apex follows rotation', () => {
  const apex = (rot) => outline('triangle', rot).points[0];
  near(apex(0)[0], 50);
  assert.ok(apex(0)[1] < 50, 'apex is above centre');
  assert.ok(apex(90)[0] > 50, 'rotated 90, the apex points right');
  assert.ok(apex(180)[1] > 50, 'rotated 180, the apex points down');
});

test('a square rests on flat sides and a diamond stands on its vertices', () => {
  const square = outline('square').points;
  const diamond = outline('diamond').points;
  assert.ok(square.every(([x, y]) => Math.abs(Math.abs(x - 50) - Math.abs(y - 50)) < 1e-9));
  assert.equal(diamond.filter(([x]) => Math.abs(x - 50) < 1e-9).length, 2);
});

test('fill state reads hollow, half, solid', () => {
  assert.equal(fillClips(1).ink, null);
  assert.equal(fillClips(2).ink.h, CELL / 2);
  assert.equal(fillClips(3).core, null);
  assert.throws(() => fillClips(0));
  assert.throws(() => fillClips(4));
});

test('every mark yields drawable primitives, and nest repeats the form', () => {
  for (const mark of MARKS) {
    const geo = markGeometry(mark, 'pentagon');
    assert.ok(geo.dots && geo.lines && geo.rings);
  }
  assert.equal(markGeometry('nest', 'pentagon').rings[0].points.length, 5);
  assert.equal(markGeometry('none', 'circle').rings.length, 0);
});

test('an unknown form or mark fails loudly', () => {
  assert.throws(() => outline('octagon'));
  assert.throws(() => markGeometry('squiggle', 'circle'));
});

test('data/gloss.json carries every knob the renderer asks for', async () => {
  const { readFileSync } = await import('node:fs');
  const gloss = JSON.parse(readFileSync(new URL('../data/gloss.json', import.meta.url), 'utf8'));
  const required = [
    'radius', 'cellShadowY', 'cellShadowBlur', 'cellShadowA',
    'sheen', 'sheenStop', 'bevel',
    'glyphShadowY', 'glyphShadowBlur', 'glyphShadowA', 'spec',
  ];
  for (const key of required) {
    assert.equal(typeof gloss[key], 'number', `gloss is missing "${key}"`);
    assert.ok(gloss[key] >= 0, `${key} is negative`);
  }
  for (const key of ['cellShadowA', 'sheen', 'sheenStop', 'bevel', 'glyphShadowA', 'spec']) {
    assert.ok(gloss[key] <= 100, `${key} is a percentage and must not exceed 100`);
  }
});
