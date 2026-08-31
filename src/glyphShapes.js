// Glyph geometry — pure, no canvas. The lengths are `data/geometry.json`; this turns
// them into the shapes `render.js` paints.
//
// A glyph is a Roman letter, turned or mirrored: the letterform is the verb and the
// turn is the direction. Two of the twelve are authored rather than drawn from a
// letter — `+` is two bars and `.` is a filled dot — because no letter is shaped like
// a cross and none is shaped like a stop.
//
// The letters arrive as baked outlines from data/glyphPaths.json, not as type set in a
// font. The game ships the paths, so nothing about how a glyph looks depends on what
// the player has installed and there is no webfont to wait for before the first frame.
// tools/bakeGlyphs.py cuts them; each is normalised to a cap height of 1.
//
// Everything is expressed in the spec's 100x100 cell; the renderer scales the whole
// cell to pixels. The lengths are tuning and arrive as `geom` from data/geometry.json,
// so this module says what shape a glyph is and never how big.

export const CELL = 100;
export const CENTER = 50;

/** The knobs data/geometry.json has to carry for a glyph to be drawable. */
export const GEOMETRY_KEYS = Object.freeze(['stem', 'cap', 'centre', 'dotDiameter', 'keylinePx']);

/** The glyphs with no letter behind them, keyed by what `letter` holds. */
export const AUTHORED = Object.freeze({ '|': 'bar', '+': 'cross', '.': 'dot' });

/**
 * What to draw for one glyph, as primitives a renderer can paint without knowing
 * which glyph it got.
 *
 * `kind` here is the drawing kind, not the glyph's ability: 'path' means the baked
 * letterform outline, 'bars' and 'dot' mean fill the rects or the circle. The turn and the mirror
 * are returned rather than applied, so the caller owns the transform the same way it
 * owns the scale.
 *
 * @param {{id?: string, letter: string, rot?: number, flip?: boolean}} glyph
 * @param {object} geom - from data/geometry.json.
 * @param {object} paths - the `paths` map from data/glyphPaths.json.
 */
export function glyphDrawing(glyph, geom, paths) {
  const rot = glyph.rot ?? 0;
  const flip = glyph.flip === true;
  const authored = AUTHORED[glyph.letter];

  if (authored === 'bar' || authored === 'cross') {
    // Both at the letters' own stem width and cap height, so they sit with them. A
    // cross is a bar and the bar turned, drawn at once -- which is the same thing the
    // swap family says about what they do.
    //
    // A bar spans the cap-height box the letters sit in. Turned onto a diagonal that
    // box is longer corner to corner, so the bar is too, or the diagonal marks read
    // visibly shorter than the upright ones they are meant to compose with.
    const { stem, cap, centre } = geom;
    const span = rot % 90 === 0 ? cap : cap * Math.SQRT2;
    const upright = { x: CENTER - stem / 2, y: CENTER + centre - span / 2, w: stem, h: span };
    const turned = { x: CENTER - span / 2, y: CENTER + centre - stem / 2, w: span, h: stem };
    return {
      kind: 'bars',
      rot,
      flip,
      rects: authored === 'bar' ? [upright] : [upright, turned],
    };
  }

  if (authored === 'dot') {
    // A full stop. The piece still carries a colour, so the dot has to be wide enough
    // to read it; the font's own period is one stem across, and this is tuning above
    // that, bounded by O's counter or it starts reading as a filled O.
    return {
      kind: 'dot',
      rot,
      flip,
      circle: { cx: CENTER, cy: CENTER + geom.centre, r: geom.dotDiameter / 2 },
    };
  }

  const d = paths?.[glyph.letter];
  if (!d) {
    throw new Error(`glyph "${glyph.id}" has no baked path for "${glyph.letter}"`); // boundary
  }
  // Baked at cap height 1 about its own centre, so the size and the vertical aim are
  // still geometry.json's to set.
  return { kind: 'path', rot, flip, d, scale: geom.cap, y: geom.centre };
}

/**
 * The stroke width, in cell units, that paints `px` screen pixels once the caller has
 * scaled the cell. A width fixed in cell units would be four pixels on a large board
 * and a third of one on a small board, and the keyline is meant to be a hairline at
 * every size. Doubled because a centred stroke puts half its width outside the shape.
 */
export function keylineUnits(px, cellPx) {
  return (px * 2 * CELL) / cellPx;
}
