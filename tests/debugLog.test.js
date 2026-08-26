import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/rng.js';
import { ANCHOR, PUSH_LEFT, applySwap, blankBoard, createRecorder, settle } from '../src/board.js';
import { describeSwap, toText } from '../src/debugLog.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const PALETTE = read('../data/palette.json');
const byId = new Map(read('../data/glyphs.json').glyphs.map((g) => [g.id, g]));
const RULES = { width: 5, height: 8, colors: 6, adjacentOnly: false };
const rand = mulberry32(20260825);

function bareBoard() {
  const b = blankBoard(RULES);
  for (let r = 0; r < b.height; r++) for (let c = 0; c < b.width; c++) b.bg[r][c] = 5;
  return b;
}

const describe = (before, recorder, extra = {}) =>
  describeSwap({
    before,
    swap: [[0, 0], [0, 1]],
    recorder,
    palette: PALETTE,
    glyphsById: byId,
    moveNumber: 1,
    shown: 1,
    cleared: 1,
    ...extra,
  });

test('a dead move says so instead of pretending something happened', () => {
  const b = bareBoard();
  b.glyph[0][0] = 1;
  b.art[0][0] = 'pulse';
  b.glyph[0][1] = 2;
  b.art[0][1] = 'pulse';
  const text = toText(describe(b, { steps: [] }, { shown: 0, cleared: 0 }));
  assert.match(text, /dead move/);
});

test('every eaten piece says which sink ate it', () => {
  const seen = new Set();
  for (const [kind, expected] of [[ANCHOR, /shoved into an eater/], [null, /off the board edge/]]) {
    const b = bareBoard();
    for (let i = 0; i < 4; i++) {
      b.bg[0][i] = 4;
      b.glyph[0][i] = i;
      b.art[0][i] = 'pulse';
    }
    if (kind) {
      b.kind[0][0] = kind;
      b.art[0][0] = 'anchor';
    }
    b.kind[0][3] = PUSH_LEFT;
    b.art[0][3] = 'push-left';
    b.bg[0][3] = 3;
    b.glyph[0][3] = 3;
    const before = structuredClone(b);
    const recorder = createRecorder();
    settle(b, rand, recorder);
    const text = toText(describe(before, recorder));
    assert.match(text, expected);
    seen.add(expected.source);
  }
  assert.equal(seen.size, 2, 'the two sinks read differently');
});

test('a log names where, what and why for every line', () => {
  const b = bareBoard();
  for (let i = 0; i < 4; i++) {
    b.bg[0][i] = 4;
    b.glyph[0][i] = i;
    b.art[0][i] = 'pulse';
  }
  b.kind[0][0] = ANCHOR;
  b.art[0][0] = 'anchor';
  b.kind[0][3] = PUSH_LEFT;
  b.art[0][3] = 'push-left';
  b.bg[0][3] = 3;
  b.glyph[0][3] = 3;
  const before = structuredClone(b);
  const recorder = createRecorder();
  const { activated } = settle(b, rand, recorder);
  const entries = describe(before, recorder, { cleared: activated });
  const text = toText(entries);
  assert.match(text, /\[0,3\] Push left fires/);
  assert.match(text, /\[0,1\] eaten/);
  assert.match(text, /\[0,2\] -> \[0,1\]   shoved/);
  assert.match(text, /cell destroyed — it activated/);
  assert.match(text, /= 1 cell cleared in 1 step/);
  // Every line anchors to a cell or is a header the reader can hang them under.
  for (const { text: line } of entries) {
    assert.ok(/\[\d+,\d+\]|swap |step |shows |= /.test(line), `unanchored line: ${line}`);
  }
});

test('an unknown event type fails loudly rather than logging nothing', () => {
  const b = bareBoard();
  b.glyph[0][0] = 1;
  b.art[0][0] = 'pulse';
  const recorder = { steps: [{ snapshot: b, activated: [], events: [{ type: 'wat', at: [0, 0] }] }] };
  assert.throws(() => describe(b, recorder), /unlogged event type/);
});

test('the clipboard text indents by depth', () => {
  const out = toText([
    { depth: 0, text: 'a' },
    { depth: 2, text: 'b' },
  ]);
  assert.equal(out, 'a\n    b');
});

test('a real swap produces a log with a fire, a move and a total', () => {
  const b = bareBoard();
  for (let i = 0; i < 4; i++) {
    b.bg[1][i] = 4;
    b.glyph[1][i] = i;
    b.art[1][i] = 'pulse';
  }
  b.bg[1][3] = 0;
  b.glyph[1][3] = 3;
  // The piece swapped up from [2,3] is the one that lands on its own colour, so it
  // is the one whose ability the log has to name.
  b.glyph[2][3] = 0;
  b.kind[2][3] = PUSH_LEFT;
  b.art[2][3] = 'push-left';
  const before = structuredClone(b);
  const recorder = createRecorder();
  const { activated } = applySwap(b, [1, 3], [2, 3], rand, recorder);
  const text = toText(
    describeSwap({
      before, swap: [[1, 3], [2, 3]], recorder, palette: PALETTE, glyphsById: byId,
      moveNumber: 2, shown: 1, cleared: activated,
    }),
  );
  assert.match(text, /swap 2   \[1,3\] <-> \[2,3\]/);
  assert.match(text, /\[1,3\] Push left fires/);
  assert.match(text, /landed on/);
  assert.match(text, /-> \[1,1\]   shoved/);
  assert.match(text, /cells? cleared in/);
});
