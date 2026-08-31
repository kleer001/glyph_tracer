import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PUSH_RIGHT, blankBoard, copyBoard, createRecorder, settle } from '../src/board.js';
import { buildTimeline, sampleTimeline } from '../src/animate.js';
import { createFxLayer, createGhostLayer } from '../src/fxLayer.js';
import { resolvePalette } from '../src/palette.js';
import { mulberry32 } from '../src/rng.js';
import { boardLayout, VIEW } from '../src/render.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const ANIM = read('../data/animation.json');
const PALETTE = resolvePalette(read('../data/palette.json'));
const GLYPHS = read('../data/glyphs.json').glyphs;
const GLOSS = read('../data/gloss.json');
const GEOMETRY = read('../data/geometry.json');
const PATHS = read('../data/glyphPaths.json').paths;
const byId = new Map(GLYPHS.map((g) => [g.id, g]));

/** A canvas that draws nothing and remembers what it was asked to do. */
function recorder() {
  const calls = [];
  const noop = (name) => (...args) => calls.push({ name, args });
  return new Proxy({ calls, canvas: { width: 400, height: 400 } }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient') {
        return () => ({ addColorStop() {} });
      }
      return noop(String(prop));
    },
    set() { return true; },
  });
}

/** A push at (2,1) with a piece in front of it, landed on its own colour. */
function pushBoard() {
  const b = blankBoard({ width: 5, height: 5, colors: 4, adjacentOnly: false });
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      b.bg[r][c] = 0;
      b.glyph[r][c] = 1;
      b.kind[r][c] = '';
      b.art[r][c] = 'inert';
    }
  }
  b.kind[2][1] = PUSH_RIGHT;
  b.art[2][1] = 'push-right';
  b.glyph[2][1] = b.bg[2][1]; // it has landed, so it fires
  return b;
}

function played(board, at) {
  const before = copyBoard(board);
  const rec = createRecorder();
  settle(board, mulberry32(9), rec);
  return { before, timeline: buildTimeline({ before, swap: [at, at], recorder: rec, timing: ANIM }) };
}

const frameAt = (timeline, before, ms) => ({
  ...sampleTimeline(timeline, ms, ANIM.spin),
  width: 400,
  height: 400,
  layout: boardLayout(before, 400, 400, { ...VIEW, hudHeight: 0 }),
  palette: PALETTE,
  gloss: GLOSS,
  geometry: GEOMETRY,
  glyphPaths: PATHS,
  glyphsById: byId,
  animation: ANIM,
});

test('the frame the game builds carries what fired, and when', () => {
  const board = pushBoard();
  const { before, timeline } = played(board, [2, 1]);
  const opening = timeline.phases[0];
  const firing = frameAt(timeline, before, opening.tweenMs + opening.holdMs + 10);
  assert.equal(firing.fires.length, 1, 'one glyph fired on this beat');
  assert.equal(firing.fires[0].kind, PUSH_RIGHT);
  assert.deepEqual(firing.fires[0].at, [2, 1]);
  assert.ok(firing.board, 'and the board it fired on came with it');
  assert.ok(firing.since >= 0, 'along with how long ago');
});

test('nothing has fired during the opening beat', () => {
  const board = pushBoard();
  const { before, timeline } = played(board, [2, 1]);
  assert.deepEqual(frameAt(timeline, before, 1).fires, [], 'the swap itself throws nothing');
});

test('the fx layer strokes a beam for a push that fired', () => {
  const board = pushBoard();
  const { before, timeline } = played(board, [2, 1]);
  const opening = timeline.phases[0];
  const ctx = recorder();
  createFxLayer().draw(ctx, frameAt(timeline, before, opening.tweenMs + opening.holdMs + 60));
  const strokes = ctx.calls.filter((c) => c.name === 'stroke').length;
  assert.ok(strokes >= 2, `a beam is a stroke over a keyline, so at least two; got ${strokes}`);
  assert.ok(ctx.calls.some((c) => c.name === 'clip'), 'and it is clipped to the board');
});

test('the fx layer draws nothing before the beam starts or after it is spent', () => {
  const board = pushBoard();
  const { before, timeline } = played(board, [2, 1]);
  for (const ms of [1, timeline.totalMs + 500]) {
    const ctx = recorder();
    const frame = sampleTimeline(timeline, ms, ANIM.spin);
    if (!frame) continue; // spent timelines stop sampling, which is its own answer
    createFxLayer().draw(ctx, frameAt(timeline, before, ms));
    assert.equal(ctx.calls.filter((c) => c.name === 'stroke').length, 0, `nothing at ${ms}ms`);
  }
});

test('a piece with no ability leaves a ghost instead of a beam', () => {
  const b = blankBoard({ width: 3, height: 3, colors: 4, adjacentOnly: false });
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      b.bg[r][c] = 0;
      b.glyph[r][c] = 1;
      b.kind[r][c] = '';
      b.art[r][c] = 'inert';
    }
  }
  b.glyph[1][1] = b.bg[1][1];
  const { before, timeline } = played(b, [1, 1]);
  const opening = timeline.phases[0];
  const frame = frameAt(timeline, before, opening.tweenMs + opening.holdMs + 40);

  const beams = recorder();
  createFxLayer().draw(beams, frame);
  assert.equal(beams.calls.filter((c) => c.name === 'stroke').length, 0, 'an inert piece throws nothing');

  const ghosts = recorder();
  createGhostLayer().draw(ghosts, frame);
  assert.ok(ghosts.calls.some((c) => c.name === 'scale'), 'but it does swell out of its cell');
});
