// FX — the flourish an ability throws when it fires.
//
// Separate from `animate.js` on purpose. That module folds a resolved settle into
// phases the board can be drawn from; this one draws what an ability *means* — the
// direction a shove went, the reach of a turn — over the top of it. The board would
// still be readable with every effect here switched off, which is the test each one
// has to pass: a flourish that carries information the rules do not is a lie, and one
// the player cannot ignore is noise.
//
// The beam is lifted from a sister game, where a piercing shot is drawn as a stroke
// from its origin to its live tip under a sine envelope: thin as it leaves, swollen
// in flight, gone at the end. One envelope drives width and alpha together, which is
// what makes it read as a single travelling thing rather than a line being faded.
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
 * The beam's envelope over its own life: nothing at either end, most in the middle.
 *
 * `power` above 1 sharpens the peak, which shortens the part of the life the beam is
 * actually visible for without changing how long it takes to cross the board.
 */
export function swellAt(t, power = 1) {
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(Math.PI * t) ** power;
}

/** A hex colour at an alpha, as the string canvas wants. */
export function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha))})`;
}

/**
 * One beam, as a tapered quad with a fade down its length.
 *
 * A stroked line cannot narrow along its run and cannot fade along it either, so the
 * beam is a filled path with a gradient instead: `taper` is the tip's width as a
 * fraction of the root's, and `fade` is the tip's alpha as a fraction of the root's.
 * A taper of 0 ends the beam in a point, which is what "it dissipates" looks like
 * when there is nothing at the far end to hit.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} beam
 * @param {number} beam.x - origin in canvas pixels.
 * @param {number} beam.y
 * @param {number} beam.angle - radians, y running down.
 * @param {number} beam.length - how far it reaches, in pixels.
 * @param {number} beam.width - the root's full width, in pixels.
 * @param {number} beam.alpha - the root's opacity.
 * @param {number} [beam.taper] - tip width over root width.
 * @param {number} [beam.fade] - tip alpha over root alpha.
 * @param {string} beam.hex
 * @param {boolean} [beam.glow] - composite additively, so crossing beams brighten.
 */
export function drawBeam(ctx, { x, y, angle, length, width, alpha, taper = 0, fade = 0, hex, glow = false }) {
  if (!(alpha > 0) || !(length > 0) || !(width > 0)) return;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;
  const root = width / 2;
  const tip = (width * taper) / 2;
  const tx = x + ux * length;
  const ty = y + uy * length;

  ctx.save();
  if (glow) ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createLinearGradient(x, y, tx, ty);
  grad.addColorStop(0, rgba(hex, alpha));
  grad.addColorStop(1, rgba(hex, alpha * fade));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x + nx * root, y + ny * root);
  ctx.lineTo(tx + nx * tip, ty + ny * tip);
  ctx.lineTo(tx - nx * tip, ty - ny * tip);
  ctx.lineTo(x - nx * root, y - ny * root);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
