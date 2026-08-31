// Debug log — a settle, written out as what happened, why, and where.
//
// The recorder collects the ordered events that took a board apart (see settle()
// in board.js). This turns them into lines a person can read. Pure: it is handed
// the boards and the naming tables, and returns text.
//
// Every line carries a cell reference, because "where" is the question you are
// actually asking when a cascade does something you did not expect.

import {
  ANCHOR, PLAIN, PULSE, PUSH_DOWN, PUSH_LEFT, PUSH_RIGHT, PUSH_UP, ROTATE, ROTATE_REV,
  SINK, SWAP_DIAG, SWAP_DIAG_DOWN, SWAP_DIAG_UP, SWAP_HORIZ, SWAP_ORTH, SWAP_VERT,
} from './board.js';

const at = ([r, c]) => `[${r},${c}]`;

const EATEN_BY = {
  edge: 'shoved off the board edge',
  hole: 'shoved into a destroyed cell',
  eater: 'shoved into an eater',
};

// Keyed by the rules' own constants rather than by retyped strings: renaming a kind
// in board.js would otherwise leave this table silently falling back to printing the
// raw kind, which is the quiet kind of wrong this log exists to avoid.
const VERB = {
  [PULSE]: 'advances all four lines by one',
  [PUSH_UP]: 'advances the line above by one',
  [PUSH_RIGHT]: 'advances the line to its right by one',
  [PUSH_DOWN]: 'advances the line below by one',
  [PUSH_LEFT]: 'advances the line to its left by one',
  [SWAP_VERT]: 'exchanges upper with lower',
  [SWAP_HORIZ]: 'exchanges left with right',
  [SWAP_ORTH]: 'exchanges upper with lower, and left with right',
  [SWAP_DIAG_UP]: 'exchanges upper right with lower left',
  [SWAP_DIAG_DOWN]: 'exchanges upper left with lower right',
  [SWAP_DIAG]: 'exchanges both corner pairs',
  [ROTATE]: 'turns its four neighbors one step clockwise',
  [ROTATE_REV]: 'turns its four neighbors one step anticlockwise',
  [SINK]: 'draws all four lines inward',
  [ANCHOR]: 'shoves nothing — it only eats',
  [PLAIN]: 'does nothing but clear',
};

/**
 * Name a piece the way the player sees it: its colour and what it is drawn as.
 * @returns {string}
 */
function name(board, [r, c], palette, glyphsById) {
  if (!board.alive[r][c]) return 'destroyed cell';
  if (board.glyph[r][c] === null) return 'empty cell';
  const colour = palette.colors[board.glyph[r][c]].name;
  const glyph = glyphsById.get(board.art[r][c]);
  return `${colour} ${glyph ? glyph.name : 'piece'}`;
}

/**
 * One swap, written out.
 * @param {object} args
 * @param {object} args.before - the board as it stood before the swap.
 * @param {Array} args.swap - the two cells the player exchanged.
 * @param {{steps: Array}} args.recorder - what settle() collected.
 * @param {number} args.moveNumber - which swap of the budget this was.
 * @param {number} args.shown - matches the swap showed before it resolved.
 * @param {number} args.cleared - cells the swap ended up clearing.
 * @returns {Array<{depth: number, text: string}>}
 */
export function describeSwap({
  before,
  swap,
  recorder,
  palette,
  glyphsById,
  moveNumber,
  shown,
  cleared,
}) {
  const [a, z] = swap;
  const lines = [
    { depth: 0, text: `swap ${moveNumber}   ${at(a)} <-> ${at(z)}` },
    {
      depth: 1,
      text:
        `${at(a)} ${name(before, a, palette, glyphsById)}` +
        `  <->  ${at(z)} ${name(before, z, palette, glyphsById)}`,
    },
    { depth: 1, text: `shows ${shown} match${shown === 1 ? '' : 'es'}` },
  ];

  if (!recorder.steps.length) {
    lines.push({ depth: 1, text: 'nothing activated — the swap was a dead move' });
    return lines;
  }

  recorder.steps.forEach((step, i) => {
    const { snapshot, activated, events } = step;
    lines.push({
      depth: 1,
      text: `step ${i + 1} — ${activated.length} activated`,
    });
    for (const cell of activated) {
      const ground = palette.colors[snapshot.bg[cell[0]][cell[1]]]?.name ?? '?';
      lines.push({
        depth: 2,
        text: `${at(cell)} ${name(snapshot, cell, palette, glyphsById)} landed on ${ground} ground`,
      });
    }
    for (const event of events) {
      lines.push({ depth: 3, text: describeEvent(event, snapshot, palette, glyphsById) });
    }
  });

  const steps = recorder.steps.length;
  lines.push({
    depth: 1,
    text: `= ${cleared} cell${cleared === 1 ? '' : 's'} cleared in ${steps} step${steps === 1 ? '' : 's'}`,
  });
  return lines;
}

function describeEvent(event, snapshot, palette, glyphsById) {
  switch (event.type) {
    case 'fire': {
      const glyph = glyphsById.get(event.art);
      return `${at(event.at)} ${glyph ? glyph.name : 'piece'} fires — ${VERB[event.kind] ?? event.kind}`;
    }
    case 'move':
      return `${at(event.from)} -> ${at(event.to)}   shoved`;
    case 'exchange':
      return `${at(event.a)} <-> ${at(event.z)}   exchanged`;
    case 'turn':
      return `${at(event.from)} -> ${at(event.to)}   turned`;
    case 'eat':
      return `${at(event.at)} eaten — ${EATEN_BY[event.reason]}`;
    case 'kill':
      return event.reason === 'sink'
        ? `${at(event.at)} cell destroyed — the sink's own cell becomes the hole`
        : `${at(event.at)} cell destroyed — it activated`;
    default:
      throw new Error(`unlogged event type: ${event.type}`); // boundary
  }
}

/** The whole log as plain text, for the clipboard. */
export function toText(entries) {
  return entries.map(({ depth, text }) => '  '.repeat(depth) + text).join('\n');
}
