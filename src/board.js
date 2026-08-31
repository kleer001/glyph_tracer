// Board — the whole rule set, as pure data and functions. No DOM, no canvas.
//
// Every cell has a fixed background color and holds a glyph in a different color.
// A glyph sitting on a cell whose background is its own color activates: its
// ability fires, then the whole cell goes away.
//
// No gravity, no refill. Chaining comes only from abilities: a pusher shoves its
// orthogonal neighbors one cell outward, and a shoved glyph meeting another shoves
// that one onward, down the line.
//
// A shove line ends at a SINK, and all three sinks behave the same way — the glyph
// at the front of the line is eaten, everything behind it advances one. The sinks
// are the board edge, a dead cell, and a blocker glyph. A line only advances intact
// when it ends on a live empty cell, which is why an emptied square cannot simply
// vanish: that is the one ending a shove survives.

export const ORTHO = Object.freeze([
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]);

/** The four corners. Only swapDiag reaches them. */
export const DIAG = Object.freeze([
  [-1, -1],
  [-1, 1],
  [1, 1],
  [1, -1],
]);

// One kind per glyph and no two alike, so a push carries its direction here rather
// than in its drawing: board.js never reads the art layer.
export const PLAIN = '';
export const PULSE = 'pulse';
export const ANCHOR = 'anchor';
export const PUSH_UP = 'pushUp';
export const PUSH_RIGHT = 'pushRight';
export const PUSH_DOWN = 'pushDown';
export const PUSH_LEFT = 'pushLeft';
export const SWAP_ORTH = 'swapOrth';
export const SWAP_DIAG = 'swapDiag';
export const ROTATE = 'rotate';
export const ROTATE_REV = 'rotateRev';
export const SINK = 'sink';

/** Which way each push sends its line. */
export const PUSH_DIR = Object.freeze({
  [PUSH_UP]: [-1, 0],
  [PUSH_RIGHT]: [0, 1],
  [PUSH_DOWN]: [1, 0],
  [PUSH_LEFT]: [0, -1],
});

/** North, east, south, west — the order a rotation steps through. */
export const RING = Object.freeze([[-1, 0], [0, 1], [1, 0], [0, -1]]);

/**
 * An empty board of the given size. Callers fill `bg`, `glyph` and `kind`.
 * @param {{width: number, height: number, colors: number}} rules
 * @returns {object} board state
 */
export function blankBoard({ width, height, colors, adjacentOnly }) {
  const grid = (fill) =>
    Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
  return {
    width,
    height,
    colors,
    adjacentOnly,
    alive: grid(true),
    bg: grid(0),
    glyph: grid(null),
    kind: grid(PLAIN),
    // What the piece is drawn as. The rules never read it; it rides along because
    // it belongs to the piece rather than to the cell it is standing on.
    art: grid(null),
  };
}

/**
 * A random board. A glyph never spawns on its own color, so a board opens with
 * nothing matched and every activation is something the player caused.
 * @param {{width: number, height: number, colors: number}} rules
 * @param {object} mix - {kind: fraction}; the remainder are plain glyphs.
 * @param {() => number} rand - seeded generator from rng.js.
 */
export function randomBoard(rules, mix, rand) {
  const b = blankBoard(rules);
  for (let r = 0; r < b.height; r++) {
    for (let c = 0; c < b.width; c++) {
      b.bg[r][c] = Math.floor(rand() * b.colors);
      b.kind[r][c] = rollKind(mix, rand);
      const g = Math.floor(rand() * (b.colors - 1));
      b.glyph[r][c] = g >= b.bg[r][c] ? g + 1 : g;
    }
  }
  return b;
}

/** Pick a glyph kind from {kind: fraction}; the remainder is a plain glyph. */
export function rollKind(mix, rand) {
  let x = rand();
  for (const [kind, share] of Object.entries(mix ?? {})) {
    if (x < share) return kind;
    x -= share;
  }
  return PLAIN;
}

/**
 * A palette index as a letter, so an authored board reads as text. Lowercase is the
 * ground a piece stands on, uppercase the ink the piece is drawn in.
 */
export const COLOR_LETTERS = 'abcdefghijklmnop';
const INK_LETTERS = COLOR_LETTERS.toUpperCase();
const DEAD_CELL = '...';
const EMPTY_PIECE = '--';

/**
 * A board written out as text: one three-character cell per piece, cells separated by
 * whitespace, every row the same length.
 *
 *     aC.   an inert piece, ink C, standing on ground a
 *     dB^   a push-up
 *     e--   a live cell with nothing standing on it
 *     ...   a cell that is not part of the board
 *
 * The third character is the glyph's `mark` from `data/glyphs.json`, which is where
 * the alphabet lives — adding a glyph adds its character in one place. Board size and
 * palette size come from the grid, so an authored level states neither.
 *
 * @param {string[]} rows
 * @param {Array<object>} glyphs - the pack from data/glyphs.json.
 * @param {{adjacentOnly?: boolean}} [opts]
 */
export function parseBoard(rows, glyphs, { adjacentOnly = false } = {}) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('an authored board needs rows'); // boundary
  }
  const byMark = new Map(glyphs.map((g) => [g.mark, g]));
  const grid = rows.map((row, r) => {
    if (typeof row !== 'string' || !row.trim()) {
      throw new Error(`board row ${r} is not a row of cells`); // boundary
    }
    return row.trim().split(/\s+/);
  });
  const width = grid[0].length;
  grid.forEach((cells, r) => {
    if (cells.length !== width) {
      throw new Error(`board row ${r} has ${cells.length} cells, row 0 has ${width}`); // boundary
    }
  });

  const b = blankBoard({ width, height: grid.length, colors: 0, adjacentOnly });
  let colors = 0;
  grid.forEach((cells, r) => cells.forEach((cell, c) => {
    const at = `[${r},${c}] "${cell}"`;
    if (cell.length !== 3) throw new Error(`${at} is not three characters`); // boundary
    if (cell === DEAD_CELL) {
      b.alive[r][c] = false;
      return;
    }
    const bg = COLOR_LETTERS.indexOf(cell[0]);
    if (bg < 0) throw new Error(`${at}: "${cell[0]}" is not a ground colour`); // boundary
    b.bg[r][c] = bg;
    colors = Math.max(colors, bg + 1);
    if (cell.slice(1) === EMPTY_PIECE) return; // live, with nothing standing on it
    const ink = INK_LETTERS.indexOf(cell[1]);
    if (ink < 0) throw new Error(`${at}: "${cell[1]}" is not a glyph colour`); // boundary
    const piece = byMark.get(cell[2]);
    if (!piece) throw new Error(`${at}: "${cell[2]}" is no glyph's mark`); // boundary
    b.glyph[r][c] = ink;
    b.kind[r][c] = piece.kind;
    b.art[r][c] = piece.id;
    colors = Math.max(colors, ink + 1);
  }));
  b.colors = colors;
  return b;
}

/**
 * The inverse of `parseBoard`, so a board a tool generated can be pasted into a level
 * and played. One kind per glyph, so the mark is a lookup rather than a choice.
 */
export function formatBoard(b, glyphs) {
  const byKind = new Map(glyphs.map((g) => [g.kind, g]));
  return Array.from({ length: b.height }, (_, r) =>
    Array.from({ length: b.width }, (_, c) => {
      if (!b.alive[r][c]) return DEAD_CELL;
      const ground = COLOR_LETTERS[b.bg[r][c]];
      if (b.glyph[r][c] === null) return `${ground}${EMPTY_PIECE}`;
      const piece = byKind.get(b.kind[r][c]);
      if (!piece) throw new Error(`no glyph is drawn for kind "${b.kind[r][c]}"`); // boundary
      return `${ground}${INK_LETTERS[b.glyph[r][c]]}${piece.mark}`;
    }).join(' '),
  );
}

export function copyBoard(b) {
  return {
    ...b,
    alive: b.alive.map((row) => row.slice()),
    bg: b.bg.map((row) => row.slice()),
    glyph: b.glyph.map((row) => row.slice()),
    kind: b.kind.map((row) => row.slice()),
    art: b.art.map((row) => row.slice()),
  };
}

export function onBoard(b, r, c) {
  return r >= 0 && r < b.height && c >= 0 && c < b.width;
}

export function occupied(b, r, c) {
  return onBoard(b, r, c) && b.alive[r][c] && b.glyph[r][c] !== null;
}

/** Cells whose glyph is standing on its own color. */
export function matches(b) {
  const hits = [];
  for (let r = 0; r < b.height; r++) {
    for (let c = 0; c < b.width; c++) {
      if (occupied(b, r, c) && b.glyph[r][c] === b.bg[r][c]) hits.push([r, c]);
    }
  }
  return hits;
}

export function remaining(b) {
  return b.alive.flat().filter(Boolean).length;
}

function clear(b, r, c) {
  b.glyph[r][c] = null;
  b.kind[r][c] = PLAIN;
  b.art[r][c] = null;
}

/** Move a whole piece — color, ability and drawing — from one cell to another. */
function carry(b, [fr, fc], [tr, tc]) {
  b.glyph[tr][tc] = b.glyph[fr][fc];
  b.kind[tr][tc] = b.kind[fr][fc];
  b.art[tr][tc] = b.art[fr][fc];
}

/**
 * Shove the glyph at (r,c) one step along (dr,dc), chaining into whatever it meets.
 * The line runs until it hits a sink; there the front glyph is eaten and the rest
 * advance. Only a live empty cell lets the whole line move intact.
 */
export function shove(b, r, c, dr, dc, log) {
  if (!occupied(b, r, c) || b.kind[r][c] === ANCHOR) return; // an eater will not be shoved
  const run = [];
  let rr = r;
  let cc = c;
  while (occupied(b, rr, cc) && b.kind[rr][cc] !== ANCHOR) {
    run.push([rr, cc]);
    rr += dr;
    cc += dc;
  }
  // The walk stopped for one of four reasons; three of them are sinks. The fourth
  // — a live empty cell — is the only ending that costs the line nothing.
  const sink = !onBoard(b, rr, cc)
    ? 'edge'
    : !b.alive[rr][cc]
      ? 'hole'
      : b.glyph[rr][cc] !== null
        ? 'eater'
        : null;
  const [lr, lc] = run[run.length - 1];
  if (sink) {
    clear(b, lr, lc);
    // `into` is the cell that swallowed it — the hole, the eater, or off the board.
    // The piece is consumed there, not where it was standing, which is the difference
    // between falling in and blinking out.
    log?.events.push({ type: 'eat', at: [lr, lc], into: [rr, cc], reason: sink });
  } else {
    carry(b, [lr, lc], [rr, cc]);
    log?.events.push({ type: 'move', from: [lr, lc], to: [rr, cc] });
  }
  run.pop();
  for (let i = run.length - 1; i >= 0; i--) {
    const [sr, sc] = run[i];
    carry(b, [sr, sc], [sr + dr, sc + dc]);
    log?.events.push({ type: 'move', from: [sr, sc], to: [sr + dr, sc + dc] });
  }
  clear(b, r, c);
}

/** The outermost cell of the unbroken run of glyphs leaving (r,c) along (dr,dc). */
export function armEnd(b, r, c, dr, dc) {
  let last = null;
  let rr = r + dr;
  let cc = c + dc;
  while (occupied(b, rr, cc) && b.kind[rr][cc] !== ANCHOR) {
    last = [rr, cc];
    rr += dr;
    cc += dc;
  }
  return last;
}

/** Exchange two cells' pieces. A pair acts only when both its cells are live. */
function exchange(b, [r1, c1], [r2, c2], log) {
  if (!onBoard(b, r1, c1) || !onBoard(b, r2, c2)) return;
  if (!b.alive[r1][c1] || !b.alive[r2][c2]) return;
  for (const layer of ['glyph', 'kind', 'art']) {
    const held = b[layer][r1][c1];
    b[layer][r1][c1] = b[layer][r2][c2];
    b[layer][r2][c2] = held;
  }
  log?.events.push({ type: 'exchange', a: [r1, c1], z: [r2, c2] });
}

/**
 * Step the four neighbours one place around the centre. Reading the ring into a
 * buffer first is what makes it a rotation rather than a chain of overwrites; a
 * dead or off-board cell holds its position, so the live ones turn past it.
 */
function turn(b, r, c, clockwise, log) {
  const ring = clockwise ? RING : [...RING].reverse();
  const cells = ring.map(([dr, dc]) => [r + dr, c + dc]);
  const held = cells.map(([rr, cc]) =>
    onBoard(b, rr, cc) && b.alive[rr][cc]
      ? { glyph: b.glyph[rr][cc], kind: b.kind[rr][cc], art: b.art[rr][cc] }
      : null);
  cells.forEach(([rr, cc], i) => {
    const source = (i - 1 + cells.length) % cells.length;
    const from = held[source];
    if (!from || !onBoard(b, rr, cc) || !b.alive[rr][cc]) return;
    b.glyph[rr][cc] = from.glyph;
    b.kind[rr][cc] = from.kind;
    b.art[rr][cc] = from.art;
    log?.events.push({ type: 'turn', from: cells[source], to: [rr, cc] });
  });
}

/**
 * Run the ability of the glyph at (r,c).
 *
 * A pull is a shove aimed the other way: to draw an arm inward the far end is the
 * one shoved, so the whole arm advances and the glyph nearest the centre runs into
 * the sink the sink glyph leaves behind.
 */
export function fire(b, r, c, rand, log) {
  const kind = b.kind[r][c];
  log?.events.push({ type: 'fire', at: [r, c], kind, art: b.art[r][c] });

  if (kind === PULSE) {
    for (const [dr, dc] of ORTHO) shove(b, r + dr, c + dc, dr, dc, log);
    return;
  }
  if (PUSH_DIR[kind]) {
    const [dr, dc] = PUSH_DIR[kind];
    shove(b, r + dr, c + dc, dr, dc, log);
    return;
  }
  if (kind === SWAP_ORTH) {
    exchange(b, [r - 1, c], [r + 1, c], log);
    exchange(b, [r, c - 1], [r, c + 1], log);
    return;
  }
  if (kind === SWAP_DIAG) {
    exchange(b, [r - 1, c - 1], [r + 1, c + 1], log);
    exchange(b, [r - 1, c + 1], [r + 1, c - 1], log);
    return;
  }
  if (kind === ROTATE || kind === ROTATE_REV) {
    turn(b, r, c, kind === ROTATE, log);
    return;
  }
  if (kind === SINK) {
    b.alive[r][c] = false; // the hole the arms fall into
    clear(b, r, c);
    log?.events.push({ type: 'kill', at: [r, c], reason: 'sink' });
    for (const [dr, dc] of ORTHO) {
      const end = armEnd(b, r, c, dr, dc);
      if (end) shove(b, end[0], end[1], -dr, -dc, log);
    }
  }
  // PLAIN and ANCHOR move nothing: an anchor's whole ability is being a sink,
  // which shove() handles where the line meets it.
}

/**
 * Activate, fire abilities, remove cells, repeat until nothing matches.
 *
 * `recorder`, when given, collects one entry per resolution step: the board as it
 * stood when the step began and the ordered events that took it apart. Playing a
 * settle back is the only reason to ask for it; the hot paths pass nothing.
 * @returns {{activated: number, steps: number}}
 */
export function settle(b, rand, recorder) {
  let activated = 0;
  let steps = 0;
  for (;;) {
    const hits = matches(b);
    if (!hits.length) return { activated, steps };
    steps += 1;
    activated += hits.length;
    const log = recorder ? { snapshot: copyBoard(b), activated: hits, events: [] } : null;
    if (log) recorder.steps.push(log);
    for (const [r, c] of hits) fire(b, r, c, rand, log);
    for (const [r, c] of hits) {
      b.alive[r][c] = false;
      clear(b, r, c);
      log?.events.push({ type: 'kill', at: [r, c], reason: 'activated' });
    }
  }
}

/** Collects what a settle did, for playing back. */
export function createRecorder() {
  return { steps: [] };
}

/**
 * Every legal swap. `adjacentOnly` is a rule, so it is read from the rules rather
 * than defaulted here — a caller that has not decided it has not decided the game.
 */
export function swapPairs({ width, height, adjacentOnly }) {
  if (typeof adjacentOnly !== 'boolean') {
    throw new Error('swapPairs() needs rules.adjacentOnly'); // boundary
  }
  const cells = [];
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) cells.push([r, c]);
  const out = [];
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, z] = [cells[i], cells[j]];
      if (adjacentOnly && Math.abs(a[0] - z[0]) + Math.abs(a[1] - z[1]) !== 1) continue;
      out.push([a, z]);
    }
  }
  return out;
}

/**
 * Immediate activations from swapping a and z — what the player can see.
 *
 * Either cell may be empty. Once the board has drained there are live empty cells
 * on it, and moving a piece onto one is a legal move that can land it on its own
 * colour; scoring that as nothing would hide a whole class of play from the greedy
 * solver and from the trap generator.
 */
export function gain(b, a, z) {
  const [[r1, c1], [r2, c2]] = [a, z];
  if (!b.alive[r1][c1] || !b.alive[r2][c2]) return 0; // a dead cell holds nothing
  return (
    (occupied(b, r1, c1) && b.glyph[r1][c1] === b.bg[r2][c2]) +
    (occupied(b, r2, c2) && b.glyph[r2][c2] === b.bg[r1][c1])
  );
}

/**
 * Exchange the glyphs of a and z, then settle. Mutates b — this is the single
 * place a swap becomes a board change.
 */
export function applySwap(b, a, z, rand, recorder) {
  for (const layer of ['glyph', 'kind', 'art']) {
    const held = b[layer][a[0]][a[1]];
    b[layer][a[0]][a[1]] = b[layer][z[0]][z[1]];
    b[layer][z[0]][z[1]] = held;
  }
  return settle(b, rand, recorder);
}

/** Apply a swap to a copy. Returns what the player sees and what it actually costs. */
export function resolve(b, a, z, rand) {
  const immediate = gain(b, a, z);
  if (!immediate) return { immediate: 0, activated: 0, steps: 0 };
  return { immediate, ...applySwap(copyBoard(b), a, z, rand) };
}
