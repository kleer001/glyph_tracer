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

import { ANCHOR, DIAG, ORTHO, PUSH_DIR, RING, armEnd, occupied, onBoard } from './board.js';

/**
 * How an ability's beam behaves, which follows from what the ability does to a piece.
 *
 * A shove sends a piece AWAY, so its beam is thrown: it leaves in one direction, runs
 * its reach and dissipates, and never depended on hitting anything. A swap, a turn or
 * a sink all take hold of a piece and move it somewhere, so their beams grab: the tip
 * lands on the piece and stays with it, which is what makes the piece look moved
 * rather than merely moving.
 *
 * Getting this backwards is not a small thing. A thrown beam that grabbed would read
 * as pulling the piece it is meant to be shoving.
 */
export function beamStyleFor(kind) {
  if (PUSH_DIR[kind] || kind === 'pulse') return 'throw';
  if (kind === 'swapOrth' || kind === 'swapDiag') return 'grab';
  if (kind === 'rotate' || kind === 'rotateRev') return 'grab';
  if (kind === 'sink') return 'grab';
  return null; // an anchor and a plain piece throw nothing at all
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
export function targetsFor(kind, [r, c], board) {
  const holding = ([rr, cc]) => occupied(board, rr, cc);
  const step = PUSH_DIR[kind];
  if (step) return [[r + step[0], c + step[1]]].filter(holding);

  // A pulse shoves all four neighbours and an orthogonal swap trades them: different
  // verbs, the same four cells.
  if (kind === 'pulse' || kind === 'swapOrth') {
    return ORTHO.map(([dr, dc]) => [r + dr, c + dc]).filter(holding);
  }
  if (kind === 'swapDiag') {
    return DIAG.map(([dr, dc]) => [r + dr, c + dc]).filter(holding);
  }
  if (kind === 'rotate' || kind === 'rotateRev') {
    return RING.map(([dr, dc]) => [r + dr, c + dc]).filter(holding);
  }
  if (kind === 'sink') {
    // A sink pulls the FAR end of each arm, not the neighbour: the beam has to reach
    // past everything between and take hold of the piece that will actually move.
    return ORTHO.map(([dr, dc]) => armEnd(board, r, c, dr, dc)).filter(Boolean).filter(holding);
  }
  return []; // an anchor throws nothing, and a plain piece has nothing to throw
}

/**
 * How far a beam may travel from a cell before something stops it, in cells.
 *
 * An anchor stops it. The rules already treat one as the end of a line -- `armEnd`
 * walks up to an anchor and no further, and a shove that reaches one is swallowed
 * there -- so a beam sailing through would be drawing past the point where the
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
