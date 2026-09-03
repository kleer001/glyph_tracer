import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applySwap, copyBoard, gain, swapPairs } from '../src/board.js';
import { greedyPlay } from '../src/level.js';
import { dealLevel, loadRun, nextAfter, outcome } from '../src/levels.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const PACK = read('../data/levels.json');
const RULES = read('../data/rules.json');
const GLYPHS = read('../data/glyphs.json').glyphs;
const RUN = loadRun(PACK, GLYPHS);

test('the run is acts of consecutive levels', () => {
  assert.ok(RUN.acts.length > 0, 'the pack has no acts');
  assert.deepEqual(RUN.levels.map((l) => l.id), RUN.levels.map((_, i) => i + 1));
  assert.equal(RUN.levels.length, RUN.acts.reduce((n, a) => n + a.levels.length, 0));
});

test('a pack that skips a level fails loudly rather than shipping a hole', () => {
  const holed = structuredClone(PACK);
  holed.acts[0].levels.splice(1, 1);
  assert.throws(() => loadRun(holed, GLYPHS), /skips or repeats/);
});

test('a pack missing a budget or a target fails loudly', () => {
  assert.throws(() => loadRun({ acts: PACK.acts }, GLYPHS), /swap budget/);
  const noTarget = structuredClone(PACK);
  delete noTarget.acts[0].levels[0].target;
  assert.throws(() => loadRun(noTarget, GLYPHS), /target/);
});

// The guarantee the pack exists to make. Greedy play is a lower bound on what a
// person can find, so a board greedy can clear the target on is a board the target is
// reachable on. Without this a level could ship unwinnable and nothing would say so.
test('every shipped level can be won', () => {
  for (const level of RUN.levels) {
    const dealt = dealLevel(level, { rules: RULES, glyphs: GLYPHS, budget: RUN.budget });
    // The candidate pairs have to come from the board the level actually opened — a
    // spec's stated size is absent on a level that carries its board, and wrong for
    // any level smaller than the default.
    const { width, height } = dealt.board;
    const pairs = swapPairs({ ...RULES, width, height });

    if (dealt.budget === 1) {
      // One swap is the whole level, so every swap can be tried and the answer is
      // exact. Greedy is the wrong instrument here: a level built to reward reading a
      // glyph offers a visible match that falls short, and greedy takes it.
      const answers = pairs.filter(([a, z]) => {
        if (!gain(dealt.board, a, z)) return false;
        const probe = copyBoard(dealt.board);
        return applySwap(probe, a, z, dealt.rand).activated >= level.target;
      });
      assert.equal(answers.length, 1,
        `level ${level.id}: ${answers.length} swaps reach a target of ${level.target}, on a budget of 1`);
      continue;
    }

    const run = greedyPlay(dealt.board, dealt.budget, dealt.rand, pairs);
    assert.ok(run.cleared >= level.target,
      `level ${level.id}: greedy play clears ${run.cleared}, target is ${level.target}`);
  }
});

test('a level opens the same board every time', () => {
  // Whichever way a level names its board, opening it twice has to give the same one.
  const specs = [RUN.levels.find((l) => l.board), RUN.levels.find((l) => !l.board)]
    .filter(Boolean);
  assert.ok(specs.length, 'the run has no levels');
  for (const spec of specs) {
    const opts = { rules: RULES, glyphs: GLYPHS, budget: RUN.budget };
    const a = dealLevel(spec, opts);
    assert.deepEqual(a.board, dealLevel(spec, opts).board, `level ${spec.id}`);
    assert.equal(a.target, spec.target);
    assert.equal(a.budget, spec.budget ?? RUN.budget);
  }
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

test('every act says what its boards are made of, in kinds the engine runs', () => {
  const kinds = new Set(read('../data/glyphs.json').glyphs.map((g) => g.kind));
  for (const act of RUN.acts) {
    // An act whose levels all carry their boards has no mix to state — there is
    // nothing to deal, so a proportion of kinds would describe nothing.
    if (act.levels.every((l) => l.board)) continue;
    const named = Object.keys(act.mix);
    assert.ok(named.length, `${act.name} says nothing about its boards`);
    for (const kind of named) {
      assert.ok(kinds.has(kind), `${act.name} asks for "${kind}", which no glyph is drawn for`);
      assert.equal(typeof act.mix[kind], 'number', `${act.name}'s ${kind} is not a fraction`);
    }
  }
});

// The two ways a level can name a board, and the guarantee that carrying one changes
// nothing downstream: `dealLevel` returns the same shape either way.
test('a level can carry its board instead of dealing one', () => {
  const spec = {
    id: 1,
    target: 2,
    board: [
      'aB. bAO cB^',
      'bC+ aBX cAH',
      'cA@ bC% aBS',
    ],
    act: { mix: {} },
  };
  const dealt = dealLevel(spec, { rules: RULES, glyphs: GLYPHS, budget: 6 });
  assert.equal(dealt.board.width, 3);
  assert.equal(dealt.board.height, 3);
  assert.deepEqual(dealt.board.kind[1], ['swapOrth', 'swapDiag', 'anchor']);
  assert.equal(dealt.board.art[2][2], 'sink');
  assert.equal(outcome(dealt), 'playing');
});

test('an authored level opens the same board every time', () => {
  const spec = { id: 1, target: 1, board: ['aB. bAO', 'cB^ aC.'], act: { mix: {} } };
  const opts = { rules: RULES, glyphs: GLYPHS, budget: 6 };
  assert.deepEqual(dealLevel(spec, opts).board, dealLevel(spec, opts).board);
});

test('an authored level is checked against the board it carries, not a stated size', () => {
  const pack = {
    budget: 6,
    acts: [{ id: 'a', no: 'I', name: 'A', mix: {}, levels: [
      { id: 1, target: 99, board: ['aB. bAO', 'cB^ aC.'] },
    ] }],
  };
  assert.throws(() => loadRun(pack, GLYPHS), /target 99 exceeds its 2x2 board/);
});

test('a ragged authored board fails loudly rather than shipping a hole', () => {
  const pack = {
    budget: 6,
    acts: [{ id: 'a', no: 'I', name: 'A', mix: {}, levels: [
      { id: 1, target: 1, board: ['aB. bAO', 'cB^'] },
    ] }],
  };
  assert.throws(() => loadRun(pack, GLYPHS), /board row 1 has 1 cells, row 0 has 2/);
});

// The author, not the player, is the one who should hear about a mistyped cell — so a
// bad board twenty levels in has to be a startup error, not a surprise on level twenty.
test('a mistyped cell is reported at load, against the level it is in', () => {
  const bad = (board) => ({
    budget: 6,
    acts: [{ id: 'a', no: 'I', name: 'A', mix: {}, levels: [{ id: 1, target: 1, board }] }],
  });
  assert.throws(() => loadRun(bad(['aB. bAZ']), GLYPHS), /level 1: .*"Z" is no glyph's mark/);
  assert.throws(() => loadRun(bad(['zB. bA.']), GLYPHS), /level 1: .*"z" is not a ground colour/);
  assert.throws(() => loadRun(bad(['aB. bA']), GLYPHS), /level 1: .*is not three characters/);
});

// randomBoard cannot deal a piece onto its own colour, so nothing the game shows the
// player ever opens mid-match. An authored board has to keep that promise too.
test('a board that opens already matched fails loudly', () => {
  const pack = {
    budget: 6,
    acts: [{ id: 'a', no: 'I', name: 'A', mix: {}, levels: [
      { id: 1, target: 1, board: ['aA. cD.'] },
    ] }],
  };
  assert.throws(() => loadRun(pack, GLYPHS), /\[0,0\] already sits on its own colour/);
});

// A teaching level wants one swap and a hard stop; a full board wants six. The pack's
// budget is the default, so a level that states its own gets it.
test('a level can set its own swap budget', () => {
  const opts = { rules: RULES, glyphs: GLYPHS, budget: 6 };
  const spec = { id: 1, target: 2, board: ['aB. bA.'], act: { mix: {} } };
  assert.equal(dealLevel(spec, opts).budget, 6, 'without one, the pack decides');
  assert.equal(dealLevel({ ...spec, budget: 1 }, opts).budget, 1);
  // and it is what a loss is measured against
  const tight = dealLevel({ ...spec, budget: 1 }, opts);
  assert.equal(outcome({ ...tight, swapsUsed: 1, cleared: 0 }), 'lost');
});

test('a budget that is not a positive whole number fails loudly', () => {
  const pack = (budget) => ({
    budget: 6,
    acts: [{ id: 'a', no: 'I', name: 'A', mix: {}, levels: [
      { id: 1, target: 2, budget, board: ['aB. bA.'] },
    ] }],
  });
  assert.throws(() => loadRun(pack(0), GLYPHS), /"budget" must be a positive whole number/);
  assert.throws(() => loadRun(pack(1.5), GLYPHS), /"budget" must be a positive whole number/);
  assert.doesNotThrow(() => loadRun(pack(1), GLYPHS));
});
