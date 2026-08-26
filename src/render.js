// Render — the board as ordered compositor layers. This is the boundary: it is the
// only place that touches a canvas, so board.js and level.js stay pure.
//
// RENDER_SPEC.md is the paint order this implements. Each glyph is drawn in the
// spec's 100x100 cell and scaled to the view; the lengths and the gloss both arrive
// as data, so nothing about the look is spelled out here.

import { CELL, GEOMETRY_KEYS, fillClips, markGeometry, outline } from './glyphShapes.js';

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

function tracePath(ctx, shape) {
  ctx.beginPath();
  if (shape.kind === 'circle') {
    ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
    return;
  }
  shape.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function traceRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
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
  'glyphShadowY', 'glyphShadowBlur', 'glyphShadowA', 'spec',
];

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
      traceRoundRect(ctx, 0, 0, size, size, radius);
      ctx.fillStyle = groundHex;
      ctx.fill();
    },
  );

  // The sheen and the bevel both live inside the tile, so they share its clip.
  if (gloss.sheen > 0 || gloss.bevel > 0) {
    ctx.save();
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

function clipTo(ctx, rect) {
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
}

function drawMark(ctx, geo, color, width) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  for (const dot of geo.dots) {
    ctx.beginPath();
    ctx.arc(dot.cx, dot.cy, dot.r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const line of geo.lines) {
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
  for (const ring of geo.rings) {
    tracePath(ctx, ring);
    ctx.stroke();
  }
}

/**
 * Draw one glyph into the spec's 100x100 cell. The caller owns the transform.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{form: string, mag: number, mark: string, rotation: number}} glyph
 * @param {{ink: string, core: string, key: string}} colors
 * @param {object} geom - lengths from data/geometry.json.
 */
export function drawGlyph(ctx, glyph, colors, gloss, geom) {
  assertGloss(gloss);
  assertGeometry(geom);
  const shape = outline(glyph.form, glyph.rotation, geom.radius);
  const clips = fillClips(glyph.mag);
  ctx.lineJoin = 'round';

  // 0 — the shadow the piece casts, thrown by an opaque copy of its own silhouette.
  // Filling and stroking the shape once with the shadow on costs one pass; letting
  // every fill and stroke below cast its own would stack five shadows into mud.
  withShadow(
    ctx,
    { alpha: gloss.glyphShadowA, offsetY: gloss.glyphShadowY, blur: gloss.glyphShadowBlur },
    1,
    () => {
      tracePath(ctx, shape);
      ctx.fillStyle = colors.key;
      ctx.strokeStyle = colors.key;
      ctx.lineWidth = geom.keyWidth;
      ctx.fill();
      ctx.stroke();
    },
  );

  // 1 — silhouette: a black interior under a wide keyline.
  tracePath(ctx, shape);
  ctx.fillStyle = colors.core;
  ctx.fill();
  ctx.strokeStyle = colors.key;
  ctx.lineWidth = geom.keyWidth;
  ctx.stroke();

  // 2 — fill state, under the ring so the ring stays crisp. Skipped at mag 1.
  if (clips.ink) {
    ctx.save();
    clipTo(ctx, clips.ink);
    tracePath(ctx, shape);
    ctx.fillStyle = colors.ink;
    ctx.fill();
    ctx.restore();
  }

  // 3 — ink ring.
  tracePath(ctx, shape);
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = geom.inkWidth;
  ctx.stroke();

  // 4 — the mark, painted once per region in the other region's color. One rule,
  // so it contrasts at every fill state without per-glyph art.
  const geo = markGeometry(glyph.mark, glyph.form, glyph.rotation, geom);
  if (clips.core) {
    ctx.save();
    clipTo(ctx, clips.core);
    drawMark(ctx, geo, colors.ink, geom.markWidth);
    ctx.restore();
  }
  if (clips.ink) {
    ctx.save();
    clipTo(ctx, clips.ink);
    drawMark(ctx, geo, colors.core, geom.markWidth);
    ctx.restore();
  }

  // 5 — specular: a highlight riding the top-left of the silhouette, clipped to it
  // so the piece picks up the same overhead light the cell does.
  if (gloss.spec > 0) {
    ctx.save();
    tracePath(ctx, shape);
    ctx.clip();
    const sheen = ctx.createLinearGradient(20, 14, 62, 74);
    sheen.addColorStop(0, `rgba(255,255,255,${gloss.spec / 100})`);
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, CELL, CELL);
    ctx.restore();
  }
}

/**
 * Where a tile or a sprite lands on the canvas. A scale below 1 shrinks it about
 * its own centre, which is what makes a dying cell collapse in place.
 */
function placed(layout, item, view) {
  const { x, y } = cellOrigin(layout, item.y, item.x, view);
  const size = layout.cell * item.scale;
  const inset = (layout.cell - size) / 2;
  return { x: x + inset, y: y + inset, size };
}

/** Layer 0: the terrain. Backgrounds are fixed; a dead cell is simply not there. */
export function createGroundLayer(view = VIEW) {
  return {
    name: 'ground',
    draw(ctx, frame) {
      const { tiles, layout, palette } = frame;
      ctx.fillStyle = view.paper;
      ctx.fillRect(0, 0, frame.width, frame.height);
      for (const tile of tiles) {
        const box = placed(layout, tile, view);
        if (box.size <= 0) continue;
        drawTile(ctx, box, palette.colors[tile.bg].hex, frame.gloss);
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
        const { x, y, size } = placed(layout, sprite, view);
        if (size <= 0) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(size / CELL, size / CELL);
        drawGlyph(
          ctx,
          glyphsById.get(sprite.art),
          { ink: palette.colors[sprite.ink].hex, core: palette.core, key: palette.key },
          frame.gloss,
          frame.geometry,
        );
        ctx.restore();
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
