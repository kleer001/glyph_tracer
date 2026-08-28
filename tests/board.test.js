import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/rng.js';
import { dealArt } from '../src/level.js';
import {
  ANCHOR,
  applySwap,
  blankBoard,
  fire,
  formatBoard,
  gain,
  matches,
  parseBoard,
  PLAIN,
  PULSE,
  PUSH_DOWN,
  PUSH_LEFT,
  PUSH_RIGHT,
  PUSH_UP,
  randomBoard,
  remaining,
  resolve,
  ROTATE,
  ROTATE_REV,
  settle,
  SINK,
  SWAP_DIAG,
  SWAP_ORTH,
  swapPairs,
} from '../src/board.js';

const GLYPHS = JSON.parse(
  readFileSync(new URL('../data/glyphs.json', import.meta.url), 'utf8'),
).glyphs;
const RULES = { width: 5, height: 8, colors: 6, adjacentOnly: false };
const rand = mulberry32(20260825);

// A board where every background is color 5 and no cell holds a glyph, so only the
// glyphs a test places itself can ever match.
function bareBoard() {
  const b = blankBoard(RULES);
  for (let r = 0; r < b.height; r++) {
    for (let c = 0; c < b.width; c++) b.bg[r][c] = 5;
  }
  return b;
}

// One row as text: 'x' a dead cell, '.' a live empty one, a letter for each glyph.
function row(b, y = 0, n = b.width) {
  let out = '';
  for (let c = 0; c < n; c++) {
    out += !b.alive[y][c] ? 'x' : b.glyph[y][c] === null ? '.' : 'ABCDE'[b.glyph[y][c]];
  }
  return out;
}

// The cell every ability test fires from, with room on all sides for a piece to be
// moved one further out. Neighbours are listed clockwise from north.
const MID = [3, 2];
const RING = [[2, 2], [3, 3], [4, 2], [3, 1]];
const CORNERS = [[2, 1], [2, 3], [4, 3], [4, 1]];
const [N, E, S, W] = RING;

/** Stand a distinguishable piece on each of the given cells. */
function pieces(b, cells) {
  cells.forEach(([r, c], i) => {
    b.glyph[r][c] = i;
    b.art[r][c] = `p${i}`;
  });
}

/** The glyph on each of the given cells, in the order they were given. */
const read = (b, cells) => cells.map(([r, c]) => b.glyph[r][c]);

/** Everything a turn carries, for the cells it carries it between. */
const carried = (b, cells) =>
  cells.map(([r, c]) => [b.glyph[r][c], b.kind[r][c], b.art[r][c]]);

const fireMid = (b, log = null) => fire(b, MID[0], MID[1], null, log);

test('a shove line ending on an eater loses its front glyph and advances the rest', () => {
  const b = bareBoard();
  for (let i = 0; i < 4; i++) {
    b.bg[0][i] = 4;
    b.glyph[0][i] = i;
  }
  b.kind[0][0] = ANCHOR;
  b.kind[0][3] = PULSE;
  b.bg[0][3] = 3;
  b.glyph[0][3] = 3; // D is on its own color, so it activates and pulses
  assert.equal(row(b, 0, 4), 'ABCD');
  settle(b, rand);
  assert.equal(row(b, 0, 4), 'AC.x');
});

test('a sink pulls its arms inward and eats the glyph nearest the centre', () => {
  const b = bareBoard();
  for (let c = 0; c < 5; c++) b.glyph[0][c] = c;
  b.kind[0][2] = SINK;
  b.bg[0][2] = 2;
  b.glyph[0][2] = 2;
  assert.equal(row(b), 'ABCDE');
  settle(b, rand);
  assert.equal(row(b), '.AxE.');
});

test('a pulse shoves all four lines outward by one', () => {
  const b = bareBoard();
  pieces(b, RING);
  b.kind[3][2] = PULSE;
  fireMid(b);
  assert.deepEqual(read(b, RING), [null, null, null, null]);
  assert.deepEqual(read(b, [[1, 2], [3, 4], [5, 2], [3, 0]]), [0, 1, 2, 3]);
});

test('each directional push shoves only the line it names', () => {
  const cases = [
    [PUSH_UP, [1, 2], 0, [null, 1, 2, 3]],
    [PUSH_RIGHT, [3, 4], 1, [0, null, 2, 3]],
    [PUSH_DOWN, [5, 2], 2, [0, 1, null, 3]],
    [PUSH_LEFT, [3, 0], 3, [0, 1, 2, null]],
  ];
  for (const [kind, [tr, tc], glyph, ring] of cases) {
    const b = bareBoard();
    pieces(b, RING);
    b.kind[3][2] = kind;
    fireMid(b);
    assert.equal(b.glyph[tr][tc], glyph, `${kind} did not land its piece`);
    assert.deepEqual(read(b, RING), ring, `${kind} moved a line it does not name`);
  }
});

test('swapOrth exchanges upper with lower and left with right', () => {
  const b = bareBoard();
  pieces(b, RING);
  b.kind[3][2] = SWAP_ORTH;
  fireMid(b);
  assert.deepEqual(read(b, RING), [2, 3, 0, 1]);
  assert.equal(b.art[N[0]][N[1]], 'p2', 'the drawing travels with the piece');
});

test('swapDiag exchanges both corner pairs', () => {
  const b = bareBoard();
  pieces(b, CORNERS);
  b.kind[3][2] = SWAP_DIAG;
  fireMid(b);
  assert.deepEqual(read(b, CORNERS), [2, 3, 0, 1]);
});

test('an exchange pair with a dead cell stays put while the other pair acts', () => {
  const b = bareBoard();
  pieces(b, RING);
  b.glyph[N[0]][N[1]] = null;
  b.alive[N[0]][N[1]] = false;
  b.kind[3][2] = SWAP_ORTH;
  fireMid(b);
  assert.deepEqual(read(b, RING), [null, 3, 2, 1]);
});

test('swapOrth twice and swapDiag twice leave the board as they found it', () => {
  for (const [kind, cells] of [[SWAP_ORTH, RING], [SWAP_DIAG, CORNERS]]) {
    const b = bareBoard();
    pieces(b, cells);
    b.kind[3][2] = kind;
    const before = JSON.stringify(b);
    fireMid(b);
    assert.notEqual(JSON.stringify(b), before, `${kind} exchanged nothing to undo`);
    fireMid(b);
    assert.equal(JSON.stringify(b), before);
  }
});

test('rotate carries each neighbour one place clockwise', () => {
  const b = bareBoard();
  pieces(b, RING);
  b.kind[3][2] = ROTATE;
  fireMid(b);
  assert.deepEqual(read(b, RING), [3, 0, 1, 2], 'north went east, and west took north');
});

test('rotateRev carries each neighbour one place anticlockwise', () => {
  const b = bareBoard();
  pieces(b, RING);
  b.kind[3][2] = ROTATE_REV;
  fireMid(b);
  assert.deepEqual(read(b, RING), [1, 2, 3, 0], 'north went west, and east took north');
});

test('rotate and rotateRev undo each other', () => {
  const b = bareBoard();
  pieces(b, RING);
  b.kind[3][2] = ROTATE;
  const before = carried(b, RING);
  fireMid(b);
  assert.notDeepEqual(carried(b, RING), before, 'the turn moved nothing to undo');
  b.kind[3][2] = ROTATE_REV;
  fireMid(b);
  assert.deepEqual(carried(b, RING), before, 'every layer came back');
});

test('an anchor and a plain glyph move nothing when they fire', () => {
  for (const kind of [ANCHOR, PLAIN]) {
    const b = bareBoard();
    pieces(b, RING);
    b.kind[3][2] = kind;
    const before = JSON.stringify(b);
    fireMid(b);
    assert.equal(JSON.stringify(b), before, `${kind || 'plain'} moved something`);
  }
});

test('an exchange logs its two cells and a turn logs where each piece landed', () => {
  const swapped = { events: [] };
  const bs = bareBoard();
  pieces(bs, RING);
  bs.kind[3][2] = SWAP_ORTH;
  fireMid(bs, swapped);
  assert.deepEqual(swapped.events.filter((e) => e.type === 'exchange'), [
    { type: 'exchange', a: N, z: S },
    { type: 'exchange', a: W, z: E },
  ]);

  const turned = { events: [] };
  const bt = bareBoard();
  pieces(bt, RING);
  bt.kind[3][2] = ROTATE;
  fireMid(bt, turned);
  assert.deepEqual(
    turned.events.filter((e) => e.type === 'turn').map((e) => e.to),
    [N, E, S, W],
  );
});

test('a fresh board opens with nothing matched', () => {
  for (let seed = 0; seed < 50; seed++) {
    const b = randomBoard(RULES, { [ANCHOR]: 0.125, [PULSE]: 0.5 }, mulberry32(seed));
    assert.deepEqual(matches(b), [], `seed ${seed} spawned a glyph on its own color`);
  }
});

test('an activated cell is gone from the board', () => {
  const b = bareBoard();
  b.bg[3][2] = 1;
  b.glyph[3][2] = 1;
  const before = remaining(b);
  const { activated } = settle(b, rand);
  assert.equal(activated, 1);
  assert.equal(remaining(b), before - 1);
});

test('resolve reads a swap without changing the board', () => {
  const b = randomBoard(RULES, { [PULSE]: 0.5 }, mulberry32(7));
  const snapshot = JSON.stringify(b);
  for (const [a, z] of swapPairs(RULES)) resolve(b, a, z, rand);
  assert.equal(JSON.stringify(b), snapshot);
});

test('a swap that shows nothing activates nothing', () => {
  const b = randomBoard(RULES, { [PULSE]: 0.5 }, mulberry32(11));
  for (const [a, z] of swapPairs(RULES)) {
    if (gain(b, a, z) === 0) assert.equal(resolve(b, a, z, rand).activated, 0);
  }
});

test('the swap rule decides how many swaps a board offers', () => {
  assert.equal(swapPairs({ ...RULES, adjacentOnly: true }).length, 4 * 8 + 5 * 7);
  assert.equal(swapPairs({ ...RULES, adjacentOnly: false }).length, (40 * 39) / 2);
  assert.throws(() => swapPairs({ width: 5, height: 8 }), /adjacentOnly/);
});

test('applySwap moves the board it is handed', () => {
  const b = randomBoard(RULES, { [PULSE]: 0.5 }, mulberry32(3));
  const [a, z] = swapPairs(RULES).find((p) => gain(b, ...p) > 0);
  const before = remaining(b);
  const { activated } = applySwap(b, a, z, rand);
  assert.ok(activated > 0);
  assert.ok(remaining(b) < before);
});

test('a piece swapped into an empty live cell can still land on its own color', () => {
  const b = bareBoard();
  b.glyph[0][0] = 3;
  b.art[0][0] = 'pulse';
  b.bg[0][1] = 3; // [0,1] is live and empty, and its ground is that piece's colour
  assert.equal(gain(b, [0, 0], [0, 1]), 1, 'the solver has to be able to see this move');
  const { activated } = applySwap(b, [0, 0], [0, 1], rand);
  assert.equal(activated, 1);
  assert.equal(b.alive[0][1], false);
});

test('a swap between two empty cells shows nothing', () => {
  const b = bareBoard();
  assert.equal(gain(b, [0, 0], [0, 1]), 0);
});

test('a dead cell is never a legal half of a swap', () => {
  const b = bareBoard();
  b.glyph[0][0] = 5;
  b.art[0][0] = 'pulse';
  b.alive[0][1] = false;
  assert.equal(gain(b, [0, 0], [0, 1]), 0);
});

// --- writing a board down ---------------------------------------------------

// Round-tripping is the guarantee the format exists to make: a board a tool generated
// can be written out, pasted into a level, and read back as the same board.
test('a board survives being written out and read back', () => {
  const b = randomBoard(RULES, { pulse: 0.25, anchor: 0.125, sink: 0.125, rotate: 0.125 }, mulberry32(11));
  dealArt(b, GLYPHS, mulberry32(11));
  const back = parseBoard(formatBoard(b, GLYPHS), GLYPHS, { adjacentOnly: RULES.adjacentOnly });
  for (const layer of ['alive', 'bg', 'glyph', 'kind', 'art']) {
    assert.deepEqual(back[layer], b[layer], layer);
  }
});

test('a written board carries dead cells and empty ones', () => {
  const rows = ['aB. ... cA^', 'b-- eCO dBS'];
  const b = parseBoard(rows, GLYPHS);
  assert.equal(b.alive[0][1], false);
  assert.equal(b.alive[1][0], true);
  assert.equal(b.glyph[1][0], null, 'a live cell with nothing standing on it');
  assert.deepEqual(formatBoard(b, GLYPHS), rows);
});

test('the palette and the size come from the grid', () => {
  const b = parseBoard(['aB. bA.', 'aB. bA.', 'aB. bA.'], GLYPHS);
  assert.equal(b.width, 2);
  assert.equal(b.height, 3);
  assert.equal(b.colors, 2, 'only a and b are used');
});

test('a cell the format cannot mean fails loudly', () => {
  assert.throws(() => parseBoard(['aB. bA'], GLYPHS), /is not three characters/);
  assert.throws(() => parseBoard(['aB. 9A.'], GLYPHS), /"9" is not a ground colour/);
  assert.throws(() => parseBoard(['aB. b9.'], GLYPHS), /"9" is not a glyph colour/);
  assert.throws(() => parseBoard(['aB. bA9'], GLYPHS), /"9" is no glyph's mark/);
  assert.throws(() => parseBoard([], GLYPHS), /needs rows/);
});

test('every glyph has a mark of its own', () => {
  const marks = GLYPHS.map((g) => g.mark);
  assert.equal(new Set(marks).size, GLYPHS.length, 'two glyphs share a mark');
  for (const m of marks) assert.equal(m.length, 1, `"${m}" is not one character`);
});
