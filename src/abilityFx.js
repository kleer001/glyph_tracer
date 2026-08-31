// What an ability reaches for — the cells its beams actually go to.
//
// Kept apart from `fx.js`, which knows how to draw a beam but nothing about the rules,
// and from `board.js`, which resolves the rules but never looks at a screen. This is
// the join: it asks the board what an ability would touch and hands back the cells, so
// an effect layer can point at them without re-deriving the rules and getting a
// different answer than the ones the pieces obey.
//
// The rule that shapes all of it: a beam only goes where there is a piece to act on.
// An ability that reaches into an empty cell, a hole, or off the board does nothing
// there, and a beam drawn into that space would be claiming otherwise. So the same
// glyph throws four beams in the middle of a full board and one at a drained corner,
// which is information rather than an inconsistency.

import {
  ANCHOR, ORTHO, PULSE, PUSH_DIR, RING, ROTATE, ROTATE_REV, SINK,
  SWAP_AXES, armEnd, occupied, onBoard,
} from './board.js';

/** The cells one step away along each of `steps`. */
const neighbours = (steps) => ([r, c]) => steps.map(([dr, dc]) => [r + dr, c + dc]);

/**
 * The far end of each arm. A sink pulls the piece at the end of the line rather than
 * the one beside it, so its beam has to reach past everything between.
 */
const armEnds = ([r, c], board) =>
  ORTHO.map(([dr, dc]) => armEnd(board, r, c, dr, dc)).filter(Boolean);

/**
 * One row per ability: how its beam behaves, and where it reaches.
 *
 * A table rather than two `if` chains, because those are one fact about an ability
 * rather than two. Split, they classified the same list of kinds twice and had to be
 * kept in step by hand — with only one half under test, so a row missing from the
 * other showed up as a beam with a style and nowhere to point.
 *
 * `style` follows from what the ability does to a piece. A shove sends one AWAY, so
 * its beam is thrown: it leaves, runs its reach and dissipates, and never depended on
 * hitting anything. A swap, a turn and a sink all take hold of a piece and move it, so
 * their beams grab — the tip lands on it and stays with it. Backwards, a thrown beam
 * would read as pulling the piece it is meant to be shoving.
 */
const ABILITY = {
  [PULSE]: { style: 'throw', reach: neighbours(ORTHO) },
  [ROTATE]: { style: 'grab', reach: neighbours(RING) },
  [ROTATE_REV]: { style: 'grab', reach: neighbours(RING) },
  [SINK]: { style: 'grab', reach: armEnds },
};

// The four pushes differ only in which way they point, so they come from the rules'
// own direction table rather than being written out four more times.
for (const [kind, step] of Object.entries(PUSH_DIR)) {
  ABILITY[kind] = { style: 'throw', reach: neighbours([step]) };
}

// And every swap is one ability over a different set of axes, so where each one reaches
// comes from the rules' own table. Written out here as well, the beams and the exchanges
// would be two lists of the same fact, free to drift apart.
for (const [kind, axes] of Object.entries(SWAP_AXES)) {
  ABILITY[kind] = { style: 'grab', reach: neighbours(axes.flat()) };
}

/** Every ability that throws a beam, for a caller that wants to check the set. */
export const BEAMING = Object.freeze(Object.keys(ABILITY));

/**
 * How an ability's beam behaves, or null for one that throws nothing — an anchor never
 * fires, and a plain piece has no ability to fire.
 */
export function beamStyleFor(kind) {
  return ABILITY[kind]?.style ?? null;
}

/**
 * Every cell an ability at (r, c) reaches, filtered to the ones holding a piece.
 *
 * @param {string} kind - the glyph's ability, as `board.kind` records it.
 * @param {Array<number>} at - [row, column] of the glyph firing.
 * @param {object} board - read only; nothing here moves a piece.
 * @returns {Array<Array<number>>} cells, which may be empty when there is nothing
 *   in reach. An empty list is the right answer, not a missing one.
 */
export function targetsFor(kind, at, board) {
  const ability = ABILITY[kind];
  if (!ability) return [];
  return ability.reach(at, board).filter(([r, c]) => occupied(board, r, c));
}

/**
 * How far a beam may travel from a cell before something stops it, in cells.
 *
 * An anchor stops it. The rules already treat one as the end of a line — `armEnd`
 * walks up to an anchor and no further, and a shove that reaches one is swallowed
 * there — so a beam sailing through would be drawing past the point where the
 * ability's effect actually ended.
 *
 * The beam stops half a cell short, on the anchor's near edge rather than at its
 * middle: a line that stopped dead centre would look like it went in, and it did not.
 *
 * @returns {number} cells, possibly fractional, never more than `maxCells`.
 */
export function beamReach(board, [r, c], [dr, dc], maxCells) {
  let rr = r + dr;
  let cc = c + dc;
  for (let n = 0; n < maxCells; n++) {
    if (!onBoard(board, rr, cc)) return n;
    if (board.kind[rr][cc] === ANCHOR) return n + 0.5;
    rr += dr;
    cc += dc;
  }
  return maxCells;
}
