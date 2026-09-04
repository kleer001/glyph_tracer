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
import { applySwap, copyBoard, gain, swapPairs } from '../src/board.js';
import { greedyPlay } from '../src/level.js';
import { dealLevel, loadRun } from '../src/levels.js';
import { maxLine, movePairs } from './puzzleBoards.js';
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
  // `dealt.budget`, not the pack's: a level that states its own gets that many swaps, and
  // playing a one-swap level six times over reports a number nobody can reach.
  return greedyPlay(board, dealt.budget, dealt.rand, candidates).cleared;
}

/**
 * How many swaps score at all, and how many of those actually reach the target.
 *
 * The second number is the one that matters. A level with a single swap budget has one
 * answer or it has none, and a board written by hand looks right long before it is: a
 * filler piece whose ink matches some other cell's ground quietly adds a second way to
 * finish, and the level stops being about the thing it was built to teach.
 *
 * Swaps that score but fall short are not a problem — they are the level asking whether
 * the player has understood, rather than counted.
 */
function answers(spec, budget, swaps) {
  const { board, rand } = dealLevel(spec, { rules: RULES, glyphs: GLYPHS, budget });
  const pairs = swapPairs({ ...RULES, width: board.width, height: board.height });
  let scores = 0;
  for (const [a, z] of pairs) {
    if (gain(board, a, z)) scores += 1;
  }
  // How many openings begin a line that reaches the target. Every opening is tried and
  // every line under it is followed, so this is the answer rather than a lower bound —
  // which greedy play is not, and cannot be on a level built to punish a greedy read.
  let reach = 0;
  for (const [a, z] of movePairs(board)) {
    const probe = copyBoard(board);
    const { activated } = applySwap(probe, a, z, rand);
    if (activated + maxLine(probe, swaps - 1) >= spec.target) reach += 1;
  }
  return { scores, reach };
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
  // Not loadRun yet: a dealt level has no seed until this tool picks one, and loadRun
  // rightly refuses a pack without them. Validation is what happens after, not before.
  const { budget } = pack;
  if (!Number.isInteger(budget) || budget < 1) {
    throw new Error('a level pack needs a swap budget'); // boundary
  }

  console.log('level  act         board  source    target  greedy  score  answer  seed');
  console.log('-'.repeat(81));
  let changed = 0;
  for (const act of pack.acts) {
    for (const level of act.levels) {
      const spec = { ...level, act };
      const swaps = level.budget ?? budget;
      // An exact search costs pairs to the power of the allowance. Two is affordable on
      // these board sizes; past that the count below would be the slowest thing here.
      const exact = Boolean(level.board) && swaps <= 2;
      let source = 'authored';
      let greedy;
      if (level.board) {
        // Greedy is reported, never trusted: a puzzle exists to punish a greedy read, so
        // greedy falling short is the level working. `reach` below is what decides.
        greedy = greedyClears(spec, budget);
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
      const { scores, reach } = answers(spec, budget, exact ? swaps : 0);
      console.log(
        `${String(level.id).padStart(5)}  ${act.name.padEnd(11)}`
        + `${`${dealt.board.width}x${dealt.board.height}`.padStart(5)}  ${source.padEnd(8)}  `
        + `${String(level.target).padStart(6)}  ${String(greedy).padStart(6)}  `
        + `${String(scores).padStart(5)}  ${String(exact ? reach : '—').padStart(6)}  ${level.seed ?? '—'}`
        + (exact && greedy < level.target ? '   greedy misses' : ''),
      );
      // Winnable, and winnable one way. A second answer means the level can be finished
      // without the character it exists to teach; none at all means it cannot be
      // finished. Greedy falling short is not a fault here — on a level built to reward
      // reading the glyph, it is the level working.
      if (exact && reach !== 1) {
        throw new Error(
          `level ${level.id}: ${reach} openings reach the target on ${swaps} swap(s)`,
        ); // boundary
      }
    }
  }

  // Now that every level has one, the pack has to pass the same check the game makes.
  loadRun(pack, GLYPHS);

  const total = pack.acts.reduce((n, a) => n + a.levels.length, 0);
  console.log(`\n${total} levels across ${pack.acts.length} acts, every one winnable.`);
  console.log(changed ? `${changed} seed(s) newly chosen (marked *)` : 'no seed needed changing');
  if (args.write) {
    writeFileSync(PACK, `${JSON.stringify(pack, null, 2)}\n`);
    console.log(`wrote ${PACK.pathname}`);
  } else {
    console.log('(dry run — pass --write to save)');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
