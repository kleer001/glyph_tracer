// Levels — the shipped run, and where the player is in it.
//
// The pack is data (`data/levels.json`, generated from the run in
// docs/teaching.html). This module turns it into something the game can play and the
// picker can draw, and checks at the boundary that the pack says what it must.

import { randomBoard } from './board.js';
import { mulberry32 } from './rng.js';
import { dealArt } from './level.js';

/**
 * Validate a pack and flatten it into a playable run.
 * @returns {{budget: number, acts: Array, levels: Array}} `levels` is every level in
 *   order, each carrying the act it belongs to.
 */
export function loadRun(pack) {
  if (!Array.isArray(pack?.acts) || !pack.acts.length) {
    throw new Error('a level pack needs acts'); // boundary
  }
  if (!Number.isInteger(pack.budget) || pack.budget < 1) {
    throw new Error('a level pack needs a swap budget'); // boundary
  }
  const levels = [];
  for (const act of pack.acts) {
    for (const level of act.levels) {
      for (const field of ['id', 'width', 'height', 'colors', 'target', 'seed']) {
        if (!Number.isInteger(level[field])) {
          throw new Error(`level ${level.id}: "${field}" must be a whole number`); // boundary
        }
      }
      if (level.target > 0 === false) throw new Error(`level ${level.id}: target must be positive`);
      if (level.target > level.width * level.height) {
        // A target no board of this size can reach ships an unwinnable level.
        throw new Error(
          `level ${level.id}: target ${level.target} exceeds its ${level.width}x${level.height} board`,
        ); // boundary
      }
      levels.push({ ...level, act });
    }
  }
  levels.sort((a, z) => a.id - z.id);
  levels.forEach((level, i) => {
    if (level.id !== i + 1) throw new Error(`the run skips or repeats level ${i + 1}`); // boundary
  });
  return { budget: pack.budget, acts: pack.acts, levels };
}

/**
 * Deal one level of the run. The seed makes the board the same every time it is
 * opened, so a level is a puzzle rather than a fresh roll.
 */
export function dealLevel(spec, { rules, glyphs, budget }) {
  const rand = mulberry32(spec.seed);
  // The run opens on a smaller board than it ends on, so the size is the level's to
  // state rather than the rules' to fix.
  const board = randomBoard(
    { ...rules, width: spec.width, height: spec.height, colors: spec.colors },
    spec.act.mix,
    rand,
  );
  dealArt(board, glyphs, rand);
  return {
    spec,
    board,
    rand,
    budget,
    target: spec.target,
    swapsUsed: 0,
    cleared: 0,
  };
}

/** Whether the level is finished, and how. */
export function outcome(level) {
  if (level.cleared >= level.target) return 'won';
  if (level.swapsUsed >= level.budget) return 'lost';
  return 'playing';
}

/** The level after this one, or null at the end of the run. */
export function nextAfter(run, id) {
  return run.levels.find((level) => level.id === id + 1) ?? null;
}
