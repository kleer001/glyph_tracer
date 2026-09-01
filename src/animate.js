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
 * The curves a tween may run on, named by a data file.
 *
 * What is eased is the parameter, never the value it produces. A dying cell's turn
 * is held under what its shrink has made room for, and that bound is a relation
 * between the scale and the angle — bend those two apart and the corners leave the
 * cell. One curve, read once, drives both.
 */
const EASINGS = Object.freeze({
  linear: (t) => t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2),
});

/** Linear is the no-op curve, so an unnamed tween is the tween this game always had. */
function curveNamed(name) {
  const fn = EASINGS[name ?? 'linear'];
  if (!fn) throw new Error(`no easing named "${name}"`); // boundary
  return fn;
}

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
 * @param {object} args.timing - swapMs, stepMs, holdMs, staggerMs, splitBeats,
 *   easing, hitStopMs.
 *   `holdMs` is a still beat after each phase; `staggerMs` delays each piece by how
 *   far it sits from what fired; `splitBeats` plays a step's movement and its
 *   destruction as two beats instead of one, which is the order the rules resolve in.
 *   `hitStopMs` lengthens the beat that ends where an ability fires; `escalate`
 *   scales that pause, the turn and the collapse with how deep into the chain a
 *   link sits.
 * @returns {{phases: Array, totalMs: number}}
 */
export function buildTimeline({ before, swap, recorder, timing }) {
  const { stepMs, holdMs = 0, staggerMs = 0, splitBeats = false, shrinkMs = stepMs,
    glyphFadeMs = shrinkMs, easing = null, hitStopMs = 0, escalate = null,
    swapArc = 0, smear = null } = timing;
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
      fires: [],
      eats: [],
      board: before,
      tiles: tilesOf(before),
      sprites: restingSprites(before, { moveMs: swapMs, shrinkMs, glyphFadeMs }).map((sprite) => {
        if (key(sprite.from) === key(a)) return { ...sprite, to: z, swapped: true };
        if (key(sprite.from) === key(z)) return { ...sprite, to: a, swapped: true };
        return sprite;
      }),
    }),
  ];

  // How much louder the chain's Nth link plays than its first. A cascade of a dozen
  // activations otherwise plays each one identically, and the mechanic's own drama is
  // that it builds. Capped, because past a point more intensity stops reading as more
  // and starts reading as noise; at link zero the factor is one, so a chain of one is
  // the chain this game always had.
  const loudness = (link) =>
    (escalate ? 1 + escalate.per * Math.min(link, escalate.cap) : 1);

  for (let link = 0; link < recorder.steps.length; link++) {
    const step = recorder.steps[link];
    const loud = loudness(link);
    // The three things a link scales: the pause around it lengthens, the turn quickens,
    // and the collapse sharpens.
    const linkHoldMs = holdMs * loud;
    const linkShrinkMs = shrinkMs / loud;
    const { deadCells, fates } = collapseStep(step);
    const { snapshot, activated } = step;
    // What an effect layer needs to draw this beat: which glyphs fired, and what any
    // eater swallowed. Both are already in the recording; reading them off the phase
    // saves every layer from walking the whole settle to find its own beat.
    const fires = step.events.filter((e) => e.type === 'fire');
    const eats = step.events.filter((e) => e.type === 'eat' && e.reason === 'eater');
    // Hit stop. The freeze belongs at the instant the piece arrives on its own colour,
    // and that instant is the end of the beat before the one that fires: the swap for
    // the first link, the previous step's clearing for every link after it. A hold is
    // already a still beat, so this is that beat lengthened rather than a new one.
    if (fires.length) phases.at(-1).holdMs += hitStopMs * loud;
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
      shrinkMs: linkShrinkMs,
      glyphFadeMs,
    });

    if (!splitBeats) {
      cleared += activated.length;
      phases.push(phaseOf({
        cleared,
        holdMs: linkHoldMs,
        escalate: loud,
        fires,
        eats,
        board: snapshot,
        tiles: tilesOf(snapshot, deadCells, activated, staggerMs, linkShrinkMs),
        sprites: fates.map(sprite),
      }));
      continue;
    }

    // Beat one: everything travels, nothing dies yet. Beat two: what the step
    // destroyed goes, from where it ended up. Two beats say the shove caused the
    // clearing; one beat only says they happened together.
    phases.push(phaseOf({
      cleared, // nothing has died yet on this beat
      fires,
      eats,
      board: snapshot,
      holdMs: linkHoldMs,
      escalate: loud,
      tiles: tilesOf(snapshot, [], activated, staggerMs, linkShrinkMs),
      // The cell holds its ground for this beat, but a doomed piece is already going:
      // it leaves while the ability it fired is still travelling, so the two read as
      // one event. A fade longer than this beat is cut off by the next one, which is
      // why it is meant to be the quickest clock in the file.
      sprites: fates.map(sprite).map((s) => ({ ...s, scaleTo: 1, spin: false })),
    }));
    cleared += activated.length;
    phases.push(phaseOf({
      cleared,
      holdMs: linkHoldMs,
      escalate: loud,
      // The ability fired on the beat before; carrying the fires again here would
      // start its beam over just as the pieces it moved are being cleared.
      fires: [],
      eats: [],
      board: snapshot,
      tiles: tilesOf(snapshot, deadCells, activated, staggerMs, linkShrinkMs),
      // By now the piece has gone and only the ground is still collapsing, so the fade
      // is spent rather than run again from full.
      sprites: fates.map(sprite).map((s) => ({
        ...s, from: s.to, delay: 0, moveMs: 1, glyphFadeMs: s.fades ? 1 : s.glyphFadeMs,
      })),
    }));
  }
  // Every phase of one timeline runs on the same curves, so they are set once here
  // rather than threaded through four calls to phaseOf.
  const eased = phases.map((phase) => ({ ...phase, easing, swapArc, smear }));
  return { phases: eased, totalMs: eased.reduce((sum, p) => sum + p.tweenMs + p.holdMs, 0) };
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
const NO_BOW = Object.freeze({ x: 0, y: 0 });
const EMPTY = Object.freeze([]);

/**
 * The copies a piece leaves behind it while it crosses the board.
 *
 * A swap can cross eight cells in under a second, which reads as a jump. Copies strung
 * back along the path it actually took give the eye something to follow. Only above a
 * distance worth following: a one-cell swap has nothing to smear.
 */
function trailOf(sprite, phase, moved) {
  const smear = phase.smear;
  if (!smear?.copies) return EMPTY;
  const [dy, dx] = [sprite.to[0] - sprite.from[0], sprite.to[1] - sprite.from[1]];
  if (Math.hypot(dy, dx) < smear.minCells) return EMPTY;
  const out = [];
  for (let k = 1; k <= smear.copies; k++) {
    const t = moved - k * smear.spacing;
    if (t <= 0) break;
    const bow = bowOf(sprite, phase.swapArc, t);
    out.push({
      x: lerp(sprite.from[1], sprite.to[1], t) + bow.x,
      y: lerp(sprite.from[0], sprite.to[0], t) + bow.y,
      alpha: 1 - k / (smear.copies + 1),
    });
  }
  return out;
}

/**
 * How far a swapping piece stands off its own straight line, in cells.
 *
 * The offset is the travel turned a quarter turn — right becomes up, down becomes right
 * — and rises and falls over the crossing, so both ends of the arc are exactly on the
 * cells the rules moved between.
 */
function bowOf(sprite, arc, t) {
  if (!arc) return NO_BOW;
  const [dy, dx] = [sprite.to[0] - sprite.from[0], sprite.to[1] - sprite.from[1]];
  const span = Math.hypot(dy, dx);
  if (!span) return NO_BOW;
  const height = arc * Math.sin(Math.PI * t);
  return { x: (dy / span) * height, y: (-dx / span) * height };
}
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Sample one phase at `elapsed` ms into it, in cell space. */
function sampleFrame(phase, elapsed, spin, since = elapsed) {
  const at = (delay, duration) => clamp01((elapsed - delay) / Math.max(1, duration));
  // Arriving and leaving are different motions: a piece decelerates into its cell,
  // and a cell being destroyed gathers pace before easing out of existence.
  const easeMove = curveNamed(phase.easing?.move);
  const easeShrink = curveNamed(phase.easing?.shrink);
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
  //
  // The turns are the phase's own, not the timeline's: a link deeper into a chain
  // turns further in the same room, so the exponent is taken from what is actually
  // being spun rather than from what the data file asked for.
  const turns = (spin?.turns ?? 1) * (phase.escalate ?? 1);
  const ease = 2 + Math.log2(turns) / 2;
  const spinAt = (t) => (spin ? turns * t ** ease * 2 * Math.PI : 0);
  return {
    // how much of this swap's clearing has actually happened on screen
    cleared: phase.cleared ?? 0,
    // how deep into the chain this beat sits, for anything that builds with it
    escalate: phase.escalate ?? 1,
    // What fired on this beat and how long ago, for a layer drawing what an ability
    // means. `since` is not clamped to the movement: an effect may outlast it and
    // play on through the hold.
    fires: phase.fires ?? [],
    eats: phase.eats ?? [],
    board: phase.board ?? null,
    since,
    tiles: phase.tiles.map((tile) => {
      const t = easeShrink(at(tile.delay, tile.shrinkMs));
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
      const moved = easeMove(at(sprite.delay, sprite.moveMs));
      // A swap bows. Two pieces trading along one row otherwise travel the same line in
      // opposite directions and pass through each other; each bowing to the side its own
      // heading turns to puts one clear of the other, and because their headings are
      // opposite so are their bows. One rule covers the diagonals without a fifth case.
      const bow = sprite.swapped ? bowOf(sprite, phase.swapArc, moved) : NO_BOW;
      const shrunk = easeShrink(at(sprite.delay, sprite.shrinkMs));
      // The fade stays linear: it is an opacity, and a curve on it reads as nothing.
      const faded = sprite.fades ? at(sprite.delay, sprite.glyphFadeMs) : 0;
      return {
        art: sprite.art,
        ink: sprite.ink,
        x: lerp(sprite.from[1], sprite.to[1], moved) + bow.x,
        y: lerp(sprite.from[0], sprite.to[0], moved) + bow.y,
        spin: sprite.spin ? spinAt(shrunk) : 0,
        scale: lerp(sprite.scaleFrom, sprite.scaleTo, shrunk),
        alpha: 1 - faded,
        // Where this piece has just been, faintest first. Built here rather than in the
        // layer that paints it because a copy has to sit on the same arc as the piece,
        // and the arc is this module's to know.
        trail: sprite.swapped ? trailOf(sprite, phase, moved) : EMPTY,
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
    if (remaining < span) {
      return sampleFrame(phase, Math.min(remaining, phase.tweenMs), spin, remaining);
    }
    remaining -= span;
  }
  return null;
}
