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

export const PLAIN = '';
export const PUSH = 'push';
export const BLOCK = 'block';
export const WILD = 'wild';
export const VOID = 'void';

/** Every subset of the four orthogonal directions — wild picks one at random. */
export const WILD_SETS = Object.freeze(
  Array.from({ length: 16 }, (_, bits) =>
    Object.freeze(ORTHO.filter((_dir, i) => (bits >> (3 - i)) & 1)),
  ),
);

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
  if (!occupied(b, r, c) || b.kind[r][c] === BLOCK) return; // an eater will not be shoved
  const run = [];
  let rr = r;
  let cc = c;
  while (occupied(b, rr, cc) && b.kind[rr][cc] !== BLOCK) {
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
  while (occupied(b, rr, cc) && b.kind[rr][cc] !== BLOCK) {
    last = [rr, cc];
    rr += dr;
    cc += dc;
  }
  return last;
}

/**
 * Run the ability of the glyph at (r,c).
 *
 * A pull is a shove aimed the other way: to draw an arm inward the far end is the
 * one shoved, so the whole arm advances and the glyph nearest the centre runs into
 * the sink the void leaves behind.
 */
export function fire(b, r, c, rand, log) {
  const kind = b.kind[r][c];
  log?.events.push({ type: 'fire', at: [r, c], kind, art: b.art[r][c] });
  if (kind === PUSH) {
    for (const [dr, dc] of ORTHO) shove(b, r + dr, c + dc, dr, dc, log);
  } else if (kind === WILD) {
    const set = WILD_SETS[Math.floor(rand() * WILD_SETS.length)];
    for (const [dr, dc] of set) shove(b, r + dr, c + dc, dr, dc, log);
  } else if (kind === VOID) {
    b.alive[r][c] = false; // the hole the arms fall into
    clear(b, r, c);
    log?.events.push({ type: 'kill', at: [r, c], reason: 'void' });
    for (const [dr, dc] of ORTHO) {
      const end = armEnd(b, r, c, dr, dc);
      if (end) shove(b, end[0], end[1], -dr, -dc, log);
    }
  }
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
