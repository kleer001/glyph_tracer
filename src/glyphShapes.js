// Glyph geometry — pure, no canvas. RENDER_SPEC.md is the reference this implements.
//
// A glyph is a Roman letter, turned or mirrored: the letterform is the verb and the
// turn is the direction. Two of the twelve are authored rather than taken from the
// font — `+` is two bars and `.` is a filled dot — because no letter is shaped like a
// cross and none is shaped like a stop.
//
// Everything is expressed in the spec's 100x100 cell; the renderer scales the whole
// cell to pixels. The lengths are tuning and arrive as `geom` from data/geometry.json,
// so this module says what shape a glyph is and never how big.

export const CELL = 100;
export const CENTER = 50;

/** The knobs data/geometry.json has to carry for a glyph to be drawable. */
export const GEOMETRY_KEYS = Object.freeze(['stem', 'cap', 'centre', 'dotDiameter', 'keylinePx']);

/** The two glyphs with no letter behind them, keyed by what `letter` holds. */
export const AUTHORED = Object.freeze({ '+': 'bars', '.': 'dot' });

/**
 * What to draw for one glyph, as primitives a renderer can paint without knowing
 * which glyph it got.
 *
 * `kind` here is the drawing kind, not the glyph's ability: 'text' means set the
 * letter, 'bars' and 'dot' mean fill the rects or the circle. The turn and the mirror
 * are returned rather than applied, so the caller owns the transform the same way it
 * owns the scale.
 *
 * @param {{id?: string, letter: string, rot?: number, flip?: boolean}} glyph
 * @param {object} geom - from data/geometry.json.
 */
export function glyphDrawing(glyph, geom) {
  const rot = glyph.rot ?? 0;
  const flip = glyph.flip === true;
  const authored = AUTHORED[glyph.letter];

  if (authored === 'bars') {
    // A cross at the letters' own stem width and cap height, so it sits with them.
    const { stem, cap, centre } = geom;
    return {
      kind: 'bars',
      rot,
      flip,
      rects: [
        { x: CENTER - stem / 2, y: CENTER + centre - cap / 2, w: stem, h: cap },
        { x: CENTER - cap / 2, y: CENTER + centre - stem / 2, w: cap, h: stem },
      ],
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

  if (typeof glyph.letter !== 'string' || glyph.letter.length === 0) {
    throw new Error(`glyph "${glyph.id}" has no letter to draw`); // boundary
  }
  return { kind: 'text', rot, flip, letter: glyph.letter };
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
