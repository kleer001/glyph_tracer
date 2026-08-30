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
// A glyph that throws a beam says what it did by where the beam went. One that throws
// nothing has to say it another way, so it leaves a ghost of itself instead: the same
// letterform in outline, swelling out of the cell as it goes. A piece never gets both --
// two things claiming the same event read as two events.
//
// Nothing here touches the DOM or reads a clock. A caller passes the time it wants
// drawn, which is what keeps the effect testable and lets a sandbox scrub it.

/**
 * How big a ghost is and how much is left of it, `t` through its life.
 *
 * It starts the size of the glyph and fully opaque, and arrives at `grow` bigger and
 * gone. Both ends matter: a ghost that begins transparent never reads as the piece
 * itself, and one that stops short of gone leaves a smear on the board.
 */
export function ghostAt(t, grow = 0.5) {
  const at = t < 0 ? 0 : t > 1 ? 1 : t;
  return { scale: 1 + grow * at, alpha: 1 - at };
}

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
 * Where a beam's tip is when it reaches out to something and then holds on.
 *
 * It runs from the cell to `target` over `reachMs`, and after that it is wherever the
 * target is -- which, once the rules have started moving that piece, means the beam
 * follows it. Shooting out and then gripping is one function because they are one
 * gesture: the pause between them is what a beam that missed would look like.
 *
 * @param {number} ms - since the beam fired.
 * @param {number} reachMs - how long the reaching-out takes.
 * @param {{x: number, y: number}} from - the cell that threw it.
 * @param {{x: number, y: number}} target - where the far end is now.
 */
export function grabAt(ms, reachMs, from, target) {
  const out = reachMs <= 0 ? 1 : Math.min(1, Math.max(0, ms / reachMs));
  return {
    x: from.x + (target.x - from.x) * out,
    y: from.y + (target.y - from.y) * out,
    holding: out >= 1,
  };
}

/**
 * One beam: a stroke from root to tip over a black keyline. Both ends are cut square.
 *
 * The keyline is the same trick the glyphs use, and for the same reason: the palette
 * puts every colour on every other colour, so a red beam crossing a green tile has
 * almost no contrast to lean on.
 *
 * It edges the long sides only. Both strokes are butt-capped and end on the same two
 * points, so the outline reads as rails down the length and neither end is closed off.
 * A round cap on either would leave a disc sitting at the tip, which reads as a drawn
 * object with ends rather than a line.
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
  ctx.lineCap = 'butt'; // a line, not a lozenge: nothing rounds off either end
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tipX, tipY);
  if (keyline > 0) {
    ctx.strokeStyle = key;
    ctx.lineWidth = width + keyline * 2;
    ctx.stroke();
  }
  if (glow) ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hex;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}
