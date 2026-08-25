import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import {
  BLOCK,
  PUSH,
  VOID,
  WILD,
  WILD_SETS,
  applySwap,
  blankBoard,
  gain,
  matches,
  randomBoard,
  remaining,
  resolve,
  settle,
  swapPairs,
} from '../src/board.js';

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

test('a shove line ending on an eater loses its front glyph and advances the rest', () => {
  const b = bareBoard();
  for (let i = 0; i < 4; i++) {
    b.bg[0][i] = 4;
    b.glyph[0][i] = i;
  }
  b.kind[0][0] = BLOCK;
  b.kind[0][3] = PUSH;
  b.bg[0][3] = 3;
  b.glyph[0][3] = 3; // D is on its own color, so it activates and pushes left
  assert.equal(row(b, 0, 4), 'ABCD');
  settle(b, rand);
  assert.equal(row(b, 0, 4), 'AC.x');
});

test('a void pulls its arms inward and eats the glyph nearest the centre', () => {
  const b = bareBoard();
  for (let c = 0; c < 5; c++) b.glyph[0][c] = c;
  b.kind[0][2] = VOID;
  b.bg[0][2] = 2;
  b.glyph[0][2] = 2;
  assert.equal(row(b), 'ABCDE');
  settle(b, rand);
  assert.equal(row(b), '.AxE.');
});

test('a wild fires a random subset of its four directions', () => {
  const seen = new Set();
  for (let seed = 0; seed < 400; seed++) {
    const b = bareBoard();
    for (let c = 0; c < 5; c++) b.glyph[1][c] = c;
    b.kind[1][2] = WILD;
    b.bg[1][2] = 2;
    b.glyph[1][2] = 2;
    settle(b, mulberry32(seed));
    seen.add(row(b, 1));
  }
  assert.ok(seen.size > 1, 'a wild that always did the same thing would not be wild');
  assert.equal(WILD_SETS.length, 16);
});

test('a fresh board opens with nothing matched', () => {
  for (let seed = 0; seed < 50; seed++) {
    const b = randomBoard(RULES, { [BLOCK]: 0.125, [PUSH]: 0.5 }, mulberry32(seed));
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
  const b = randomBoard(RULES, { [PUSH]: 0.5 }, mulberry32(7));
  const snapshot = JSON.stringify(b);
  for (const [a, z] of swapPairs(RULES)) resolve(b, a, z, rand);
  assert.equal(JSON.stringify(b), snapshot);
});

test('a swap that shows nothing activates nothing', () => {
  const b = randomBoard(RULES, { [PUSH]: 0.5 }, mulberry32(11));
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
  const b = randomBoard(RULES, { [PUSH]: 0.5 }, mulberry32(3));
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
