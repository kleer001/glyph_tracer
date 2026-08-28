// Levels — the shipped run, and where the player is in it.
//
// The pack is data (`data/levels.json`). This module turns it into something the game
// can play and the picker can draw, and checks at the boundary that the pack says what
// it must.
//
// A level either *carries* a board or *deals* one. A carried board is written out as
// text — see `parseBoard` — and is exactly the board the player gets. A dealt board is
// a size, a palette and a seed, and the act's `mix` says how much of it has an ability;
// `tools/makeLevels.js` picks the seed by playing candidates until one clears the
// target, so no dealt level ships unwinnable.

import { parseBoard, randomBoard } from './board.js';
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
      const authored = level.board !== undefined;
      const required = authored ? ['id', 'target'] : ['id', 'width', 'height', 'colors', 'target', 'seed'];
      for (const field of required) {
        if (!Number.isInteger(level[field])) {
          throw new Error(`level ${level.id}: "${field}" must be a whole number`); // boundary
        }
      }
      if (level.target > 0 === false) throw new Error(`level ${level.id}: target must be positive`);
      // The grammar of a cell is `parseBoard`'s to check; the size is this pack's,
      // because a target no board of that size can reach ships an unwinnable level.
      const [width, height] = authored ? boardSize(level) : [level.width, level.height];
      if (level.target > width * height) {
        throw new Error(
          `level ${level.id}: target ${level.target} exceeds its ${width}x${height} board`,
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

/** How wide and tall an authored board is, read off the grid it is written on. */
function boardSize(level) {
  if (!Array.isArray(level.board) || !level.board.length) {
    throw new Error(`level ${level.id}: "board" must be rows of cells`); // boundary
  }
  const cells = level.board.map((row) => String(row).trim().split(/\s+/).length);
  if (new Set(cells).size !== 1) {
    throw new Error(`level ${level.id}: its rows are ${cells.join(', ')} cells wide`); // boundary
  }
  return [cells[0], level.board.length];
}

/**
 * Open one level of the run: the board it carries, or the board its seed deals. Either
 * way the same level opens the same way every time, so it is a puzzle rather than a
 * fresh roll.
 */
export function dealLevel(spec, { rules, glyphs, budget }) {
  // A swap still draws from a seeded stream to break ties, so an authored level needs
  // one too; its own number serves, since it never deals anything.
  const rand = mulberry32(spec.seed ?? spec.id);
  const board = spec.board
    ? parseBoard(spec.board, glyphs, { adjacentOnly: rules.adjacentOnly })
    : dealBoard(spec, rules, glyphs, rand);
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

/** A board from a size, a palette and a seed. The act's mix says what is on it. */
function dealBoard(spec, rules, glyphs, rand) {
  // The run opens on a smaller board than it ends on, so the size is the level's to
  // state rather than the rules' to fix.
  const board = randomBoard(
    { ...rules, width: spec.width, height: spec.height, colors: spec.colors },
    spec.act.mix,
    rand,
  );
  dealArt(board, glyphs, rand);
  return board;
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
