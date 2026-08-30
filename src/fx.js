// FX — the flourish an ability throws when it fires.
//
// Separate from `animate.js` on purpose. That module folds a resolved settle into
// phases the board can be drawn from; this one draws what an ability *means* — the
// direction a shove went, the hold a turn had — over the top of it. The board would
// still be readable with every effect here switched off, which is the test each one
// has to pass: a flourish that carries information the rules do not is a lie, and one
// the player cannot ignore is noise.
//
// The beam is a sister game's, and it is deliberately a plain one: a stroke from where
// it started to where it has got to, under a single sine envelope driving the width and
// the opacity together. One envelope and not two is the whole trick — it reads as a
// travelling thing rather than a line being faded — and it is about six lines of canvas.
//
// A beam does not taper and does not bend. It is a straight line with a round cap:
// what it has to say is a direction, and anything else it did would be saying something
// the rules did not.
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
 * The envelope over a beam's life: nothing at either end, most in the middle.
 *
 * `power` above 1 sharpens the peak, which shortens the part of the life the beam is
 * actually visible for without changing how long it takes to cross.
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
 * One beam: a stroke from root to tip, round-capped, over a black keyline.
 *
 * The keyline is the same trick the glyphs use, and for the same reason: the palette
 * puts every colour on every other colour, so a red beam crossing a green tile has
 * almost no contrast to lean on.
 *
 * It edges the long sides only. The outline is stroked first, wider, and butt-capped,
 * so it stops dead at both endpoints while the body's round caps carry on past it: the
 * beam gets rails down its length and open ends. Capping the outline round instead
 * would ring the whole beam and turn it into a drawn object rather than a shaft of
 * light leaving a cell.
 *
 * It is also drawn before the composite mode changes. Black adds nothing under
 * `lighter`, so an outline drawn with the body would vanish exactly when the beam is
 * brightest and hardest to place.
 *
 * The caller owns the envelope. It passes the width and the opacity it wants this
 * frame, because the same curve drives both and working it out twice in here is the
 * one place they could drift apart.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} beam
 * @param {number} beam.x - the root, in canvas pixels.
 * @param {number} beam.y
 * @param {number} beam.tipX - the tip, wherever it has reached.
 * @param {number} beam.tipY
 * @param {number} beam.width - stroke width this frame.
 * @param {number} beam.alpha
 * @param {string} beam.hex
 * @param {number} [beam.keyline] - how far the outline stands out past each side.
 * @param {string} [beam.key] - the outline's colour.
 * @param {boolean} [beam.glow] - composite the body additively, so crossing beams brighten.
 */
export function drawBeam(ctx, {
  x, y, tipX, tipY, width, alpha, hex, keyline = 0, key = '#000000', glow = false,
}) {
  if (!(alpha > 0) || !(width > 0)) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tipX, tipY);
  if (keyline > 0) {
    ctx.lineCap = 'butt'; // stop at the ends: the sides are edged, the ends stay open
    ctx.strokeStyle = key;
    ctx.lineWidth = width + keyline * 2;
    ctx.stroke();
  }
  if (glow) ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = hex;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}
