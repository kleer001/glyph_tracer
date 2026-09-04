fresh

## Summary

Glyph Tracer is public and playable at **https://kleer001.github.io/glyph_tracer/** (Pages
serves `main` at the repo root).

The run was rebuilt this session. It is now **authored puzzles, one act per glyph family**,
replacing the old mix of hand-written tutorial levels and dealt boards. Every level carries
its board and **has a right answer**: inside its allowance, one line of swaps activates more
than any other and **exactly one opening reaches it**. Verified for every shipped level.

The seam that forced the rebuild: the old run taught with one-legal-move diagrams, then
handed the player a dealt board on six swaps, then a 5x8 with 780 pairs and ~26 tied for
the best visible payoff. Slow, then abruptly unreadable.

**Dealt boards left the run but not the code.** `randomBoard`, the act `mix` machinery and
`greedyPlay` are all still in `src/` — they are the endless act, which is unbuilt.

**The game is allowed to beat the player.** Recorded as the first rule in `CLAUDE.md`. No
undo; the allowance runs out and a tap restarts. Do not propose softening this.

## The shape of the run

A lesson is five levels: two teaching on a **4x4** frame, three applying it on **5x5**. The
frame grows inside every lesson, not across the run. Frames are *shapes* — dead cells carve
them, and live-cell count is the real ramp, not grid size.

Allowance is one swap for the early lessons and two for the later ones; a lesson's two
teaching levels stay at one swap however late they fall.

## The tool

`node tools/puzzleBoards.js --layout '....,.O..,....,....' --colors 4 --swaps 1 --iters 8000
--seed N --json out.json`

You hand-place the glyphs; the search only repaints grounds and inks. **It never moves a
glyph** — where the pieces sit is the statement of what the lesson is about, and it is also
the whitelist, since a lesson can only be taught with what it has placed. Objective, in
weight order: the biggest line, exactly one opening reaching it, and a greedy read that
falls short of it.

Rows separate on **commas**, because `/` and `|` are both glyph marks.

Cost is pairs to the power of the allowance. One swap on 25 live cells is seconds; two is
~120 ms an iteration (a full-frame board is ~5 min at 2000 iters — background it).

## What the search cannot author

- **A four-armed glyph in a corner.** A pulse, ring or sink must be *carried* onto its
  colour by the swap, and every colouring the annealer prefers lands it in a corner where
  two arms are off the board and do nothing. Five seeds, five corners.
- **A passive glyph.** An anchor does nothing on its own turn, so the search ignores it and
  finds a plain double instead.
- Those levels are authored by choosing the answer first and writing the board around it —
  levels 11, 16, 17 and 41.
- **An anchor can never make a line clear more.** It eats the front exactly as the board
  edge does, only earlier, so any search maximising clears relocates the push to a clean
  row. Six seeds proved it. Its value is denial: teach it with boards that leave no
  alternative.
- **Three swaps is not reachable.** 420 ms an evaluation at 13 live cells, 7 s at 25 — and
  uniqueness fails first: 5 to 22 openings reach the same maximum, because three swaps
  clear nearly everything by several routes.

## Verification

`node tools/makeLevels.js` and `tests/levels.test.js` both **try every opening and follow
every line beneath it** for any level of two swaps or fewer, and fail if the count is not
exactly one. **Greedy play cannot validate a puzzle** — a puzzle exists to punish a greedy
read, so greedy falling short is the level working. It refused a level for exactly that
before the check was made exact. Suite runs in ~0.6 s.

The level format is unchanged: three characters a cell (ground letter, INK letter, glyph
`mark` from `data/glyphs.json`), `...` a cell off the board, `a--` a live empty cell. Size
and palette come from the grid. `parseBoard`/`formatBoard` are inverses.

## Todos

### Parallel

- [ ] #16 Build the endless act — a picker entry that deals boards from `rules.json`'s mix.
      Everything it needs is already in `src/`; the numbered run just stopped using it.
      This is what turns a couple of hours into "many hours".
- [ ] #17 A combination act with no whitelist at all — every family on one board, after
      lesson nine. Deliberately unfair. Was scoped out of the first pass, not rejected.

### Sequential

- [ ] #8 Graft **L2** from the studio — `GAME-SHEET.md` and `personas/`. Read
      `shelves/L2/README.md`. The four lenses are **cast per game**: their questions come
      from what Glyph Tracer promises and what it descends from. Authoring, not copying.
- [ ] #9 (needs: #8) Playtest. 45 levels have been machine-verified and **not once played
      by a person**. The one informal test predates the entire current run.

## Context

**Repos.** Game: `~/Dropbox/ai/code/glyph_tracer` → `kleer001/glyph_tracer`, **public**,
HTTPS remote — SSH is not authorized, use `gh auth setup-git`. Studio:
`~/Dropbox/ai/code/trace_rom_studio`. Pin 0.27.0.

**Pages deploys from `main` at the repo root and lags a push by 30–60 s.** `loadData()`
throws on a non-ok response by design, so a push adding a `src/` fetch and its `data/` file
must land together or the live game hard-fails during the deploy window.

**Playtest length, unmeasured.** 45 levels, 33 at one swap and 12 at two, 2077 swaps that
land a match across the whole run (mean 45 a level), 258 cells on a perfect run. Knowing the
answers it is ~10 minutes. Solving cold, best guess one to three hours — arithmetic on
search-space size, not a measurement of a person. **No replay value**: one answer per level.

**One player has ever played this game**, on a build predating everything above. They found
the colours glaring, assumed Candy Crush and only tried adjacent swaps, and were intimidated
by six colours. All three were addressed. Sample size one.

**Palette is `lively` and settled — do not reopen.** Four live colours from a six-colour
definition. Every deficiency flattens hue and leaves lightness alone, so separation is bought
in lightness, not by spacing hues. Glare is lightness *and* saturation at once. Palette
rotation is deferred, not cancelled.

**`tools/maxCombo.js` is superseded for level building.** Its unconstrained mix was the open
problem; `puzzleBoards.js` solves it from the other end by fixing the layout. maxCombo is
still the honest answer to "how long can a chain get" — anneal finds 12–13 steps clearing
20–33 of 40 cells in 0.6 s, against 2–3 steps and 4–7 cells on a dealt board.

**`docs/` pages are dated snapshots and are not edited to match the code.** `teaching.html`
describes a run that no longer exists; that is the point of a snapshot. `specs/` is empty
again — the puzzle-run spec came down when the act played, and its reasoning is in
`DECISIONS-JOURNAL.md`.

**The art is baked, not set.** `tools/bakeGlyphs.py` cuts outlines from DejaVu Serif Bold
into `data/glyphPaths.json`; `--check` fails if it drifts. Needs fontTools, a
developer-machine dependency. `data/geometry.json` is the single place glyph scale lives.

**`styles.css` has two load-bearing rules.** The `canvas` rule gives it a size — without it
the box comes *from* the backing store and each frame multiplies by the device pixel ratio.
And `.sheet[hidden]` must exist: `.sheet`'s author `display:flex` outranks the UA
`[hidden]{display:none}`, so without it the level sheet never closes and swallows every tap.

**A round-trip test against generated output proves nothing.** A copier that wrote only the
live palette colours silently dropped the rest, and the test compared the file against the
same broken copier. Assert against the definition instead.

**Driving the game headlessly.** Input is `pointerdown` on the canvas, not `click`. Compute
cells with `boardLayout(...)` from `src/render.js`; step is `lay.cell + 4`. **Wait ~7 s
between the two swaps of a two-swap line** — a tap during playback is consumed by `finish()`,
which silently eats the move and looks like a broken level. After the last level the run
waits for a tap rather than auto-advancing. `tmp/answers.mjs` regenerates every level's
answer line; the driver fetches it over HTTP, so it must sit at the repo root
(`answers-tmp.json`, gitignored).

**Gotchas:** the Bash tool's working directory persists across calls — use absolute paths;
`pkill -f <name>` kills the node process you just started as well as the old one;
`tools/palette.js` imports `node:fs` so it cannot load in a browser page; `run.sh` is
single-threaded, so a held browser connection stalls a `curl` loop; and a tool guarded by
`import.meta.url === pathToFileURL(process.argv[1]).href` throws when imported by `node -e`,
where `argv[1]` is undefined — guard on `process.argv[1]` first.

## Next Step

**#9 — get a person in front of it.** Forty-five levels are machine-verified and completely
unplayed. Every difficulty claim in this file is arithmetic on search-space size; none of it
is evidence about a human. #8 (the L2 graft) is the prerequisite, and it is the rung the
studio says to take before content goes further.

#16, the endless act, is the other live thread and is mostly wiring — the code never left.

/home/menser/Dropbox/ai/code/glyph_tracer
