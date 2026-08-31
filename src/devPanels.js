// Dev panels — the palette editor and the move log that flank the board.
//
// These are instruments, not the game: they read and write the same data the game
// does and otherwise stay out of its way. Everything here touches the DOM, which is
// why it lives in its own module rather than in main.js.

import { toText } from './debugLog.js';

const CHANNELS = ['r', 'g', 'b'];

/** '#RRGGBB' -> {r, g, b}. Fails loudly rather than guessing at a malformed value. */
export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`); // boundary
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** {r, g, b} -> '#RRGGBB', uppercase, channels clamped to a byte. */
export function rgbToHex({ r, g, b }) {
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
}

/**
 * One palette as the block it occupies inside data/palette.json's `palettes`, so what
 * you copy off the panel is what you paste back over it. `core` and `key` are shared by
 * every palette and sit at the top level of that file, so they are not part of a block.
 *
 * Every colour the palette DEFINES is written, not only the live ones — a palette that
 * plays four of its six still has six, and copying back the four would throw the other
 * two away along with any `use` that named them.
 *
 * @param {{id: string, name: string, note: string, colors: Array, defined?: Array,
 *   use?: Array<number>}} palette - resolved.
 * @returns {string}
 */
export function paletteFileText(palette) {
  const defined = palette.defined ?? palette.colors;
  const colors = defined.map((c) => `        { "name": ${JSON.stringify(c.name)}, "hex": "${c.hex}" }`);
  const live = palette.use ?? defined.map((_, i) => i);
  const usesAll = live.length === defined.length && live.every((v, i) => v === i);
  return [
    `    ${JSON.stringify(palette.id)}: {`,
    `      "name": ${JSON.stringify(palette.name)},`,
    `      "note": ${JSON.stringify(palette.note)},`,
    '      "colors": [',
    colors.join(',\n'),
    usesAll ? '      ]' : '      ],',
    ...(usesAll ? [] : [`      "use": [${live.join(', ')}]`]),
    '    }',
    '',
  ].join('\n');
}

/** One labelled line per colour: its index, its name, its hex, and whether it moved. */
export function paletteStateLines(palette, originals) {
  const width = Math.max(...palette.colors.map((c) => c.name.length));
  return [
    ...palette.colors.map((colour, i) => ({
      index: i,
      name: colour.name,
      hex: colour.hex,
      changed: colour.hex !== originals[i],
      text: `${i}  ${colour.name.padEnd(width)}  ${colour.hex}${colour.hex !== originals[i] ? '  *' : ''}`,
    })),
    { index: null, name: 'core', hex: palette.core, changed: false, text: `   ${'core'.padEnd(width)}  ${palette.core}` },
    { index: null, name: 'key', hex: palette.key, changed: false, text: `   ${'key'.padEnd(width)}  ${palette.key}` },
  ];
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Six swatches, an RGB picker for whichever is selected, and a way back.
 *
 * The original hex of each colour is captured once at mount, so revert always means
 * "what this colour was when the page loaded" no matter how far it has been dragged.
 *
 * @param {HTMLElement} root
 * @param {object} palette - mutated in place; the game reads it every frame.
 * @param {() => void} onChange - called after any edit, to repaint the board.
 */
export function mountPalettePanel(root, palette, onChange) {
  const originals = palette.colors.map((c) => c.hex);
  let selected = 0;

  root.append(el('h2', 'panel-title', 'Palette'));
  const grid = el('div', 'swatch-grid');
  const swatches = palette.colors.map((colour, i) => {
    const button = el('button', 'swatch');
    button.type = 'button';
    button.append(el('span', 'swatch-chip'), el('span', 'swatch-name', colour.name));
    button.addEventListener('click', () => select(i));
    grid.append(button);
    return button;
  });
  root.append(grid);

  const readout = el('div', 'readout');
  const hexLabel = el('code', 'hex');
  const revert = el('button', 'revert', 'revert');
  revert.type = 'button';
  readout.append(hexLabel, revert);
  root.append(readout);

  const sliders = CHANNELS.map((channel) => {
    const row = el('label', 'slider-row');
    const input = el('input');
    input.type = 'range';
    input.min = '0';
    input.max = '255';
    const value = el('span', 'slider-value');
    row.append(el('span', 'slider-label', channel.toUpperCase()), input, value);
    input.addEventListener('input', () => {
      const rgb = hexToRgb(palette.colors[selected].hex);
      rgb[channel] = Number(input.value);
      apply(rgbToHex(rgb));
    });
    root.append(row);
    return { input, value };
  });

  function apply(hex) {
    palette.colors[selected].hex = hex;
    refresh();
    onChange();
  }

  function select(i) {
    selected = i;
    refresh();
  }

  function refresh() {
    palette.colors.forEach((colour, i) => {
      swatches[i].querySelector('.swatch-chip').style.background = colour.hex;
      swatches[i].classList.toggle('is-selected', i === selected);
    });
    const hex = palette.colors[selected].hex;
    hexLabel.textContent = hex;
    const rgb = hexToRgb(hex);
    CHANNELS.forEach((channel, i) => {
      sliders[i].input.value = String(rgb[channel]);
      sliders[i].value.textContent = String(rgb[channel]);
    });
    revert.disabled = hex === originals[selected];
    refreshState();
  }

  // --- the state of all six, labelled, and a way to take it with you ---------
  const stateHead = el('div', 'panel-head');
  stateHead.append(el('h2', 'panel-title', 'All six'));
  const copyPalette = el('button', 'copy', 'copy');
  copyPalette.type = 'button';
  stateHead.append(copyPalette);
  root.append(stateHead);

  const stateList = el('div', 'state-list');
  root.append(stateList);
  root.append(el('p', 'panel-hint', 'copy gives you data/palette.json, ready to paste'));

  copyPalette.addEventListener('click', async () => {
    await navigator.clipboard.writeText(paletteFileText(palette));
    copyPalette.textContent = 'copied';
    setTimeout(() => {
      copyPalette.textContent = 'copy';
    }, 1200);
  });

  function refreshState() {
    stateList.replaceChildren(
      ...paletteStateLines(palette, originals).map((line) => {
        const row = el('div', `state-row${line.changed ? ' is-changed' : ''}`);
        const chip = el('span', 'state-chip');
        chip.style.background = line.hex;
        row.append(chip, el('span', 'state-text', line.text));
        return row;
      }),
    );
  }

  revert.addEventListener('click', () => apply(originals[selected]));
  refresh();
}

/**
 * The move log, and a button that puts all of it on the clipboard.
 * @param {HTMLElement} root
 * @returns {{append: Function, clear: Function, text: () => string}}
 */
export function mountDebugPanel(root) {
  const entries = [];

  const header = el('div', 'panel-head');
  header.append(el('h2', 'panel-title', 'Move log'));
  const copy = el('button', 'copy', 'copy');
  copy.type = 'button';
  header.append(copy);
  root.append(header);

  const body = el('div', 'log');
  root.append(body);

  const text = () => entries.map(({ depth, text: line }) => '  '.repeat(depth) + line).join('\n');

  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(text());
    copy.textContent = 'copied';
    setTimeout(() => {
      copy.textContent = 'copy';
    }, 1200);
  });

  return {
    append(lines) {
      for (const line of lines) {
        entries.push(line);
        const node = el('div', `log-line depth-${line.depth}`, line.text);
        body.append(node);
      }
      body.scrollTop = body.scrollHeight;
    },
    clear() {
      entries.length = 0;
      body.replaceChildren();
    },
    text,
  };
}
