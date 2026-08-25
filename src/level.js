// Level — turning rules and a seed into something playable, and measuring what it
// is worth before the player touches it.
//
// A level is `clear N cells in X swaps`. The budget is fixed at six, where the
// yield curve flattens. The target is the measured mean yield for the level's
// configuration times a stage factor, which is the whole difficulty curve.

import { PLAIN, applySwap, gain, randomBoard, remaining, swapPairs } from './board.js';
import { mulberry32 } from './rng.js';

/**
 * Play a board out greedily: each turn take the swap with the highest visible
 * payoff, breaking ties at random. This is the measuring stick, not an opponent —
 * a greedy read is exactly what the game later sets out to punish.
 *
 * Mutates the board it is handed.
 * @returns {{cleared: number, cascade: number, deepest: number, turns: Array<object>}}
 *   `turns` is the running total after each swap of the budget, so a caller can
 *   read a shorter level off a longer one: a 3-swap level is a prefix of a 6-swap
 *   one, and replaying the same seed per budget would re-simulate the same opening.
 */
export function greedyPlay(board, budget, rand, candidates = swapPairs(board)) {
  let cleared = 0;
  let deepest = 0;
  const stepsSeen = [];
  const turns = [];
  for (let turn = 0; turn < budget; turn++) {
    let best = 0;
    let choices = [];
    for (const pair of candidates) {
      const g = gain(board, pair[0], pair[1]);
      if (g > best) {
        best = g;
        choices = [pair];
      } else if (g === best && g > 0) {
        choices.push(pair);
      }
    }
    if (!choices.length) {
      turns.push({ cleared, steps: 0, left: remaining(board) }); // budget still burns
      continue;
    }
    const [a, z] = choices[Math.floor(rand() * choices.length)];
    const { activated, steps } = applySwap(board, a, z, rand);
    cleared += activated;
    stepsSeen.push(steps);
    deepest = Math.max(deepest, steps);
    turns.push({ cleared, steps, left: remaining(board) });
  }
  const cascade = stepsSeen.length
    ? stepsSeen.reduce((a, b) => a + b, 0) / stepsSeen.length
    : 0;
  return { cleared, cascade, deepest, turns };
}

/**
 * Mean greedy yield for a configuration, over freshly generated boards.
 *
 * Cascade depth is averaged over every swap of a full level rather than the
 * opening one: on a virgin board every cell is occupied, so a shove line runs
 * unbroken to the edge and is always refused. Sampling only the first swap reports
 * 1.00 by construction and says nothing about the game.
 */
export function measureYield({ rules, mix, budget, trials, seed }) {
  const candidates = swapPairs(rules);
  let cleared = 0;
  let cascade = 0;
  let deepest = 0;
  for (let i = 0; i < trials; i++) {
    const rand = mulberry32(seed + i);
    const board = randomBoard(rules, mix, rand);
    const run = greedyPlay(board, budget, rand, candidates);
    cleared += run.cleared;
    cascade += run.cascade;
    deepest += run.deepest;
  }
  return { mean: cleared / trials, cascade: cascade / trials, deepest: deepest / trials };
}

/** Round a measured mean into a level target. */
export function targetFor(mean, factor) {
  return Math.max(1, Math.round(mean * factor));
}

/**
 * Which of the sixteen each piece is drawn as, written onto the board so it travels
 * with the piece when it is shoved. The engine only knows the four kinds; every
 * glyph of a kind runs identically, so the choice is the level's to make, and it is
 * made once from the seed rather than per frame.
 */
export function dealArt(board, glyphs, rand) {
  const byKind = new Map();
  for (const g of glyphs) {
    if (!byKind.has(g.kind)) byKind.set(g.kind, []);
    byKind.get(g.kind).push(g);
  }
  for (let r = 0; r < board.height; r++) {
    for (let c = 0; c < board.width; c++) {
      const options = byKind.get(board.kind[r][c]);
      if (!options) throw new Error(`no glyph is drawn for kind "${board.kind[r][c]}"`); // boundary
      board.art[r][c] = options[Math.floor(rand() * options.length)].id;
    }
  }
}

/**
 * Build a playable level: a board, the art it wears, and a target measured from
 * the configuration it was generated under.
 */
export function createLevel({ rules, glyphs, stage, seed, trials = 120 }) {
  const { mix, swapBudget } = rules;
  const measured = measureYield({ rules, mix, budget: swapBudget, trials, seed });
  const rand = mulberry32(seed);
  const board = randomBoard(rules, mix, rand);
  dealArt(board, glyphs, rand);
  return {
    seed,
    stage: stage.id,
    board,
    budget: swapBudget,
    target: targetFor(measured.mean, stage.factor),
    measured,
    swapsUsed: 0,
    cleared: 0,
  };
}

/** Kinds the engine runs. A glyph whose effect is not implemented is plain. */
export function playableGlyphs(glyphs) {
  return glyphs.map((g) => (g.implemented === false ? { ...g, kind: PLAIN } : g));
}
