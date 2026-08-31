// Entry point for the vertical slice. Tap a cell, tap any other, their pieces
// exchange. A glyph landing on its own color activates and the cell goes away.
//
// This module is the boundary: it owns the canvas, the pointer and the fetches.
// The rules live in board.js, the level in level.js, the playback in animate.js,
// the paint in render.js — all of them pure, all of them tested without a browser.

import { createCompositor } from './compositor.js';
import { applySwap, copyBoard, createRecorder, gain } from './board.js';
import { buildTimeline, sampleTimeline, staticFrame } from './animate.js';
import { resolvePalette, uncovered } from './palette.js';
import { dealLevel, loadRun, nextAfter, outcome } from './levels.js';
import { createProgress } from './progress.js';
import { mountPicker } from './picker.js';
import { describeSwap } from './debugLog.js';
import { mountDebugPanel } from './debugPanel.js';
import { createFxLayer, createGhostLayer } from './fxLayer.js';
import {
  VIEW,
  boardLayout,
  cellAt,
  createGlyphLayer,
  createGroundLayer,
  createHudLayer,
  createSelectionLayer,
} from './render.js';

const DATA = ['rules', 'palette', 'glyphs', 'glyphPaths', 'animation', 'gloss', 'geometry', 'levels'];
/** What the HUD says about a level that is finished, or still running. */
export function statusFor(level, atEnd = false) {
  const state = outcome(level);
  if (state === 'won') {
    const left = level.budget - level.swapsUsed;
    const spare = left ? ` with ${left} swap${left === 1 ? '' : 's'} to spare` : '';
    return atEnd ? `run complete${spare} — tap to play it again` : `cleared${spare} — tap for the next one`;
  }
  if (state === 'lost') return 'out of swaps — tap to try again';
  return level.swapsUsed === 0 ? 'tap a cell, then any other' : 'keep going';
}

export function isOver(level) {
  return outcome(level) !== 'playing';
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
 * @param {{debug: HTMLElement, sheet: HTMLElement, chrome: object}} [panels] - the
 *   move log, the level sheet's root, and the topbar it reads from.
 */
export async function start(canvas, panels) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('start() requires a <canvas> element'); // boundary
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const data = await loadData();
  const glyphs = data.glyphs.glyphs;
  const glyphsById = new Map(glyphs.map((g) => [g.id, g]));

  // The order is the argument: a beam is holding or shoving a piece, so it draws
  // behind them; a ghost comes off a piece, so it draws in front.
  const scene = createCompositor()
    .add(createGroundLayer())
    .add(createFxLayer())
    .add(createGlyphLayer())
    .add(createGhostLayer())
    .add(createSelectionLayer())
    .add(createHudLayer());

  // One of the palettes in data/palette.json, named by that file's `default`.
  const palette = resolvePalette(data.palette);
  const run = loadRun(data.levels, data.glyphs.glyphs);
  // A board holds colour indices, so a palette narrower than a level is a level that
  // cannot be painted. Say so here rather than drawing part of it.
  const short = uncovered(palette, run.levels, (level) =>
    dealLevel(level, { rules: data.rules, glyphs, budget: run.budget }).board.colors);
  if (short.length) {
    throw new Error(
      `palette "${palette.id}" has ${palette.colors.length} colours; `
      + `${short.length} level(s) need more, starting with level ${short[0].id} (${short[0].needs})`,
    ); // boundary
  }
  const progress = createProgress(window.localStorage);
  let level = null;
  let rand = null;
  let selected = null;
  let playing = null; // a timeline mid-flight; input is refused while one runs

  const log = panels ? mountDebugPanel(panels.debug) : null;

  const deal = (spec) => {
    level = dealLevel(spec, { rules: data.rules, glyphs, budget: run.budget });
    rand = level.rand;
    selected = null;
    picker?.repaint(spec.id);
    if (chrome) {
      chrome.number.textContent = String(spec.id).padStart(2, '0');
      chrome.act.textContent = `${spec.act.no} · ${spec.act.name}`;
      chrome.teaches.textContent = spec.teaches;
    }
    log?.clear();
    log?.append([{
      depth: 0,
      text: `level ${spec.id} · ${spec.act.name} — clear ${spec.target} in ${level.budget}`,
    }]);
  };

  /** Won: on to the next. Lost or at the end of the run: this one again. */
  const advance = () => {
    const state = outcome(level);
    if (state === 'won') {
      progress.record(level.spec.id, level.budget - level.swapsUsed);
      const next = nextAfter(run, level.spec.id);
      deal(next ?? run.levels[0]);
      return;
    }
    deal(level.spec);
  };

  /** The level as the counter should read it: mid-flight, only what has landed. */
  const asShown = (drawList) =>
    (playing ? { ...level, cleared: playing.clearedBefore + (drawList.cleared ?? 0) } : level);

  const paint = (drawList) => {
    // The canvas backing store is sized in device pixels; everything below works
    // in CSS pixels, so the transform is set once per frame rather than threaded
    // through the layers.
    const dpr = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shown = asShown(drawList);
    scene.render(ctx, {
      width: box.width,
      height: box.height,
      ...drawList,
      layout: boardLayout(level.board, box.width, box.height),
      palette,
      gloss: data.gloss,
      geometry: data.geometry,
      glyphPaths: data.glyphPaths.paths,
      glyphsById,
      animation: data.animation,
      selected: playing ? null : selected,
      level: shown,
      // Mid-cascade the swap is already spent and the clearing has not landed, so the
      // level reads as lost until it is not. Nothing is decided until the board settles,
      // and saying so is also where the player learns they can cut it short.
      status: playing ? 'tap to skip' : statusFor(shown, !nextAfter(run, level.spec.id)),
    });
  };

  const drawBoard = () => paint(staticFrame(level.board));

  const tick = (now) => {
    if (!playing) return; // a tap cut the playback short and already drew the settled board
    const drawList = sampleTimeline(playing.timeline, now - playing.startedAt, data.animation.spin);
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
    const clearedBefore = level.cleared;
    const { activated } = applySwap(level.board, a, z, rand, recorder);
    level.swapsUsed += 1;
    level.cleared += activated;
    selected = null;
    log?.append(
      describeSwap({
        before,
        swap: [a, z],
        recorder,
        palette,
        glyphsById,
        moveNumber: level.swapsUsed,
        shown,
        cleared: activated,
      }),
    );
    playing = {
      timeline: buildTimeline({ before, swap: [a, z], recorder, timing: data.animation }),
      startedAt: performance.now(),
      // The rules resolved the whole cascade before any of it was drawn. The counter
      // follows what the player can see instead, or it reads the level won while the
      // pieces that won it are still in the air.
      clearedBefore,
    };
    requestAnimationFrame(tick);
  };

  const onPick = (event) => {
    // The rules already ran: applySwap settled the board before the timeline started,
    // so cutting playback short jumps to the finished board rather than skipping a move.
    if (playing) {
      playing = null;
      drawBoard();
      return;
    }
    if (isOver(level)) {
      advance();
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

  const picker = panels?.sheet
    ? mountPicker(panels.sheet, run, progress, (spec) => {
        deal(spec);
        drawBoard();
      })
    : null;
  const chrome = panels?.chrome ?? null;
  chrome?.open.addEventListener('click', () => picker.open());

  deal(progress.resumeAt(run.levels));

  canvas.addEventListener('pointerdown', onPick);
  window.addEventListener('resize', () => {
    if (!playing) drawBoard();
  });
  drawBoard();
}

// Auto-start when loaded in the browser (skipped under `node --test`).
if (typeof document !== 'undefined') {
  const canvas = document.getElementById('screen');
  const debug = document.getElementById('debug-panel');
  const sheet = document.getElementById('sheet-root');
  const chrome = {
    open: document.getElementById('level-open'),
    number: document.getElementById('level-no'),
    act: document.getElementById('level-act'),
    teaches: document.getElementById('level-teaches'),
  };
  const wired = debug && sheet && Object.values(chrome).every(Boolean);
  if (canvas) start(canvas, wired ? { debug, sheet, chrome } : undefined);
}
