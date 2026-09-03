// FX layers — what an ability throws, drawn over the board that obeyed it.
//
// Two layers, and they sit on opposite sides of the pieces on purpose.
//
// A beam is holding or shoving something, so it belongs BEHIND the pieces: drawn over
// the top it reads as painted on, drawn behind it reads as gripping. A ghost is coming
// off a piece itself, so it belongs IN FRONT: behind the glyph, an outline a tenth
// bigger is entirely hidden by the glyph that cast it.
//
// Neither layer decides anything. What fired, what it reached and what got eaten all
// come off the frame, which got them from the recording of a settle that already
// happened. `abilityFx.js` says which cells an ability touches; `fx.js` knows how to
// draw a beam; this joins them to a compositor and nothing more.

import { beamReach, beamStyleFor, targetsFor } from './abilityFx.js';
import { beamSpan, drawBeam, ghostAt, grabAt, swellAt } from './fx.js';
import { CELL } from './glyphShapes.js';
import { mulberry32 } from './rng.js';
import { VIEW, cellCenter, drawGlyph } from './render.js';

/**
 * What a cleared cell throws, drawn over the pieces.
 *
 * Alongside the shrink and the turn rather than instead of them. Radial and closed
 * form: a particle's whole life is a function of how long ago its beat began, so there
 * is no per-frame state to keep, nothing to reset when playback is cut short, and the
 * same seed throws the same burst every time. No gravity — this board has no down.
 */
export function createBurstLayer(view = VIEW) {
  return {
    name: 'burst',
    draw(ctx, frame) {
      const { tiles, layout, palette, animation, board } = frame;
      const tune = animation.burst;
      if (!tune?.count || !board) return;
      // Most frames have nothing dying on them. Setting up a clip for those is three
      // canvas calls and a clip-stack push to draw nothing.
      if (!tiles.some((tile) => tile.dying)) return;

      ctx.beginPath();
      ctx.rect(layout.originX, layout.originY, layout.spanW, layout.spanH);
      ctx.clip();
      const [small, large] = tune.sizePx;

      for (const tile of tiles) {
        if (!tile.dying) continue;
        // Each cell's own clock: a staggered run shrinks as a wave, and a burst timed
        // off the beat instead would have every cell throw at once against it.
        const u = tile.age / tune.ms;
        if (u <= 0 || u >= 1) continue;
        // Speed falls away as it goes, so the ring pops and then creeps.
        const reach = tune.speed * layout.cell * (1 - Math.exp(-u / tune.settle));
        ctx.globalAlpha = (1 - u) ** tune.fade;
        const mid = cellCenter(layout, tile.y, tile.x, view);
        const ink = board.glyph[tile.y][tile.x];
        ctx.fillStyle = palette.colors[ink === null ? tile.bg : ink].hex;
        // One path for the whole ring, not one per dot: a `moveTo` starts each arc as
        // its own subpath, so a cell costs one fill however many particles it throws.
        // The seed and the order of draws are untouched, so a replay is unchanged.
        const rand = mulberry32(tile.y * 31 + tile.x + 1);
        ctx.beginPath();
        for (let i = 0; i < tune.count; i++) {
          const even = ((i + 0.5) / tune.count) * Math.PI * 2;
          const angle = even + (rand() - 0.5) * tune.scatter;
          const away = reach * (0.7 + rand() * 0.6);
          const px = mid.x + Math.cos(angle) * away;
          const py = mid.y + Math.sin(angle) * away;
          const size = small + rand() * (large - small);
          ctx.moveTo(px + size, py);
          ctx.arc(px, py, size, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    },
  };
}

/**
 * The bloom a landing throws, drawn over the ground and under everything else.
 *
 * White under `screen`, which is exactly the distance from the cell's colour to white:
 * every channel moves the same fraction of the headroom it has left, so nothing can
 * clip and no colour is left out. Adding a colour to itself instead sounds righter and
 * is not — it brightens only where that colour has room, and this palette leaves wildly
 * different amounts. Measured across the six at equal strength, additive light lifted
 * green by 0.40 relative luminance and red by 0.06, because red's own channel already
 * sits at 243 and clips on the first frame. A signal that loud on one hue and silent on
 * another is reporting the tile, not the event. Toward white the same spread is
 * threefold, and what is left of it is physical: a pale tile has nowhere bright to go.
 *
 * A bloom rather than a filled cell. The tiles have rounded corners and sit in
 * gutters, so a square of added light would put four bright corners in the gaps
 * between cells, which is where nothing happened.
 */
export function createFlashLayer(view = VIEW) {
  return {
    name: 'flash',
    draw(ctx, frame) {
      const { fires, layout, animation } = frame;
      if (!fires?.length) return;
      const tune = animation.flash;
      const t = frame.since / tune.ms;
      if (t <= 0 || t >= 1) return;

      // Loudest at the landing and falling away from there. A flash that swells into
      // view has already missed the instant it was meant to be pointing at.
      const alpha = tune.alpha * (1 - t) ** tune.falloff;
      ctx.beginPath();
      ctx.rect(layout.originX, layout.originY, layout.spanW, layout.spanH);
      ctx.clip();
      ctx.globalCompositeOperation = 'screen';
      for (const fired of fires) {
        const [r, c] = fired.at;
        const mid = cellCenter(layout, r, c, view);
        const reach = layout.cell * tune.spread;
        const bloom = ctx.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, reach);
        bloom.addColorStop(0, `rgba(255,255,255,${alpha})`);
        bloom.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = bloom;
        ctx.fillRect(mid.x - reach, mid.y - reach, reach * 2, reach * 2);
      }
    },
  };
}

/** Every ability's beam, drawn under the pieces so a held piece reads as held. */
export function createFxLayer(view = VIEW) {
  return {
    name: 'fx',
    draw(ctx, frame) {
      const { fires, board, layout, palette, animation } = frame;
      if (!fires?.length || !board) return;

      // A beam that outran the board would paint over whatever sits beside it, the
      // same reason the glyph layer has always clipped.
      ctx.beginPath();
      ctx.rect(layout.originX, layout.originY, layout.spanW, layout.spanH);
      ctx.clip();

      const step = layout.cell + view.gap;
      for (const fired of fires) {
        const style = beamStyleFor(fired.kind);
        if (!style) continue;
        const tune = animation.fx[style];
        const t = frame.since / tune.travelMs;
        if (t <= 0 || t >= 1) continue;

        const [r, c] = fired.at;
        const from = cellCenter(layout, r, c, view);
        const env = swellAt(t, tune.swell);
        const hex = palette.colors[board.glyph[r][c]].hex;

        // Where every piece is headed, read once rather than scanned per target.
        const arriving = new Map();
        for (const sprite of frame.sprites) {
          if (sprite.to) arriving.set(String(sprite.to), sprite);
        }

        for (const cell of targetsFor(fired.kind, fired.at, board)) {
          let root = from;
          let tip;
          if (style === 'throw') {
            // Away from the cell and onward: a shove does not stop where the piece
            // it moved happened to be standing.
            const angle = Math.atan2(cell[0] - r, cell[1] - c);
            const dir = [Math.sign(cell[0] - r), Math.sign(cell[1] - c)];
            const reach = beamReach(board, fired.at, dir, tune.reachCells);
            const span = beamSpan(t, reach * step, tune.chase);
            root = { x: from.x + Math.cos(angle) * span.from, y: from.y + Math.sin(angle) * span.from };
            tip = { x: from.x + Math.cos(angle) * span.to, y: from.y + Math.sin(angle) * span.to };
          } else {
            // Onto the piece, and thereafter wherever the rules have taken it.
            const held = arriving.get(String(cell));
            const target = held
              ? cellCenter(layout, held.y, held.x, view)
              : cellCenter(layout, cell[0], cell[1], view);
            tip = grabAt(frame.since, tune.reachMs, from, target);
          }
          drawBeam(ctx, {
            x: root.x,
            y: root.y,
            tipX: tip.x,
            tipY: tip.y,
            // One envelope drives the width and the opacity together, which is what
            // makes it read as a travelling thing rather than a line being faded.
            width: tune.width * layout.cell * env + 1,
            alpha: tune.alpha * env,
            hex,
            keyline: tune.outline,
            key: palette.key,
          });
        }
      }
    },
  };
}

/**
 * The ghost a piece leaves when it has no beam to speak with, drawn over the pieces.
 *
 * An eater swells because it swallowed something and stayed; a glyph with no ability
 * swells because going is the only thing it does. Outline only in both cases: a piece
 * activates by landing on its own colour, so filling it in its own ink would paint it
 * the exact colour of the cell it is standing on.
 */
export function createGhostLayer(view = VIEW) {
  return {
    name: 'ghost',
    draw(ctx, frame) {
      const { fires, eats, board, layout, palette, animation, glyphsById } = frame;
      if (!board || (!fires?.length && !eats?.length)) return;

      const ghosts = [];
      // A swallow is not the firing glyph's event: whoever fired, the piece is eaten
      // at the eater's doorstep, and it is the eater that pulses. Two arms feeding one
      // eater on the same beat is one swallow to watch, not two.
      for (const at of new Set(eats.map((e) => String(e.into)))) {
        const [r, c] = at.split(',').map(Number);
        const glyph = glyphsById.get(board.art[r][c]);
        if (glyph?.exit === 'ghost') ghosts.push({ at: [r, c], glyph, grow: animation.ghost.swallowGrow });
      }
      for (const fired of fires) {
        const [r, c] = fired.at;
        const glyph = glyphsById.get(fired.art);
        if (glyph?.exit === 'ghost') ghosts.push({ at: [r, c], glyph, grow: animation.ghost.clearGrow });
        if (glyph?.exit === 'grow') ghosts.push({ at: [r, c], glyph, grow: animation.grow });
      }

      for (const ghost of ghosts) {
        const { scale, alpha } = ghostAt(frame.since / animation.ghost.ms, ghost.grow);
        if (alpha <= 0) continue;
        const size = layout.cell * scale;
        const mid = cellCenter(layout, ghost.at[0], ghost.at[1], view);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(mid.x - size / 2, mid.y - size / 2);
        ctx.scale(size / CELL, size / CELL);
        drawGlyph(
          ctx,
          ghost.glyph,
          { ink: 'rgba(0,0,0,0)', core: palette.key, key: palette.key },
          { ...frame.gloss, glyphShadowA: 0 }, // a ghost casts nothing
          frame.geometry,
          size,
          frame.glyphPaths,
        );
        ctx.restore();
      }
    },
  };
}
