import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PUSH_STEPS, beamSpan, ghostAt, grabAt, headingFor, rgba, swellAt,
} from '../src/fx.js';

test('a push heading points the way the rules send the piece', () => {
  // The canvas y axis runs down, so a heading of -PI/2 is up the screen and up the board.
  const cases = [
    ['pushUp', -Math.PI / 2],
    ['pushRight', 0],
    ['pushDown', Math.PI / 2],
    ['pushLeft', Math.PI],
  ];
  for (const [kind, want] of cases) {
    assert.ok(Math.abs(headingFor(kind) - want) < 1e-9, `${kind} points at ${want}`);
  }
  // and the heading agrees with the step the rules actually take
  for (const [kind, [dr, dc]] of Object.entries(PUSH_STEPS)) {
    const a = headingFor(kind);
    assert.ok(Math.abs(Math.round(Math.sin(a)) - dr) < 1e-9, `${kind} row`);
    assert.ok(Math.abs(Math.round(Math.cos(a)) - dc) < 1e-9, `${kind} column`);
  }
});

test('an ability with no direction has no heading', () => {
  assert.equal(headingFor('pulse'), null);
  assert.equal(headingFor(''), null);
});

test('the beam envelope is nothing at both ends and most in the middle', () => {
  assert.equal(swellAt(0), 0);
  assert.equal(swellAt(1), 0);
  assert.equal(swellAt(-0.2), 0, 'before it fires');
  assert.equal(swellAt(1.4), 0, 'after it is spent');
  assert.ok(Math.abs(swellAt(0.5) - 1) < 1e-9, 'full at the halfway point');
  assert.ok(swellAt(0.25) < swellAt(0.5), 'still swelling');
  assert.ok(swellAt(0.75) < swellAt(0.5), 'already fading');
});

test('a sharper envelope peaks at the same moment but leaves sooner', () => {
  const soft = swellAt(0.2, 1);
  const sharp = swellAt(0.2, 3);
  assert.ok(sharp < soft, 'a higher power is dimmer away from the peak');
  assert.ok(Math.abs(swellAt(0.5, 3) - 1) < 1e-9, 'and still full at the peak');
});

test('one envelope drives the width and the opacity together', () => {
  // The beam reads as a travelling thing because these never come apart. Two curves
  // would be two things happening at once; one curve is a beam.
  for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const env = swellAt(t);
    const width = 16 * env + 1;
    assert.ok(Math.abs((width - 1) / 16 - env) < 1e-9, `they agree at ${t}`);
  }
});

test('a beam with no chase grows from its origin and keeps its root', () => {
  const early = beamSpan(0.25, 3);
  const late = beamSpan(1, 3);
  assert.equal(early.from, 0, 'the root stays put');
  assert.ok(early.to > 0 && early.to < 3, 'the tip is on its way');
  assert.equal(late.to, 3, 'and arrives at the reach it was given');
});

test('a beam that chases pulls its root along behind the tip', () => {
  const mid = beamSpan(0.9, 3, 0.5);
  assert.ok(mid.from > 0, 'the root has left the origin');
  assert.ok(mid.from < mid.to, 'and is still behind the tip');
  const done = beamSpan(1, 3, 0.5);
  assert.ok(Math.abs(done.from - done.to) < 1e-9, 'by the end the beam has closed up');
});

test('rgba clamps rather than emitting a colour canvas would reject', () => {
  assert.equal(rgba('#F33122', 0.5), 'rgba(243,49,34,0.5)');
  assert.equal(rgba('#000000', -1), 'rgba(0,0,0,0)');
  assert.equal(rgba('#FFFFFF', 9), 'rgba(255,255,255,1)');
});

test('a ghost starts as the piece and ends bigger and gone', () => {
  const start = ghostAt(0);
  assert.equal(start.scale, 1, 'the same size as the glyph it came from');
  assert.equal(start.alpha, 1, 'and fully there, so it reads as the piece');
  const end = ghostAt(1, 0.5);
  assert.ok(Math.abs(end.scale - 1.5) < 1e-9, 'half again as big');
  assert.equal(end.alpha, 0, 'and completely gone, leaving no smear');
});

test('a ghost grows and fades together, and clamps outside its life', () => {
  const mid = ghostAt(0.5, 0.5);
  assert.ok(Math.abs(mid.scale - 1.25) < 1e-9);
  assert.ok(Math.abs(mid.alpha - 0.5) < 1e-9);
  assert.deepEqual(ghostAt(-1), ghostAt(0), 'before it starts');
  assert.deepEqual(ghostAt(2), ghostAt(1), 'after it is spent');
});

test('a smaller grow makes a smaller ghost without changing the fade', () => {
  const quarter = ghostAt(1, 0.25);
  assert.ok(Math.abs(quarter.scale - 1.25) < 1e-9, 'a quarter bigger');
  assert.equal(quarter.alpha, 0, 'gone all the same');
});

test('a grab reaches out first and holds on after', () => {
  const from = { x: 0, y: 0 };
  const target = { x: 100, y: 0 };
  const early = grabAt(25, 100, from, target);
  assert.ok(Math.abs(early.x - 25) < 1e-9, 'a quarter of the way out');
  assert.equal(early.holding, false, 'and not yet attached');
  const landed = grabAt(100, 100, from, target);
  assert.ok(Math.abs(landed.x - 100) < 1e-9, 'arrived');
  assert.equal(landed.holding, true);
});

test('once it has hold, the tip is wherever the piece has got to', () => {
  const from = { x: 0, y: 0 };
  // the piece it grabbed is being pulled inward by the rules
  const pulled = grabAt(400, 100, from, { x: 30, y: 0 });
  assert.ok(Math.abs(pulled.x - 30) < 1e-9, 'the beam came in with it');
  assert.equal(pulled.holding, true);
});

test('a beam with no reach is already holding on the frame it fires', () => {
  const now = grabAt(0, 0, { x: 0, y: 0 }, { x: 80, y: 0 });
  assert.ok(Math.abs(now.x - 80) < 1e-9);
  assert.equal(now.holding, true);
});
