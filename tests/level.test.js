import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/rng.js';
import { PLAIN, randomBoard, remaining, swapPairs } from '../src/board.js';
import {
  createLevel,
  dealArt,
  greedyPlay,
  measureYield,
  targetFor,
} from '../src/level.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const RULES = read('../data/rules.json');
const GLYPHS = read('../data/glyphs.json').glyphs;
const STAGES = read('../data/stages.json').stages;

test('greedy play spends its budget and drains the board', () => {
  const rand = mulberry32(4);
  const board = randomBoard(RULES, RULES.mix, rand);
  const before = remaining(board);
  const run = greedyPlay(board, RULES.swapBudget, rand);
  assert.ok(run.cleared > 0);
  assert.ok(remaining(board) < before);
  assert.ok(run.deepest >= 1);
});

test('a measured yield reproduces from its seed', () => {
  const args = { rules: RULES, mix: RULES.mix, budget: RULES.swapBudget, trials: 30, seed: 99 };
  assert.deepEqual(measureYield(args), measureYield(args));
});

test('the target is the measured mean times the stage factor', () => {
  assert.equal(targetFor(10, 0.45), 5);
  assert.equal(targetFor(9.8, 1.03), 10);
  assert.equal(targetFor(0.1, 0.35), 1, 'a target of zero would already be met');
});

test('a stage factor sits inside its documented band', () => {
  for (const s of STAGES) {
    assert.ok(s.factor >= s.band[0] && s.factor <= s.band[1], `${s.id} is outside its band`);
  }
});

test('every cell is dealt art of its own kind', () => {
  const rand = mulberry32(5);
  const board = randomBoard(RULES, RULES.mix, rand);
  dealArt(board, GLYPHS, rand);
  const byId = new Map(GLYPHS.map((g) => [g.id, g]));
  for (let r = 0; r < board.height; r++) {
    for (let c = 0; c < board.width; c++) {
      assert.equal(byId.get(board.art[r][c]).kind, board.kind[r][c]);
    }
  }
});

test('a piece keeps its drawing when it is shoved', () => {
  const rand = mulberry32(5);
  const board = randomBoard(RULES, RULES.mix, rand);
  dealArt(board, GLYPHS, rand);
  const byId = new Map(GLYPHS.map((g) => [g.id, g]));
  greedyPlay(board, RULES.swapBudget, rand);
  for (let r = 0; r < board.height; r++) {
    for (let c = 0; c < board.width; c++) {
      if (!board.alive[r][c] || board.glyph[r][c] === null) continue;
      assert.equal(byId.get(board.art[r][c]).kind, board.kind[r][c],
        `[${r},${c}] is drawn as something it does not do`);
    }
  }
});

test('exactly one glyph is inert, and it is the one drawn as a full stop', () => {
  const raw = read('../data/glyphs.json').glyphs;
  const inert = raw.filter((g) => g.kind === PLAIN);
  assert.equal(inert.length, 1);
  assert.equal(inert[0].letter, '.');
});

test('a level is reproducible and its target is reachable in the budget', () => {
  const stage = STAGES.find((s) => s.id === 'practise');
  const a = createLevel({ rules: RULES, glyphs: GLYPHS, stage, seed: 20260825, trials: 40 });
  const b = createLevel({ rules: RULES, glyphs: GLYPHS, stage, seed: 20260825, trials: 40 });
  assert.deepEqual(a.board, b.board);
  assert.equal(a.target, b.target);
  assert.ok(a.target > 0 && a.target < RULES.width * RULES.height);
  assert.equal(a.budget, RULES.swapBudget);
});

test('every kind the rules can roll has a glyph drawn for it', () => {
  const kinds = new Set([PLAIN, ...Object.keys(RULES.mix)]);
  const drawn = new Set(GLYPHS.map((g) => g.kind));
  for (const k of kinds) assert.ok(drawn.has(k), `nothing is drawn for kind "${k}"`);
});

test('no configuration in the rules produces a board with no legal swap', () => {
  for (let seed = 0; seed < 60; seed++) {
    const board = randomBoard(RULES, RULES.mix, mulberry32(seed));
    const openings = swapPairs(RULES).filter(([a, z]) => {
      const held = board.glyph[a[0]][a[1]];
      return held === board.bg[z[0]][z[1]] || board.glyph[z[0]][z[1]] === board.bg[a[0]][a[1]];
    });
    assert.ok(openings.length > 0, `seed ${seed} opened dead`);
  }
});
