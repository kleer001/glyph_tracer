import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { swapPairs } from '../src/board.js';
import { greedyPlay } from '../src/level.js';
import { dealLevel, loadRun, nextAfter, outcome } from '../src/levels.js';
import { readRun } from '../tools/makeLevels.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const PACK = read('../data/levels.json');
const RULES = read('../data/rules.json');
const GLYPHS = read('../data/glyphs.json').glyphs;
const RUN = loadRun(PACK);

test('the run is four acts of consecutive levels', () => {
  assert.equal(RUN.acts.length, 4);
  assert.deepEqual(RUN.levels.map((l) => l.id), RUN.levels.map((_, i) => i + 1));
  assert.equal(RUN.levels.length, RUN.acts.reduce((n, a) => n + a.levels.length, 0));
});

test('a pack that skips a level fails loudly rather than shipping a hole', () => {
  const holed = structuredClone(PACK);
  holed.acts[0].levels.splice(1, 1);
  assert.throws(() => loadRun(holed), /skips or repeats/);
});

test('a pack missing a budget or a target fails loudly', () => {
  assert.throws(() => loadRun({ acts: PACK.acts }), /swap budget/);
  const noTarget = structuredClone(PACK);
  delete noTarget.acts[0].levels[0].target;
  assert.throws(() => loadRun(noTarget), /target/);
});

// The guarantee the pack exists to make. Greedy play is a lower bound on what a
// person can find, so a board greedy can clear the target on is a board the target is
// reachable on. Without this a level could ship unwinnable and nothing would say so.
test('every shipped level can be won', () => {
  for (const level of RUN.levels) {
    const dealt = dealLevel(level, { rules: RULES, glyphs: GLYPHS, budget: RUN.budget });
    const rules = { ...RULES, colors: level.colors };
    const run = greedyPlay(dealt.board, RUN.budget, dealt.rand, swapPairs(rules));
    assert.ok(run.cleared >= level.target,
      `level ${level.id}: greedy play clears ${run.cleared}, target is ${level.target}`);
  }
});

test('a level deals the same board every time it is opened', () => {
  const spec = RUN.levels[7];
  const a = dealLevel(spec, { rules: RULES, glyphs: GLYPHS, budget: RUN.budget });
  const b = dealLevel(spec, { rules: RULES, glyphs: GLYPHS, budget: RUN.budget });
  assert.deepEqual(a.board, b.board);
  assert.equal(a.target, spec.target);
  assert.equal(a.budget, RUN.budget);
});

test('a level opens unplayed and unwon', () => {
  const dealt = dealLevel(RUN.levels[0], { rules: RULES, glyphs: GLYPHS, budget: RUN.budget });
  assert.equal(outcome(dealt), 'playing');
  assert.equal(dealt.cleared, 0);
  assert.equal(dealt.swapsUsed, 0);
});

test('a level is won on its target and lost on its budget', () => {
  const dealt = dealLevel(RUN.levels[0], { rules: RULES, glyphs: GLYPHS, budget: RUN.budget });
  assert.equal(outcome({ ...dealt, cleared: dealt.target }), 'won');
  assert.equal(outcome({ ...dealt, cleared: dealt.target - 1, swapsUsed: RUN.budget }), 'lost');
  // Meeting the target on the last swap is a win, not a loss.
  assert.equal(outcome({ ...dealt, cleared: dealt.target, swapsUsed: RUN.budget }), 'won');
});

test('the run ends rather than running off its end', () => {
  assert.equal(nextAfter(RUN, 1).id, 2);
  assert.equal(nextAfter(RUN, RUN.levels.length), null);
});

// The pack is generated from the doc, so the two describing different runs would mean
// the game and its design record had quietly diverged.
test('the pack is the run documented in docs/teaching.html', () => {
  const doc = readRun(readFileSync(new URL('../docs/teaching.html', import.meta.url), 'utf8'));
  assert.equal(doc.length, PACK.acts.length);
  doc.forEach((act, i) => {
    const packed = PACK.acts[i];
    assert.equal(packed.name, act.name, `act ${i + 1} name`);
    assert.equal(packed.no, act.no);
    assert.deepEqual(packed.mix, act.mix, `act ${act.name} board mix`);
    assert.equal(packed.levels.length, act.levels.length);
    act.levels.forEach((level, j) => {
      const p = packed.levels[j];
      for (const field of ['id', 'colors', 'factor', 'target', 'teaches']) {
        assert.equal(p[field], level[field], `level ${level.id}: ${field}`);
      }
    });
  });
});

test('every act says what its boards are made of, in kinds the engine runs', () => {
  const kinds = new Set(read('../data/glyphs.json').glyphs.map((g) => g.kind));
  for (const act of RUN.acts) {
    const named = Object.keys(act.mix);
    assert.ok(named.length, `${act.name} says nothing about its boards`);
    for (const kind of named) {
      assert.ok(kinds.has(kind), `${act.name} asks for "${kind}", which no glyph is drawn for`);
      assert.equal(typeof act.mix[kind], 'number', `${act.name}'s ${kind} is not a fraction`);
    }
  }
});
