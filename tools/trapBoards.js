#!/usr/bin/env node
// Generate trap boards — where the obvious swap is the wrong one.
//
// A player cannot simulate a cascade in their head. What they can see is a swap's
// *immediate* payoff: does it land one glyph on its color, or two? A board is a
// trap when that visible ranking misleads. The generator anneals toward boards
// where a two-match lure fizzles next to a one-match line that detonates, and
// where only one swap finds it.
//
// Usage:
//   node tools/trapBoards.js                        # one 6-color board
//   node tools/trapBoards.js --boards 3 --colors 5
//   node tools/trapBoards.js --target 12            # a modest trap, not a board-wipe
//   node tools/trapBoards.js --iters 6000 --payoff 10
//   node tools/trapBoards.js --adjacent-only          # restrict to neighbor swaps
//   node tools/trapBoards.js --json boards.json

import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  ANCHOR,
  COLOR_LETTERS,
  PLAIN,
  PULSE,
  ROTATE,
  SINK,
  copyBoard,
  formatBoard,
  randomBoard,
  resolve,
  swapPairs,
} from '../src/board.js';
import { mulberry32 } from '../src/rng.js';
import { parseArgs } from './args.js';

const KIND_MARK = { [PLAIN]: ' ', [PULSE]: '*', [ANCHOR]: '#', [ROTATE]: '@', [SINK]: 'o' };
const LETTERS = COLOR_LETTERS;
const GLYPHS = JSON.parse(
  readFileSync(new URL('../data/glyphs.json', import.meta.url), 'utf8'),
).glyphs;

const SPEC = {
  boards: { type: 'number', default: 1 },
  colors: { type: 'number', default: 6 },
  width: { type: 'number', default: 5 },
  height: { type: 'number', default: 8 },
  pushers: { type: 'number', default: 0.5 },
  blockers: { type: 'number', default: 0.125 },
  // Nothing is random at resolution time, so there is no unpredictable glyph to dial
  // in. The rotator takes that knob: it is the rearranger that touches the most cells
  // without shoving, which is the other way a trap line can detonate.
  rotators: { type: 'number', default: 0 },
  voids: { type: 'number', default: 0 },
  payoff: { type: 'number', default: 8 },
  target: { type: 'number', default: 40 },
  iters: { type: 'number', default: 2500 },
  seed: { type: 'number', default: 20260825 },
  'adjacent-only': { type: 'flag', default: false },
  json: { type: 'string', default: null },
};

/** Every legal swap, scored both ways: what it shows, and what it costs. */
export function analyse(board, candidates, rand) {
  const rows = [];
  for (const [a, z] of candidates) {
    const { immediate, activated, steps } = resolve(board, a, z, rand);
    if (immediate) rows.push({ a, z, imm: immediate, full: activated, steps });
  }
  if (!rows.length) return null;
  const fulls = rows.map((r) => r.full).sort((x, y) => x - y);
  const topImm = Math.max(...rows.map((r) => r.imm));
  // The move a greedy player takes: highest visible payoff, worst tie-break.
  const lure = rows
    .filter((r) => r.imm === topImm)
    .reduce((best, r) => (r.full < best.full ? r : best));
  const solution = rows.reduce((best, r) =>
    r.full > best.full || (r.full === best.full && r.imm < best.imm) ? r : best,
  );
  const best = solution.full;
  const median = fulls[Math.floor(fulls.length / 2)];
  // What following the habit is actually worth. `lure` is the worst swap tied for the
  // best visible payoff — a lower bound, and a misleading one once dozens of swaps
  // tie. The mean over that whole tied pool is what a player picking among them gets.
  const tied = rows.filter((r) => r.imm === topImm);
  const greedyEv = tied.reduce((sum, r) => sum + r.full, 0) / tied.length;
  return {
    rows,
    best,
    median,
    solvers: fulls.filter((f) => f >= 0.8 * best).length,
    lure,
    solution,
    tied: tied.length,
    greedyEv,
    deception: best - lure.full,
    spread: best - median,
  };
}

/**
 * `target` caps how much a bigger cascade keeps helping, so the search aims for a
 * board of a chosen size instead of running away to clearing everything.
 */
export function score(m, payoff, target) {
  if (m === null) return -1e6;
  let s =
    3.0 * Math.min(m.deception, target) +
    1.0 * Math.min(m.spread, target) +
    0.5 * Math.min(m.best, target);
  s -= 2.0 * Math.max(0, m.solvers - 1);
  if (m.best < payoff) s -= 8.0 * (payoff - m.best); // gate: walkable, not fatal
  return s;
}

function mutate(board, colors, kinds, rand) {
  const r = Math.floor(rand() * board.height);
  const c = Math.floor(rand() * board.width);
  const roll = rand();
  if (roll < 0.4) {
    board.bg[r][c] = Math.floor(rand() * colors);
    // Keep the no-free-match invariant: a glyph never sits on its own color.
    if (board.glyph[r][c] === board.bg[r][c]) {
      board.glyph[r][c] = (board.glyph[r][c] + 1) % colors;
    }
  } else if (roll < 0.72) {
    const g = Math.floor(rand() * (colors - 1));
    board.glyph[r][c] = g >= board.bg[r][c] ? g + 1 : g;
  } else {
    board.kind[r][c] = kinds[Math.floor(rand() * kinds.length)];
  }
}

export function anneal({ rules, mix, payoff, target, iters, rand }) {
  const candidates = swapPairs(rules);
  const kinds = [PLAIN, ...Object.entries(mix).filter(([, v]) => v).map(([k]) => k)];
  let cur = randomBoard(rules, mix, rand);
  let m = analyse(cur, candidates, rand);
  let s = score(m, payoff, target);
  let bestBoard = copyBoard(cur);
  let bestM = m;
  let bestS = s;
  for (let i = 0; i < iters; i++) {
    const T = 1.2 * Math.exp((-4.0 * i) / iters);
    const cand = copyBoard(cur);
    mutate(cand, rules.colors, kinds, rand);
    const cm = analyse(cand, candidates, rand);
    const cs = score(cm, payoff, target);
    if (cs >= s || rand() < Math.exp((cs - s) / Math.max(T, 1e-6))) {
      cur = cand;
      m = cm;
      s = cs;
      if (cs > bestS) {
        // `cand` is about to become `cur`, and `cur` is never mutated in place —
        // each iteration mutates a fresh copy — so this can alias it.
        bestBoard = cand;
        bestM = cm;
        bestS = cs;
      }
    }
  }
  return { board: bestBoard, metrics: bestM };
}

/** Each cell as background-letter, glyph-letter, and a mark for what it does. */
function render(b) {
  const lines = ['    ' + Array.from({ length: b.width }, (_, c) => `  ${String(c).padEnd(3)}`).join('')];
  for (let r = 0; r < b.height; r++) {
    let row = String(r).padStart(3) + ' ';
    for (let c = 0; c < b.width; c++) {
      if (!b.alive[r][c]) {
        row += '  .. ';
        continue;
      }
      const g = b.glyph[r][c];
      row += ` ${LETTERS[b.bg[r][c]]}${g === null ? '-' : LETTERS[g].toUpperCase()}${KIND_MARK[b.kind[r][c]]} `;
    }
    lines.push(row);
  }
  return lines.join('\n');
}

function report(board, m) {
  console.log(render(board));
  console.log('\n  lowercase = cell background, UPPERCASE = glyph   * pushes   # eats   @ turns   o pulls inward\n');
  // The same board in the level format, so a trap worth keeping is a paste rather than
  // a transcription. See `parseBoard` in src/board.js.
  console.log('  as a level board:\n');
  for (const row of formatBoard(board, GLYPHS)) console.log(`      "${row}",`);
  console.log();
  const { lure, solution: sol } = m;
  console.log(
    `  cells cleared:   best line ${String(m.best).padEnd(3)}   greedy pick ${String(lure.full).padEnd(3)}   typical swap ${m.median}`,
  );
  console.log(`  the best line is worth ${(m.best / Math.max(1, lure.full)).toFixed(1)}x the move a greedy read takes`);
  console.log(`  ${m.rows.length} productive swaps, ${m.solvers} of them within 80% of best`);
  console.log(
    `  ${m.tied} swaps tie for the best visible payoff; picking among them averages ` +
      `${m.greedyEv.toFixed(1)} against a best of ${m.best}\n`,
  );
  const line = (label, r) =>
    `  ${label}      [${r.a}] <-> [${r.z}]   shows ${r.imm} match${r.imm === 1 ? '' : 'es'}, ` +
    `actually clears ${r.full} in ${r.steps} step(s)`;
  console.log(line('THE LURE ', lure));
  console.log(line('THE LINE ', sol));
  console.log('\n  top 5 swaps by what the player can see:');
  for (const r of [...m.rows].sort((x, y) => y.imm - x.imm).slice(0, 5)) {
    console.log(`    [${r.a}] <-> [${r.z}]   shows ${r.imm}  ->  clears ${String(r.full).padStart(2)}`);
  }
}

function toJson(board, m) {
  return {
    w: board.width,
    h: board.height,
    colors: board.colors,
    bg: board.bg,
    glyph: board.glyph,
    kind: board.kind,
    // ready to paste into a level in data/levels.json
    board: formatBoard(board, GLYPHS),
    solution: { a: m.solution.a, z: m.solution.z, clears: m.solution.full, steps: m.solution.steps },
    lure: { a: m.lure.a, z: m.lure.z, clears: m.lure.full },
    deception: m.deception,
    spread: m.spread,
    solvers: m.solvers,
    tied: m.tied,
    greedyEv: Number(m.greedyEv.toFixed(2)),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2), SPEC);
  const rules = {
    width: args.width,
    height: args.height,
    colors: args.colors,
    adjacentOnly: args['adjacent-only'],
  };
  const mix = { [ANCHOR]: args.blockers, [ROTATE]: args.rotators, [SINK]: args.voids, [PULSE]: args.pushers };
  const blurb = Object.entries(mix)
    .filter(([, v]) => v)
    .map(([k, v]) => `${(v * 100).toFixed(0)}% ${k}`)
    .join(', ');

  const dump = [];
  for (let n = 0; n < args.boards; n++) {
    const rand = mulberry32(args.seed + n * 977);
    const { board, metrics } = anneal({
      rules,
      mix,
      payoff: args.payoff,
      target: args.target,
      iters: args.iters,
      rand,
    });
    console.log('='.repeat(66));
    console.log(`BOARD ${n + 1}   ${args.colors} colors, ${blurb}, ${args.iters} annealing steps`);
    console.log('='.repeat(66));
    report(board, metrics);
    console.log();
    dump.push(toJson(board, metrics));
  }

  if (args.json) {
    writeFileSync(args.json, JSON.stringify(dump, null, 2));
    console.log(`wrote ${dump.length} board(s) to ${args.json}`);
  }
}

// Only run when invoked directly — this module is imported for its measurements too,
// and an import that starts printing boards is an import nobody can reuse.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
