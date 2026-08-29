import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dealArt } from '../src/level.js';
import { mulberry32 } from '../src/rng.js';
import {
  ANCHOR,
  applySwap,
  blankBoard,
  copyBoard,
  createRecorder,
  gain,
  PULSE,
  PUSH_LEFT,
  randomBoard,
  settle,
  SINK,
  swapPairs,
} from '../src/board.js';
import {
  buildTimeline, collapseStep, sampleTimeline, staticFrame, swapDurationFor,
} from '../src/animate.js';

const RULES = { width: 5, height: 8, colors: 6, adjacentOnly: false };
const TIMING = { swapMsPerCell: 55, swapMinMs: 110, stepMs: 200 };
// Most of these build their timeline from a self-swap, whose travel is nothing, so
// the swap beat lands on its floor.
const FLOOR = TIMING.swapMinMs;
const SPIN = { turns: 1 };
const rand = mulberry32(20260825);

// Backgrounds are all color 5 and no cell holds a piece, so only what a test puts
// on the board can ever match.
function bareBoard() {
  const b = blankBoard(RULES);
  for (let r = 0; r < b.height; r++) {
    for (let c = 0; c < b.width; c++) b.bg[r][c] = 5;
  }
  return b;
}

function place(b, r, c, { glyph, kind = '', art = 'pulse' }) {
  b.glyph[r][c] = glyph;
  b.kind[r][c] = kind;
  b.art[r][c] = art;
}

test('a piece shoved twice in one step is one move, not two', () => {
  const step = {
    snapshot: (() => {
      const b = bareBoard();
      place(b, 0, 0, { glyph: 1 });
      return b;
    })(),
    events: [
      { type: 'move', from: [0, 0], to: [0, 1] },
      { type: 'move', from: [0, 1], to: [0, 2] },
    ],
  };
  const { fates } = collapseStep(step);
  assert.equal(fates.length, 1);
  assert.deepEqual(fates[0], { origin: [0, 0], end: [0, 2], kind: 'moved' });
});

test('a piece that travels and is then eaten falls into whatever ate it', () => {
  const b = bareBoard();
  place(b, 0, 0, { glyph: 1 });
  const { fates } = collapseStep({
    snapshot: b,
    events: [
      { type: 'move', from: [0, 0], to: [0, 1] },
      { type: 'eat', at: [0, 1], into: [0, 2] },
    ],
  });
  assert.deepEqual(fates, [{ origin: [0, 0], end: [0, 2], kind: 'eaten' }]);
});

test('a cell reported dead twice only dies once', () => {
  const b = bareBoard();
  place(b, 2, 2, { glyph: 1, kind: SINK });
  const { deadCells } = collapseStep({
    snapshot: b,
    events: [
      { type: 'kill', at: [2, 2] },
      { type: 'kill', at: [2, 2] },
    ],
  });
  assert.deepEqual(deadCells, [[2, 2]]);
});

test('every piece on the board gets exactly one fate', () => {
  const b = bareBoard();
  for (let c = 0; c < 4; c++) place(b, 0, c, { glyph: c });
  place(b, 0, 0, { glyph: 0, kind: ANCHOR });
  place(b, 0, 3, { glyph: 3, kind: PULSE });
  b.bg[0][3] = 3;
  const recorder = createRecorder();
  settle(b, rand, recorder);
  const step = recorder.steps[0];
  const { fates } = collapseStep(step);
  const pieces = step.snapshot.glyph.flat().filter((g) => g !== null).length;
  assert.equal(fates.length, pieces);
  const origins = new Set(fates.map((f) => String(f.origin)));
  assert.equal(origins.size, pieces, 'two fates claimed the same piece');
});

test('a line shoved into an anchor is one eaten piece, one mover, one dying cell', () => {
  const b = bareBoard();
  for (let i = 0; i < 4; i++) {
    b.bg[0][i] = 4;
    place(b, 0, i, { glyph: i });
  }
  b.kind[0][0] = ANCHOR;
  b.kind[0][3] = PULSE;
  b.bg[0][3] = 3;
  b.glyph[0][3] = 3;
  const recorder = createRecorder();
  settle(b, rand, recorder);
  const { fates, deadCells } = collapseStep(recorder.steps[0]);
  const by = (kind) => fates.filter((f) => f.kind === kind);
  assert.deepEqual(by('eaten').map((f) => f.origin), [[0, 1]], 'B is eaten');
  assert.deepEqual(by('moved').map((f) => [f.origin, f.end]), [[[0, 2], [0, 1]]], 'C advances');
  assert.deepEqual(deadCells, [[0, 3]], "D's own cell is destroyed");
  assert.deepEqual(by('held').map((f) => f.origin), [[0, 0]], 'A the eater stays put');
});

test('a timeline runs the swap and then one phase per resolution step', () => {
  const b = bareBoard();
  for (let i = 0; i < 4; i++) {
    b.bg[1][i] = 4;
    place(b, 1, i, { glyph: i });
  }
  b.bg[1][3] = 0;
  b.glyph[1][3] = 3;
  // The pulse is the piece that gets swapped up onto its own colour, so it is the
  // one that fires.
  place(b, 2, 3, { glyph: 0, kind: PULSE });
  const before = structuredClone(b);
  const recorder = createRecorder();
  applySwap(b, [1, 3], [2, 3], rand, recorder);
  const timeline = buildTimeline({ before, swap: [[1, 3], [2, 3]], recorder, timing: TIMING });
  assert.equal(timeline.phases.length, 1 + recorder.steps.length);
  assert.equal(timeline.totalMs, FLOOR + recorder.steps.length * TIMING.stepMs);
});

test('the swap phase carries the two pieces to each other', () => {
  const b = bareBoard();
  place(b, 0, 0, { glyph: 1, art: 'pulse' });
  place(b, 7, 4, { glyph: 2, art: 'anchor' });
  const timeline = buildTimeline({
    before: b,
    swap: [[0, 0], [7, 4]],
    recorder: { steps: [] },
    timing: TIMING,
  });
  const span = swapDurationFor([0, 0], [7, 4], TIMING);
  const start = sampleTimeline(timeline, 0, SPIN);
  const mid = sampleTimeline(timeline, span / 2, SPIN);
  const pulseStart = start.sprites.find((s) => s.art === 'pulse');
  const pulseMid = mid.sprites.find((s) => s.art === 'pulse');
  assert.deepEqual([pulseStart.x, pulseStart.y], [0, 0]);
  assert.deepEqual([pulseMid.x, pulseMid.y], [2, 3.5], 'halfway across the board');
});

test('a dying cell shrinks to nothing over its phase', () => {
  const b = bareBoard();
  b.bg[3][2] = 1;
  place(b, 3, 2, { glyph: 1 });
  const recorder = createRecorder();
  settle(b, rand, recorder);
  const timeline = buildTimeline({
    before: b,
    swap: [[3, 2], [3, 2]],
    recorder,
    timing: TIMING,
  });
  const at = (t) => sampleTimeline(timeline, FLOOR + t, SPIN);
  const tileAt = (t) => at(t).tiles.find((tile) => Math.round(tile.x) === 2 && tile.y === 3);
  assert.ok(Math.abs(tileAt(0).scale - 1) < 1e-9, 'starts full size');
  assert.ok(Math.abs(tileAt(TIMING.stepMs / 2).scale - 0.5) < 1e-9, 'half way, half size');
  assert.equal(sampleTimeline(timeline, timeline.totalMs, SPIN), null, 'then it is over');
});

test('a dying cell turns as it collapses and an ordinary one does not', () => {
  const b = bareBoard();
  b.bg[3][2] = 1;
  place(b, 3, 2, { glyph: 1 });
  place(b, 0, 0, { glyph: 2 });
  const recorder = createRecorder();
  settle(b, rand, recorder);
  const timeline = buildTimeline({ before: b, swap: [[3, 2], [3, 2]], recorder, timing: TIMING });
  // A quarter of the way through the shrink is a quarter of the way round.
  const frame = sampleTimeline(timeline, FLOOR + TIMING.stepMs / 4, SPIN);
  const dying = frame.tiles.filter((t) => t.scale < 1);
  assert.equal(dying.length, 1, 'exactly one cell is being destroyed');
  assert.ok(Math.abs(dying[0].spin - SPIN.turns * Math.PI / 2) < 1e-9, 'a quarter turn in');
  assert.equal(dying[0].x, 2, 'and it stays on its own column while it turns');
  for (const tile of frame.tiles.filter((t) => t.scale === 1)) {
    assert.equal(tile.spin, 0, 'a cell that is not dying does not turn');
  }
});

test('a static frame is every live cell and every piece, at rest', () => {
  const b = bareBoard();
  place(b, 0, 0, { glyph: 1 });
  place(b, 4, 4, { glyph: 2 });
  b.alive[7][4] = false;
  const frame = staticFrame(b);
  assert.equal(frame.tiles.length, RULES.width * RULES.height - 1);
  assert.equal(frame.sprites.length, 2);
  assert.ok(frame.sprites.every((s) => s.scale === 1));
  assert.ok(frame.tiles.every((t) => t.scale === 1));
});

test('a timeline is spent once its phases are', () => {
  const b = bareBoard();
  place(b, 0, 0, { glyph: 1 });
  const timeline = buildTimeline({
    before: b,
    swap: [[0, 0], [0, 1]],
    recorder: { steps: [] },
    timing: TIMING,
  });
  assert.ok(sampleTimeline(timeline, FLOOR - 1, SPIN));
  assert.equal(sampleTimeline(timeline, FLOOR, SPIN), null);
});

// --- the timing knobs -------------------------------------------------------

/** A pusher at [0,3] on its own colour, with a run of pieces to its left. */
function shoveBoard() {
  const b = bareBoard();
  for (let i = 0; i < 4; i++) {
    b.bg[0][i] = 4;
    place(b, 0, i, { glyph: i });
  }
  b.kind[0][3] = PULSE;
  b.bg[0][3] = 3;
  b.glyph[0][3] = 3;
  return b;
}

const timelineFor = (timing) => {
  const b = shoveBoard();
  const before = structuredClone(b);
  const recorder = createRecorder();
  settle(b, rand, recorder);
  return buildTimeline({ before, swap: [[0, 0], [0, 0]], recorder, timing });
};

test('a hold adds still time after each phase without moving anything', () => {
  const plain = timelineFor(TIMING);
  const held = timelineFor({ ...TIMING, holdMs: 100 });
  assert.equal(held.phases.length, plain.phases.length);
  assert.equal(held.totalMs, plain.totalMs + 100 * plain.phases.length);
  // Through the hold the frame is whatever the phase ended on.
  const atEnd = sampleTimeline(held, FLOOR, SPIN);
  const inHold = sampleTimeline(held, FLOOR + 60, SPIN);
  assert.deepEqual(inHold, atEnd, 'nothing moves during a hold');
});

test('stagger delays pieces by how far they sit from what fired', () => {
  const staggered = timelineFor({ ...TIMING, staggerMs: 40 });
  const step = staggered.phases[1];
  const byOrigin = new Map(step.sprites.map((s) => [String(s.from), s.delay]));
  // [0,3] fired, so its neighbour waits nothing and the far end waits longest.
  assert.equal(byOrigin.get('0,2'), 0);
  assert.ok(byOrigin.get('0,0') > byOrigin.get('0,1'), 'the far piece starts last');
});

test('a staggered phase runs until its slowest piece is done', () => {
  const plain = timelineFor(TIMING);
  const staggered = timelineFor({ ...TIMING, staggerMs: 40 });
  assert.ok(staggered.totalMs > plain.totalMs, 'the wave takes longer than the block');
});

test('a staggered piece has not started while its delay is still running', () => {
  const staggered = timelineFor({ ...TIMING, staggerMs: 60 });
  const step = staggered.phases[1];
  const late = step.sprites.find((s) => s.delay > 0 && String(s.from) !== String(s.to));
  assert.ok(late, 'something is delayed and moving');
  const frame = sampleTimeline(staggered, FLOOR + late.delay / 2, SPIN);
  const drawn = frame.sprites.find((s) => s.art === late.art && Math.abs(s.y - late.from[0]) < 1e-9);
  assert.ok(drawn, 'it is still sitting where it started');
});

test('split beats move first and destroy second', () => {
  const joined = timelineFor(TIMING);
  const split = timelineFor({ ...TIMING, splitBeats: true });
  assert.equal(split.phases.length, 1 + (joined.phases.length - 1) * 2);
  const [, moveBeat, deathBeat] = split.phases;
  assert.ok(moveBeat.sprites.every((s) => s.scaleTo === 1), 'nothing shrinks while things move');
  assert.ok(moveBeat.tiles.every((t) => !t.dying), 'no cell dies on the movement beat');
  assert.ok(deathBeat.sprites.some((s) => s.scaleTo === 0), 'the second beat is where things go');
  assert.ok(deathBeat.tiles.some((t) => t.dying), 'and where the cell goes');
  assert.ok(deathBeat.sprites.every((s) => String(s.from) === String(s.to)),
    'the death beat starts from where the movement beat left off');
});

test('the knobs are no-ops at zero, so the timeline is what it always was', () => {
  const bare = timelineFor({ ...TIMING });
  const zeroed = timelineFor({ ...TIMING, holdMs: 0, staggerMs: 0, splitBeats: false });
  assert.equal(zeroed.totalMs, bare.totalMs);
  assert.deepEqual(zeroed.phases.map((p) => p.tweenMs), bare.phases.map((p) => p.tweenMs));
});

test('data/animation.json carries every knob the timeline reads', async () => {
  const { readFileSync } = await import('node:fs');
  const anim = JSON.parse(readFileSync(new URL('../data/animation.json', import.meta.url), 'utf8'));
  for (const key of ['swapMsPerCell', 'swapMinMs', 'stepMs', 'shrinkMs', 'holdMs', 'staggerMs']) {
    assert.equal(typeof anim[key], 'number', `animation is missing "${key}"`);
    assert.ok(anim[key] >= 0);
  }
  assert.equal(typeof anim.splitBeats, 'boolean');
  assert.equal(typeof anim.spin.turns, 'number');
});

test('shrink runs on its own clock, not the movement clock', () => {
  const slowShrink = timelineFor({ ...TIMING, shrinkMs: 600 });
  const fastShrink = timelineFor({ ...TIMING, shrinkMs: 80 });
  assert.ok(slowShrink.totalMs > fastShrink.totalMs, 'a longer shrink is a longer timeline');

  // Halfway through a 600ms shrink the piece is half gone, while a piece that only
  // travels has finished its 200ms move long before.
  const step = slowShrink.phases[1];
  const frame = sampleTimeline(slowShrink, FLOOR + 300, SPIN);
  const dying = frame.sprites.filter((s) => s.scale > 0 && s.scale < 1);
  assert.ok(dying.length, 'something is mid-shrink');
  assert.ok(dying.every((s) => Math.abs(s.scale - 0.5) < 0.05), 'and it is about half gone');
  assert.equal(step.tweenMs, 600);
});

test('a phase lasts as long as the clocks its pieces actually use', () => {
  // Nothing moves in this one: a lone glyph on its own colour, so the step is a
  // shrink and nothing else.
  const b = bareBoard();
  b.bg[3][2] = 1;
  place(b, 3, 2, { glyph: 1 });
  const recorder = createRecorder();
  settle(b, rand, recorder);
  const timeline = buildTimeline({
    before: b, swap: [[3, 2], [3, 2]], recorder, timing: { ...TIMING, shrinkMs: 90 },
  });
  assert.equal(timeline.phases[0].tweenMs, FLOOR, 'the swap beat still holds');
  assert.equal(timeline.phases[1].tweenMs, 90, 'the step is only as long as its shrink');
});

test('a delayed piece takes as long to travel as an undelayed one', () => {
  const staggered = timelineFor({ ...TIMING, staggerMs: 50 });
  const movers = staggered.phases[1].sprites.filter(
    (s) => s.from[0] !== s.to[0] || s.from[1] !== s.to[1],
  );
  assert.ok(movers.length > 1);
  assert.ok(movers.every((s) => s.moveMs === TIMING.stepMs),
    'a wave is pieces starting at different times, not moving at different speeds');
});

test("a sink's direct neighbours travel into it as they go", () => {
  const b = bareBoard();
  for (const [r, c] of [[1, 2], [2, 2], [4, 2], [5, 2], [3, 1], [3, 3]]) {
    place(b, r, c, { glyph: 1 });
  }
  b.bg[3][2] = 0;
  place(b, 3, 2, { glyph: 0, kind: SINK, art: 'sink' });
  const recorder = createRecorder();
  settle(b, rand, recorder);
  const { fates } = collapseStep(recorder.steps[0]);
  const eaten = fates.filter((f) => f.kind === 'eaten');
  assert.equal(eaten.length, 4, 'all four direct neighbours are eaten');
  for (const fate of eaten) {
    assert.deepEqual(fate.end, [3, 2], 'and each one ends up in the sink, not where it stood');
    assert.notDeepEqual(fate.origin, fate.end, 'so it has somewhere to travel');
  }
});

test('a piece shoved off the board travels off the edge rather than vanishing', () => {
  const b = bareBoard();
  for (let c = 0; c < 3; c++) place(b, 0, c, { glyph: c });
  b.bg[0][2] = 2;
  b.kind[0][2] = PULSE;
  const recorder = createRecorder();
  settle(b, rand, recorder);
  const { fates } = collapseStep(recorder.steps[0]);
  const off = fates.find((f) => f.kind === 'eaten');
  assert.ok(off, 'the front of the line went off the edge');
  assert.equal(off.end[1], -1, 'and it heads off the board to do it');
});

test('a piece eaten by an anchor travels into the anchor', () => {
  const b = bareBoard();
  place(b, 0, 0, { glyph: 0, kind: ANCHOR, art: 'anchor' });
  place(b, 0, 1, { glyph: 1 });
  place(b, 0, 2, { glyph: 2 });
  b.bg[0][3] = 3;
  place(b, 0, 3, { glyph: 3, kind: PUSH_LEFT, art: 'push-left' });
  const recorder = createRecorder();
  settle(b, rand, recorder);
  const { fates } = collapseStep(recorder.steps[0]);
  const eaten = fates.find((f) => f.kind === 'eaten');
  assert.deepEqual(eaten.origin, [0, 1]);
  assert.deepEqual(eaten.end, [0, 0], 'it slides into the eater that took it');
});

// --- a swap is a speed ------------------------------------------------------

test('a swap takes longer the further the pieces travel', () => {
  const near = swapDurationFor([0, 0], [0, 3], TIMING);
  const far = swapDurationFor([0, 0], [7, 4], TIMING);
  assert.ok(far > near, 'crossing the board is not the same as crossing three cells');
  // Above the floor, the time per cell is the same wherever the swap is.
  const speed = (a, z) => swapDurationFor(a, z, TIMING) / Math.hypot(a[0] - z[0], a[1] - z[1]);
  assert.ok(Math.abs(speed([0, 0], [0, 3]) - speed([0, 0], [7, 4])) < 1e-9,
    'the pieces move at one speed, not one duration');
});

test('a short swap is floored so it can still be seen', () => {
  const neighbour = swapDurationFor([3, 2], [3, 3], TIMING);
  assert.equal(neighbour, TIMING.swapMinMs, 'one cell would be over in a few frames');
  // The floor stops mattering once the distance is worth more than it.
  const reach = TIMING.swapMinMs / TIMING.swapMsPerCell;
  assert.ok(swapDurationFor([0, 0], [0, Math.ceil(reach) + 1], TIMING) > TIMING.swapMinMs);
});

test('the swap phase lasts exactly as long as its swap', () => {
  const b = bareBoard();
  place(b, 0, 0, { glyph: 1 });
  place(b, 7, 4, { glyph: 2, art: 'wall' });
  for (const pair of [[[0, 0], [7, 4]], [[0, 0], [0, 1]]]) {
    const timeline = buildTimeline({
      before: b, swap: pair, recorder: { steps: [] }, timing: TIMING,
    });
    assert.equal(timeline.phases[0].tweenMs, swapDurationFor(pair[0], pair[1], TIMING));
    assert.equal(timeline.totalMs, swapDurationFor(pair[0], pair[1], TIMING));
  }
});

test('a swap with no speed set fails loudly rather than guessing one', () => {
  assert.throws(() => swapDurationFor([0, 0], [1, 1], { stepMs: 200 }), /swapMsPerCell/);
});

// The rules resolve a whole cascade before any of it is drawn, so a counter reading the
// board directly shows the final total — and "won" — while the pieces that won it are
// still in the air. Every phase carries how much has actually landed by the end of it.
test('a timeline says how much has cleared by each phase, not by the end', () => {
  const rules = { width: 5, height: 8, colors: 4, adjacentOnly: false };
  const glyphs = JSON.parse(
    readFileSync(new URL('../data/glyphs.json', import.meta.url), 'utf8'),
  ).glyphs;
  const timing = JSON.parse(
    readFileSync(new URL('../data/animation.json', import.meta.url), 'utf8'),
  );

  // find a swap that actually chains, so there is something to lag behind
  const rand = mulberry32(708);
  const board = randomBoard(rules, { pulse: 0.25, anchor: 0.125 }, rand);
  dealArt(board, glyphs, rand);
  const pairs = swapPairs(rules);
  let found = null;
  for (const [a, z] of pairs) {
    if (!gain(board, a, z)) continue;
    const probe = copyBoard(board);
    const rec = createRecorder();
    const { activated, steps } = applySwap(probe, a, z, mulberry32(9), rec);
    if (steps >= 3) { found = { a, z, activated, rec }; break; }
  }
  assert.ok(found, 'no chaining swap on the test board');

  const timeline = buildTimeline({
    before: board, swap: [found.a, found.z], recorder: found.rec, timing,
  });
  const counts = timeline.phases.map((p) => p.cleared);
  assert.equal(counts[0], 0, 'the swap itself has cleared nothing');
  assert.equal(counts.at(-1), found.activated, 'and the last phase has cleared it all');
  for (let i = 1; i < counts.length; i++) {
    assert.ok(counts[i] >= counts[i - 1], `the count went backwards at phase ${i}`);
  }
  assert.ok(counts.some((c) => c > 0 && c < found.activated),
    'the count should pass through the middle rather than jump');

  // and the sampler hands it on, so the HUD can read it
  assert.equal(sampleTimeline(timeline, 0, timing.spin).cleared, 0);
});
