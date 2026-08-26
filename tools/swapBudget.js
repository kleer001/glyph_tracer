#!/usr/bin/env node
// How many swaps should a Glyph Tracer level give you?
//
// Sweeps palette size against the swap budget by playing boards out greedily. The
// rules under test live in src/board.js; this file only measures them, so a rule
// change shows up here without being restated.
//
// Usage:
//   node tools/swapBudget.js                      # full sweep
//   node tools/swapBudget.js --colors 4 6 8       # pick the palette sizes
//   node tools/swapBudget.js --blockers 0.25      # fraction of glyphs that eat
//   node tools/swapBudget.js --rotators 0.1 --voids 0.1
//   node tools/swapBudget.js --show               # play one board out loud

import { pathToFileURL } from 'node:url';
import { ANCHOR, PULSE, ROTATE, SINK, randomBoard, swapPairs } from '../src/board.js';
import { greedyPlay } from '../src/level.js';
import { mulberry32 } from '../src/rng.js';
import { parseArgs } from './args.js';

const CHECKPOINTS = [3, 6, 10]; // swap budgets reported; the last one is played out
const BUDGET = Math.max(...CHECKPOINTS);

const SPEC = {
  trials: { type: 'number', default: 150 },
  seed: { type: 'number', default: 20260825 },
  colors: { type: 'numbers', default: [4, 6, 8, 12] },
  width: { type: 'number', default: 5 },
  height: { type: 'number', default: 8 },
  pushers: { type: 'number', default: 0.5 },
  blockers: { type: 'number', default: 0.125 },
  // Nothing is random at resolution time, so there is no unpredictable glyph to dial
  // in. The rotator takes that knob: it is the rearranger that touches the most cells
  // without shoving, which is the other way a cascade can start.
  rotators: { type: 'number', default: 0 },
  voids: { type: 'number', default: 0 },
  show: { type: 'flag', default: false },
};

function measure({ colors, rules, mix, trials, seed }) {
  const candidates = swapPairs(rules);
  const totals = new Map(CHECKPOINTS.map((k) => [k, { cleared: 0, left: 0 }]));
  let cascade = 0;
  let deepest = 0;
  for (let i = 0; i < trials; i++) {
    const rand = mulberry32(seed + i);
    const board = randomBoard({ ...rules, colors }, mix, rand);
    const run = greedyPlay(board, BUDGET, rand, candidates);
    for (const k of CHECKPOINTS) {
      const at = run.turns[k - 1];
      totals.get(k).cleared += at.cleared / trials;
      totals.get(k).left += at.left / trials;
    }
    cascade += run.cascade / trials;
    deepest += run.deepest / trials;
  }
  return { totals, cascade, deepest, perSwap: totals.get(BUDGET).cleared / BUDGET };
}

function main() {
  const args = parseArgs(process.argv.slice(2), SPEC);
  const rules = { width: args.width, height: args.height };
  const mix = { [ANCHOR]: args.blockers, [ROTATE]: args.rotators, [SINK]: args.voids, [PULSE]: args.pushers };
  const blurb = Object.entries(mix)
    .filter(([, v]) => v)
    .map(([k, v]) => `${(v * 100).toFixed(0)}% ${k}`)
    .join(', ');
  const cells = rules.width * rules.height;

  if (args.show) {
    console.log(`One ${rules.width}x${rules.height} board, 6 colors, ${BUDGET} swaps, neighbor swaps:\n`);
    const rand = mulberry32(args.seed);
    const board = randomBoard({ ...rules, colors: 6, adjacentOnly: false }, mix, rand);
    const run = greedyPlay(board, BUDGET, rand);
    run.turns.forEach((t, i) => {
      const gained = t.cleared - (run.turns[i - 1]?.cleared ?? 0);
      console.log(
        `  swap ${String(i + 1).padStart(2)}: ${String(gained).padStart(2)} cells in ` +
          `${t.steps} step(s), ${String(t.left).padStart(2)} cells left`,
      );
    });
    console.log();
  }

  for (const [name, adjacentOnly] of [['swap any two cells', false], ['neighbor swaps', true]]) {
    console.log(`\n${name}  —  ${rules.width}x${rules.height}, ${blurb}, ${args.trials} trials`);
    const head = ['colors', 'per swap', 'cascade', 'deepest', '3 swaps', '6 swaps', '10 swaps', `left of ${cells}`];
    console.log(head.map((h, i) => h.padStart(i ? 10 : 8)).join(' '));
    console.log('-'.repeat(78));
    for (const colors of args.colors) {
      const m = measure({ colors, rules: { ...rules, adjacentOnly }, mix, trials: args.trials, seed: args.seed });
      const row = [
        String(colors).padStart(8),
        m.perSwap.toFixed(1).padStart(10),
        m.cascade.toFixed(2).padStart(10),
        m.deepest.toFixed(2).padStart(10),
        ...CHECKPOINTS.map((k) => m.totals.get(k).cleared.toFixed(1).padStart(10)),
        m.totals.get(BUDGET).left.toFixed(1).padStart(10),
      ];
      console.log(row.join(' '));
    }
  }

  console.log(`
Reading this
------------
per swap    cells activated per swap over a ${BUDGET}-swap level, chains included
cascade     mean resolution steps per swap; 1.00 means nothing chained
deepest     the best single cascade seen in a level
3/6/10      total cells activated across a level at that swap budget
left of ${cells}  cells still standing after a ${BUDGET}-swap level

Every shove line ends at a sink — edge, hole or blocker — which eats the front
glyph while the rest advance. A shove always moves something, so the board starts
opening from the first swap. Cascade depth above 1.00 is the ability layer working.
`);
}

// Only run when invoked directly — this module is imported for its measurements too,
// and an import that starts printing boards is an import nobody can reuse.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
