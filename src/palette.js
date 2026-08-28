// Palette — picking one of the named palettes out of data/palette.json.
//
// The file holds several; everything downstream wants one, in the flat shape the
// renderer reads. This is the boundary where a palette that cannot be drawn from is
// refused rather than half-drawn.

/**
 * One named palette, flattened.
 *
 * @param {object} pack - data/palette.json.
 * @param {string} [id] - which one; the pack's `default` if not given.
 * @returns {{id: string, name: string, colors: Array<{name: string, hex: string}>,
 *   core: string, key: string}}
 */
export function resolvePalette(pack, id = pack?.default) {
  const chosen = pack?.palettes?.[id];
  if (!chosen) {
    const had = Object.keys(pack?.palettes ?? {}).join(', ') || 'none';
    throw new Error(`no palette named "${id}"; the file has ${had}`); // boundary
  }
  if (!Array.isArray(chosen.colors) || chosen.colors.length < 2) {
    throw new Error(`palette "${id}" needs colours`); // boundary
  }
  for (const c of chosen.colors) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(c?.hex ?? '')) {
      throw new Error(`palette "${id}": "${c?.hex}" is not a six-digit hex colour`); // boundary
    }
  }
  for (const field of ['core', 'key']) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(pack[field] ?? '')) {
      throw new Error(`the palette file's "${field}" is not a six-digit hex colour`); // boundary
    }
  }
  return {
    id,
    name: chosen.name ?? id,
    note: chosen.note ?? '',
    colors: chosen.colors,
    core: pack.core,
    key: pack.key,
  };
}

/** Every palette the file offers, for a picker or a plate. */
export function paletteNames(pack) {
  return Object.entries(pack?.palettes ?? {}).map(([id, p]) => ({ id, name: p.name ?? id }));
}
