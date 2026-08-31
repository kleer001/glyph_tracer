// Animate — turning a resolved settle back into something you can watch.
//
// The engine resolves a swap to its final board in one go; a recorder collects the
// ordered events that got it there (see settle() in board.js). This module folds
// those events into phases and samples a phase at a moment in time. It is pure:
// positions come out in cell space, and render.js turns them into pixels.
//
// Within one step a glyph can be shoved more than once, so the events are folded
// down to net movement per glyph before anything is drawn — otherwise a piece that
// travelled two cells would be tweened twice from the same start.

const key = ([r, c]) => `${r},${c}`;

/**
 * How long a swap takes: the distance the pieces travel, at a fixed speed.
 *
 * Any two live cells may be swapped, so a swap crosses anywhere from one cell to
 * eight. A single duration for all of them is a single duration for an eightfold
 * range of distances — the same animation that ambles across a neighbour swap hurls
 * a piece corner to corner. Speed is the thing that should be constant.
 *
 * Distance is straight-line because the tween is a straight line. `swapMinMs` is a
 * floor: at any readable speed a one-cell swap is over in a few frames, and the
 * player needs to see which two cells they just picked.
 *
 * @param {[number, number]} a
 * @param {[number, number]} z
 * @returns {number} milliseconds
 */
export function swapDurationFor(a, z, { swapMsPerCell, swapMinMs }) {
  if (typeof swapMsPerCell !== 'number' || typeof swapMinMs !== 'number') {
    throw new Error('a swap needs swapMsPerCell and swapMinMs'); // boundary
  }
  return Math.max(swapMinMs, Math.hypot(a[0] - z[0], a[1] - z[1]) * swapMsPerCell);
}

/**
 * Fold one recorded step into what happened to each piece and each cell.
 * @returns {{deadCells: Array<[number, number]>, fates: Array<object>}}
 *   A fate is {origin, end, kind}; kind is held, moved, eaten or destroyed.
 */
export function collapseStep({ snapshot, events }) {
  const occupant = new Map(); // where a piece is now -> where it started the step
  for (let r = 0; r < snapshot.height; r++) {
    for (let c = 0; c < snapshot.width; c++) {
      if (snapshot.alive[r][c] && snapshot.glyph[r][c] !== null) {
        occupant.set(key([r, c]), [r, c]);
      }
    }
  }
  const fates = [];
  const deadCells = [];
  const seenDead = new Set();
  const turns = [];
  for (const event of events) {
    if (event.type === 'fire') continue; // recorded for the log; nothing moves yet
    if (event.type === 'move') {
      const origin = occupant.get(key(event.from));
      occupant.delete(key(event.from));
      if (origin) occupant.set(key(event.to), origin);
      continue;
    }
    if (event.type === 'exchange') {
      // Two pieces trade cells, so neither leaves the board and nothing dies. Read
      // both out before writing either back, or the first write loses the second.
      const [a, z] = [key(event.a), key(event.z)];
      const held = [occupant.get(a), occupant.get(z)];
      occupant.delete(a);
      occupant.delete(z);
      if (held[1]) occupant.set(a, held[1]);
      if (held[0]) occupant.set(z, held[0]);
      continue;
    }
    if (event.type === 'turn') {
      // A rotation moves every piece in the ring at once. Replaying the events one at
      // a time would drag a single piece the whole way round, so they are collected
      // and applied together below.
      turns.push(event);
      continue;
    }
    const at = key(event.at);
    const origin = occupant.get(at);
    occupant.delete(at);
    if (event.type === 'eat') {
      // It travels into whatever ate it while it goes, so a void reads as pulling its
      // neighbours in and an edge reads as shoving one off.
      if (!event.into) throw new Error(`an eat at ${at} recorded no sink`); // boundary
      if (origin) fates.push({ origin, end: event.into, kind: 'eaten' });
      continue;
    }
    // Everything above is handled by name, so anything left has to be a kill. Saying
    // so out loud matters: a new event type falling through here would be drawn as a
    // piece being destroyed and its cell dying, which is a wrong animation with no
    // error behind it. debugLog.js refuses the same stream on the same grounds.
    if (event.type !== 'kill') {
      throw new Error(`collapseStep cannot draw a "${event.type}" event`); // boundary
    }
    // A void kills its own cell and the settle kills it again on the way out, so
    // the same cell can be reported twice; it only dies once on screen.
    if (!seenDead.has(at)) {
      seenDead.add(at);
      deadCells.push(event.at);
    }
    if (origin) fates.push({ origin, end: event.at, kind: 'destroyed' });
  }
  if (turns.length) {
    const lifted = turns.map((t) => occupant.get(key(t.from)));
    for (const t of turns) occupant.delete(key(t.from));
    turns.forEach((t, i) => {
      if (lifted[i]) occupant.set(key(t.to), lifted[i]);
    });
  }
  for (const [where, origin] of occupant) {
    const end = where.split(',').map(Number);
    const moved = origin[0] !== end[0] || origin[1] !== end[1];
    fates.push({ origin, end, kind: moved ? 'moved' : 'held' });
  }
  return { deadCells, fates };
}

/**
 * How long a piece waits before it starts moving. A shove is a wave travelling away
 * from whatever fired, so pieces further from the cells that activated start later —
 * without that, a run of five slides as one rigid block and reads as nothing.
 */
function delayFor(cell, activated, staggerMs) {
  if (!staggerMs || !activated.length) return 0;
  const reach = Math.min(...activated.map(([r, c]) => Math.abs(r - cell[0]) + Math.abs(c - cell[1])));
  return Math.max(0, reach - 1) * staggerMs;
}

/** Every piece standing on a board, as a sprite that does not move. */
function restingSprites(board, timing) {
  const sprites = [];
  for (let r = 0; r < board.height; r++) {
    for (let c = 0; c < board.width; c++) {
      if (!board.alive[r][c] || board.glyph[r][c] === null) continue;
      sprites.push({
        art: board.art[r][c],
        ink: board.glyph[r][c],
        from: [r, c],
        to: [r, c],
        scaleFrom: 1,
        scaleTo: 1,
        spin: false,
        fades: false,
        delay: 0,
        ...timing,
      });
    }
  }
  return sprites;
}

function tilesOf(board, dead = [], activated = [], staggerMs = 0, shrinkMs = 1) {
  const dying = new Set(dead.map(key));
  const tiles = [];
  for (let r = 0; r < board.height; r++) {
    for (let c = 0; c < board.width; c++) {
      if (!board.alive[r][c]) continue;
      tiles.push({
        r,
        c,
        bg: board.bg[r][c],
        dying: dying.has(key([r, c])),
        delay: delayFor([r, c], activated, staggerMs),
        shrinkMs,
      });
    }
  }
  return tiles;
}

/** What a board looks like when nothing is happening. */
export function staticFrame(board) {
  const at_rest = { moveMs: 1, shrinkMs: 1, glyphFadeMs: 1 };
  const phase = {
    tweenMs: 1,
    holdMs: 0,
    tiles: tilesOf(board),
    sprites: restingSprites(board, at_rest),
  };
  return sampleFrame(phase, phase.tweenMs, null);
}

/**
 * Build the phases for one swap and everything it set off.
 * @param {object} args
 * @param {object} args.before - the board as it stood before the swap.
 * @param {Array} args.swap - the two cells the player exchanged.
 * @param {{steps: Array}} args.recorder - what settle() collected.
 * @param {object} args.timing - swapMs, stepMs, holdMs, staggerMs, splitBeats.
 *   `holdMs` is a still beat after each phase; `staggerMs` delays each piece by how
 *   far it sits from what fired; `splitBeats` plays a step's movement and its
 *   destruction as two beats instead of one, which is the order the rules resolve in.
 * @returns {{phases: Array, totalMs: number}}
 */
export function buildTimeline({ before, swap, recorder, timing }) {
  const { stepMs, holdMs = 0, staggerMs = 0, splitBeats = false, shrinkMs = stepMs,
    glyphFadeMs = shrinkMs } = timing;
  const [a, z] = swap;
  const swapMs = swapDurationFor(a, z, timing);
  let cleared = 0;
  const phases = [
    phaseOf({
      cleared,
      holdMs,
      // The swap is the player's own beat, so it lasts as long as it is given
      // whether or not the two pieces differ.
      floorMs: swapMs,
      tiles: tilesOf(before),
      sprites: restingSprites(before, { moveMs: swapMs, shrinkMs, glyphFadeMs }).map((sprite) => {
        if (key(sprite.from) === key(a)) return { ...sprite, to: z };
        if (key(sprite.from) === key(z)) return { ...sprite, to: a };
        return sprite;
      }),
    }),
  ];

  for (const step of recorder.steps) {
    const { deadCells, fates } = collapseStep(step);
    const { snapshot, activated } = step;
    const sprite = ({ origin, end, kind }) => ({
      art: snapshot.art[origin[0]][origin[1]],
      ink: snapshot.glyph[origin[0]][origin[1]],
      from: origin,
      to: end,
      scaleFrom: 1,
      scaleTo: kind === 'eaten' || kind === 'destroyed' ? 0 : 1,
      spin: kind === 'destroyed',
      // The piece leaves before the cell does. The ground keeps turning and shrinking
      // on its own clock; the glyph is only there long enough to say which one went.
      fades: kind === 'eaten' || kind === 'destroyed',
      delay: delayFor(origin, activated, staggerMs),
      moveMs: stepMs,
      shrinkMs,
      glyphFadeMs,
    });

    if (!splitBeats) {
      cleared += activated.length;
      phases.push(phaseOf({
        cleared,
        holdMs,
        tiles: tilesOf(snapshot, deadCells, activated, staggerMs, shrinkMs),
        sprites: fates.map(sprite),
      }));
      continue;
    }

    // Beat one: everything travels, nothing dies yet. Beat two: what the step
    // destroyed goes, from where it ended up. Two beats say the shove caused the
    // clearing; one beat only says they happened together.
    phases.push(phaseOf({
      cleared, // nothing has died yet on this beat
      holdMs,
      tiles: tilesOf(snapshot, [], activated, staggerMs, shrinkMs),
      // The cell holds its ground for this beat, but a doomed piece is already going:
      // it leaves while the ability it fired is still travelling, so the two read as
      // one event. A fade longer than this beat is cut off by the next one, which is
      // why it is meant to be the quickest clock in the file.
      sprites: fates.map(sprite).map((s) => ({ ...s, scaleTo: 1, spin: false })),
    }));
    cleared += activated.length;
    phases.push(phaseOf({
      cleared,
      holdMs,
      tiles: tilesOf(snapshot, deadCells, activated, staggerMs, shrinkMs),
      // By now the piece has gone and only the ground is still collapsing, so the fade
      // is spent rather than run again from full.
      sprites: fates.map(sprite).map((s) => ({
        ...s, from: s.to, delay: 0, moveMs: 1, glyphFadeMs: s.fades ? 1 : s.glyphFadeMs,
      })),
    }));
  }
  return { phases, totalMs: phases.reduce((sum, p) => sum + p.tweenMs + p.holdMs, 0) };
}

/**
 * A phase runs until its slowest piece has finished, then holds still.
 *
 * Every piece keeps its own duration: a delayed one starts later and takes just as
 * long, which is what makes a stagger read as a wave. Deriving each piece's duration
 * from the phase instead would make the ones at the front of the run travel slower
 * than the ones behind them.
 */
function phaseOf(phase) {
  // A piece only spends the clocks it actually uses. Counting a resting sprite's
  // shrink time would pad every phase out to the slowest thing nothing is doing.
  const spriteEnd = (s) => {
    const travels = s.from[0] !== s.to[0] || s.from[1] !== s.to[1];
    const shrinks = s.scaleTo !== s.scaleFrom;
    return s.delay + Math.max(
      travels ? s.moveMs : 0,
      shrinks ? s.shrinkMs : 0,
      s.fades ? s.glyphFadeMs : 0,
    );
  };
  const ends = [
    ...phase.sprites.map(spriteEnd),
    ...phase.tiles.map((t) => (t.dying ? t.delay + t.shrinkMs : 0)),
  ];
  return { ...phase, tweenMs: Math.max(phase.floorMs ?? 1, ...ends) };
}

const lerp = (from, to, t) => from + (to - from) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Sample one phase at `elapsed` ms into it, in cell space. */
function sampleFrame(phase, elapsed, spin) {
  const at = (delay, duration) => clamp01((elapsed - delay) / Math.max(1, duration));
  // A cell being destroyed turns as it collapses. The angle is in radians; the
  // renderer turns tile and piece together about the cell's own centre.
  //
  // The turn has to wait for the shrink to make room for it. A square of side s
  // at angle a is s(|cos a| + |sin a|) wide, so at full size any angle at all
  // throws its corners over the cells beside it. The most a cell at scale u may
  // turn is asin(1 / (u * sqrt 2)) - PI/4: nothing at u = 1, opening to 45 degrees
  // at u = 1/sqrt 2, past which a shrunk square fits inside the cell it is leaving
  // whichever way it faces. That envelope's own speed runs away to infinity at the
  // release point, so the spin takes a power curve under it instead. The exponent
  // is what holds the corners in at any number of turns, and comes out a plain
  // square law for the one turn the game plays.
  const ease = 2 + Math.log2(spin?.turns || 1) / 2;
  const spinAt = (t) => (spin ? spin.turns * t ** ease * 2 * Math.PI : 0);
  return {
    // how much of this swap's clearing has actually happened on screen
    cleared: phase.cleared ?? 0,
    tiles: phase.tiles.map((tile) => {
      const t = at(tile.delay, tile.shrinkMs);
      return {
        bg: tile.bg,
        x: tile.c,
        y: tile.r,
        spin: tile.dying ? spinAt(t) : 0,
        scale: tile.dying ? 1 - t : 1,
      };
    }),
    sprites: phase.sprites.map((sprite) => {
      // Travel and shrink are separate clocks: a piece can slide at one speed and
      // vanish at another, which is the difference between a shove and a pop.
      const moved = at(sprite.delay, sprite.moveMs);
      const shrunk = at(sprite.delay, sprite.shrinkMs);
      const faded = sprite.fades ? at(sprite.delay, sprite.glyphFadeMs) : 0;
      return {
        art: sprite.art,
        ink: sprite.ink,
        x: lerp(sprite.from[1], sprite.to[1], moved),
        y: lerp(sprite.from[0], sprite.to[0], moved),
        spin: sprite.spin ? spinAt(shrunk) : 0,
        scale: lerp(sprite.scaleFrom, sprite.scaleTo, shrunk),
        alpha: 1 - faded,
        // Where the piece is going, not just where it is. An effect layer that wants to
        // point at a moving piece — a beam that holds one while it travels — needs the
        // journey, and deriving it from a position alone is guesswork.
        from: sprite.from,
        to: sprite.to,
      };
    }),
  };
}

/**
 * The frame at `elapsed` milliseconds into a timeline. Linear throughout.
 * @returns {?object} null once the timeline has run out, so the caller knows to
 *   go back to drawing the board itself.
 */
export function sampleTimeline(timeline, elapsed, spin) {
  let remaining = elapsed;
  for (const phase of timeline.phases) {
    const span = phase.tweenMs + phase.holdMs;
    if (remaining < span) return sampleFrame(phase, Math.min(remaining, phase.tweenMs), spin);
    remaining -= span;
  }
  return null;
}
