// Render — the board as ordered compositor layers. This and `fx.js` are the canvas
// boundary: between them they hold every drawing call, so board.js and level.js stay
// pure. This module owns the board itself — the ground, the pieces, the selection and
// the HUD; fx.js owns what an ability throws over the top of them.
//
// The paint order is this file, read top to bottom. Each glyph is drawn in a 100x100
// cell and scaled to the view; the lengths and the gloss both arrive as data, so
// nothing about the look is fixed here.

import { CELL, GEOMETRY_KEYS, glyphDrawing, keylineUnits } from './glyphShapes.js';

/** Layout tuning. Everything else about the look comes from data/palette.json. */
export const VIEW = Object.freeze({
  pad: 24,
  gap: 4,
  hudHeight: 72,
  hudFont: '600 15px "Martian Mono", ui-monospace, SFMono-Regular, Consolas, monospace',
  hudInk: '#16171A',
  hudDim: '#83868D',
  paper: '#E7E8EA',
  selection: '#16171A',
  selectionWidth: 3,
});

/**
 * Where the board sits in the canvas. Pure, so hit-testing and drawing agree by
 * construction rather than by both being written carefully.
 * @returns {{cell: number, originX: number, originY: number, spanW: number, spanH: number}}
 *   `spanW`/`spanH` bound every cell, which is the rect a piece leaving the board has
 *   to be clipped against.
 */
export function boardLayout(board, canvasWidth, canvasHeight, view = VIEW) {
  const usableW = canvasWidth - view.pad * 2;
  const usableH = canvasHeight - view.pad * 2 - view.hudHeight;
  const cell = Math.floor(
    Math.min(
      (usableW - view.gap * (board.width - 1)) / board.width,
      (usableH - view.gap * (board.height - 1)) / board.height,
    ),
  );
  const spanW = cell * board.width + view.gap * (board.width - 1);
  const spanH = cell * board.height + view.gap * (board.height - 1);
  return {
    cell,
    spanW,
    spanH,
    originX: Math.round((canvasWidth - spanW) / 2),
    originY: Math.round(view.hudHeight + (canvasHeight - view.hudHeight - spanH) / 2),
  };
}

/**
 * Top-left corner of a cell, in canvas pixels. Row and column may be fractional —
 * a piece part-way between two cells is the ordinary case while a swap plays.
 */
export function cellOrigin(layout, r, c, view = VIEW) {
  return {
    x: layout.originX + c * (layout.cell + view.gap),
    y: layout.originY + r * (layout.cell + view.gap),
  };
}

/**
 * The middle of a cell, in canvas pixels. Where an effect aims from and at, so it lives
 * beside `cellOrigin` rather than being worked out again by everything that draws one.
 */
export function cellCenter(layout, r, c, view = VIEW) {
  const { x, y } = cellOrigin(layout, r, c, view);
  return { x: x + layout.cell / 2, y: y + layout.cell / 2 };
}

/** Which cell a point lands in, or null. The input boundary's half of the layout. */
export function cellAt(layout, board, px, py, view = VIEW) {
  const step = layout.cell + view.gap;
  const c = Math.floor((px - layout.originX) / step);
  const r = Math.floor((py - layout.originY) / step);
  if (r < 0 || r >= board.height || c < 0 || c >= board.width) return null;
  const { x, y } = cellOrigin(layout, r, c, view);
  if (px > x + layout.cell || py > y + layout.cell) return null; // landed in a gutter
  return [r, c];
}

/**
 * Trace a rounded rectangle into whatever is collecting a path — the context, or a
 * second subpath of one already begun. It does not open the path itself: the well
 * below is a rectangle with a rounded hole punched out of it, and that is two of
 * these in one path.
 */
function traceRoundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const GLOSS_KEYS = [
  'radius', 'cellShadowY', 'cellShadowBlur', 'cellShadowA',
  'sheen', 'sheenStop', 'bevel',
  'glyphShadowY', 'glyphShadowBlur', 'glyphShadowA',
];

/**
 * The shadow a hole casts into itself.
 *
 * Canvas has no inset shadow, so this is the shadow of a shape with the hole punched out
 * of it: everything but the blur creeping over the rim lands outside whatever is
 * clipping, and only the rim survives. The caller owns the clip, because what it clips to
 * is what decides whether the ring shows.
 */
function insetShadow(ctx, shapes, { alpha, offsetY, blur }, bleed) {
  if (!shapes.length) return;
  const left = Math.min(...shapes.map((s) => s.x)) - bleed;
  const top = Math.min(...shapes.map((s) => s.y)) - bleed;
  const right = Math.max(...shapes.map((s) => s.x + s.w)) + bleed;
  const bottom = Math.max(...shapes.map((s) => s.y + s.h)) + bleed;

  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  for (const { x, y, w, h, radius } of shapes) traceRoundRect(ctx, x, y, w, h, radius);
  ctx.shadowColor = `rgba(0,0,0,${alpha / 100})`;
  ctx.shadowOffsetY = offsetY;
  ctx.shadowBlur = blur;
  ctx.fillStyle = '#000';
  ctx.fill('evenodd');
}

/** Clip to the union of some rounded rects, so only what falls inside any of them draws. */
function clipToAll(ctx, shapes) {
  ctx.beginPath();
  for (const { x, y, w, h, radius } of shapes) traceRoundRect(ctx, x, y, w, h, radius);
  ctx.clip();
}

export const WELL_KEYS = ['pad', 'radius', 'tintA', 'shadowY', 'shadowBlur', 'shadowA',
  'drained', 'divotRadius', 'divotA'];

/**
 * The tray the board sits in, drawn under every tile.
 *
 * This game's premise is that the board drains, and a tile floating on the paper
 * leaves a cleared cell reading as a hole in the page rather than a hole in the
 * board. Recessing the grid makes emptiness a state of the board instead — which
 * matters more here than it would elsewhere, because a yellow tile and bare paper
 * are within a hair of the same luminance and the gutter is all that separates them.
 *
 * An inset shadow in Canvas 2D is the shadow of a hole: fill the tray, clip to it,
 * then cast a shadow from a rectangle with the tray punched out. Everything but the
 * blur creeping over the rim lands outside the clip.
 */
function drawWell(ctx, layout, well, board) {
  for (const key of WELL_KEYS) {
    if (typeof well?.[key] !== 'number') throw new Error(`gloss.well is missing "${key}"`); // boundary
  }
  const scale = layout.cell / CELL;
  // The board draining is the score, so the tray reports it twice over: it sinks by how
  // much has gone, and each hole keeps a socket where its cell used to sit. One says how
  // far along, the other says which cells.
  const gone = holesIn(board);
  const drained = board ? gone.length / (board.width * board.height) : 0;
  const deeper = 1 + drained * well.drained;
  const pad = well.pad * scale;
  const [x, y] = [layout.originX - pad, layout.originY - pad];
  const [w, h] = [layout.spanW + pad * 2, layout.spanH + pad * 2];
  const radius = well.radius * scale;

  ctx.save();
  ctx.beginPath();
  traceRoundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = `rgba(0,0,0,${well.tintA / 100})`;
  ctx.fill();
  ctx.clip();

  const bleed = well.shadowBlur * scale * 3 * deeper + pad;
  insetShadow(ctx, [{ x, y, w, h, radius }], {
    alpha: Math.min(100, well.shadowA * deeper),
    offsetY: well.shadowY * scale * deeper,
    blur: well.shadowBlur * scale * deeper,
  }, bleed);

  // Every socket at once: clip to all the holes together and cast one shadow through a
  // sheet with all of them punched out. Per hole it would be a clip and a blurred fill
  // each, and `shadowBlur` is the most expensive thing in the frame — a drained board
  // would pay it forty times over. The ring still has to fall OUTSIDE the clip or it
  // paints rather than casting; the union of the holes is what it falls outside of.
  if (well.divotA > 0 && gone.length) {
    const r = well.divotRadius * scale;
    const sockets = gone.map(([row, col]) => {
      const o = cellOrigin(layout, row, col, VIEW);
      return { x: o.x, y: o.y, w: layout.cell, h: layout.cell, radius: r };
    });
    const blur = well.shadowBlur * scale;
    ctx.save();
    clipToAll(ctx, sockets);
    insetShadow(ctx, sockets, { alpha: well.divotA, offsetY: well.shadowY * scale, blur },
      blur * 3);
    ctx.restore();
  }
  ctx.restore();
}

/** Every cell the board has lost, which is where a divot goes. */
function holesIn(board) {
  if (!board) return [];
  const out = [];
  for (let r = 0; r < board.height; r++) {
    for (let c = 0; c < board.width; c++) if (!board.alive[r][c]) out.push([r, c]);
  }
  return out;
}

/** Gloss is data; a missing knob is a broken data file, not a default to invent. */
function assertGloss(gloss) {
  for (const key of GLOSS_KEYS) {
    if (typeof gloss?.[key] !== 'number') {
      throw new Error(`gloss is missing "${key}"`); // boundary
    }
  }
}

/** Geometry is data too; a missing length is a broken data file, not a default. */
function assertGeometry(geom) {
  for (const key of GEOMETRY_KEYS) {
    if (typeof geom?.[key] !== 'number') {
      throw new Error(`geometry is missing "${key}"`); // boundary
    }
  }
}

/** Set up a shadow, run the paint, put the context back. */
function withShadow(ctx, { alpha, offsetY, blur }, scale, paint) {
  if (alpha <= 0) {
    paint();
    return;
  }
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${alpha / 100})`;
  ctx.shadowOffsetY = offsetY * scale;
  ctx.shadowBlur = blur * scale;
  paint();
  ctx.restore();
}

/**
 * One cell: its ground, the shadow it casts, the sheen down its face and the bevel
 * around its edge. `size` is the cell's side in pixels; every gloss length is in the
 * spec's 100-unit cell and scales with it.
 *
 * Shared with the tuning sandbox, so what is tuned is what ships.
 */
export function drawTile(ctx, { x, y, size }, groundHex, gloss) {
  assertGloss(gloss);
  const scale = size / CELL;
  const radius = gloss.radius * scale;

  ctx.save();
  ctx.translate(x, y);

  withShadow(
    ctx,
    { alpha: gloss.cellShadowA, offsetY: gloss.cellShadowY, blur: gloss.cellShadowBlur },
    scale,
    () => {
      ctx.beginPath();
      traceRoundRect(ctx, 0, 0, size, size, radius);
      ctx.fillStyle = groundHex;
      ctx.fill();
    },
  );

  // The sheen and the bevel both live inside the tile, so they share its clip.
  if (gloss.sheen > 0 || gloss.bevel > 0) {
    ctx.save();
    ctx.beginPath();
    traceRoundRect(ctx, 0, 0, size, size, radius);
    ctx.clip();

    if (gloss.sheen > 0) {
      const stop = ctx.createLinearGradient(0, 0, 0, size * (gloss.sheenStop / 100));
      stop.addColorStop(0, `rgba(255,255,255,${gloss.sheen / 100})`);
      stop.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = stop;
      ctx.fillRect(0, 0, size, size);
    }

    if (gloss.bevel > 0) {
      // Light along the top edge, dark along the bottom — the tile reads as lit
      // from above, which is the same direction its shadow falls.
      const alpha = gloss.bevel / 100;
      const inset = Math.max(1, 2 * scale);
      ctx.lineWidth = inset * 2;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      traceRoundRect(ctx, inset, inset, size - inset * 2, size - inset * 2, Math.max(0, radius - inset));
      ctx.stroke();
      ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.8})`;
      ctx.beginPath();
      ctx.moveTo(inset, size - inset);
      ctx.lineTo(size - inset, size - inset);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * One glyph: a letter set in the game's face, or one of the two authored shapes.
 * The caller owns the transform, so this paints into the spec's 100x100 cell.
 *
 * Every glyph carries a black keyline of `geom.keylinePx` screen pixels. That width
 * is converted from pixels here rather than fixed in cell units, because the same
 * glyph is drawn at 92px on the board and half that in the level sheet, and a
 * hairline has to stay a hairline at both.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{letter: string, rot?: number, flip?: boolean}} glyph
 * @param {{ink: string, key: string}} colors
 * @param {number} cellPx - the on-screen side of the cell, for the keyline.
 */
export function drawGlyph(ctx, glyph, colors, gloss, geom, cellPx, paths) {
  assertGloss(gloss);
  assertGeometry(geom);
  const d = glyphDrawing(glyph, geom, paths);
  const key = keylineUnits(geom.keylinePx, cellPx);

  ctx.save();
  ctx.translate(CELL / 2, CELL / 2);
  if (d.rot) ctx.rotate((d.rot * Math.PI) / 180);
  if (d.flip) ctx.scale(-1, 1);
  ctx.translate(-CELL / 2, -CELL / 2);

  // The shadow the piece casts, thrown by one opaque copy of its own shape: letting
  // every fill below cast its own would stack them into mud. The piece carries no
  // highlight of its own — the sheen belongs to the cell, and a highlight drawn here
  // would travel with the sprite across the board while a swap plays.
  //
  // Skipped outright when there is no shadow to cast. That copy is opaque, so with the
  // shadow off it is a solid black glyph painted under the real one — invisible while
  // the ink covers it exactly, and a solid black blob the moment the ink is anything
  // less than opaque.
  if (gloss.glyphShadowA > 0) {
    withShadow(
      ctx,
      { alpha: gloss.glyphShadowA, offsetY: gloss.glyphShadowY, blur: gloss.glyphShadowBlur },
      1,
      () => paintGlyph(ctx, d, geom, colors.key, colors.key, key),
    );
  }
  paintGlyph(ctx, d, geom, colors.ink, colors.key, key);

  ctx.restore();
}

/**
 * Path2D objects are immutable once built and the same dozen strings are drawn every
 * frame, so they are parsed once and kept.
 */
const PATHS = new Map();
function pathFor(d) {
  let path = PATHS.get(d);
  if (!path) {
    path = new Path2D(d);
    PATHS.set(d, path);
  }
  return path;
}

/** The shape itself, filled in `fill` under a keyline of `key` at `keyWidth`. */
function paintGlyph(ctx, d, geom, fill, key, keyWidth) {
  ctx.lineJoin = 'round';
  ctx.strokeStyle = key;
  ctx.fillStyle = fill;
  ctx.lineWidth = keyWidth;

  if (d.kind === 'path') {
    // Baked at cap height 1 about its own centre, so one scale and one shift place it.
    ctx.save();
    ctx.translate(CELL / 2, CELL / 2 + d.y);
    ctx.scale(d.scale, d.scale);
    const path = pathFor(d.d);
    // The keyline is a cell-unit width, and the path is about to be scaled by the cap,
    // so divide it back out or a tall glyph would carry a thicker outline than a short.
    ctx.lineWidth = keyWidth / d.scale;
    if (keyWidth > 0) ctx.stroke(path);
    ctx.fill(path);
    ctx.restore();
    return;
  }
  if (d.kind === 'bars') {
    for (const r of d.rects) {
      if (keyWidth > 0) ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    return;
  }
  ctx.beginPath();
  ctx.arc(d.circle.cx, d.circle.cy, d.circle.r, 0, Math.PI * 2);
  if (keyWidth > 0) ctx.stroke();
  ctx.fill();
}

/**
 * Where a tile or a sprite lands on the canvas. A scale below 1 shrinks it about
 * its own centre, which is what makes a dying cell collapse in place.
 */
// `size` is the piece's own scale and stays square — it is what a length measured in
// screen pixels, like the keyline, is converted against. `w` and `h` are what it is
// actually drawn at, which come apart when a travelling piece squashes.
function placed(layout, item, view) {
  const { x, y } = cellOrigin(layout, item.y, item.x, view);
  const size = layout.cell * item.scale;
  const w = layout.cell * (item.scaleX ?? item.scale);
  const h = layout.cell * (item.scaleY ?? item.scale);
  return { x: x + (layout.cell - w) / 2, y: y + (layout.cell - h) / 2, size, w, h };
}

/**
 * Run `paint` with the canvas turned about the box's own centre. A cell being
 * destroyed spins while it collapses, and its piece has to turn with it.
 */
function spun(ctx, box, angle, paint) {
  if (!angle) {
    paint();
    return;
  }
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.translate(-cx, -cy);
  paint();
  ctx.restore();
}

/** Layer 0: the terrain. Backgrounds are fixed; a dead cell is simply not there. */
export function createGroundLayer(view = VIEW) {
  return {
    name: 'ground',
    draw(ctx, frame) {
      const { tiles, layout, palette } = frame;
      // The paper covers wherever the board has been shoved, not just where it sits.
      // This layer draws inside the shake, and the canvas is not cleared between frames,
      // so a fill of exactly the frame would let a stale sliver show at the trailing
      // edge of every shaken frame.
      const { x = 0, y = 0 } = frame.offset ?? {};
      const [ox, oy] = [Math.abs(x), Math.abs(y)];
      ctx.fillStyle = view.paper;
      ctx.fillRect(-ox, -oy, frame.width + ox * 2, frame.height + oy * 2);
      drawWell(ctx, layout, frame.gloss.well, frame.board);
      for (const tile of tiles) {
        const box = placed(layout, tile, view);
        if (box.size <= 0) continue;
        spun(ctx, box, tile.spin, () => drawTile(ctx, box, palette.colors[tile.bg].hex, frame.gloss));
      }
    },
  };
}

/** Layer 1: the pieces. */
export function createGlyphLayer(view = VIEW) {
  return {
    name: 'glyphs',
    draw(ctx, frame) {
      const { sprites, layout, palette, glyphsById } = frame;
      // A piece shoved off the board travels past the edge on its way out. Clip to
      // the board so it leaves rather than wandering across the HUD. The compositor
      // already wraps this layer in save/restore, so the clip goes no further.
      ctx.beginPath();
      ctx.rect(layout.originX, layout.originY, layout.spanW, layout.spanH);
      ctx.clip();
      for (const sprite of sprites) {
        const box = placed(layout, sprite, view);
        if (box.size <= 0) continue;
        // Where it has been, behind where it is. Same drawing, fainter — a smear made of
        // the piece itself rather than a blur, which is the only kind this canvas can
        // have: the backing store is reassigned every frame, so nothing survives to
        // fade.
        for (const ghost of sprite.trail ?? []) {
          const back = placed(layout, { ...sprite, x: ghost.x, y: ghost.y }, view);
          ctx.save();
          ctx.globalAlpha = (sprite.alpha ?? 1) * ghost.alpha;
          ctx.translate(back.x, back.y);
          ctx.scale(back.size / CELL, back.size / CELL);
          drawGlyph(
            ctx,
            glyphsById.get(sprite.art),
            { ink: palette.colors[sprite.ink].hex, core: palette.core, key: palette.key },
            { ...frame.gloss, glyphShadowA: 0 }, // a copy casts nothing
            frame.geometry,
            back.size,
            frame.glyphPaths,
          );
          ctx.restore();
        }
        spun(ctx, box, sprite.spin, () => {
          ctx.save();
          // The piece fades on its own clock while the ground it sat on goes on turning
          // and shrinking, so the two read as separate things coming apart.
          ctx.globalAlpha = sprite.alpha ?? 1;
          ctx.translate(box.x, box.y);
          ctx.scale(box.w / CELL, box.h / CELL);
          drawGlyph(
            ctx,
            glyphsById.get(sprite.art),
            { ink: palette.colors[sprite.ink].hex, core: palette.core, key: palette.key },
            frame.gloss,
            frame.geometry,
            box.size,
            frame.glyphPaths,
          );
          ctx.restore();
        });
      }
    },
  };
}

/** Layer 2: which cell the player has picked up. */
export function createSelectionLayer(view = VIEW) {
  return {
    name: 'selection',
    draw(ctx, frame) {
      if (!frame.selected) return;
      const [r, c] = frame.selected;
      const { x, y } = cellOrigin(frame.layout, r, c, view);
      const inset = view.selectionWidth;
      ctx.beginPath();
      traceRoundRect(
        ctx,
        x - inset,
        y - inset,
        frame.layout.cell + inset * 2,
        frame.layout.cell + inset * 2,
        (frame.gloss.radius / CELL) * frame.layout.cell + inset,
      );
      ctx.strokeStyle = view.selection;
      ctx.lineWidth = view.selectionWidth;
      ctx.stroke();
    },
  };
}

/** Layer 3: the level, in the two numbers that decide it. */
export function createHudLayer(view = VIEW) {
  return {
    name: 'hud',
    // Readouts do not ride the shake: a number that moves is a number you re-read.
    pinned: true,
    draw(ctx, frame) {
      const { level } = frame;
      ctx.font = view.hudFont;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = view.hudInk;
      ctx.textAlign = 'left';
      ctx.fillText(`${level.cleared} / ${level.target} cleared`, view.pad, 34);
      ctx.textAlign = 'right';
      ctx.fillText(
        `${level.budget - level.swapsUsed} swap${level.budget - level.swapsUsed === 1 ? '' : 's'}`,
        frame.width - view.pad,
        34,
      );
      ctx.fillStyle = view.hudDim;
      ctx.textAlign = 'left';
      ctx.fillText(frame.status, view.pad, 56);
    },
  };
}
