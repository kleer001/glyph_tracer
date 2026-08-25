import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORE_KEY, createProgress, stars } from '../src/progress.js';
import { cellTitle, tallyLabel } from '../src/picker.js';

/** A Storage-shaped object with none of the browser around it. */
const fakeStore = (seed = {}) => {
  const data = { ...seed };
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = String(v);
    },
    raw: data,
  };
};

const levels = [1, 2, 3].map((id) => ({ id, teaches: `rung ${id}`, target: 5, act: { budget: 6 } }));

test('stars come from swaps left over', () => {
  assert.equal(stars(null), 0, 'never finished');
  assert.equal(stars(0), 1, 'finished on the last swap');
  assert.equal(stars(1), 2);
  assert.equal(stars(2), 3);
  assert.equal(stars(5), 3, 'three is the ceiling');
});

test('a finish is recorded and survives a reload', () => {
  const store = fakeStore();
  createProgress(store).record(2, 1);
  const reloaded = createProgress(store);
  assert.equal(reloaded.best(2), 1);
  assert.equal(reloaded.stars(2), 2);
  assert.ok(reloaded.done(2));
  assert.ok(!reloaded.done(1));
});

test('a worse run never takes the stars away', () => {
  const p = createProgress(fakeStore());
  p.record(1, 3).record(1, 0);
  assert.equal(p.best(1), 3, 'the best run is kept, not the latest');
  assert.equal(p.stars(1), 3);
});

test('storage a player has edited is ignored rather than trusted', () => {
  for (const raw of ['not json', '[]', '{"1":"lots"}', '{"1":-2}', '{"1":1.5}']) {
    const p = createProgress(fakeStore({ [STORE_KEY]: raw }));
    assert.equal(p.best(1), null, `accepted ${raw}`);
  }
  const good = createProgress(fakeStore({ [STORE_KEY]: '{"1":2,"9":"x"}' }));
  assert.equal(good.best(1), 2, 'the sound entries still load');
  assert.equal(good.best(9), null);
});

test('a store that refuses to write does not stop the run', () => {
  const broken = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
  };
  const p = createProgress(broken);
  assert.doesNotThrow(() => p.record(1, 2));
  assert.equal(p.best(1), 2, 'it is still remembered for this session');
});

test('an act tallies what is done and what is earned', () => {
  const p = createProgress(fakeStore());
  assert.deepEqual(p.tally(levels), { done: 0, total: 3, earned: 0, possible: 9, complete: false });
  p.record(1, 2).record(2, 0);
  assert.deepEqual(p.tally(levels), { done: 2, total: 3, earned: 4, possible: 9, complete: false });
  p.record(3, 2);
  assert.equal(p.tally(levels).complete, true);
});

test('the run resumes at the first unfinished level', () => {
  const p = createProgress(fakeStore());
  assert.equal(p.resumeAt(levels).id, 1);
  p.record(1, 1);
  assert.equal(p.resumeAt(levels).id, 2);
  p.record(2, 1).record(3, 1);
  assert.equal(p.resumeAt(levels).id, 3, 'a finished run rests on its last level');
});

test('an act chip says where you are, or that you are done', () => {
  assert.equal(tallyLabel({ done: 2, total: 5, earned: 4, possible: 15, complete: false }), '2/5 · 4★');
  assert.equal(tallyLabel({ done: 5, total: 5, earned: 15, possible: 15, complete: true }), 'done · 15/15★');
});

test('a level cell says what it teaches and how it went', () => {
  const p = createProgress(fakeStore());
  assert.match(cellTitle(levels[0], p), /^01 — rung 1 · not finished$/);
  p.record(1, 1);
  assert.match(cellTitle(levels[0], p), /finished with 1 swap to spare \(2\/3\)/);
  p.record(1, 3);
  assert.match(cellTitle(levels[0], p), /3 swaps to spare \(3\/3\)/);
});
