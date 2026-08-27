#!/usr/bin/env node
// Build data/levels.json from the run documented in docs/teaching.html.
//
// The doc is where the run is designed — which rung each level teaches, what factor
// it carries, what its target works out to. This turns that into the pack the game
// plays, so the two cannot describe different runs.
//
// Every level also gets a seed, chosen by playing candidate boards greedily until one
// meets the target. Greedy play is a lower bound on what a person can do, so a board
// that clears the target greedily is a board the target is reachable on. A level whose
// target could not be met would be unplayable, and nothing else would catch it.
//
// Usage:  node tools/makeLevels.js [--write]

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ANCHOR, PULSE, swapPairs } from '../src/board.js';
import { greedyPlay } from '../src/level.js';
import { dealLevel } from '../src/levels.js';
import { parseArgs } from './args.js';

const HTML = new URL('../docs/teaching.html', import.meta.url);
const OUT = new URL('../data/levels.json', import.meta.url);
const RULES = JSON.parse(readFileSync(new URL('../data/rules.json', import.meta.url), 'utf8'));
const GLYPHS = JSON.parse(readFileSync(new URL('../data/glyphs.json', import.meta.url), 'utf8')).glyphs;
/** Every kind a glyph is drawn for, so an act cannot name one that cannot appear. */
const KINDS = new Set(GLYPHS.map((g) => g.kind).filter(Boolean));

const SEED_BASE = 20260825;
const SEED_STRIDE = 7919;
const SEED_TRIES = 4000;

/** Pull the acts and their levels straight out of the run's own tables. */
export function readRun(html) {
  const acts = [...html.matchAll(
    /<div class="act" data-means='(\{.*?\})'>[\s\S]*?<span class="no">ACT ([IV]+)<\/span><span class="nm">(.*?)<\/span><span class="cfg">(.*?)<\/span>([\s\S]*?)<\/table>/g,
  )].map(([, means, roman, name, cfg, body]) => {
    // The act bar names its own mix — "25% pulse · 12.5% anchor · 6 swaps" — so an act
    // can ask for any kind the glyph pack draws without this parser learning its name.
    // The remainder of the board is inert, which is most of it.
    const mix = {};
    for (const [, pct, kind] of cfg.matchAll(/([\d.]+)%\s+([A-Za-z]+)/g)) {
      if (!KINDS.has(kind)) {
        throw new Error(`act ${roman} asks for "${kind}", which no glyph is drawn for`); // boundary
      }
      mix[kind] = Number(pct) / 100;
    }
    if (!Object.keys(mix).length) {
      throw new Error(`act ${roman} says nothing about what its boards are made of`); // boundary
    }
    return {
      id: name.toLowerCase().replace(/^the /, ''),
      no: roman,
      name,
      means: JSON.parse(means),
      mix,
      levels: [...body.matchAll(
        /<tr><td class="num">(\d+)<\/td><td class="num">(\d+)x(\d+)<\/td><td class="num">(\d+)<\/td><td class="teach">(.*?)<\/td><td class="num">([\d.]+)<\/td><td class="num">(\d+)<\/td><td class="note">(.*?)<\/td><\/tr>/g,
      )].map(([, id, width, height, colors, teaches, factor, target, note]) => ({
        id: Number(id),
        width: Number(width),
        height: Number(height),
        colors: Number(colors),
        teaches: text(teaches),
        factor: Number(factor),
        target: Number(target),
        note: text(note),
      })),
    };
  });
  // The doc decides how many acts the run has; this only checks it found some and that
  // none was parsed twice, which is what a bad splice into the doc looks like.
  if (!acts.length) throw new Error('the run has no acts'); // boundary
  const seen = new Set(acts.map((a) => a.no));
  if (seen.size !== acts.length) {
    throw new Error(`an act number appears twice: ${acts.map((a) => a.no).join(' ')}`); // boundary
  }
  return acts;
}

const text = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#215;/g, '×')
  .replace(/&rsquo;/g, '’').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

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
  const acts = readRun(readFileSync(HTML, 'utf8'));
  const budget = RULES.swapBudget;

  const pack = {
    note: 'Generated by tools/makeLevels.js from the run in docs/teaching.html. Every '
      + 'seed is a board greedy play can clear the target on, so no level ships unwinnable. '
      + 'Edit the run in the doc and regenerate; editing this file alone makes the two disagree '
      + 'and the tests say so.',
    budget,
    acts: [],
  };

  console.log(`level  act        board  colors  factor  target  greedy  seed`);
  console.log('-'.repeat(68));
  for (const act of acts) {
    const out = { id: act.id, no: act.no, name: act.name, mix: act.mix, levels: [] };
    for (const level of act.levels) {
      const { seed, greedy } = seedFor(level, act.mix, budget, SEED_BASE + level.id * SEED_STRIDE);
      out.levels.push({ ...level, seed });
      console.log(
        `${String(level.id).padStart(5)}  ${act.name.padEnd(10)} `
        + `${`${level.width}x${level.height}`.padStart(5)}  ${String(level.colors).padStart(6)}  `
        + `${level.factor.toFixed(2).padStart(6)}  ${String(level.target).padStart(6)}  `
        + `${String(greedy).padStart(6)}  ${seed}`,
      );
    }
    pack.acts.push(out);
  }

  const total = pack.acts.reduce((n, a) => n + a.levels.length, 0);
  console.log(`\n${total} levels across ${pack.acts.length} acts, every one reachable greedily.`);
  if (args.write) {
    writeFileSync(OUT, `${JSON.stringify(pack, null, 2)}\n`);
    console.log(`wrote ${OUT.pathname}`);
  } else {
    console.log('(dry run — pass --write to save)');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
