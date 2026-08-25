// Glyph geometry — pure, no canvas. RENDER_SPEC.md is the reference this implements.
//
// Everything is expressed in the spec's 100x100 cell so the numbers here read
// straight off that document; the renderer scales the whole cell to pixels.
//
// SVG y is down, so an offset of -90 degrees puts a vertex at the top.

export const CELL = 100;
export const CENTER = 50;
export const RADIUS = 36;
export const CORNER = 8;

/** Stroke widths, in cell units. A 14 under an 8 leaves 3 units of keyline outside. */
export const STROKE = Object.freeze({ key: 14, ink: 8, mark: 6, nest: 6 });

/** Side count is the verb: how the form relates to a 4-grid. */
export const FORMS = Object.freeze({
  circle: { sides: null, offset: 0, verb: 'radiate' },
  triangle: { sides: 3, offset: -90, verb: 'push' },
  square: { sides: 4, offset: -45, verb: 'hold' },
  diamond: { sides: 4, offset: -90, verb: 'swap' },
  pentagon: { sides: 5, offset: -90, verb: 'wild' },
  hexagon: { sides: 6, offset: 0, verb: 'flow' },
});

export const MARKS = Object.freeze(['none', 'dot', 'cross', 'ex', 'slash', 'nest']);

/**
 * The outline of a form, as a polygon or a circle.
 * @param {string} form - a key of FORMS.
 * @param {number} [rotation] - degrees added to the form's offset; a triangle's
 *   apex is its push direction, which is the only axis rotation is used for.
 * @param {number} [radius]
 * @returns {{kind: 'circle', cx: number, cy: number, r: number}
 *          |{kind: 'polygon', points: Array<[number, number]>}}
 */
export function outline(form, rotation = 0, radius = RADIUS) {
  const spec = FORMS[form];
  if (!spec) throw new Error(`unknown form: ${form}`); // boundary
  if (spec.sides === null) return { kind: 'circle', cx: CENTER, cy: CENTER, r: radius };
  const points = [];
  for (let i = 0; i < spec.sides; i++) {
    const deg = spec.offset + rotation + (i * 360) / spec.sides;
    const rad = (deg * Math.PI) / 180;
    points.push([CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)]);
  }
  return { kind: 'polygon', points };
}

/**
 * Clip rects for the fill state. Magnitude reads as a gauge: hollow, half, solid.
 * @param {number} mag - 1, 2 or 3.
 * @returns {{ink: ?object, core: ?object}} rects in cell units; null means no clip
 *   is needed because that paint is skipped or covers the whole interior.
 */
export function fillClips(mag) {
  if (mag === 1) return { ink: null, core: { x: 0, y: 0, w: CELL, h: CELL } };
  if (mag === 2) {
    return { ink: { x: 0, y: 50, w: CELL, h: 50 }, core: { x: 0, y: 0, w: CELL, h: 50 } };
  }
  if (mag === 3) return { ink: { x: 0, y: 0, w: CELL, h: CELL }, core: null };
  throw new Error(`magnitude must be 1, 2 or 3, got ${mag}`); // boundary
}

/**
 * The inner mark, as primitives the renderer can draw without knowing which mark
 * it got. Painted twice — ink inside the core clip, core inside the ink clip — so
 * it contrasts at every fill state with no per-glyph art.
 * @returns {{dots: Array<object>, lines: Array<object>, rings: Array<object>}}
 */
export function markGeometry(mark, form, rotation = 0) {
  const empty = { dots: [], lines: [], rings: [] };
  switch (mark) {
    case 'none':
      return empty;
    case 'dot':
      return { ...empty, dots: [{ cx: CENTER, cy: CENTER, r: 8 }] };
    case 'cross':
      return {
        ...empty,
        lines: [
          { x1: 36, y1: 50, x2: 64, y2: 50 },
          { x1: 50, y1: 36, x2: 50, y2: 64 },
        ],
      };
    case 'ex':
      return {
        ...empty,
        lines: [
          { x1: 40, y1: 40, x2: 60, y2: 60 },
          { x1: 60, y1: 40, x2: 40, y2: 60 },
        ],
      };
    case 'slash':
      return { ...empty, lines: [{ x1: 38, y1: 62, x2: 62, y2: 38 }] };
    case 'nest':
      // Nesting encodes range: the same form again, inside itself.
      return { ...empty, rings: [outline(form, rotation, 15)] };
    default:
      throw new Error(`unknown mark: ${mark}`); // boundary
  }
}
