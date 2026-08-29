#!/usr/bin/env node
// Build a board where one swap sets off as long a chain as possible.
//
// Two ways to do it, and they are not close.
//
// GROW reasons about the cascade. A chain step exists because a shove put a piece on a
// cell whose ground matches it, so to add a step you run the chain, look at what moved
// last, and paint those destinations to match. It is nearly free — a few milliseconds —
// and it plateaus almost at once, because painting a background is the only move it has.
//
// ANNEAL asks the engine instead of reasoning. It changes one cell at a time — ground,
// glyph colour, or which glyph — and keeps what deepens the best line. It is hundreds of
// times slower and finds chains three times longer, because it can build structures no
// rule of thumb would suggest.
//
// Usage:
//   node tools/maxCombo.js                       # anneal one board, print it
//   node tools/maxCombo.js --mode grow
//   node tools/maxCombo.js --mode both --iters 12000
//   node tools/maxCombo.js --boards 5 --colors 6 --compare

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  applySwap, copyBoard, createRecorder, formatBoard, gain, randomBoard, swapPairs,
} from '../src/board.js';
import { mulberry32 } from '../src/rng.js';
import { dealArt } from '../src/level.js';
import { parseArgs } from './args.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const RULES = read('../data/rules.json');
const GLYPHS = read('../data/glyphs.json').glyphs;
const KINDS = [...new Set(GLYPHS.map((g) => g.kind))];
const BY_KIND = new Map(KINDS.map((k) => [k, GLYPHS.filter((g) => g.kind === k)]));

const SPEC = {
  mode: { type: 'string', default: 'anneal' }, // grow | anneal | both
  boards: { type: 'number', default: 1 },
  colors: { type: 'number', default: 4 },
  iters: { type: 'number', default: 6000 },
  seed: { type: 'number', default: 708 },
  compare: { type: 'flag', default: false },
};

/** The best swap on a board, by chain length first and cells cleared second. */
export function bestSwap(board, cands) {
  let best = { steps: 0, activated: 0, pair: null };
  for (const [a, z] of cands) {
    if (!gain(board, a, z)) continue;
    const probe = copyBoard(board);
    const { steps, activated } = applySwap(probe, a, z, mulberry32(9));
    if (steps > best.steps || (steps === best.steps && activated > best.activated)) {
      best = { steps, activated, pair: [a, z] };
    }
  }
  return best;
}

/**
 * Deepen a chain by making its last movers land on their own colour.
 *
 * Backgrounds never move, so painting one is a change to the board as dealt — it can
 * shorten an earlier step as easily as add a later one. Every change is therefore kept
 * only if the whole line, replayed from scratch, came out longer.
 */
export function grow(board, cands, { rounds = 60 } = {}) {
  let cur = copyBoard(board);
  let best = bestSwap(cur, cands);
  let painted = 0;
  for (let r = 0; r < rounds; r++) {
    if (!best.pair) break;
    const probe = copyBoard(cur);
    const rec = createRecorder();
    applySwap(probe, best.pair[0], best.pair[1], mulberry32(9), rec);
    const last = rec.steps.at(-1);
    if (!last) break;
    const landings = last.events
      .filter((e) => e.type === 'move')
      .map((e) => ({ to: e.to, ink: last.snapshot.glyph[e.from[0]][e.from[1]] }))
      .filter((l) => l.ink !== null);
    if (!landings.length) break;

    let improved = false;
    for (const { to: [r2, c2], ink } of landings) {
      if (cur.bg[r2][c2] === ink) continue;
      const trial = copyBoard(cur);
      trial.bg[r2][c2] = ink;
      if (trial.glyph[r2][c2] === ink) continue; // never leave a cell pre-matched
      const got = bestSwap(trial, cands);
      if (got.steps > best.steps || (got.steps === best.steps && got.activated > best.activated)) {
        cur = trial; best = got; painted += 1; improved = true;
      }
    }
    if (!improved) break;
  }
  return { board: cur, ...best, painted };
}

/**
 * Anneal toward a longer chain: change one cell, keep what helps, keep a little of what
 * does not while the temperature is high.
 *
 * Scoring a board honestly means resolving every legal swap — 780 settles on a 5x8 for
 * one number — so the search works from a sample: the pair that was best last time plus
 * a handful of fresh ones. The full price is paid once, on the board that won.
 */
export function anneal(board, cands, { iters = 6000, seed = 5, sample = 40 } = {}) {
  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const score = (b, keep) => {
    let best = { steps: 0, activated: 0, pair: null };
    const tryPair = ([a, z]) => {
      if (!gain(b, a, z)) return;
      const probe = copyBoard(b);
      const { steps, activated } = applySwap(probe, a, z, mulberry32(9));
      if (steps > best.steps || (steps === best.steps && activated > best.activated)) {
        best = { steps, activated, pair: [a, z] };
      }
    };
    if (keep) tryPair(keep);
    for (let i = 0; i < sample; i++) tryPair(cands[Math.floor(rand() * cands.length)]);
    return { v: best.steps * 1000 + best.activated, ...best };
  };

  let cur = copyBoard(board);
  let curS = score(cur, null);
  let best = { board: copyBoard(cur), ...curS };
  for (let n = 0; n < iters; n++) {
    const T = 1 - n / iters;
    const cand = copyBoard(cur);
    const r = Math.floor(rand() * cand.height);
    const c = Math.floor(rand() * cand.width);
    const roll = rand();
    if (roll < 0.4) {
      cand.bg[r][c] = Math.floor(rand() * cand.colors);
    } else if (roll < 0.7) {
      const g = Math.floor(rand() * (cand.colors - 1));
      cand.glyph[r][c] = g >= cand.bg[r][c] ? g + 1 : g;
    } else {
      const kind = KINDS[Math.floor(rand() * KINDS.length)];
      const opts = BY_KIND.get(kind);
      cand.kind[r][c] = kind;
      cand.art[r][c] = opts[Math.floor(rand() * opts.length)].id;
    }
    if (cand.glyph[r][c] === cand.bg[r][c]) continue; // a board never opens pre-matched
    const got = score(cand, curS.pair);
    if (got.v >= curS.v || rand() < 0.02 * T) {
      cur = cand; curS = got;
      if (got.v > best.v) best = { board: copyBoard(cand), ...got };
    }
  }
  return { board: best.board, ...bestSwap(best.board, cands) };
}

function fresh(colors, seed) {
  const rand = mulberry32(seed);
  const b = randomBoard({ ...RULES, colors }, RULES.mix, rand);
  dealArt(b, GLYPHS, rand);
  return b;
}

function main() {
  const args = parseArgs(process.argv.slice(2), SPEC);
  const cands = swapPairs(RULES);
  const build = {
    grow: (b) => grow(b, cands),
    anneal: (b) => anneal(b, cands, { iters: args.iters }),
    both: (b) => anneal(grow(b, cands).board, cands, { iters: args.iters }),
  }[args.mode];
  if (!build) throw new Error(`--mode wants grow, anneal or both, not "${args.mode}"`); // boundary

  if (args.compare) {
    console.log(' seed     dealt      grow   ms      anneal    ms       both    ms');
    console.log(' ' + '-'.repeat(66));
    for (let i = 0; i < args.boards; i++) {
      const seed = args.seed + i;
      const b = fresh(args.colors, seed);
      const d = bestSwap(b, cands);
      const runs = ['grow', 'anneal', 'both'].map((m) => {
        const t = Date.now();
        const r = { grow: () => grow(b, cands), anneal: () => anneal(b, cands, { iters: args.iters }),
          both: () => anneal(grow(b, cands).board, cands, { iters: args.iters }) }[m]();
        return { ...r, ms: Date.now() - t };
      });
      const f = (x) => `${x.steps}/${String(x.activated).padStart(2)}`;
      console.log(` ${seed}  ${f(d).padStart(8)} ${runs.map((r) => `${f(r).padStart(9)} ${String(r.ms).padStart(5)}`).join('')}`);
    }
    return;
  }

  for (let i = 0; i < args.boards; i++) {
    const seed = args.seed + i;
    const start = fresh(args.colors, seed);
    const before = bestSwap(start, cands);
    const t = Date.now();
    const r = build(start);
    const rec = createRecorder();
    const probe = copyBoard(r.board);
    const res = applySwap(probe, r.pair[0], r.pair[1], mulberry32(9), rec);
    console.log(`\nseed ${seed}, ${args.colors} colours, ${args.mode} — dealt at ${before.steps} steps `
      + `/ ${before.activated} cells, built to ${r.steps} / ${r.activated} in ${((Date.now() - t) / 1000).toFixed(1)}s`);
    console.log(`  swap [${r.pair[0]}] <-> [${r.pair[1]}]   activated per step: `
      + rec.steps.map((s) => s.activated.length).join(' '));
    console.log('  as a level board:\n');
    for (const row of formatBoard(r.board, GLYPHS)) console.log(`      "${row}",`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
