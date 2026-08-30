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

import { DIAG, ORTHO, armEnd, occupied } from './board.js';
import { PUSH_STEPS } from './fx.js';

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
  if (PUSH_STEPS[kind] || kind === 'pulse') return 'throw';
  if (kind === 'swapOrth' || kind === 'swapDiag') return 'grab';
  if (kind === 'rotate' || kind === 'rotateRev') return 'grab';
  if (kind === 'sink') return 'grab';
  return null; // an anchor and a plain piece throw nothing at all
}

/** The ring a rotate steps its neighbours around, in the order `turn()` walks it. */
const RING = Object.freeze([[-1, 0], [0, 1], [1, 0], [0, -1]]);

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
  const step = PUSH_STEPS[kind];
  if (step) return [[r + step[0], c + step[1]]].filter(holding);

  if (kind === 'pulse') {
    // The push's ability four ways at once, so the same reach four times over.
    return ORTHO.map(([dr, dc]) => [r + dr, c + dc]).filter(holding);
  }
  if (kind === 'swapOrth') {
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
