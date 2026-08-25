import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The level run is a document, but its targets are arithmetic: each one is the
// measured six-swap mean for that level's configuration times the level's factor.
// These check the document against its own stated means, so a target cannot drift
// away from the policy that produced it without the build going red.
const HTML = readFileSync(new URL('../docs/teaching.html', import.meta.url), 'utf8');

const ACTS = [...HTML.matchAll(/<div class="act" data-means='(\{.*?\})'>([\s\S]*?)<\/table>/g)].map(
  ([, means, body]) => ({
    means: JSON.parse(means),
    rows: [...body.matchAll(
      /<tr><td class="num">(\d+)<\/td><td class="num">(\d+)<\/td><td class="teach">.*?<\/td><td class="num">([\d.]+)<\/td><td class="num">(\d+)<\/td>/g,
    )].map(([, level, colors, factor, target]) => ({
      level: Number(level), colors: Number(colors), factor: Number(factor), target: Number(target),
    })),
  }),
);

test('the run has four acts and every act has levels', () => {
  assert.equal(ACTS.length, 4);
  for (const act of ACTS) assert.ok(act.rows.length > 0);
});

test('every target is its configuration mean times its factor, rounded', () => {
  for (const act of ACTS) {
    for (const row of act.rows) {
      const mean = act.means[row.colors];
      assert.ok(mean, `level ${row.level} uses ${row.colors} colors, which its act has no mean for`);
      assert.equal(row.target, Math.round(mean * row.factor),
        `level ${row.level}: ${mean} x ${row.factor} is not ${row.target}`);
    }
  }
});

test('levels are numbered from one with no gaps', () => {
  const levels = ACTS.flatMap((a) => a.rows.map((r) => r.level));
  assert.deepEqual(levels, levels.map((_, i) => i + 1));
});

test('every factor sits in one of the documented stage bands', () => {
  const bands = [...HTML.matchAll(/<td class="num">([\d.]+) – ([\d.]+)<\/td>/g)]
    .map(([, lo, hi]) => [Number(lo), Number(hi)]);
  assert.equal(bands.length, 3, 'teaching, practising, testing');
  for (const act of ACTS) {
    for (const row of act.rows) {
      assert.ok(bands.some(([lo, hi]) => row.factor >= lo && row.factor <= hi),
        `level ${row.level}'s factor ${row.factor} is outside every band`);
    }
  }
});

test('the difficulty factor rises across each act', () => {
  for (const act of ACTS) {
    const byPalette = new Map();
    for (const row of act.rows) {
      const seen = byPalette.get(row.colors) ?? [];
      seen.push(row.factor);
      byPalette.set(row.colors, seen);
    }
    for (const [colors, factors] of byPalette) {
      const sorted = [...factors].sort((a, b) => a - b);
      assert.deepEqual(factors, sorted,
        `at ${colors} colors the factor goes backwards: ${factors.join(', ')}`);
    }
  }
});

test('the stage bands agree with data/stages.json', () => {
  const stages = JSON.parse(readFileSync(new URL('../data/stages.json', import.meta.url), 'utf8'));
  const bands = [...HTML.matchAll(/<td class="num">([\d.]+) – ([\d.]+)<\/td>/g)]
    .map(([, lo, hi]) => [Number(lo), Number(hi)]);
  assert.deepEqual(stages.stages.map((s) => s.band), bands);
});

test('the dependency ladder is numbered from one with no gaps', () => {
  const rungs = [...HTML.matchAll(/<div class="rung"><span class="n">(\d+)<\/span>/g)].map(
    ([, n]) => Number(n),
  );
  assert.ok(rungs.length > 0);
  assert.deepEqual(rungs, rungs.map((_, i) => i + 1));
});

test('nothing in the run still teaches a rule the game does not have', () => {
  // The neighbour restriction was lifted, so neither the ladder nor any level may
  // present it as something to learn.
  const teaches = [
    ...HTML.matchAll(/<span class="what">(.*?)<\/span>/g),
    ...HTML.matchAll(/<td class="teach">(.*?)<\/td>/g),
  ].map(([, text]) => text.toLowerCase());
  for (const line of teaches) {
    assert.doesNotMatch(line, /neighbors only|only neighbors/, `still teaches: ${line}`);
  }
});

test('every doc page declares its encoding', () => {
  // They are UTF-8 and carry em-dashes and the ⊞ ⊠ ⊘ glyphs. Without a declaration a
  // browser guesses Latin-1 and renders all of them as mojibake.
  const docs = readdirSync(new URL('../docs/', import.meta.url)).filter((f) => f.endsWith('.html'));
  assert.ok(docs.length >= 3);
  for (const name of docs) {
    const html = readFileSync(new URL(`../docs/${name}`, import.meta.url), 'utf8');
    assert.match(html.slice(0, 200), /<meta charset="utf-8">/i, `${name} declares no charset`);
  }
});
