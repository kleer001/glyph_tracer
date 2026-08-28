// Palette — picking one of the named palettes out of data/palette.json.
//
// The file holds several; everything downstream wants one, in the flat shape the
// renderer reads. This is the boundary where a palette that cannot be drawn from is
// refused rather than half-drawn.

/**
 * One named palette, flattened.
 *
 * A palette defines its colours and then says with `use` which of them are live, so a
 * six-colour set can be played as a four-colour one without losing the other two. What
 * comes back is only the live ones, in the order `use` names them — a board indexes
 * into that, so `use` decides what index 0 means.
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
  const use = chosen.use ?? chosen.colors.map((_, i) => i);
  if (!Array.isArray(use) || !use.length) {
    throw new Error(`palette "${id}": "use" must name which colours are live`); // boundary
  }
  if (new Set(use).size !== use.length) {
    throw new Error(`palette "${id}": "use" names the same colour twice`); // boundary
  }
  const live = use.map((i) => {
    if (!Number.isInteger(i) || i < 0 || i >= chosen.colors.length) {
      throw new Error(`palette "${id}": "use" names colour ${i}, which it does not have`); // boundary
    }
    return chosen.colors[i];
  });
  for (const field of ['core', 'key']) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(pack[field] ?? '')) {
      throw new Error(`the palette file's "${field}" is not a six-digit hex colour`); // boundary
    }
  }
  return {
    id,
    name: chosen.name ?? id,
    note: chosen.note ?? '',
    colors: live,
    defined: chosen.colors,
    use,
    core: pack.core,
    key: pack.key,
  };
}

/** Every palette the file offers, for a picker or a plate. */
export function paletteNames(pack) {
  return Object.entries(pack?.palettes ?? {}).map(([id, p]) => ({ id, name: p.name ?? id }));
}

/**
 * Which levels a palette cannot paint.
 *
 * A board holds colour indices, so a palette with four live colours can only show a
 * level that uses four. Narrowing `use` is therefore not a skin change — it decides
 * which levels are playable at all, and silently painting nothing would be worse than
 * saying so.
 *
 * @param {{colors: Array}} palette - resolved.
 * @param {Array<{id: number, colors?: number, board?: Array}>} levels - from loadRun.
 * @param {(level: object) => number} colorsOf - how many colours a level uses.
 * @returns {Array<{id: number, needs: number}>}
 */
export function uncovered(palette, levels, colorsOf) {
  return levels
    .map((level) => ({ id: level.id, needs: colorsOf(level) }))
    .filter((l) => l.needs > palette.colors.length);
}
