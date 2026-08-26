#!/usr/bin/env node
// What does the shape of the board do to the game?
//
// Board size and palette size are not independent dials. Both of them move the same
// quantity — how many swaps tie for the best payoff a player can see — and that
// quantity is what decides whether a choice is a decision or a lottery. This tool
// measures it, alongside what each shape costs the ability layer.
//
// Usage:
//   node tools/boardShapes.js                                  # the standard sweep
//   node tools/boardShapes.js --sizes 4x4 5x5 5x8 --colors 6
//   node tools/boardShapes.js --budget 6 --trials 500
//   node tools/boardShapes.js --curve                          # marginal yield per swap
//   node tools/boardShapes.js --traps                          # generator quality (slow)

import {
  ANCHOR,
  PULSE,
  applySwap,
  gain,
  randomBoard,
  remaining,
  swapPairs,
} from '../src/board.js';
import { mulberry32 } from '../src/rng.js';
import { anneal } from './trapBoards.js';
import { parseArgs } from './args.js';

const SPEC = {
  sizes: { type: 'strings', default: ['4x4', '5x5', '4x8', '5x8'] },
  colors: { type: 'numbers', default: [4, 6, 8] },
  trials: { type: 'number', default: 400 },
  budget: { type: 'number', default: 6 },
  span: { type: 'number', default: 12 },
  pushers: { type: 'number', default: 0.5 },
  blockers: { type: 'number', default: 0.125 },
  seed: { type: 'number', default: 20260825 },
  curve: { type: 'flag', default: false },
  traps: { type: 'flag', default: false },
};

/** '5x8' -> {width: 5, height: 8}. A typo here would silently measure the wrong game. */
function parseSize(text) {
  const m = /^(\d+)x(\d+)$/.exec(text);
  if (!m) throw new Error(`a size looks like 5x8, got "${text}"`); // boundary
  return { width: Number(m[1]), height: Number(m[2]) };
}

/** What a greedy read is offered on a board nobody has touched yet. */
export function freshRead(rules, mix, trials, seed) {
  const cands = swapPairs(rules);
  let openings = 0;
  let tied = 0;
  let payoff = 0;
  let deadlocked = 0;
  for (let i = 0; i < trials; i++) {
    const board = randomBoard(rules, mix, mulberry32(seed + i));
    const gains = cands.map(([a, z]) => gain(board, a, z)).filter((g) => g > 0);
    const top = Math.max(0, ...gains);
    if (!gains.length) deadlocked += 1;
    openings += gains.length / trials;
    tied += gains.filter((g) => g === top).length / trials;
    payoff += top / trials;
  }
  return { pairs: cands.length, openings, tied, payoff, deadlocked };
}

/**
 * Greedy play, reporting the running total after every swap so a shorter budget can
 * be read off a longer run, plus the turns where nothing productive existed at all.
 */
export function playOut(rules, mix, rand, cands, span) {
  const board = randomBoard(rules, mix, rand);
  const curve = [];
  const steps = [];
  let cleared = 0;
  let dead = 0;
  for (let turn = 0; turn < span; turn++) {
    let best = 0;
    let picks = [];
    for (const pair of cands) {
      const g = gain(board, pair[0], pair[1]);
      if (g > best) {
        best = g;
        picks = [pair];
      } else if (g === best && g > 0) {
        picks.push(pair);
      }
    }
    if (!picks.length) {
      dead += 1;
      curve.push(cleared);
      continue;
    }
    const [a, z] = picks[Math.floor(rand() * picks.length)];
    const out = applySwap(board, a, z, rand);
    cleared += out.activated;
    steps.push(out.steps);
    curve.push(cleared);
  }
  return {
    curve,
    dead,
    left: remaining(board),
    cascade: steps.length ? steps.reduce((x, y) => x + y, 0) / steps.length : 0,
    deepest: Math.max(0, ...steps),
  };
}

/**
 * How far a shove can travel before it meets something. This is the ability layer's
 * runway: chains need room, and room is what a small board does not have.
 */
export function shoveRunway(rules, mix, trials, seed) {
  let total = 0;
  let count = 0;
  for (let i = 0; i < trials; i++) {
    const b = randomBoard(rules, mix, mulberry32(seed + i));
    for (let r = 0; r < b.height; r++) {
      for (let c = 0; c < b.width; c++) {
        if (b.kind[r][c] !== PULSE) continue;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          let len = 0;
          let rr = r + dr;
          let cc = c + dc;
          while (
            rr >= 0 && rr < b.height && cc >= 0 && cc < b.width &&
            b.alive[rr][cc] && b.glyph[rr][cc] !== null && b.kind[rr][cc] !== ANCHOR
          ) {
            len += 1;
            rr += dr;
            cc += dc;
          }
          total += len;
          count += 1;
        }
      }
    }
  }
  return count ? total / count : 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2), SPEC);
  const mix = { [ANCHOR]: args.blockers, [PULSE]: args.pushers };
  const sizes = args.sizes.map(parseSize);
  const pad = (v, n, d = 1) => (typeof v === 'number' ? v.toFixed(d) : String(v)).padStart(n);

  console.log(`\nWhat a greedy read is offered on a fresh board — ${args.trials} boards each`);
  console.log('board  cells  pairs  colors  pairs/c^2  openings  tied@max  maxpay  deadlocked');
  console.log('-'.repeat(80));
  for (const size of sizes) {
    for (const colors of args.colors) {
      const rules = { ...size, colors, adjacentOnly: false };
      const r = freshRead(rules, mix, args.trials, args.seed);
      console.log(
        `${(`${size.width}x${size.height}`).padEnd(6)} ${pad(size.width * size.height, 6, 0)} ` +
        `${pad(r.pairs, 6, 0)} ${pad(colors, 7, 0)} ${pad(r.pairs / colors ** 2, 10)} ` +
        `${pad(r.openings, 9)} ${pad(r.tied, 9)} ${pad(r.payoff, 7, 2)} ${pad(r.deadlocked, 11, 0)}`,
      );
    }
  }

  console.log(`\nWhat each shape plays like over ${args.budget} swaps`);
  console.log('board  colors  cleared  % board  cascade  deepest  dead turns  shove runway');
  console.log('-'.repeat(80));
  for (const size of sizes) {
    for (const colors of args.colors) {
      const rules = { ...size, colors, adjacentOnly: false };
      const cands = swapPairs(rules);
      const cells = size.width * size.height;
      let cleared = 0;
      let cascade = 0;
      let deepest = 0;
      let dead = 0;
      for (let i = 0; i < args.trials; i++) {
        const r = playOut(rules, mix, mulberry32(args.seed + i), cands, args.budget);
        cleared += r.curve[args.budget - 1] / args.trials;
        cascade += r.cascade / args.trials;
        deepest += r.deepest / args.trials;
        dead += r.dead / args.trials;
      }
      console.log(
        `${(`${size.width}x${size.height}`).padEnd(6)} ${pad(colors, 7, 0)} ${pad(cleared, 8)} ` +
        `${pad((100 * cleared) / cells, 7, 0)}% ${pad(cascade, 8, 2)} ${pad(deepest, 8, 2)} ` +
        `${pad(dead, 11, 2)} ${pad(shoveRunway(rules, mix, Math.min(args.trials, 200), args.seed), 13, 2)}`,
      );
    }
  }

  if (args.curve) {
    console.log(`\nMarginal cells gained by swap number — where the budget stops paying`);
    const head = Array.from({ length: args.span }, (_, i) => String(i + 1).padStart(5)).join('');
    console.log(`board  colors${head}${'tail'.padStart(7)}`);
    console.log('-'.repeat(20 + args.span * 5));
    for (const size of sizes) {
      for (const colors of args.colors) {
        const rules = { ...size, colors, adjacentOnly: false };
        const cands = swapPairs(rules);
        const acc = new Array(args.span).fill(0);
        for (let i = 0; i < args.trials; i++) {
          const { curve } = playOut(rules, mix, mulberry32(args.seed + i), cands, args.span);
          curve.forEach((v, j) => {
            acc[j] += v / args.trials;
          });
        }
        const marginal = acc.map((v, j) => v - (j ? acc[j - 1] : 0));
        const tail = marginal.slice(args.budget).reduce((x, y) => x + y, 0);
        console.log(
          `${(`${size.width}x${size.height}`).padEnd(6)} ${pad(colors, 7, 0)}` +
          marginal.map((m) => pad(m, 5)).join('') + pad(tail, 7),
        );
      }
    }
  }

  if (args.traps) {
    console.log(`\nWhat the trap generator can build on each shape — 2500 annealing steps`);
    console.log('board  colors  best  tied@max  greedy EV  solvers  productive');
    console.log('-'.repeat(62));
    for (const size of sizes) {
      for (const colors of args.colors) {
        const rules = { ...size, colors, adjacentOnly: false };
        const cells = size.width * size.height;
        for (let n = 0; n < 2; n++) {
          const { metrics: m } = anneal({
            rules, mix, payoff: Math.round(cells * 0.2), target: cells, iters: 2500,
            rand: mulberry32(args.seed + n * 977),
          });
          if (!m) {
            console.log(`${(`${size.width}x${size.height}`).padEnd(6)} ${pad(colors, 7, 0)}  no productive swap`);
            continue;
          }
          console.log(
            `${(`${size.width}x${size.height}`).padEnd(6)} ${pad(colors, 7, 0)} ${pad(m.best, 5, 0)} ` +
            `${pad(m.tied, 9, 0)} ${pad(m.greedyEv, 10)} ${pad(m.solvers, 8, 0)} ${pad(m.rows.length, 11, 0)}`,
          );
        }
      }
    }
  }
  console.log();
}

main();
