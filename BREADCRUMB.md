fresh

## Summary

Glyph Tracer is public and playable at **https://kleer001.github.io/glyph_tracer/** (Pages
serves `main` at the repo root; the README leads with a launch link).

The engine runs **twelve glyphs with twelve distinct behaviours**, none of them random.
Glyphs are **Roman letters, turned or mirrored**, baked out of DejaVu Serif Bold into SVG
paths the game ships — no font, no webfont wait, nothing depending on the visitor's
machine. The level run is **six acts**, opening on a 4×4 board at two colours.

135 tests pass.

## The twelve

| letter | kind | behaviour |
|---|---|---|
| `.` | `''` | Inert — nothing. The commonest piece on the board. |
| `O` | `pulse` | Advances the line in all four directions by one |
| `H` | `anchor` | Absorbs whatever is shoved in; stays put. The only sink that is a piece. |
| `A` ×4 | `pushUp/Right/Down/Left` | Advances one line, the way it points |
| `+` | `swapOrth` | Exchanges upper↔lower and left↔right |
| `X` | `swapDiag` | Exchanges both corner pairs — the only glyph that reaches diagonals |
| `R` | `rotate` | Turns the four neighbours one step clockwise |
| `R` mirrored | `rotateRev` | The same turn, anticlockwise |
| `S` | `sink` | Draws all four lines inward; its own cell dies first and is the hole |

One kind per glyph, so a push carries its direction in its **kind**, not its rotation —
`board.js` still never reads the art layer. `+` and `.` are authored from the face's own
measurements rather than baked from a letter. `anchor` has no `fire()` branch: absorbing is
implemented in `shove()`, where a line meets it.

## Todos

### Parallel

- [ ] #10 **`CLAUDE.md` describes the retired engine.** §"Where things are" says "The engine
      knows four kinds — push, block, wild, void" and calls the set "the sixteen glyphs" in
      two places. This file is loaded into every session's context, so it is the most
      misleading stale document in the repo — a session reads it before reading any code.
- [ ] #11 **`RENDER_SPEC.md` documents a render system that no longer exists**: a `FORMS`
      table with a pentagon named "Wild", inner marks, magnitude fill states, a specular
      glyph layer, and `radius`/`keyWidth`/`inkWidth`/`markWidth`/`dotRadius`/`nestRadius` in
      `data/geometry.json` (which actually holds `stem`, `cap`, `centre`, `dotDiameter`,
      `keylinePx`). Its paint-order and gloss sections still match `src/render.js`; nothing
      else does.
- [ ] #12 **`docs/specimen.html` is the polygon plate** — "108 combinations: 6 polygons × 3
      fill states × 6 inner marks", built from a hardcoded shape table with `⬠ Wild` in it.
      There is no polygon system to plate. Either rebuild it over the twelve (`dev/cell.html`
      already draws exactly that, through the shipping renderer) or delete the page and let
      `dev/cell.html` be the plate.
- [ ] #13 **`README.md` says "the sixteen glyphs" (line 58) and "two of the sixteen" (76);
      `dev/README.md` says "all sixteen glyphs" twice.** The README is the public face of the
      repo.
- [ ] #14 **`tmp/buildActs.py` is the only source for `docs/teaching.html`'s act markup and
      lives in a gitignored directory.** Lose it and the acts cannot be regenerated — the doc
      becomes hand-editable only, and `tests/levels.test.js` pins `data/levels.json` to it.
      Move it to `tools/` and replace its hardcoded absolute `BASE` path with one derived
      from the script's own location.

### Sequential

- [ ] #8 Graft **L2** from the studio — `GAME-SHEET.md` and `personas/`. Read
      `shelves/L2/README.md`. The four lenses are **cast per game**: their questions come
      from what Glyph Tracer promises and what it descends from. Authoring, not copying.
      More urgent than it was — there is now a public URL to hand someone.
- [ ] #9 (needs: #8) Playtest with someone who isn't the owner. `shelves/L2/PLAYTEST.md` is
      method that stays on the shelf; what belongs in the game is what a test taught it.

## Context

**Repos.** Game: `~/Dropbox/ai/code/glyph_tracer` → `kleer001/glyph_tracer`, **public**,
HTTPS remote — SSH is not authorized for this account, use `gh auth setup-git`. Studio:
`~/Dropbox/ai/code/trace_rom_studio`. Pin 0.27.0, studio VERSION 0.27.0 — up to date.

**Pages deploys from `main` at the repo root and lags a push by 30–60s.** `loadData()` throws
on a non-ok response by design, so a push that adds a `src/` fetch and its `data/` file must
land together or the live game hard-fails during the deploy window.

**The art is baked, not set.** `tools/bakeGlyphs.py` cuts outlines from
`/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf` into `data/glyphPaths.json` (2.9KB,
letters A H O R S X). Each path is normalised to **cap height 1** about its own centre, so
`data/geometry.json` owns size and vertical aim. `python3 tools/bakeGlyphs.py --check` fails
if the file drifts from the font. Needs fontTools — a developer-machine dependency; the game
has none. `favicon.svg` is generated from the same `A` path.

**`data/geometry.json` is the single place glyph scale lives:** `stem 9`, `cap 33`,
`centre -0.5`, `dotDiameter 24`, `keylinePx 1`. Widest letter is **36 of the 100-unit cell** —
a little over a third, which is the owner's spec. Sliders for all five in `dev/cell.html`,
with a live warning when the dot grows wide enough to read as a filled O (O's counter, 37, is
the ceiling). The keyline is converted from **screen pixels** at draw time, not fixed in cell
units, so a hairline stays a hairline at 92px and at 34px.

**Canvas text does not pull a webfont in** — only DOM content does. That bug is designed out
(paths, no font), but it is the trap to remember if type ever returns to the canvas.

**Board size is the level's to state, not the rules' to fix.** Every level carries
`width`/`height`; `loadRun` rejects a target no board of that size could reach.

**Act means are keyed `WxH@colours`,** because a 4×4 board is a different game: yield 11.3
against the full board's 12.0, it *falls* as colours rise where the full board is flat, and
adding pulses **lowers** it — sixteen cells cannot refill what a shove spends off the edge.

**Measured yield over six swaps, 5×8 at 4 colours:** inert 12.0 · pulse 15.1 · directional
pushes 13.1 · pushes+anchors 12.7 · swaps 15.6 · turns+sink 16.6. **Rearrangers are
yield-positive where pushers spend material** — a trade or a turn manufactures matches
without consuming the board. That curve is what the six acts are built on, and it is the
lever for any further act design.

**The run:** levels 1–2 are 4×4 at 2 colours, 3 is 5×8 at 2, 4–7 at 3, 8–9 at 4, then up to
6. Factors run 0.33→1.10 and use all three documented stage bands.

**`tmp/buildActs.py` generates the act sections** of `docs/teaching.html` from a table of
levels and measured means; then `node tools/makeLevels.js --write` searches seeds and writes
`data/levels.json`. It **is idempotent**, and the page it produces is byte-identical to the
one committed, so a regeneration is safe. `makeLevels` parses whatever kinds an act bar
names, and an act with no abilities must state `0% <kind>` rather than say nothing. See #14:
the file is not under version control.

**`data/example_board.json` and `docs/trapping.html` come from one command:**
`node tools/trapBoards.js --iters 3000 --json boards.json`, element 0 of the array, pasted
into both. The doc's script reads `D.solution` — the tool's own key — so the paste needs no
reshaping. `tests/exampleBoard.test.js` pins the embedded copy to the file, and every kind on
it to a glyph that is drawn for it.

**The move log is hidden below 900px** (`styles.css` media query) — it was taking two thirds
of a phone's width and leaving the board a strip. It is the last dev instrument on the
player's screen; moving it to a `dev/` page is a small change if it bothers you on desktop.

**A tap during playback skips to the settled board.** `applySwap` resolves the whole swap
before the timeline is built, so the timeline is playback only and dropping it skips nothing.
The worst cascade in the run animates for 4.9s.

**Board shape is settled — do not reopen.** 5×8 at six colours, `docs/board-size.html` is the
record. Animation timing settled in `data/animation.json`. Stars are swaps left over.

**`styles.css` has two load-bearing rules.** The `canvas` rule gives it a size — `main.js`
sizes the backing store from the rendered box, so without it the box comes *from* the backing
store and each frame multiplies by the device pixel ratio (the page once grew to 768602px).
And `.sheet[hidden]` must exist: `.sheet`'s author `display:flex` outranks the UA
`[hidden]{display:none}`, so without it the level sheet never closes and swallows every tap.
`tests/render.test.js` pins the first; the second is only pinned by the bug being memorable.

**Prose discipline.** A measurement written in the grammar of a rule reads back as policy.
Test: could a future session cite this sentence to refuse the owner? Then it is an invented
rule — rewrite it as the cost it measures. `SPEC.md` has a §"Measured under a retired engine"
holding exactly those figures, labelled.

**Gotchas:** the Bash tool's working directory persists across calls (a `cd tmp` silently
sends later relative paths astray — use absolute paths); Playwright's element screenshots
land on the wrong region on these pages (extract `canvas.toDataURL()` instead); Playwright's
viewport is scaled by a 0.67 DPR, so `innerWidth` is not the number you set; and `run.sh` is
a single-threaded server, so a held browser connection stalls a `curl` loop against it.

## Next Step

**#10, `CLAUDE.md`.** It is read before anything else every session and it states the wrong
engine, so every other stale document is downstream of it. Bounded — the twelve are already
tabulated above.

Then **#8, graft L2**. It was the next real gate before this and still is; the public URL
makes it sharper — there is now something to hand a stranger.

/home/menser/Dropbox/ai/code/glyph_tracer
