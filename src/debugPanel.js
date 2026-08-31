// Debug panel — the move log, on screen.
//
// The shipped half of what used to sit beside the palette editor: this one is mounted
// by the game, that one only by a dev page. They shared nothing but a DOM helper, and
// a module that mounts a player-facing panel AND a colour-picking tool is a module
// that has to be described with an "and".
//
// The panel is a boundary: it is handed a root element and reads nothing else.

import { toText } from './debugLog.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
