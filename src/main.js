// Entry point for the vertical slice. Tap a cell, tap any other, their pieces
// exchange. A glyph landing on its own color activates and the cell goes away.
//
// This module is the boundary: it owns the canvas, the pointer and the fetches.
// The rules live in board.js, the level in level.js, the playback in animate.js,
// the paint in render.js — all of them pure, all of them tested without a browser.

import { createCompositor } from './compositor.js';
import { mulberry32 } from './rng.js';
import { applySwap, copyBoard, createRecorder, gain } from './board.js';
import { buildTimeline, sampleTimeline, staticFrame } from './animate.js';
import { createLevel, playableGlyphs } from './level.js';
import { describeSwap } from './debugLog.js';
import { mountDebugPanel, mountPalettePanel } from './devPanels.js';
import {
  VIEW,
  boardLayout,
  cellAt,
  createGlyphLayer,
  createGroundLayer,
  createHudLayer,
  createSelectionLayer,
} from './render.js';

const DATA = ['rules', 'palette', 'glyphs', 'stages', 'animation', 'gloss'];
const START_SEED = 20260825;
const STAGE = 'practise';

/** What the HUD says about a level that is finished, or still running. */
export function statusFor(level) {
  if (level.cleared >= level.target) return 'target met — tap for a new board';
  if (level.swapsUsed >= level.budget) return 'out of swaps — tap for a new board';
  return level.swapsUsed === 0 ? 'tap a cell, then any other' : 'keep going';
}

export function isOver(level) {
  return level.cleared >= level.target || level.swapsUsed >= level.budget;
}

const samePlace = (a, z) => a[0] === z[0] && a[1] === z[1];

async function loadData() {
  const files = await Promise.all(
    DATA.map(async (name) => {
      const res = await fetch(`data/${name}.json`);
      if (!res.ok) throw new Error(`data/${name}.json: ${res.status}`); // boundary
      return [name, await res.json()];
    }),
  );
  return Object.fromEntries(files);
}

/**
 * Wire up the canvas and run the game.
 * @param {HTMLCanvasElement} canvas
 * @param {{palette: HTMLElement, debug: HTMLElement}} [panels] - dev instruments.
 */
export async function start(canvas, panels) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('start() requires a <canvas> element'); // boundary
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const data = await loadData();
  const glyphs = playableGlyphs(data.glyphs.glyphs);
  const glyphsById = new Map(glyphs.map((g) => [g.id, g]));
  const stage = data.stages.stages.find((s) => s.id === STAGE);
  if (!stage) throw new Error(`no stage "${STAGE}" in data/stages.json`); // boundary

  const scene = createCompositor()
    .add(createGroundLayer())
    .add(createGlyphLayer())
    .add(createSelectionLayer())
    .add(createHudLayer());

  let seed = START_SEED;
  let level = createLevel({ rules: data.rules, glyphs, stage, seed });
  let rand = mulberry32(seed);
  let selected = null;
  let playing = null; // a timeline mid-flight; input is refused while one runs

  const log = panels ? mountDebugPanel(panels.debug) : null;

  const deal = () => {
    seed += 1;
    level = createLevel({ rules: data.rules, glyphs, stage, seed });
    rand = mulberry32(seed);
    selected = null;
    log?.clear();
    log?.append([{ depth: 0, text: `board ${seed} — clear ${level.target} in ${level.budget}` }]);
  };

  const paint = (drawList) => {
    // The canvas backing store is sized in device pixels; everything below works
    // in CSS pixels, so the transform is set once per frame rather than threaded
    // through the layers.
    const dpr = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene.render(ctx, {
      width: box.width,
      height: box.height,
      ...drawList,
      layout: boardLayout(level.board, box.width, box.height),
      palette: data.palette,
      gloss: data.gloss,
      glyphsById,
      selected: playing ? null : selected,
      level,
      status: statusFor(level),
    });
  };

  const drawBoard = () => paint(staticFrame(level.board));

  const tick = (now) => {
    const drawList = sampleTimeline(playing.timeline, now - playing.startedAt, data.animation.shake);
    if (!drawList) {
      playing = null;
      drawBoard();
      return;
    }
    paint(drawList);
    requestAnimationFrame(tick);
  };

  const play = (a, z) => {
    const before = copyBoard(level.board);
    const shown = gain(level.board, a, z);
    const recorder = createRecorder();
    const { activated } = applySwap(level.board, a, z, rand, recorder);
    level.swapsUsed += 1;
    level.cleared += activated;
    selected = null;
    log?.append(
      describeSwap({
        before,
        swap: [a, z],
        recorder,
        palette: data.palette,
        glyphsById,
        moveNumber: level.swapsUsed,
        shown,
        cleared: activated,
      }),
    );
    playing = {
      timeline: buildTimeline({ before, swap: [a, z], recorder, timing: data.animation }),
      startedAt: performance.now(),
    };
    requestAnimationFrame(tick);
  };

  const onPick = (event) => {
    if (playing) return; // let the board finish resolving before taking another move
    if (isOver(level)) {
      deal();
      drawBoard();
      return;
    }
    const box = canvas.getBoundingClientRect();
    const layout = boardLayout(level.board, box.width, box.height);
    const hit = cellAt(layout, level.board, event.clientX - box.left, event.clientY - box.top);
    if (!hit || !level.board.alive[hit[0]][hit[1]]) {
      selected = null;
    } else if (selected && samePlace(selected, hit)) {
      selected = null; // tapping the held cell puts it back down
    } else if (!selected) {
      selected = hit;
    } else {
      play(selected, hit);
      return;
    }
    drawBoard();
  };

  canvas.addEventListener('pointerdown', onPick);
  window.addEventListener('resize', () => {
    if (!playing) drawBoard();
  });
  if (panels) {
    // The editor mutates data.palette in place; the board reads it every frame, so a
    // repaint is all it takes for a colour change to land.
    mountPalettePanel(panels.palette, data.palette, () => {
      if (!playing) drawBoard();
    });
    log.append([{ depth: 0, text: `board ${seed} — clear ${level.target} in ${level.budget}` }]);
  }
  drawBoard();
}

// Auto-start when loaded in the browser (skipped under `node --test`).
if (typeof document !== 'undefined') {
  const canvas = document.getElementById('screen');
  const palette = document.getElementById('palette-panel');
  const debug = document.getElementById('debug-panel');
  if (canvas) start(canvas, palette && debug ? { palette, debug } : undefined);
}
