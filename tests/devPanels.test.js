import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hexToRgb, paletteFileText, paletteStateLines, rgbToHex } from '../src/devPanels.js';

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
  const palette = JSON.parse(readFileSync(new URL('../data/palette.json', import.meta.url), 'utf8'));
  for (const colour of palette.colors) {
    const rgb = hexToRgb(colour.hex);
    assert.ok(CHANNELS_OK(rgb), `${colour.name} is out of range`);
  }
  hexToRgb(palette.core);
  hexToRgb(palette.key);
});

const CHANNELS_OK = ({ r, g, b }) => [r, g, b].every((v) => v >= 0 && v <= 255);

test('the copied palette is valid JSON that parses back to the same colours', () => {
  const palette = JSON.parse(readFileSync(new URL('../data/palette.json', import.meta.url), 'utf8'));
  palette.colors[2].hex = '#123456'; // pretend the picker moved one
  const parsed = JSON.parse(paletteFileText(palette));
  assert.deepEqual(parsed.colors, palette.colors);
  assert.equal(parsed.core, palette.core);
  assert.equal(parsed.key, palette.key);
  assert.equal(parsed.note, palette.note);
});

test('the copied palette is a drop-in for the file it came from', () => {
  const raw = readFileSync(new URL('../data/palette.json', import.meta.url), 'utf8');
  assert.equal(paletteFileText(JSON.parse(raw)), raw, 'an untouched palette round-trips byte for byte');
});

test('every colour is labelled with its index, name and hex', () => {
  const palette = JSON.parse(readFileSync(new URL('../data/palette.json', import.meta.url), 'utf8'));
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
  const palette = JSON.parse(readFileSync(new URL('../data/palette.json', import.meta.url), 'utf8'));
  const originals = palette.colors.map((c) => c.hex);
  palette.colors[1].hex = '#ABCDEF';
  const lines = paletteStateLines(palette, originals);
  assert.equal(lines[1].changed, true);
  assert.match(lines[1].text, /\*$/);
  assert.equal(lines[0].changed, false);
  assert.doesNotMatch(lines[0].text, /\*/);
});
