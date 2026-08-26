import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardLayout, cellAt, cellOrigin, createGlyphLayer, VIEW } from '../src/render.js';

const GLOSS = JSON.parse(readFileSync(new URL('../data/gloss.json', import.meta.url), 'utf8'));
const GEOMETRY = JSON.parse(readFileSync(new URL('../data/geometry.json', import.meta.url), 'utf8'));
const PALETTE = JSON.parse(readFileSync(new URL('../data/palette.json', import.meta.url), 'utf8'));
const BOARD = { width: 5, height: 8 };

/** A 2D context that records the calls it is given and draws nothing. */
function recordingCtx(calls) {
  const note = (name) => (...args) => calls.push({ name, args });
  return {
    canvas: { width: 400, height: 700 },
    save: note('save'), restore: note('restore'), beginPath: note('beginPath'),
    rect: note('rect'), clip: note('clip'), moveTo: note('moveTo'), lineTo: note('lineTo'),
    arc: note('arc'), arcTo: note('arcTo'), closePath: note('closePath'),
    fill: note('fill'), stroke: note('stroke'), translate: note('translate'),
    scale: note('scale'), fillRect: note('fillRect'),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
}

test('the layout spans exactly the cells it lays out', () => {
  const layout = boardLayout(BOARD, 400, 700);
  const last = cellOrigin(layout, BOARD.height - 1, BOARD.width - 1);
  assert.equal(layout.originX + layout.spanW, last.x + layout.cell);
  assert.equal(layout.originY + layout.spanH, last.y + layout.cell);
});

test('every cell hit-tests back to itself', () => {
  const layout = boardLayout(BOARD, 400, 700);
  for (let r = 0; r < BOARD.height; r++) {
    for (let c = 0; c < BOARD.width; c++) {
      const { x, y } = cellOrigin(layout, r, c);
      assert.deepEqual(cellAt(layout, BOARD, x + layout.cell / 2, y + layout.cell / 2), [r, c]);
    }
  }
});

test('a point outside the board hit-tests to nothing', () => {
  const layout = boardLayout(BOARD, 400, 700);
  assert.equal(cellAt(layout, BOARD, layout.originX - 5, layout.originY + 5), null);
  assert.equal(cellAt(layout, BOARD, layout.originX + layout.spanW + 5, layout.originY + 5), null);
});

test('the glyph layer clips to the board before it draws anything', () => {
  const calls = [];
  const ctx = recordingCtx(calls);
  const layout = boardLayout(BOARD, 400, 700);
  createGlyphLayer().draw(ctx, {
    sprites: [{ art: 'pulse', ink: 0, x: 0, y: 0, scale: 1 }],
    layout,
    palette: PALETTE,
    gloss: GLOSS,
    geometry: GEOMETRY,
    glyphsById: new Map([['pulse', { form: 'circle', mag: 1, mark: 'none', rotation: 0 }]]),
  });
  const clipAt = calls.findIndex((c) => c.name === 'clip');
  const firstDraw = calls.findIndex((c) => c.name === 'fill' || c.name === 'stroke');
  assert.ok(clipAt >= 0, 'the layer clips');
  assert.ok(firstDraw > clipAt, 'and it clips before it paints');
  const rect = calls[clipAt - 1];
  assert.equal(rect.name, 'rect');
  assert.deepEqual(rect.args, [layout.originX, layout.originY, layout.spanW, layout.spanH]);
});

test('a piece travelling off the edge is drawn outside the clip, not inside it', () => {
  const layout = boardLayout(BOARD, 400, 700);
  // A sprite heading off the left edge sits at a negative column.
  const { x } = cellOrigin(layout, 0, -1);
  assert.ok(x + layout.cell <= layout.originX,
    'it is fully past the board edge, so the clip is what removes it');
});

// The renderer sizes the canvas backing store from the canvas's own rendered box, so
// the CSS that gives it a size is what stops that from being circular. Losing the rule
// does not fail any behavioural test — it just makes the page grow until it dies.
test('the stylesheet gives the canvas a size', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const rule = css.match(/(^|\n)canvas\s*\{([\s\S]*?)\}/);
  assert.ok(rule, 'styles.css has no canvas rule');
  assert.match(rule[2], /(^|\n)\s*width\s*:/, 'the canvas rule sets no width');
  assert.match(rule[2], /(^|\n)\s*height\s*:/, 'the canvas rule sets no height');
});
