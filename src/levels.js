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

import { matches, parseBoard, randomBoard } from './board.js';
import { mulberry32 } from './rng.js';
import { dealArt } from './level.js';

/**
 * Validate a pack and flatten it into a playable run.
 *
 * Every authored board is parsed here rather than when its level is opened, because a
 * mistyped cell twenty levels in is a mistake the author should hear about now and not
 * one the player should find. What this cannot promise is that a level is winnable —
 * that costs a full resolve of every swap, so it lives in `tools/makeLevels.js`.
 *
 * @param {object} pack - data/levels.json.
 * @param {Array<object>} glyphs - the pack from data/glyphs.json.
 * @returns {{budget: number, acts: Array, levels: Array}} `levels` is every level in
 *   order, each carrying the act it belongs to.
 */
export function loadRun(pack, glyphs) {
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
      // A teaching level wants one swap and a hard stop; a full board wants six. The
      // pack's budget is the default, not the rule.
      if (level.budget !== undefined && !(Number.isInteger(level.budget) && level.budget > 0)) {
        throw new Error(`level ${level.id}: "budget" must be a positive whole number`); // boundary
      }
      const [width, height] = authored ? checkBoard(level, glyphs) : [level.width, level.height];
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

/**
 * Read an authored board now, and return its size. Anything `parseBoard` will not
 * accept is reported against the level it is in, so the author gets a level number
 * rather than a bare cell reference.
 */
function checkBoard(level, glyphs) {
  if (!Array.isArray(level.board) || !level.board.length) {
    throw new Error(`level ${level.id}: "board" must be rows of cells`); // boundary
  }
  if (!Array.isArray(glyphs) || !glyphs.length) {
    throw new Error('loadRun needs the glyph pack to read an authored board'); // boundary
  }
  let board;
  try {
    board = parseBoard(level.board, glyphs);
  } catch (cause) {
    throw new Error(`level ${level.id}: ${cause.message}`); // boundary
  }
  // A dealt board never opens with a piece on its own colour, so every activation is
  // one the player caused. An authored board that broke that would sit there looking
  // fired and doing nothing until some unrelated swap resolved it.
  const already = matches(board);
  if (already.length) {
    throw new Error(
      `level ${level.id}: [${already[0]}] already sits on its own colour`,
    ); // boundary
  }
  return [board.width, board.height];
}

/**
 * Open one level of the run: the board it carries, or the board its seed deals. Either
 * way the same level opens the same way every time, so it is a puzzle rather than a
 * fresh roll.
 */
export function dealLevel(spec, { rules, glyphs, budget }) {
  const swaps = spec.budget ?? budget;
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
    budget: swaps,
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
