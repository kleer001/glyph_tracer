// Level — the measuring stick, and the drawing a piece wears.
//
// Two things the run needs that are not rules. `greedyPlay` says how a player who
// always takes the biggest visible payoff would do on a board, which is how a level's
// difficulty gets judged by the tools. `dealArt` decides which of the glyph drawings
// each piece carries, which the rules never read.
//
// Targets and budgets used to be measured here and derived from a stage factor. They
// are authored in data/levels.json now and read by levels.js, so the level a player
// gets is the one someone chose rather than one a curve produced.

import { applySwap, gain, remaining, swapPairs } from './board.js';

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
 * Which glyph each piece is drawn as, written onto the board so it travels with the
 * piece when it is shoved. One kind per glyph now, so this is a lookup rather than a
 * choice — except for inert, which is most of the board and has one drawing.
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

