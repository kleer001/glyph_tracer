import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hexToRgb, paletteFileText, paletteStateLines, rgbToHex } from '../dev/palettePanel.js';
import { resolvePalette } from '../src/palette.js';

const PACK = JSON.parse(readFileSync(new URL('../data/palette.json', import.meta.url), 'utf8'));

test('hex and rgb round-trip', () => {
  for (const hex of ['#FF0000', '#00FF00', '#0000FF', '#101216', '#7A5C7E']) {
    assert.equal(rgbToHex(hexToRgb(hex)), hex.toUpperCase());
  }
});

test('channels are clamped to a byte', () => {
  assert.equal(rgbToHex({ r: 300, g: -20, b: 128 }), '#FF0080');
});

test('a malformed colour fails loudly', () => {
  for (const bad of ['#FFF', 'red', '#GGGGGG', '']) {
    assert.throws(() => hexToRgb(bad), /hex colour/);
  }
});

test('every shipped palette colour is a hex the picker can load', () => {
  for (const colour of resolvePalette(PACK).colors) {
    assert.ok(CHANNELS_OK(hexToRgb(colour.hex)), `${colour.name} is out of range`);
  }
  hexToRgb(PACK.core);
  hexToRgb(PACK.key);
});

const CHANNELS_OK = ({ r, g, b }) => [r, g, b].every((v) => v >= 0 && v <= 255);

test('the copied palette parses back to the same colours', () => {
  const palette = structuredClone(resolvePalette(PACK));
  palette.colors[2].hex = '#123456'; // pretend the picker moved one
  const parsed = JSON.parse(paletteFileText(palette));
  assert.deepEqual(parsed.colors, palette.colors);
  assert.equal(parsed.core, palette.core);
  assert.equal(parsed.key, palette.key);
  assert.equal(parsed.note, palette.note);
});

// The panel copies the whole file, so what it hands you has to be byte-identical to
// what is on disk or pasting it back would be a diff nobody asked for.
test('the copied palette is the file, to the byte', () => {
  const raw = readFileSync(new URL('../data/palette.json', import.meta.url), 'utf8');
  assert.equal(paletteFileText(resolvePalette(PACK)), raw);
});

test('every colour is labelled with its index, name and hex', () => {
  const palette = resolvePalette(PACK);
  const originals = palette.colors.map((c) => c.hex);
  const lines = paletteStateLines(palette, originals);
  assert.equal(lines.length, palette.colors.length + 2, 'six colours plus core and key');
  palette.colors.forEach((colour, i) => {
    assert.match(lines[i].text, new RegExp(`^${i}\\s+${colour.name}\\s+${colour.hex}$`));
  });
  assert.equal(lines.at(-2).name, 'core');
  assert.equal(lines.at(-1).name, 'key');
});

test('an edited colour is marked as changed', () => {
  const palette = structuredClone(resolvePalette(PACK));
  const originals = palette.colors.map((c) => c.hex);
  palette.colors[1].hex = '#ABCDEF';
  const lines = paletteStateLines(palette, originals);
  assert.equal(lines[1].changed, true);
  assert.match(lines[1].text, /\*$/);
  assert.equal(lines[0].changed, false);
  assert.doesNotMatch(lines[0].text, /\*/);
});

// The copier once wrote only the live colours, which silently deleted the rest of a
// palette's definition — and the round-trip test could not see it, because the file it
// compared against had been written by the same broken copier.
