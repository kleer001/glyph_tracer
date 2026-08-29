fresh

## Summary

Glyph Tracer is public and playable at **https://kleer001.github.io/glyph_tracer/** (Pages
serves `main` at the repo root; the README leads with a launch link).

The engine runs **twelve glyphs with twelve distinct behaviours**, none of them random,
drawn as Roman letters turned or mirrored and baked into SVG paths the game ships. The run
is **38 levels in 7 acts**: 13 authored tutorial levels that teach one character each, then
the 25 dealt levels of the original six acts.

**Every tutorial level past the second is a trap** — a visible match that falls short beside
one right answer, on a single swap. That is deliberate, and it is a real difficulty
decision: the gentler levels that only demonstrated a glyph were cut for not paying the
player anything, which left only the ones that ask whether the glyph was understood.

**The whole game is four colours.** Every level, tutorial and dealt, indexes red, yellow,
green and blue; `data/palette.json`'s `lively` defines six and its `use` names those four.

**A level can carry its board as text**, so a board can be written by hand or generated and
pasted in. `data/levels.json` is the run — nothing generates it. 153 tests pass.

## What a player said

One person outside the project has played it, on a build from before the four-colour work.
They enjoyed it. Three things got in the way, and all three are now closed:

- **The colours bothered them.** The palette was six hues at even weight with a yellow at
  L 0.95 holding every scrap of chroma sRGB has — the one cell that glared. Now `lively`.
- **They assumed it was Candy Crush and only tried adjacent swaps.** Tutorial level 2 exists
  to break that: a board where the only swap that scores is between the two far ends.
- **They were intimidated by how many colours there were.** Now four.

That is the whole record. It is worth knowing these three decisions came from a person
rather than from taste — and worth knowing the sample is one.

## Where things stand

- **Palette is `lively` and settled — do not reopen.** The owner called further palette work
  bikeshedding. Rotation between several palettes is **deferred**, not cancelled.
- **A blank is a dead cell, not a green one.** Cells the lesson does not use are `...`
  rather than `c--`, which takes green back for grounds and glyphs.
- **Four colours is done.** The 24 tutorial boards were rewritten and the 25 dealt levels
  rebuilt: act means re-measured at four, targets recomputed from them, seeds re-searched.
  The factor column was not touched — it is the ramp, and it was never about the palette.
  Means at four: match 10.3 on 4x4 and 12.0 on 5x8, shove 15.1, aim 13.2, wall 12.7,
  trade 15.6, turn 16.7.
- **Documents are deliberately stale.** The owner's instruction: let them get out of date
  until told otherwise. `SPEC.md`, `RENDER_SPEC.md` and `docs/` are all behind the code, and
  that is fine. Do not spend time on them.

## Todos

### Parallel

- [ ] #15 Constrain the mix in `tools/maxCombo.js`. The annealer may rewrite which glyph
      sits in any cell, so it packs the board with abilities and its boards look nothing
      like a dealt one. Levels built from it would read as a different game.
- [ ] #14 `tmp/buildActs.py` generates the act markup in `docs/teaching.html` and is
      gitignored. Much less urgent than it was — that page is no longer the level source —
      but the file is still the only way to regenerate those tables.

### Sequential

- [ ] #8 Graft **L2** from the studio — `GAME-SHEET.md` and `personas/`. Read
      `shelves/L2/README.md`. The four lenses are **cast per game**: their questions come
      from what Glyph Tracer promises and what it descends from. Authoring, not copying.
- [ ] #9 (needs: #8) Playtest properly. One informal test has happened — see above — and
      everything it found is fixed, which means the next one will find different things.
      `shelves/L2/PLAYTEST.md` is method that stays on the shelf; what belongs in the game
      is what a test taught it.

## The level format

A level either **carries** a board or **deals** one.

```json
{ "id": 12, "teaches": "...", "budget": 1, "target": 5,
  "board": ["aB. bAO cB^", "bC+ aBX cAH", "... dEO aC."] }
```

Three characters a cell: ground letter, INK letter, and the glyph's `mark` from
`data/glyphs.json`, which is where that alphabet lives. `...` is a cell that is not part of
the board, `a--` a live cell with nothing on it. **Size and palette come from the grid**, so
an authored level states neither `width`/`height` nor `colors`. `parseBoard` and
`formatBoard` are inverses — any board the engine can hold round-trips.

`loadRun` reads every authored board at startup, so a mistyped cell is the author's problem
rather than a surprise for a player twenty levels in. It also rejects a board that opens
with a piece already on its own colour, which `randomBoard` cannot deal.

## Authoring a level, and what bites

- **`node tools/studyBoard.js`** plays every swap on a board and says what each does. Two
  mistakes are invisible on the page and obvious here: a shove nobody can see, because the
  pieces in the line are all one colour, and a second answer nobody intended, because some
  filler piece's ink matches another cell's ground.
- **The rule that makes a teaching level teach:** two grounds only — one for filler, one for
  the cell the taught glyph must reach — and exactly one piece carrying the ink that matches
  the target ground. Every other ink comes from those that are no cell's ground. That is
  what leaves exactly one swap that scores.
- Only four inks are legal under that rule, so eight surrounding cells cannot be eight
  colours. Where a glyph touches one set of neighbours and not the other, **leave the
  untouched set empty** rather than filled.
- **At four colours the rule leaves only two legal filler inks** — the game's grounds are
  `c` for filler and `d` for the target, so only `A` and `B` match no ground. That is not
  enough to tell four neighbours apart, so on the `+`, `X` and rotate levels the four
  neighbours are the four **A rotations** in one colour: the letter carries what the colour
  cannot, and every symbol used is one already taught by then.
- `makeLevels` refuses a one-swap level with more than one answer. On a budget of one every
  swap can simply be tried, so it resolves them exhaustively rather than trusting greedy
  play — **greedy is the wrong instrument for a level built to reward reading a glyph**, and
  on four of the proof levels it misses.

## Combos

`node tools/maxCombo.js` builds a board where one swap sets off the longest chain it can.
Two approaches, measured against each other:

- **grow** reasons about the cascade and paints the last movers' destinations to match.
  Milliseconds, and it plateaus at four steps.
- **anneal** asks the engine instead — one cell at a time, keep what deepens the best line.
  **12–13 steps clearing 20–33 of 40 cells, in 0.6 seconds.** Best seen: 13 steps, 30 cells.

Running grow first buys the annealer nothing; they are alternatives, not stages. A dealt
board offers 2–3 steps clearing 4–7 cells for comparison.

## Context

**Repos.** Game: `~/Dropbox/ai/code/glyph_tracer` → `kleer001/glyph_tracer`, **public**,
HTTPS remote — SSH is not authorized for this account, use `gh auth setup-git`. Studio:
`~/Dropbox/ai/code/trace_rom_studio`. Pin 0.27.0, studio VERSION 0.27.0.

**Pages deploys from `main` at the repo root and lags a push by 30–60s.** `loadData()` throws
on a non-ok response by design, so a push that adds a `src/` fetch and its `data/` file must
land together or the live game hard-fails during the deploy window.

**`data/palette.json` holds several palettes and names a default.** `resolvePalette` flattens
one into the flat shape everything downstream reads. A palette defines its colours and says
with `use` which are live — Lively defines six and plays all six, because the run still has
levels asking for five and six. `tools/palette.js` measures a palette by simulating each
colour deficiency and reporting the closest pair in OKLab.

**The measurement that shaped the palette:** every deficiency flattens hue and leaves
lightness alone, so separation is bought in lightness, not by spacing hues evenly. Glare is
lightness *and* saturation at once — the old yellow sat at L 0.95 holding all the chroma
sRGB has there, and it was the one cell that hurt.

**Palette-size findings, re-measured on the shipped mix.** Fewer colours means livelier
combos: cascade 1.25 at three colours against 1.15 at six, deepest combo 2.42 against 1.97.
At four colours *every* dealt board has a combo and half have a four-step chain. The recorded
claim that three colours front-loads worst **does not reproduce** — total reach killed it.
Fixing the palette at four would cost about two cells of mean range; the mix alone still
spans 12.0 to 15.3 at four colours, and the factor column spans 0.33 to 1.10.

**The art is baked, not set.** `tools/bakeGlyphs.py` cuts outlines from DejaVu Serif Bold
into `data/glyphPaths.json`. `--check` fails if it drifts. Needs fontTools, a
developer-machine dependency; the game has none. `favicon.svg` comes from the same `A`.

**`data/geometry.json` is the single place glyph scale lives:** `stem 9`, `cap 33`,
`centre -0.5`, `dotDiameter 24`, `keylinePx 1`. Widest letter is 36 of the 100-unit cell.
The keyline converts from screen pixels at draw time, so a hairline stays a hairline at any
board size.

**A tap during playback skips to the settled board.** `applySwap` resolves the whole swap
before the timeline is built, so dropping it skips nothing. Worst cascade animates 4.9s.

**Board shape is settled — do not reopen.** 5×8. Animation timing settled in
`data/animation.json`. Stars are swaps left over.

**`styles.css` has two load-bearing rules.** The `canvas` rule gives it a size — without it
the box comes *from* the backing store and each frame multiplies by the device pixel ratio.
And `.sheet[hidden]` must exist: `.sheet`'s author `display:flex` outranks the UA
`[hidden]{display:none}`, so without it the level sheet never closes and swallows every tap.

**A copier that writes a subset silently deletes the rest.** `paletteFileText` once wrote
only the live colours, so rewriting the file through it dropped every colour a `use` had set
aside — and the round-trip test could not see it, because it compared the file against the
same broken copier that wrote it. **A round-trip test against generated output proves
nothing.** Assert against the definition instead.

**`makeLevels` assigns seeds before it validates.** `loadRun` rightly refuses a pack whose
dealt levels have no seed, and choosing those seeds is the tool's whole job — so it reads
the budget itself, assigns, and only then runs the same check the game makes.

**Gotchas:** the Bash tool's working directory persists across calls — use absolute paths;
`pkill -f <name>` will kill the node process you just started as well as the old one;
`tools/palette.js` imports `node:fs` so it cannot be loaded in a browser page; Playwright's
element screenshots land on the wrong region on these pages — extract `canvas.toDataURL()`
instead; and `run.sh` is single-threaded, so a held browser connection stalls a `curl` loop.

## Next Step

Ask the owner what they want next. The work is at a natural stopping point: the run is
complete and winnable, the palette is settled, and the combo builder is in the back pocket
rather than in use.

The two things with momentum behind them are **#15**, which is what stands between the combo
builder and it being usable for real levels, and the **parked four-colour question**, which
the owner asked for and has not withdrawn.

/home/menser/Dropbox/ai/code/glyph_tracer
