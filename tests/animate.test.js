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
  const frame = sampleTimeline(timeline, FLOOR + TIMING.stepMs / 2, SPIN);
  const dying = frame.tiles.filter((t) => t.scale < 1);
  assert.equal(dying.length, 1, 'exactly one cell is being destroyed');
  assert.ok(dying[0].spin > 0, 'and it has turned');
  assert.equal(dying[0].x, 2, 'while staying on its own column');
  for (const tile of frame.tiles.filter((t) => t.scale === 1)) {
    assert.equal(tile.spin, 0, 'a cell that is not dying does not turn');
  }
  assert.ok(sampleTimeline(timeline, FLOOR, SPIN).tiles.every((t) => t.spin === 0),
    'a full-size cell has no room to turn at all');
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
  // Through the hold nothing moves: every piece and every cell is where the phase
  // left it. The beat's own clock does keep running, because an effect thrown on this
  // beat may still be playing — so the comparison is of positions, not of the frame.
  const atEnd = sampleTimeline(held, FLOOR, SPIN);
  const inHold = sampleTimeline(held, FLOOR + 60, SPIN);
  assert.deepEqual(inHold.sprites, atEnd.sprites, 'no piece moves during a hold');
  assert.deepEqual(inHold.tiles, atEnd.tiles, 'no cell moves during a hold');
  assert.ok(inHold.since > atEnd.since, 'but the beat is still getting older');
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
  const zeroed = timelineFor({
    ...TIMING,
    holdMs: 0,
    staggerMs: 0,
    splitBeats: false,
    hitStopMs: 0,
    escalate: { per: 0, cap: 4 },
    easing: { move: 'linear', shrink: 'linear' },
  });
  assert.equal(zeroed.totalMs, bare.totalMs);
  assert.deepEqual(zeroed.phases.map((p) => p.tweenMs), bare.phases.map((p) => p.tweenMs));
});

// A turning square is wider than a still one, so the corners of a cell that spun too
// early would sweep over the cells beside it. The turn is held under what the shrink
// has made room for: at scale u a square may turn asin(1 / (u * sqrt 2)) - PI/4 and no
// further, which is nothing at all until it has begun to shrink.
const envelope = (scale) => {
  const room = 1 / (Math.SQRT2 * scale);
  return room > 1 ? Infinity : Math.asin(room) - Math.PI / 4;
};

/** Every cell of every frame of a timeline, held to the envelope. */
function assertInsideFootprint(timeline, spin, what) {
  for (let ms = 0; ms <= timeline.totalMs; ms += 2) {
    const frame = sampleTimeline(timeline, ms, spin);
    if (!frame) break;
    for (const tile of frame.tiles) {
      if (tile.scale >= 1) {
        assert.equal(tile.spin, 0, `${what}: a full-size cell turned at ${ms}ms`);
        continue;
      }
      assert.ok(tile.spin <= envelope(tile.scale),
        `${what}: at ${ms}ms a cell at scale ${tile.scale} turned ${tile.spin} rad`);
    }
  }
}

test('a dying cell never turns further than its own shrinking footprint allows', () => {
  for (const turns of [0.5, 1, 2, 4]) {
    const b = bareBoard();
    b.bg[3][2] = 1;
    place(b, 3, 2, { glyph: 1 });
    const recorder = createRecorder();
    settle(b, rand, recorder);
    const timeline = buildTimeline({ before: b, swap: [[3, 2], [3, 2]], recorder, timing: TIMING });
    assertInsideFootprint(timeline, { turns }, `turns ${turns}`);
  }
});

test('data/animation.json carries every knob the timeline reads', async () => {
  const { readFileSync } = await import('node:fs');
  const anim = JSON.parse(readFileSync(new URL('../data/animation.json', import.meta.url), 'utf8'));
  for (const key of ['swapMsPerCell', 'swapMinMs', 'stepMs', 'shrinkMs', 'holdMs',
    'staggerMs', 'hitStopMs']) {
    assert.equal(typeof anim[key], 'number', `animation is missing "${key}"`);
    assert.ok(anim[key] >= 0);
  }
  assert.equal(typeof anim.splitBeats, 'boolean');
  assert.equal(typeof anim.spin.turns, 'number');
  for (const key of ['move', 'shrink']) assert.equal(typeof anim.easing[key], 'string');
  assert.equal(typeof anim.escalate.per, 'number');
  assert.ok(anim.escalate.cap >= 0, 'a chain builds up to a cap, not past one');
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

// The piece and the ground it sat on come apart when a cell dies: the glyph goes
// quickly, as the ability fires, and the tile keeps turning and shrinking without it.
test('a dying glyph fades on its own clock, faster than the cell it sat on', () => {
  const b = bareBoard();
  b.bg[3][2] = 1;
  place(b, 3, 2, { glyph: 1 });
  const recorder = createRecorder();
  settle(b, rand, recorder);
  const timing = { ...TIMING, shrinkMs: 400, glyphFadeMs: 100 };
  const timeline = buildTimeline({ before: b, swap: [[3, 2], [3, 2]], recorder, timing });
  const floor = swapDurationFor([3, 2], [3, 2], timing);
  const at = (t) => sampleTimeline(timeline, floor + t, SPIN);

  const early = at(50);
  const dying = early.sprites.find((s) => s.alpha < 1);
  assert.ok(dying, 'the piece has begun to go');
  assert.ok(Math.abs(dying.alpha - 0.5) < 1e-9, 'half gone at half its fade');

  // by the time the fade is spent the piece is invisible, and the tile is still there
  const gone = at(100);
  assert.ok(gone.sprites.every((s) => s.alpha === 0 || s.alpha === 1), 'the piece is spent');
  const tile = gone.tiles.find((t) => t.scale < 1);
  assert.ok(tile, 'while its ground is still shrinking');
  assert.ok(tile.scale > 0.5, 'and has barely started');
});

test('a piece that is not dying is fully opaque', () => {
  const b = bareBoard();
  place(b, 0, 0, { glyph: 1 });
  place(b, 0, 1, { glyph: 2 });
  const timeline = buildTimeline({
    before: b, swap: [[0, 0], [0, 1]], recorder: { steps: [] }, timing: TIMING,
  });
  const frame = sampleTimeline(timeline, 1, SPIN);
  assert.ok(frame.sprites.length, 'there are pieces');
  assert.ok(frame.sprites.every((s) => s.alpha === 1), 'and none of them is going anywhere');
});

test('a phase lasts long enough for a fade slower than the shrink', () => {
  const b = bareBoard();
  b.bg[3][2] = 1;
  place(b, 3, 2, { glyph: 1 });
  const recorder = createRecorder();
  settle(b, rand, recorder);
  const quick = buildTimeline({
    before: b, swap: [[3, 2], [3, 2]], recorder, timing: { ...TIMING, shrinkMs: 200, glyphFadeMs: 60 },
  });
  const slow = buildTimeline({
    before: b, swap: [[3, 2], [3, 2]], recorder, timing: { ...TIMING, shrinkMs: 200, glyphFadeMs: 600 },
  });
  assert.ok(slow.totalMs > quick.totalMs, 'the longer fade holds the phase open');
});

// The piece leaves with the ability it fired, not a beat behind it: the fade runs on
// the movement beat, while a beam thrown from that cell is still travelling.
test('with split beats a doomed piece is already going while the shove plays', () => {
  const b = bareBoard();
  b.bg[3][2] = 1;
  place(b, 3, 2, { glyph: 1 });
  const recorder = createRecorder();
  settle(b, rand, recorder);
  const timing = { ...TIMING, splitBeats: true, shrinkMs: 400, glyphFadeMs: 100 };
  const timeline = buildTimeline({ before: b, swap: [[3, 2], [3, 2]], recorder, timing });

  const move = timeline.phases[1];
  const doomed = move.sprites.find((s) => s.fades);
  assert.ok(doomed, 'the piece is marked as going on the movement beat');

  // and by the destroying beat the fade is spent rather than restarting from full
  const destroy = timeline.phases[2];
  const spent = destroy.sprites.find((s) => s.fades);
  assert.ok(spent, 'the same piece is still listed');
  assert.equal(spent.glyphFadeMs, 1, 'but with nothing left to fade');
});

test('a piece that survives the step keeps its opacity through both beats', () => {
  const b = bareBoard();
  b.bg[0][3] = 1;
  place(b, 0, 3, { glyph: 1, kind: PUSH_LEFT });
  place(b, 0, 2, { glyph: 2 });
  place(b, 0, 1, { glyph: 3 });
  const recorder = createRecorder();
  settle(b, rand, recorder);
  const timing = { ...TIMING, splitBeats: true, glyphFadeMs: 100 };
  const timeline = buildTimeline({ before: b, swap: [[0, 3], [0, 3]], recorder, timing });
  for (const phase of timeline.phases) {
    for (const sprite of phase.sprites) {
      if (sprite.fades) continue;
      const frame = sampleTimeline(timeline, 1, SPIN);
      assert.ok(frame.sprites.every((s) => s.alpha === 1 || s.alpha < 1),
        'every piece has a defined opacity');
    }
  }
  const shoved = timeline.phases[1].sprites.filter((s) => !s.fades);
  assert.ok(shoved.length, 'the shoved run is not fading');
});

// --- the curves, the freeze and the build ------------------------------------

test('an eased tween keeps its endpoints and bends what happens between them', () => {
  const b = bareBoard();
  place(b, 0, 0, { glyph: 1, art: 'pulse' });
  place(b, 7, 4, { glyph: 2, art: 'anchor' });
  const timing = { ...TIMING, easing: { move: 'outCubic' } };
  const timeline = buildTimeline({
    before: b, swap: [[0, 0], [7, 4]], recorder: { steps: [] }, timing,
  });
  const span = swapDurationFor([0, 0], [7, 4], timing);
  const pulseAt = (t) => sampleTimeline(timeline, t, SPIN).sprites.find((s) => s.art === 'pulse');
  assert.deepEqual([pulseAt(0).x, pulseAt(0).y], [0, 0], 'it still leaves from where it was');
  const mid = pulseAt(span / 2);
  assert.ok(mid.y > 3.5, 'and at half the time it is past half the way, having set off hard');
  assert.ok(mid.y < 7, 'without having arrived early');
});

test('an easing this game does not have fails loudly rather than running linear', () => {
  const b = bareBoard();
  place(b, 0, 0, { glyph: 1 });
  const timeline = buildTimeline({
    before: b,
    swap: [[0, 0], [0, 1]],
    recorder: { steps: [] },
    timing: { ...TIMING, easing: { move: 'swoosh' } },
  });
  assert.throws(() => sampleTimeline(timeline, 1, SPIN), /swoosh/);
});

test('hit stop lengthens the beat that ends where an ability fires', () => {
  const plain = timelineFor(TIMING);
  const stopped = timelineFor({ ...TIMING, hitStopMs: 80 });
  assert.equal(stopped.phases.length, plain.phases.length, 'a longer beat, not another one');
  assert.equal(stopped.totalMs, plain.totalMs + 80, 'one activation, one freeze');
  assert.equal(stopped.phases[0].holdMs, plain.phases[0].holdMs + 80,
    'and it lands on the swap, which is the beat the piece arrived on');
});

/** A pusher that shoves a piece onto its own colour, so the chain runs two links. */
function chainBoard() {
  const b = bareBoard();
  b.bg[0][4] = 4;
  place(b, 0, 4, { glyph: 4, kind: PUSH_LEFT, art: 'push-left' });
  for (const c of [1, 2, 3]) place(b, 0, c, { glyph: 1 });
  b.bg[0][0] = 1; // where the shoved piece lands on its own colour and fires in turn
  return b;
}

const chainTimelineFor = (timing) => {
  const b = chainBoard();
  const before = structuredClone(b);
  const recorder = createRecorder();
  settle(b, rand, recorder);
  return { timeline: buildTimeline({ before, swap: [[0, 0], [0, 0]], recorder, timing }), recorder };
};

test('a chain plays louder the deeper into it a link sits', () => {
  const timing = { ...TIMING, splitBeats: true, holdMs: 100 };
  const { timeline: flat, recorder } = chainTimelineFor(timing);
  assert.equal(recorder.steps.length, 2, 'the board chains, or there is nothing to build');
  const { timeline: built } = chainTimelineFor({ ...timing, escalate: { per: 1, cap: 4 } });

  // phases: the swap, then two beats per link.
  assert.equal(built.phases[1].holdMs, 100, 'the first link plays as it always did');
  assert.equal(built.phases[3].holdMs, 200, 'the second holds twice as long');
  const dying = (t, i) => t.phases[i].tiles.find((tile) => tile.dying);
  assert.equal(dying(built, 4).shrinkMs, dying(flat, 4).shrinkMs / 2,
    'and collapses in half the time');
});

test('escalation stops at its cap rather than running away with the chain', () => {
  const timing = { ...TIMING, splitBeats: true, holdMs: 100 };
  const { timeline: flat } = chainTimelineFor(timing);
  const { timeline: capped } = chainTimelineFor({ ...timing, escalate: { per: 1, cap: 0 } });
  assert.deepEqual(capped.phases.map((p) => p.tweenMs), flat.phases.map((p) => p.tweenMs));
  assert.equal(capped.totalMs, flat.totalMs, 'a cap of nothing is no escalation at all');
});

// The turn is held under the room the shrink has made for it, and both the curve and
// the chain's build now bend that shrink. The bound is a relation between the scale and
// the angle, so it survives any curve that drives them together and any number of turns
// whose exponent is taken from those same turns — which is what this asserts.
test('the shipped curves and the chain build still hold a cell inside its footprint', () => {
  const anim = JSON.parse(readFileSync(new URL('../data/animation.json', import.meta.url), 'utf8'));
  const { timeline } = chainTimelineFor({ ...anim, escalate: { per: 3, cap: 4 } });
  assertInsideFootprint(timeline, anim.spin, 'shipped');
});
