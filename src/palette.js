// Palette — the colours the board plays in, checked before anything draws with them.
//
// One palette, in `data/palette.json`. Changing a colour is changing its hex; there is
// no set of alternates to pick from and no indirection between what the file lists and
// what a board indexes into, because either would put a second place to look between a
// colour and the cell wearing it.

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * The palette, validated. A board holds colour indices, so index n is the nth colour
 * listed — the file's order is the board's order.
 *
 * @param {object} pack - data/palette.json.
 * @returns {{name: string, hex: string}[] & object} the flat shape every caller wants:
 *   `{ colors, core, key }`.
 */
export function resolvePalette(pack) {
  const colors = pack?.colors;
  if (!Array.isArray(colors) || colors.length < 2) {
    throw new Error('the palette needs at least two colours'); // boundary
  }
  for (const c of colors) {
    if (!HEX.test(c?.hex ?? '')) {
      throw new Error(`palette: "${c?.hex}" is not a six-digit hex colour`); // boundary
    }
  }
  for (const field of ['core', 'key']) {
    if (!HEX.test(pack[field] ?? '')) {
      throw new Error(`the palette's "${field}" is not a six-digit hex colour`); // boundary
    }
  }
  return { note: pack.note ?? '', colors, core: pack.core, key: pack.key };
}

/**
 * Which levels the palette cannot paint.
 *
 * A board holds colour indices, so a level using more colours than the palette lists
 * cannot be shown at all. Painting part of it would be worse than saying so.
 *
 * @param {{colors: Array}} palette - resolved.
 * @param {Array<{id: number}>} levels - from loadRun.
 * @param {(level: object) => number} colorsOf - how many colours a level uses.
 * @returns {Array<{id: number, needs: number}>}
 */
export function uncovered(palette, levels, colorsOf) {
  return levels
    .map((level) => ({ id: level.id, needs: colorsOf(level) }))
    .filter((l) => l.needs > palette.colors.length);
}
