// FX — the flourish an ability throws when it fires.
//
// Separate from `animate.js` on purpose. That module folds a resolved settle into
// phases the board can be drawn from; this one draws what an ability *means* — the
// direction a shove went, the grip a turn had — over the top of it. The board would
// still be readable with every effect here switched off, which is the test each one
// has to pass: a flourish that carries information the rules do not is a lie, and one
// the player cannot ignore is noise.
//
// The beam is lifted from a sister game's void tentacle, and the shape of it is worth
// stating because it is not the obvious build. A beam is NOT a stroked line. It is a
// chain of discs sampled along a shaft, because:
//
//   * a stroke cannot taper along its run and cannot curve, and a beam that does
//     neither reads as a drawn line rather than a thing with a grip;
//   * a wave pushed along the shaft's own normal makes it alive, and pinning the root
//     while the rest moves is what keeps it attached to the cell that threw it;
//   * a band of brightness riding root-to-tip says the beam is charging rather than
//     merely present, and it costs one exponential per sample.
//
// The wave is also where the meaning goes: a beam that curls and a beam that whips are
// two different verbs, so an ability can be told apart by how its beam moves and not
// only by where it points.
//
// Nothing here touches the DOM or reads a clock. A caller passes the time it wants
// drawn, which is what keeps the effect testable and lets a sandbox scrub it.

/** Which way a push sends a piece, as [row, column] steps. */
export const PUSH_STEPS = Object.freeze({
  pushUp: [-1, 0],
  pushRight: [0, 1],
  pushDown: [1, 0],
  pushLeft: [0, -1],
});

/**
 * The direction a glyph's ability throws, in radians for a canvas whose y runs down,
 * or null for an ability that has no direction.
 */
export function headingFor(kind) {
  const step = PUSH_STEPS[kind];
  return step ? Math.atan2(step[0], step[1]) : null;
}

/**
 * Perpendicular displacement along a shaft, as a fraction of the wave amplitude.
 *
 * Each is a different verb. `snake` travels a whole wave down the shaft and suits a
 * beam that is holding station; `whip` grows toward the tip and suits one that struck;
 * `curl` leans the far half over and suits one that is dragging something round.
 * `none` is the straight beam, which is the right answer for a heading — a shove goes
 * in a straight line and a beam that wandered would be lying about it.
 *
 * @param {number} f - how far along the shaft, 0 at the root and 1 at the tip.
 * @param {number} t - seconds, so the wave animates.
 * @param {number} seed - keeps two beams from moving in lockstep.
 */
export const WAVES = Object.freeze({
  none: () => 0,
  snake: (f, t, seed) => Math.sin(f * Math.PI * 2 - t * 6 + seed),
  whip: (f, t, seed) => f * Math.sin(f * 4 - t * 9 + seed) * 1.4,
  curl: (f, t, seed) => f * f * Math.sin(t * 3 + seed) * 1.6,
});

/**
 * The envelope over a beam's life: nothing at either end, most in the middle.
 *
 * `power` above 1 sharpens the peak, which shortens the part of the life the beam is
 * actually visible for without changing how long it takes to cross.
 */
export function swellAt(t, power = 1) {
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(Math.PI * t) ** power;
}

/**
 * A band of brightness centred at `at` along the shaft, or nothing when there is no
 * band. `falloff` above 2 gives a hard-edged band, below 2 a soft one.
 */
export function pulseAt(f, at, width = 0.25, falloff = 2) {
  if (at == null) return 0;
  return Math.exp(-(Math.abs((f - at) / width) ** falloff));
}

/** A hex colour at an alpha, as the string canvas wants. */
export function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha))})`;
}

/** Dim a colour toward black, then lift it toward white. The band uses both. */
export function shadeHex(hex, dim = 1, lighten = 0) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (channel) => {
    const v = channel * dim;
    return Math.round(v + (255 - v) * Math.max(0, Math.min(1, lighten)));
  };
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

/**
 * Where a beam has got to at `t` through its life, given how far it may reach.
 *
 * The tip runs out to `reach` and the root follows it once `chase` of the life has
 * gone, so a beam with no chase is a spear that grows and a beam with a full chase is
 * a bolt that travels and leaves nothing behind it.
 */
export function beamSpan(t, reach, chase = 0) {
  const head = Math.min(1, t / Math.max(1e-6, 1 - chase));
  const tail = chase <= 0 ? 0 : Math.max(0, (t - (1 - chase)) / chase);
  return { from: reach * tail, to: reach * head };
}

/**
 * Sample a beam into the discs that will be drawn, root first.
 *
 * The root is pinned: the wave is scaled by `min(1, f * 4)` so the first quarter barely
 * moves and the beam stays welded to whatever threw it. `spread` fades the wave in as
 * the shaft extends, so a beam does not thrash while it is still a stub.
 *
 * Pure, and the reason the shape is testable without a canvas.
 *
 * @returns {Array<{x: number, y: number, r: number, f: number, pulse: number}>}
 */
export function beamPoints({
  x, y, tipX, tipY, baseR, tipR, samples = null,
  wave = 'none', waveAmp = 0, time = 0, seed = 0, spread = 1, band = null,
  bandWidth = 0.25, bandFalloff = 2, scale = 1,
}) {
  const shape = WAVES[wave] ?? WAVES.none;
  const dx = tipX - x;
  const dy = tipY - y;
  const len = Math.hypot(dx, dy) || 1e-6;
  // Discs have to overlap or the shaft reads as a dotted line. The count therefore
  // follows from the geometry rather than being a constant: step along by about half
  // the narrowest radius, which is where a gap would open first.
  const narrowest = Math.max(0.5, Math.min(baseR, tipR));
  const n = samples ?? Math.max(8, Math.min(160, Math.ceil(len / (narrowest * 0.6))));
  // A sharp taper can still outrun the cap on a long shaft, so no disc is allowed to be
  // narrower than the step between them. The tip goes slightly blunt, which is a price
  // worth paying: drawTip puts a bulb there anyway, and a beaded shaft reads as broken.
  const minR = (len / n) * 0.6;
  const nx = -dy / len;
  const ny = dx / len;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const off = waveAmp * shape(f, time, seed) * Math.min(1, f * 4) * spread;
    pts.push({
      f,
      x: x + dx * f + nx * off,
      y: y + dy * f + ny * off,
      r: Math.max(minR, baseR * (1 - f) + tipR * f) * scale,
      pulse: pulseAt(f, band, bandWidth, bandFalloff),
    });
  }
  return pts;
}

/**
 * Paint a sampled beam: a glow halo under a dimmed body, the way a neon shaft is built
 * in canvas 2D when there is no shader to do it.
 *
 * Two passes and not one. The halo is `shadowBlur` on every disc, which is expensive
 * enough to be worth knowing about and is the only way to get light to bleed past an
 * edge here; the body then covers the halo's middle so the shaft has a solid core.
 * Drawing one pass with a blur and no cover gives a smear, and the cover alone gives a
 * flat noodle.
 */
export function drawShaft(ctx, pts, {
  hex, alpha = 1, glowBlur = 0, glowBoost = 0, bodyDim = 1, lighten = 0, glow = false,
}) {
  if (!(alpha > 0) || !pts.length) return;
  ctx.save();
  if (glow) ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;

  if (glowBlur > 0) {
    ctx.save();
    ctx.shadowColor = hex;
    ctx.fillStyle = hex;
    for (const p of pts) {
      if (p.r <= 0) continue;
      ctx.shadowBlur = glowBlur + p.pulse * glowBoost;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  for (const p of pts) {
    if (p.r <= 0) continue;
    ctx.fillStyle = shadeHex(hex, bodyDim, p.pulse * lighten);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The bulb at a beam's tip: a soft halo and a solid core, both on the last disc. */
export function drawTip(ctx, pts, { hex, alpha = 1, halo = 3, bodyDim = 1, lighten = 0 }) {
  const tip = pts[pts.length - 1];
  if (!tip || !(alpha > 0) || tip.r <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillStyle = rgba(hex, 1);
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, tip.r + halo, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = shadeHex(hex, bodyDim, tip.pulse * lighten);
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, tip.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
