import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SOURCE = JSON.parse(read('../data/example_board.json'));

// The write-up has to be a single self-contained file, so it carries a verbatim
// copy of the board it describes. Regenerate with `node tools/trapBoards.js --json`,
// paste into the <script id="board-data"> block, and this is the check that the
// copy is still a copy.
test('the board embedded in docs/trapping.html has not drifted from the JSON', () => {
  const html = read('../docs/trapping.html');
  const block = html.match(
    /<script type="application\/json" id="board-data">(.*?)<\/script>/s,
  );
  assert.ok(block, 'docs/trapping.html has no board-data block');
  assert.deepEqual(JSON.parse(block[1]), SOURCE);
});

// What the generator guarantees about any board it emits, whatever the swap rule
// in force when it was scored. The figures the write-up quotes are a record of one
// run, so they are not asserted here — re-scoring a board under a changed rule is
// supposed to give a different answer.
test('the example board is a board the generator could emit', () => {
  assert.equal(SOURCE.bg.length, SOURCE.h);
  for (let r = 0; r < SOURCE.h; r++) {
    assert.equal(SOURCE.bg[r].length, SOURCE.w);
    for (let c = 0; c < SOURCE.w; c++) {
      assert.ok(SOURCE.bg[r][c] < SOURCE.colors && SOURCE.glyph[r][c] < SOURCE.colors);
      assert.notEqual(SOURCE.glyph[r][c], SOURCE.bg[r][c], `[${r},${c}] spawned pre-matched`);
    }
  }
});
