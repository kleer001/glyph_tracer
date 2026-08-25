// Debug log — a settle, written out as what happened, why, and where.
//
// The recorder collects the ordered events that took a board apart (see settle()
// in board.js). This turns them into lines a person can read. Pure: it is handed
// the boards and the naming tables, and returns text.
//
// Every line carries a cell reference, because "where" is the question you are
// actually asking when a cascade does something you did not expect.

const at = ([r, c]) => `[${r},${c}]`;

const SINK = {
  edge: 'shoved off the board edge',
  hole: 'shoved into a destroyed cell',
  eater: 'shoved into an eater',
};

const VERB = {
  push: 'shoves its four orthogonal neighbors outward',
  void: 'pulls its four neighbors inward',
  wild: 'shoves a random subset of its four directions',
  block: 'shoves nothing — it only eats',
  '': 'does nothing but clear',
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
    case 'eat':
      return `${at(event.at)} eaten — ${SINK[event.reason]}`;
    case 'kill':
      return event.reason === 'void'
        ? `${at(event.at)} cell destroyed — the void's own cell becomes the sink`
        : `${at(event.at)} cell destroyed — it activated`;
    default:
      throw new Error(`unlogged event type: ${event.type}`); // boundary
  }
}

/** The whole log as plain text, for the clipboard. */
export function toText(entries) {
  return entries.map(({ depth, text }) => '  '.repeat(depth) + text).join('\n');
}
