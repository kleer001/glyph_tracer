import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hexToRgb, paletteFileText, paletteStateLines, rgbToHex } from '../src/devPanels.js';
import { paletteNames, resolvePalette } from '../src/palette.js';

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
  for (const { id } of paletteNames(PACK)) {
    for (const colour of resolvePalette(PACK, id).colors) {
      assert.ok(CHANNELS_OK(hexToRgb(colour.hex)), `${id}/${colour.name} is out of range`);
    }
  }
  hexToRgb(PACK.core);
  hexToRgb(PACK.key);
});

const CHANNELS_OK = ({ r, g, b }) => [r, g, b].every((v) => v >= 0 && v <= 255);

test('the copied palette is valid JSON that parses back to the same colours', () => {
  const palette = structuredClone(resolvePalette(PACK));
  palette.defined[2].hex = '#123456'; // pretend the picker moved one
  // A block is what sits inside `palettes`, so it parses once wrapped back up. What it
  // carries is everything the palette DEFINES, not the subset `use` makes live.
  const parsed = JSON.parse(`{${paletteFileText(palette)}}`)[palette.id];
  assert.deepEqual(parsed.colors, palette.defined);
  assert.deepEqual(parsed.use, palette.use);
  assert.equal(parsed.name, palette.name);
  assert.equal(parsed.note, palette.note);
});

test('the copied palette is a drop-in for the block it came from', () => {
  const raw = readFileSync(new URL('../data/palette.json', import.meta.url), 'utf8');
  for (const { id } of paletteNames(PACK)) {
    const block = paletteFileText(resolvePalette(PACK, id)).trimEnd();
    assert.ok(raw.includes(block), `the ${id} block is not what the file holds:\n${block}`);
  }
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
test('copying a palette keeps every colour it defines, live or not', () => {
  const palette = {
    id: 'x', name: 'X', note: '',
    defined: [
      { name: 'a', hex: '#111111' }, { name: 'b', hex: '#222222' },
      { name: 'c', hex: '#333333' }, { name: 'd', hex: '#444444' },
    ],
    use: [0, 2],
    colors: [{ name: 'a', hex: '#111111' }, { name: 'c', hex: '#333333' }],
  };
  const parsed = JSON.parse(`{${paletteFileText(palette)}}`).x;
  assert.equal(parsed.colors.length, 4, 'all four defines survive');
  assert.deepEqual(parsed.use, [0, 2], 'and the set that is live');
  // a palette that uses everything says nothing, rather than repeating itself
  const all = { ...palette, use: [0, 1, 2, 3], colors: palette.defined };
  assert.equal(JSON.parse(`{${paletteFileText(all)}}`).x.use, undefined);
});
