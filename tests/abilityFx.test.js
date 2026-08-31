import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import { beamReach, beamStyleFor, targetsFor } from '../src/abilityFx.js';
import { ANCHOR, PULSE, PUSH_RIGHT, SINK, SWAP_DIAG, SWAP_ORTH, blankBoard } from '../src/board.js';

const RULES = { width: 5, height: 5, colors: 4, adjacentOnly: false };
const key = (cells) => cells.map((c) => c.join(',')).sort();

/** A board with a piece in every cell, so reach is never the limit. */
function full() {
  const b = blankBoard(RULES);
  for (let r = 0; r < b.height; r++) {
    for (let c = 0; c < b.width; c++) {
      b.glyph[r][c] = (r + c) % 3;
      b.kind[r][c] = '';
      b.art[r][c] = 'inert';
    }
  }
  return b;
}

test('a push reaches the one cell it shoves into', () => {
  const b = full();
  assert.deepEqual(targetsFor(PUSH_RIGHT, [2, 2], b), [[2, 3]]);
});

test('a pulse reaches all four, and a rotate takes the same ring', () => {
  const b = full();
  assert.deepEqual(key(targetsFor(PULSE, [2, 2], b)), key([[1, 2], [3, 2], [2, 1], [2, 3]]));
  assert.deepEqual(key(targetsFor('rotate', [2, 2], b)), key([[1, 2], [3, 2], [2, 1], [2, 3]]));
});

test('the two swaps are the same reach turned 45 degrees', () => {
  const b = full();
  const orth = key(targetsFor(SWAP_ORTH, [2, 2], b));
  const diag = key(targetsFor(SWAP_DIAG, [2, 2], b));
  assert.equal(orth.length, 4);
  assert.equal(diag.length, 4);
  assert.deepEqual(orth, key([[1, 2], [3, 2], [2, 1], [2, 3]]));
  assert.deepEqual(diag, key([[1, 1], [1, 3], [3, 1], [3, 3]]));
});

test('a beam only goes where a piece is standing', () => {
  const b = full();
  b.glyph[1][2] = null;          // an empty cell in reach
  b.alive[2][1] = false;         // and a hole
  assert.deepEqual(key(targetsFor(PULSE, [2, 2], b)), key([[3, 2], [2, 3]]));
});

test('an ability at the edge reaches only the board', () => {
  const b = full();
  assert.deepEqual(key(targetsFor(PULSE, [0, 0], b)), key([[1, 0], [0, 1]]));
});

test('an ability with nothing in reach throws nothing at all', () => {
  const b = blankBoard(RULES);   // every cell alive but empty
  assert.deepEqual(targetsFor(PULSE, [2, 2], b), []);
  assert.deepEqual(targetsFor(PUSH_RIGHT, [2, 2], b), []);
});

test('a sink takes hold of the far end of each arm, not the neighbour', () => {
  const b = full();
  // the arm running left from [2,2] ends at the board edge, [2,0]
  const targets = key(targetsFor(SINK, [2, 2], b));
  assert.ok(targets.includes('2,0'), `reached past its neighbour: ${targets}`);
  assert.ok(!targets.includes('2,1'), 'and not merely to the one beside it');
  assert.equal(targets.length, 4, 'one arm each way');
});

test('an anchor throws no beam, because it never fires', () => {
  const b = full();
  assert.deepEqual(targetsFor(ANCHOR, [2, 2], b), []);
  assert.deepEqual(targetsFor('', [2, 2], b), []);
});

test('a shove throws its beam and everything else grabs', () => {
  // Which way a beam behaves follows from what the ability does to the piece: a shove
  // sends it away, so the beam leaves; a swap, turn or sink take hold of it.
  for (const kind of ['pushUp', 'pushRight', 'pushDown', 'pushLeft', 'pulse']) {
    assert.equal(beamStyleFor(kind), 'throw', `${kind} sends pieces away`);
  }
  for (const kind of ['swapOrth', 'swapDiag', 'rotate', 'rotateRev', 'sink']) {
    assert.equal(beamStyleFor(kind), 'grab', `${kind} takes hold of pieces`);
  }
});

test('an ability that moves nothing has no beam at all', () => {
  assert.equal(beamStyleFor(ANCHOR), null);
  assert.equal(beamStyleFor(''), null);
});

test('every glyph that leaves by beam has a beam style, and the rest have none', () => {
  const pack = JSON.parse(
    readFileSync(new URL('../data/glyphs.json', import.meta.url), 'utf8'),
  ).glyphs;
  for (const glyph of pack) {
    const style = beamStyleFor(glyph.kind);
    if (glyph.exit === 'beam') assert.ok(style, `${glyph.id} exits by beam but throws none`);
    else assert.equal(style, null, `${glyph.id} does not beam, so it should have no style`);
  }
});

test('an anchor stops a beam short of itself', () => {
  const b = full();
  b.kind[2][4] = ANCHOR;                       // two clear cells away, then the anchor
  b.art[2][4] = 'anchor';
  const reach = beamReach(b, [2, 2], [0, 1], 4);
  assert.ok(Math.abs(reach - 1.5) < 1e-9,
    `stopped on the anchor's near edge, not its middle: got ${reach}`);
});

test('a beam with nothing in the way runs its whole reach', () => {
  const b = full();
  assert.equal(beamReach(b, [2, 0], [0, 1], 3), 3);
});

test('an anchor right beside a glyph stops the beam almost at once', () => {
  const b = full();
  b.kind[2][3] = ANCHOR;
  assert.ok(Math.abs(beamReach(b, [2, 2], [0, 1], 4) - 0.5) < 1e-9);
});

test('a beam stops at the board edge too', () => {
  const b = full();
  assert.equal(beamReach(b, [2, 3], [0, 1], 4), 1, 'one cell left before the edge');
});

test('the block works on a diagonal, which is where a swap throws', () => {
  const b = full();
  b.kind[0][0] = ANCHOR;
  assert.ok(Math.abs(beamReach(b, [2, 2], [-1, -1], 4) - 1.5) < 1e-9);
});

test('an anchor does not stop a beam pointed away from it', () => {
  const b = full();
  b.kind[2][3] = ANCHOR;
  assert.equal(beamReach(b, [2, 2], [0, -1], 2), 2, 'the other way is clear');
});
