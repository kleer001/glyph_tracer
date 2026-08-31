// Progress — what the player has finished, and how well. No DOM: the store is handed
// in at the boundary, so this is testable with a plain object.

export const STORE_KEY = 'glyph-tracer:progress:1';

/**
 * Stars come from swaps left over, not from cells cleared.
 *
 * A level ends the moment its target is met, so what separates a good run from a bare
 * pass is how much of the budget was still unspent — and unlike "cleared more", that
 * cannot be padded by a lucky cascade after the goal was already reached.
 *
 * The thresholds are three lines below; restating them here would be a second copy
 * of a rule that changes.
 */
export function stars(swapsLeft) {
  if (swapsLeft == null) return 0;
  if (swapsLeft >= 2) return 3;
  if (swapsLeft >= 1) return 2;
  return 1;
}

/**
 * Progress over a `Storage`-shaped object — anything with getItem/setItem. Records the
 * BEST run per level, never the latest: finishing a level badly after finishing it
 * well should not take the stars away.
 */
export function createProgress(store) {
  // Storage is outside the program: a player can edit it and an older build can have
  // left something else there. Validated at this boundary, trusted after it.
  const read = () => {
    let raw = null;
    try {
      raw = store.getItem(STORE_KEY);
    } catch {
      return {};
    }
    if (!raw) return {};
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean = {};
    for (const [id, left] of Object.entries(parsed)) {
      if (Number.isInteger(left) && left >= 0) clean[id] = left;
    }
    return clean;
  };

  let best = read();
  const write = () => {
    try {
      store.setItem(STORE_KEY, JSON.stringify(best));
    } catch {
      /* full or blocked: the run is still playable, it just will not be remembered */
    }
  };

  const api = {
    /** Most swaps ever left over on this level, or null if it was never finished. */
    best: (id) => best[id] ?? null,
    done: (id) => best[id] !== undefined,
    stars: (id) => stars(best[id] ?? null),

    /** Record a finish. Keeps the better of what is stored and what just happened. */
    record(id, swapsLeft) {
      if (!Number.isInteger(swapsLeft) || swapsLeft < 0) return api;
      if (best[id] === undefined || swapsLeft > best[id]) {
        best[id] = swapsLeft;
        write();
      }
      return api;
    },

    /** How a group of levels stands, for an act's summary line. */
    tally(levels) {
      const done = levels.filter((level) => api.done(level.id)).length;
      const earned = levels.reduce((sum, level) => sum + api.stars(level.id), 0);
      return {
        done,
        total: levels.length,
        earned,
        possible: levels.length * 3,
        complete: done === levels.length,
      };
    },

    /** The first unfinished level, or the last one when the run is done. */
    resumeAt(levels) {
      return levels.find((level) => !api.done(level.id)) ?? levels[levels.length - 1];
    },

    clear() {
      best = {};
      write();
      return api;
    },
  };
  return api;
}
