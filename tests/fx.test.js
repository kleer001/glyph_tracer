import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PUSH_STEPS, WAVES, beamPoints, beamSpan, headingFor, pulseAt, rgba, shadeHex, swellAt,
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

test('a band is brightest where it sits and dies away either side', () => {
  assert.equal(pulseAt(0.5, null), 0, 'no band, no brightness');
  assert.ok(Math.abs(pulseAt(0.5, 0.5) - 1) < 1e-9, 'full at its centre');
  assert.ok(pulseAt(0.5, 0.5) > pulseAt(0.7, 0.5), 'and dimmer away from it');
  assert.ok(pulseAt(0.7, 0.5, 0.4) > pulseAt(0.7, 0.5, 0.15), 'a wider band reaches further');
});

test('shading dims toward black and lifts toward white', () => {
  assert.equal(shadeHex('#808080', 1, 0), 'rgb(128,128,128)');
  assert.equal(shadeHex('#808080', 0.5, 0), 'rgb(64,64,64)', 'dimmed');
  assert.equal(shadeHex('#000000', 1, 1), 'rgb(255,255,255)', 'lifted all the way');
});

test('every wave leaves the root alone and only the shaped ones move at all', () => {
  // The root pin lives in beamPoints, but a wave still has to be finite everywhere.
  for (const [name, wave] of Object.entries(WAVES)) {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      assert.ok(Number.isFinite(wave(f, 1.2, 3)), `${name} at ${f}`);
      assert.ok(Math.abs(wave(f, 1.2, 3)) <= 2, `${name} stays in range at ${f}`);
    }
  }
  assert.equal(WAVES.none(0.5, 1, 1), 0, 'a straight beam does not wander');
});

test('a sampled beam runs root to tip and tapers on the way', () => {
  // Sampling is dense enough here that the continuity floor never binds, so the taper
  // is the plain lerp from root to tip.
  const pts = beamPoints({ x: 0, y: 0, tipX: 100, tipY: 0, baseR: 10, tipR: 2 });
  assert.deepEqual([pts[0].x, pts[0].y], [0, 0], 'starts at the root');
  assert.ok(Math.abs(pts.at(-1).x - 100) < 1e-9, 'and ends at the tip');
  assert.ok(Math.abs(pts[0].r - 10) < 1e-9, 'full width at the root');
  assert.ok(Math.abs(pts.at(-1).r - 2) < 1e-9, 'narrow at the tip');
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].r < pts[i - 1].r, 'narrowing all the way');
});

test('the continuity floor blunts a tip rather than letting the shaft bead', () => {
  // Ten samples over 100px is a 10px step, so a 2px tip would leave gaps. The floor
  // lifts the far discs to meet each other and the taper flattens out instead.
  const pts = beamPoints({ x: 0, y: 0, tipX: 100, tipY: 0, baseR: 10, tipR: 2, samples: 10 });
  assert.equal(pts.length, 11, 'inclusive of both ends');
  assert.ok(pts.at(-1).r > 2, 'the tip is blunter than asked');
  for (let i = 1; i < pts.length; i++) {
    assert.ok(pts[i].r <= pts[i - 1].r + 1e-9, 'and never widens on the way out');
  }
});

test('the wave pins the root and moves the rest', () => {
  const waved = beamPoints({
    x: 0, y: 0, tipX: 100, tipY: 0, baseR: 6, tipR: 6, samples: 12,
    wave: 'snake', waveAmp: 20, time: 0.3, seed: 1,
  });
  assert.ok(Math.abs(waved[0].y) < 1e-9, 'the root stays welded to the cell');
  assert.ok(waved.slice(1).some((p) => Math.abs(p.y) > 1), 'and the shaft leaves the straight line');
  const straight = beamPoints({
    x: 0, y: 0, tipX: 100, tipY: 0, baseR: 6, tipR: 6, samples: 12, wave: 'none', waveAmp: 20,
  });
  assert.ok(straight.every((p) => Math.abs(p.y) < 1e-9), 'and no wave means no wander');
});

test('a shaft that has barely extended barely waves', () => {
  const opts = { x: 0, y: 0, tipX: 100, tipY: 0, baseR: 6, tipR: 6, samples: 12,
    wave: 'whip', waveAmp: 20, time: 0.4, seed: 2 };
  const early = beamPoints({ ...opts, spread: 0.1 });
  const full = beamPoints({ ...opts, spread: 1 });
  const swing = (pts) => Math.max(...pts.map((p) => Math.abs(p.y)));
  assert.ok(swing(early) < swing(full), 'the wave fades in as the beam extends');
});

test('a long thin beam is sampled densely enough that its discs still overlap', () => {
  // A dotted line is the failure this guards: step further than a radius and the shaft
  // comes apart into beads.
  const cases = [
    { len: 400, baseR: 10, tipR: 2 },
    { len: 40, baseR: 20, tipR: 20 },
    { len: 900, baseR: 4, tipR: 4 },
  ];
  for (const { len, baseR, tipR } of cases) {
    const pts = beamPoints({ x: 0, y: 0, tipX: len, tipY: 0, baseR, tipR });
    for (let i = 1; i < pts.length; i++) {
      const gap = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      const narrowest = Math.min(pts[i].r, pts[i - 1].r);
      assert.ok(gap <= narrowest * 1.5,
        `len ${len}: discs ${gap.toFixed(1)}px apart but only ${narrowest.toFixed(1)}px wide`);
    }
  }
});

test('an explicit sample count still wins, for a caller that wants a coarse shaft', () => {
  const pts = beamPoints({ x: 0, y: 0, tipX: 400, tipY: 0, baseR: 10, tipR: 2, samples: 6 });
  assert.equal(pts.length, 7);
});
