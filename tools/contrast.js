#!/usr/bin/env node
// What separates every colour on the board from every other one.
//
// A glyph wears one of the palette's colours on a tile wearing another, so the palette
// has to survive every ordered pair, not just each colour against the paper. WCAG's
// contrast ratio is the measure, and W3C's G207 puts the floor for a graphic that
// carries meaning at 3:1.
//
// The number this prints that matters most is the keyline's. Colours chosen for hue
// tend to land at the same lightness, and two colours at the same lightness have almost
// no contrast whatever their hue — so on a board like that the black outline around a
// glyph is not decoration, it is the entire mechanism keeping the glyph legible.
//
// Usage:
//   node tools/contrast.js                 # the palette the game ships

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolvePalette } from '../src/palette.js';
import { VIEW } from '../src/render.js';
import { parseArgs } from './args.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

const SPEC = {
  floor: { type: 'number', default: 3 },
};

/** Relative luminance, per WCAG 2. Channels are linearised before weighting. */
export function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast between two colours, from 1 (identical) to 21 (black on white). */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function main() {
  const args = parseArgs(process.argv.slice(2), SPEC);
  const pack = read('../data/palette.json');
  const { colors, key } = resolvePalette(pack);

  console.log(`\npalette — ${colors.map((c) => `${c.name} ${c.hex}`).join('  ')}\n`);

  const w = Math.max(8, ...colors.map((c) => c.name.length + 2));
  const cell = (s) => String(s).padStart(8);
  console.log(' '.repeat(w) + colors.map((c) => cell(c.name)).join(''));
  const failures = [];
  for (const a of colors) {
    let row = a.name.padEnd(w);
    for (const b of colors) {
      if (a === b) {
        row += cell('—');
        continue;
      }
      const r = contrast(a.hex, b.hex);
      row += cell(r.toFixed(2));
      if (r < args.floor && a.name < b.name) failures.push({ a, b, r });
    }
    console.log(row);
  }

  console.log(`\nthe keyline (${key}) against each colour:`);
  for (const c of colors) console.log(`  ${c.name.padEnd(w)}${contrast(key, c.hex).toFixed(2)}`);

  console.log(`\nthe paper (${VIEW.paper}) against each colour:`);
  for (const c of colors) console.log(`  ${c.name.padEnd(w)}${contrast(VIEW.paper, c.hex).toFixed(2)}`);

  if (!failures.length) {
    console.log(`\nevery pair clears ${args.floor}:1.`);
    return;
  }
  console.log(`\n${failures.length} pair(s) under ${args.floor}:1 — the keyline is carrying these:`);
  for (const f of failures.sort((x, y) => x.r - y.r)) {
    console.log(`  ${f.a.name} on ${f.b.name}`.padEnd(w * 2 + 6) + f.r.toFixed(2));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
