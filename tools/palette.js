#!/usr/bin/env node
// Measure a palette: how close its closest pair gets, to every kind of eye.
//
// The board draws a glyph of one palette colour on a cell of another, so a palette is
// only as good as its most confusable pair. Roughly one man in twelve has a red-green
// colour deficiency, and this game keys its only rule on colour, so a pair they cannot
// separate is a rule they cannot read.
//
// Usage:
//   node tools/palette.js                       # the palette the game ships
//   node tools/palette.js --hex "#EC3334 #FFF627 #52DE52 #00E0DF #6482FF #B82CBB"
//
// Colour-vision-deficiency simulation and perceptual distance.
//
// Simulation matrices are the reference ones from libDaltonLens
// (github.com/DaltonLens/libDaltonLens, svg/cvd_svg_filters.html): protanopia and
// deuteranopia from Vienot, Brettel & Mollon 1999; tritanopia from Brettel, Vienot &
// Mollon 1997, which needs two projections chosen by which side of a separation plane
// the colour falls. All of them operate on LINEAR rgb, not sRGB.
//
// Distances are Euclidean in OKLab (Bjorn Ottosson, 2020), which is built so that a
// step of a given size looks like a step of the same size wherever you take it. That
// is what makes "how close are these two colours" a number worth comparing.

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const hexToLinear = (hex) =>
  [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
export const linearToHex = (rgb) =>
  '#' + rgb.map((v) => Math.round(clamp01(linearToSrgb(clamp01(v))) * 255)
    .toString(16).padStart(2, '0').toUpperCase()).join('');

const apply = (m, [r, g, b]) => m.map((row) => row[0] * r + row[1] * g + row[2] * b);

const PROTAN = [[0.10889, 0.89111, 0], [0.10889, 0.89111, 0], [0.00447, -0.00447, 1]];
const DEUTAN = [[0.29031, 0.70969, 0], [0.29031, 0.70969, 0], [-0.02197, 0.02197, 1]];
const TRITAN1 = [[1.01354, 0.14268, -0.15622], [-0.01181, 0.87561, 0.13619], [0.07707, 0.81208, 0.11085]];
const TRITAN2 = [[0.93337, 0.19999, -0.13336], [0.05809, 0.82565, 0.11626], [-0.37923, 1.13825, 0.24098]];
// The separation plane, taken from the alpha row the reference filter uses to pick
// between the two projections.
const TRITAN_PLANE = [7.92482, -5.66475, -2.26007];

function tritan(lin) {
  const t = TRITAN_PLANE[0] * lin[0] + TRITAN_PLANE[1] * lin[1] + TRITAN_PLANE[2] * lin[2];
  const a = clamp01(t + 0.8); // the filter's soft selector, clamped as SVG would
  const p1 = apply(TRITAN1, lin);
  const p2 = apply(TRITAN2, lin);
  return p1.map((v, i) => v * a + p2[i] * (1 - a));
}

export const VISION = {
  normal: (lin) => lin,
  protan: (lin) => apply(PROTAN, lin),
  deutan: (lin) => apply(DEUTAN, lin),
  tritan,
};

/** OKLab from linear rgb. */
export function oklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}
export const dist = (a, z) => Math.hypot(a[0] - z[0], a[1] - z[1], a[2] - z[2]);

/** Linear rgb from OKLCH, for building a palette rather than picking one. */
export function oklchToLinear(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
export const inGamut = (lin) => lin.every((v) => v >= -0.0005 && v <= 1.0005);

/**
 * The closest pair in a palette, under each kind of vision. The whole board is a grid
 * of one colour on another, so the number that matters is the *worst* pair, not the
 * average: one confusable pair is one the player cannot read.
 */
export function separation(hexes) {
  const lin = hexes.map(hexToLinear);
  const out = {};
  for (const [name, sim] of Object.entries(VISION)) {
    const labs = lin.map((c) => oklab(sim(c)));
    let worst = Infinity;
    let pair = null;
    for (let i = 0; i < labs.length; i++) {
      for (let j = i + 1; j < labs.length; j++) {
        const d = dist(labs[i], labs[j]);
        if (d < worst) { worst = d; pair = [i, j]; }
      }
    }
    out[name] = { worst, pair };
  }
  out.min = Math.min(...Object.values(out).map((v) => v.worst ?? Infinity));
  return out;
}

// --- reporting ---------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolvePalette } from '../src/palette.js';
import { parseArgs } from './args.js';

/** A rough reading of the numbers, so the table says what it means. */
function verdict(worst) {
  if (worst >= 0.15) return 'wide';
  if (worst >= 0.10) return 'clear';
  if (worst >= 0.07) return 'tight';
  if (worst >= 0.04) return 'confusable';
  return 'unreadable';
}

function report(label, hexes) {
  const s = separation(hexes);
  const kinds = ['normal', 'protan', 'deutan', 'tritan'];
  const worstKind = kinds.reduce((a, k) => (s[k].worst < s[a].worst ? k : a), 'normal');
  const [i, j] = s[worstKind].pair;
  console.log(
    `  ${kinds.map((k) => s[k].worst.toFixed(3).padStart(6)).join(' ')}`
    + `  ${s.min.toFixed(3)}  ${verdict(s.min).padEnd(11)} ${label}`,
  );
  console.log(`  ${' '.repeat(37)}closest: ${hexes[i]} on ${hexes[j]} (${worstKind})`);
  return s;
}

function main() {
  const args = parseArgs(process.argv.slice(2), {
    hex: { type: 'string', default: null },
  });

  console.log('Distance between the closest pair, in OKLab, per kind of eye. Higher is better.\n');
  console.log('  normal protan deutan tritan   WORST');
  console.log('  ' + '-'.repeat(70));

  if (args.hex) {
    report('given on the command line', args.hex.trim().split(/\s+/));
    return;
  }
  const pack = JSON.parse(readFileSync(new URL('../data/palette.json', import.meta.url), 'utf8'));
  report('the shipped palette', resolvePalette(pack).colors.map((c) => c.hex));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
