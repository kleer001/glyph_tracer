#!/usr/bin/env node
// Check data/levels.json, and fill in the seeds it needs.
//
// The pack is the run: acts, levels, targets and boards are authored there. This tool
// does not write any of that. What it does is guarantee the one thing an author cannot
// check by eye — that every level can actually be won:
//
//   * a level that CARRIES a board is played greedily, exactly as it ships
//   * a level that DEALS one gets a seed, chosen by playing candidate boards until one
//     meets the target; an existing seed is re-checked rather than replaced
//
// Greedy play is a lower bound on what a person can find, so a board greedy clears the
// target on is a board the target is reachable on.
//
// Usage:  node tools/makeLevels.js [--write]

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { swapPairs } from '../src/board.js';
import { greedyPlay } from '../src/level.js';
import { dealLevel, loadRun } from '../src/levels.js';
import { parseArgs } from './args.js';

const PACK = new URL('../data/levels.json', import.meta.url);
const RULES = JSON.parse(readFileSync(new URL('../data/rules.json', import.meta.url), 'utf8'));
const GLYPHS = JSON.parse(readFileSync(new URL('../data/glyphs.json', import.meta.url), 'utf8')).glyphs;

const SEED_BASE = 20260825;
const SEED_STRIDE = 7919;
const SEED_TRIES = 4000;

/** Play a level exactly as it ships, and report what a greedy read clears. */
function greedyClears(spec, budget) {
  const dealt = dealLevel(spec, { rules: RULES, glyphs: GLYPHS, budget });
  const { board } = dealt;
  const candidates = swapPairs({ ...RULES, width: board.width, height: board.height });
  return greedyPlay(board, budget, dealt.rand, candidates).cleared;
}

/**
 * The first seed whose board clears `target` under greedy play.
 *
 * The candidate is dealt through `dealLevel`, the same path the game uses, because
 * dealing also draws from the seeded stream to pick each piece's drawing — validate a
 * board dealt any other way and the game gets a different one.
 *
 * @returns {{seed: number, greedy: number}}
 */
export function seedFor({ width, height, colors, target }, mix, budget, start) {
  const candidates = swapPairs({ ...RULES, width, height, colors });
  for (let i = 0; i < SEED_TRIES; i++) {
    const seed = start + i;
    const spec = { id: 0, width, height, colors, target, seed, act: { mix } };
    const dealt = dealLevel(spec, { rules: RULES, glyphs: GLYPHS, budget });
    const run = greedyPlay(dealt.board, budget, dealt.rand, candidates);
    if (run.cleared >= target) return { seed, greedy: run.cleared };
  }
  throw new Error(`no board in ${SEED_TRIES} seeds clears ${target} at ${colors} colors`); // boundary
}

function main() {
  const args = parseArgs(process.argv.slice(2), { write: { type: 'flag', default: false } });
  const pack = JSON.parse(readFileSync(PACK, 'utf8'));
  const budget = loadRun(pack).budget;

  console.log('level  act         board  source    target  greedy  seed');
  console.log('-'.repeat(66));
  let changed = 0;
  for (const act of pack.acts) {
    for (const level of act.levels) {
      const spec = { ...level, act };
      let source = 'authored';
      let greedy;
      if (level.board) {
        greedy = greedyClears(spec, budget);
        if (greedy < level.target) {
          throw new Error(
            `level ${level.id}: its board clears ${greedy} greedily, target is ${level.target}`,
          ); // boundary
        }
      } else if (Number.isInteger(level.seed) && greedyClears(spec, budget) >= level.target) {
        source = 'dealt';
        greedy = greedyClears(spec, budget);
      } else {
        const found = seedFor(level, act.mix, budget, SEED_BASE + level.id * SEED_STRIDE);
        level.seed = found.seed;
        greedy = found.greedy;
        source = 'dealt *';
        changed += 1;
      }
      const dealt = dealLevel(spec, { rules: RULES, glyphs: GLYPHS, budget });
      console.log(
        `${String(level.id).padStart(5)}  ${act.name.padEnd(11)}`
        + `${`${dealt.board.width}x${dealt.board.height}`.padStart(5)}  ${source.padEnd(8)}  `
        + `${String(level.target).padStart(6)}  ${String(greedy).padStart(6)}  `
        + `${level.seed ?? '—'}`,
      );
    }
  }

  const total = pack.acts.reduce((n, a) => n + a.levels.length, 0);
  console.log(`\n${total} levels across ${pack.acts.length} acts, every one reachable greedily.`);
  console.log(changed ? `${changed} seed(s) newly chosen (marked *)` : 'no seed needed changing');
  if (args.write) {
    writeFileSync(PACK, `${JSON.stringify(pack, null, 2)}\n`);
    console.log(`wrote ${PACK.pathname}`);
  } else {
    console.log('(dry run — pass --write to save)');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
