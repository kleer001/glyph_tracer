#!/usr/bin/env node
// Play every swap on a board and say what each one does.
//
// This is the tool for hand-authoring a level. A board written by hand looks right long
// before it is right: the two mistakes it keeps making are a shove nobody can see,
// because the pieces in the line are all one colour, and a second answer nobody
// intended, because some filler piece's ink happens to match another cell's ground.
// Both are invisible on the page and obvious here.
//
// Usage:
//   node tools/studyBoard.js                        # every authored level in the pack
//   node tools/studyBoard.js --level 12
//   node tools/studyBoard.js --rows "cA./cB./cD./fE./cF^"
//   node tools/studyBoard.js --rows "aB. bA." --all  # list every scoring swap, not the top few

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { applySwap, copyBoard, formatBoard, gain, parseBoard, swapPairs } from '../src/board.js';
import { mulberry32 } from '../src/rng.js';
import { parseArgs } from './args.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const RULES = read('../data/rules.json');
const GLYPHS = read('../data/glyphs.json').glyphs;

const SPEC = {
  level: { type: 'number', default: null },
  rows: { type: 'string', default: null },
  all: { type: 'flag', default: false },
};

/**
 * Every swap that scores, worst first, each resolved to completion.
 *
 * @param {string[]} rows - an authored board, as in data/levels.json.
 * @returns {{board: object, scored: Array<object>}} `scored` carries what the player can
 *   see (`shown`) beside what actually happens (`clears`), which is the whole point.
 */
export function studyBoard(rows) {
  const board = parseBoard(rows, GLYPHS, { adjacentOnly: RULES.adjacentOnly });
  const pairs = swapPairs({ width: board.width, height: board.height, adjacentOnly: RULES.adjacentOnly });
  const scored = [];
  for (const [a, z] of pairs) {
    const shown = gain(board, a, z);
    if (!shown) continue;
    const after = copyBoard(board);
    // The rand only breaks ties inside a settle, and a seeded one keeps this
    // reproducible across runs of the tool.
    const { activated, steps } = applySwap(after, a, z, mulberry32(1));
    scored.push({ a, z, shown, clears: activated, steps, after: formatBoard(after, GLYPHS) });
  }
  scored.sort((x, y) => y.clears - x.clears || y.shown - x.shown);
  return { board, scored };
}

function report(label, rows, target, all) {
  const { board, scored } = studyBoard(rows);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}   ${board.width}x${board.height}, ${board.colors} colours`
    + (target ? `, target ${target}` : ''));
  console.log('='.repeat(70));
  for (const row of rows) console.log(`    ${row}`);
  if (!scored.length) {
    console.log('\n  NO SWAP ON THIS BOARD DOES ANYTHING');
    return { scored, answers: 0 };
  }
  const answers = target ? scored.filter((s) => s.clears >= target).length : null;
  console.log(`\n  ${scored.length} swap(s) score`
    + (target ? `, ${answers} of them reach the target` : '')
    + `. best clears ${scored[0].clears} in ${scored[0].steps} step(s).`);
  for (const s of all ? scored : scored.slice(0, 6)) {
    const flag = target && s.clears >= target ? ' <- reaches the target' : '';
    console.log(`    [${s.a}] <-> [${s.z}]   shows ${s.shown}   clears ${String(s.clears).padStart(2)}`
      + `   ${s.steps} step(s)${flag}`);
  }
  if (!all && scored.length > 6) console.log(`    ... ${scored.length - 6} more (--all to list them)`);
  console.log('\n  after the best swap:');
  for (const row of scored[0].after) console.log(`      ${row}`);
  return { scored, answers };
}

function main() {
  const args = parseArgs(process.argv.slice(2), SPEC);

  if (args.rows) {
    report('board', args.rows.split('/').map((r) => r.trim()), null, args.all);
    return;
  }

  const pack = read('../data/levels.json');
  const authored = pack.acts.flatMap((act) =>
    act.levels.filter((l) => l.board).map((l) => ({ ...l, act })));
  if (!authored.length) throw new Error('no level in the pack carries a board'); // boundary

  const wanted = args.level === null ? authored : authored.filter((l) => l.id === args.level);
  if (!wanted.length) {
    throw new Error(`level ${args.level} does not carry a board; it is dealt from a seed`); // boundary
  }

  let ambiguous = 0;
  for (const level of wanted) {
    const budget = level.budget ?? pack.budget;
    const { answers } = report(
      `level ${level.id} · ${level.act.name} · ${level.teaches ?? ''}`,
      level.board, level.target, args.all,
    );
    // On a one-swap budget a second answer is a second way to finish, and the level
    // stops being about the thing it was built to teach.
    if (budget === 1 && answers !== 1) {
      console.log(`  !! budget is 1 and ${answers} swaps reach the target`);
      ambiguous += 1;
    }
  }
  console.log(`\n${wanted.length} board(s) studied`
    + (ambiguous ? `, ${ambiguous} with more than one answer` : ', every one with a single answer'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
