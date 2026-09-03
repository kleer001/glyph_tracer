#!/usr/bin/env node
// Build a puzzle board: you place the pieces, the search finds the colouring.
//
// A puzzle level has a right answer. That means three things at once — a line of swaps
// that clears more than any other, exactly one opening that reaches it, and a board where
// the swap showing the biggest payoff is not that opening. The first two are what makes
// it a puzzle. The third is what makes it hard on a board small enough to read.
//
// The layout is the author's and the search never touches it. Where the pieces sit is
// the statement of what a lesson is about, so a search free to move them would erase it —
// and it is also the whitelist: a lesson can only be taught with the glyphs it has
// placed. What the search does move is colour, which is the one layer a player cannot
// reason about ahead of time and the one an author cannot hand-solve.
//
// What a level asks for is what its answer activates, which is not the same as how much
// of the board went away: a piece shoved into a sink leaves without ever landing on its
// own colour, and the counter never sees it.
//
// Cost. The search is exact -- every opening tried, every line followed -- and only the
// last swap of a line is restricted to swaps that score, since one that lands nothing
// adds nothing. The price climbs steeply with the allowance: one swap is a few hundred
// settles per candidate colouring, three is thousands. `--iters` is the knob.
//
// Usage:
//   node tools/puzzleBoards.js --layout "._./^O^/._."
//   node tools/puzzleBoards.js --layout ".^./_H_" --colors 4 --swaps 2 --iters 4000
//
// A layout row is one character per cell: any glyph's `mark` from data/glyphs.json,
// `_` for a live cell with nothing on it, `#` for a cell that is not part of the board.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  applySwap,
  blankBoard,
  COLOR_LETTERS,
  copyBoard,
  formatBoard,
  gain,
  occupied,
} from '../src/board.js';
import { mulberry32 } from '../src/rng.js';
import { parseArgs } from './args.js';

const GLYPHS = JSON.parse(
  readFileSync(new URL('../data/glyphs.json', import.meta.url), 'utf8'),
).glyphs;
const BY_MARK = new Map(GLYPHS.map((g) => [g.mark, g]));
const DEAD = '#';
const EMPTY = '_';

// No ability draws a number, so nothing downstream of this ever calls it. It exists to
// satisfy the signature the engine takes.
const RAND = mulberry32(1);

const SPEC = {
  layout: { type: 'string', default: null },
  colors: { type: 'number', default: 4 },
  swaps: { type: 'number', default: 1 },
  iters: { type: 'number', default: 3000 },
  seed: { type: 'number', default: 20260902 },
  json: { type: 'string', default: null },
};

/** A layout into an uncoloured board: alive, kind and art set, colours still to find. */
export function parseLayout(text, colors) {
  const rows = String(text).split('/').map((row) => row.trim()).filter(Boolean);
  if (!rows.length) throw new Error('a layout needs rows'); // boundary
  const width = rows[0].length;
  rows.forEach((row, r) => {
    if (row.length !== width) {
      throw new Error(`layout row ${r} is ${row.length} cells, row 0 is ${width}`); // boundary
    }
  });
  const b = blankBoard({ width, height: rows.length, colors, adjacentOnly: false });
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === DEAD) {
      b.alive[r][c] = false;
      return;
    }
    if (ch === EMPTY) return;
    const piece = BY_MARK.get(ch);
    if (!piece) throw new Error(`layout [${r},${c}]: "${ch}" is no glyph's mark`); // boundary
    b.kind[r][c] = piece.kind;
    b.art[r][c] = piece.id;
    b.glyph[r][c] = 0;
  }));
  return b;
}

/** How many pieces are still standing. A board is solved when this reaches zero. */
export function pieces(b) {
  let n = 0;
  for (let r = 0; r < b.height; r++) {
    for (let c = 0; c < b.width; c++) if (occupied(b, r, c)) n += 1;
  }
  return n;
}

/** Two cells hold the same thing, so trading them is not a move. */
function alike(b, [r1, c1], [r2, c2]) {
  return b.glyph[r1][c1] === b.glyph[r2][c2] && b.kind[r1][c1] === b.kind[r2][c2];
}

/** Every swap that changes the board. Dead cells hold nothing, so they are not in it. */
export function movePairs(b) {
  const live = [];
  for (let r = 0; r < b.height; r++) {
    for (let c = 0; c < b.width; c++) if (b.alive[r][c]) live.push([r, c]);
  }
  const out = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      if (!alike(b, live[i], live[j])) out.push([live[i], live[j]]);
    }
  }
  return out;
}

/**
 * Every swap that changes the board, with what it visibly pays, biggest first. Trying
 * the loud swaps before the quiet ones is what makes the bound below worth having: it
 * finds a strong line early, and everything weaker than that line is skipped.
 */
function ranked(b, last) {
  const rows = [];
  for (const [a, z] of movePairs(b)) {
    const imm = gain(b, a, z);
    if (last && !imm) continue; // a swap that lands nothing cannot be a line's last
    rows.push({ a, z, imm });
  }
  return rows.sort((x, y) => y.imm - x.imm);
}

/**
 * The most a line of at most `depth` swaps can activate.
 *
 * The last swap of a line is restricted to swaps that score, because one that lands
 * nothing adds nothing and is the same as stopping early. Every earlier swap is
 * unrestricted: setting a piece up before firing it is a move.
 *
 * A line can never activate more cells than there are pieces left to activate, so a
 * branch whose swap plus the whole rest of the board still falls short of the best line
 * already found is not followed. That bound is what makes a two- and three-swap search
 * finish: without it every opening pays for the entire tree beneath it.
 */
export function maxLine(b, depth) {
  if (depth <= 0 || !pieces(b)) return 0;
  let best = 0;
  for (const { a, z } of ranked(b, depth === 1)) {
    const probe = copyBoard(b);
    const { activated } = applySwap(probe, a, z, RAND);
    if (activated > best) best = activated;
    if (depth > 1 && activated + pieces(probe) >= best) {
      const got = activated + maxLine(probe, depth - 1);
      if (got > best) best = got;
    }
  }
  return best;
}

/**
 * What kind of puzzle a colouring makes: the most any line can clear, how many openings
 * reach it, and how far short the swap a greedy read takes falls.
 *
 * The greedy read is the worst swap tied for the biggest visible payoff. A player cannot
 * see a cascade, only whether a swap lands one glyph on its colour or two, so that tie is
 * where a habit picks from — and the gap between what it clears and what the answer
 * clears is the whole difficulty of a board small enough to read.
 *
 * Those swaps are scored first and never pruned, so what the habit is worth is exact.
 */
export function analyse(b, swaps) {
  const rows = ranked(b, swaps === 1);
  const topImm = rows.length ? rows[0].imm : 0;
  let best = 0;
  let lureBest = Infinity;
  const totals = [];
  for (const { a, z, imm } of rows) {
    const probe = copyBoard(b);
    const { activated } = applySwap(probe, a, z, RAND);
    const lure = imm === topImm;
    // A branch that cannot match the best line is not a winner, and only winners and
    // the greedy pick are read back out.
    if (!lure && activated + pieces(probe) < best) continue;
    const total = activated + maxLine(probe, swaps - 1);
    if (total > best) best = total;
    if (lure && total < lureBest) lureBest = total;
    totals.push({ a, z, imm, total });
  }
  return {
    best,
    topImm,
    lureBest: Number.isFinite(lureBest) ? lureBest : 0,
    winners: totals.filter((t) => t.total === best),
    opens: rows.length,
  };
}

/**
 * A puzzle wants three things, weighted in the order they matter: an answer worth
 * finding, only one way to it, and a greedy read that walks past it.
 */
export function score(m) {
  // A colouring nothing can clear is not a worse puzzle, it is not a puzzle. Without
  // this floor the search settles on a board where every cell is identical: no swap
  // changes anything, so nothing is ambiguous and the uniqueness penalty never bites.
  if (m.best === 0) return -1e6;
  return 2.0 * m.best + 2.0 * (m.best - m.lureBest) - 6.0 * Math.max(0, m.winners.length - 1);
}

/** Repaint one cell. A piece never starts on its own colour, so the two move together. */
function repaint(b, rand) {
  const cells = [];
  for (let r = 0; r < b.height; r++) {
    for (let c = 0; c < b.width; c++) if (b.alive[r][c]) cells.push([r, c]);
  }
  const [r, c] = cells[Math.floor(rand() * cells.length)];
  const pick = () => Math.floor(rand() * b.colors);
  if (b.glyph[r][c] === null || rand() < 0.5) {
    b.bg[r][c] = pick();
    if (b.glyph[r][c] === b.bg[r][c]) b.glyph[r][c] = (b.glyph[r][c] + 1) % b.colors;
    return;
  }
  const g = Math.floor(rand() * (b.colors - 1));
  b.glyph[r][c] = g >= b.bg[r][c] ? g + 1 : g;
}

/** Anneal a colouring onto a layout. */
export function anneal(layout, { swaps, iters, seed }) {
  const rand = mulberry32(seed);
  let cur = copyBoard(layout);
  for (let n = 0; n < cur.height * cur.width * 4; n++) repaint(cur, rand);
  let m = analyse(cur, swaps);
  let s = score(m);
  let best = { board: copyBoard(cur), m, s };
  for (let i = 0; i < iters; i++) {
    const T = 1.2 * Math.exp((-4.0 * i) / iters);
    const cand = copyBoard(cur);
    repaint(cand, rand);
    const cm = analyse(cand, swaps);
    const cs = score(cm);
    if (cs >= s || rand() < Math.exp((cs - s) / Math.max(T, 1e-6))) {
      cur = cand;
      m = cm;
      s = cs;
      if (cs > best.s) best = { board: cand, m: cm, s: cs };
    }
  }
  return best;
}

/**
 * The answer, swap by swap. `target` is what it activates: a piece eaten at a sink
 * leaves the board without activating, so what a level asks for is what its line
 * actually lights up rather than how much of the board went away.
 */
export function solution(b, opening, swaps) {
  const line = [];
  const cur = copyBoard(b);
  let pair = opening;
  let target = 0;
  for (let depth = swaps; depth > 0 && pair; depth--) {
    const { activated } = applySwap(cur, pair[0], pair[1], RAND);
    line.push({ pair, activated });
    target += activated;
    pair = null;
    if (depth === 1) break; // the allowance is spent; there is no next swap to find
    let best = 0;
    for (const [a, z] of movePairs(cur)) {
      if (depth === 2 && !gain(cur, a, z)) continue;
      const probe = copyBoard(cur);
      const got = applySwap(probe, a, z, RAND).activated + maxLine(probe, depth - 2);
      if (got > best) { best = got; pair = [a, z]; }
    }
  }
  return { line, target, left: pieces(cur) };
}

/** Each cell as ground letter, ink letter and the mark of what it carries. */
function render(b) {
  return Array.from({ length: b.height }, (_, r) =>
    '  ' + Array.from({ length: b.width }, (_, c) => {
      if (!b.alive[r][c]) return ' ##  ';
      if (b.glyph[r][c] === null) return ` ${COLOR_LETTERS[b.bg[r][c]]}__ `;
      const mark = GLYPHS.find((g) => g.id === b.art[r][c]).mark;
      return ` ${COLOR_LETTERS[b.bg[r][c]]}${COLOR_LETTERS[b.glyph[r][c]].toUpperCase()}${mark} `;
    }).join('')).join('\n');
}

function report({ board, m }, swaps) {
  console.log(`\n${render(board)}\n`);
  console.log('  lowercase = ground, UPPERCASE = ink, third character = the glyph\n');
  if (!m.winners.length) {
    console.log('  NO ANSWER — no swap on this board activates anything.');
    console.log('  Raise --iters, or give the layout more colours to separate.\n');
    return null;
  }
  const top = m.winners[0];
  const { line, target, left } = solution(board, [top.a, top.z], swaps);
  console.log('  as a level board:\n');
  for (const row of formatBoard(board, GLYPHS)) console.log(`      "${row}",`);
  console.log(`\n      "target": ${target}, "budget": ${swaps}\n`);
  line.forEach(({ pair, activated }, i) => {
    console.log(`  swap ${i + 1}   [${pair[0]}] <-> [${pair[1]}]   activates ${activated}`);
  });
  console.log(
    `\n  the answer clears ${target} and leaves ${left} piece(s) standing` +
      `, out of ${m.opens} swaps that land a match`,
  );
  console.log(
    `  ${m.winners.length} swap(s) reach it, and a greedy read — the worst of the ` +
      `${m.topImm}-match swaps — clears ${m.lureBest}\n`,
  );
  if (m.winners.length > 1) console.log('  MORE THAN ONE ANSWER — this is not a puzzle yet.\n');
  return { target, line };
}

function main() {
  const args = parseArgs(process.argv.slice(2), SPEC);
  if (!args.layout) throw new Error('--layout is required'); // boundary
  if (args.swaps < 1) throw new Error('--swaps must be at least 1'); // boundary
  const layout = parseLayout(args.layout, args.colors);
  const started = Date.now();
  const best = anneal(layout, { swaps: args.swaps, iters: args.iters, seed: args.seed });
  const out = report(best, args.swaps);
  console.log(`  ${args.iters} iterations in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  if (args.json && out) {
    writeFileSync(args.json, JSON.stringify({
      board: formatBoard(best.board, GLYPHS),
      target: out.target,
      budget: args.swaps,
      line: out.line.map(({ pair, activated }) => ({ a: pair[0], z: pair[1], activated })),
      winners: best.m.winners.length,
      lureWins: best.m.lureWins,
    }, null, 2));
    console.log(`  wrote ${args.json}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
