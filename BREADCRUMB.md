fresh

## Summary

Glyph Tracer was adopted into Trace ROM Studio from a Python-prototype spec, ported to
the house stack (vanilla JS, ES modules, no build), built to a playable vertical slice,
and budded into `kleer001/glyph_tracer` (private). It now plays end to end: 25 levels in
four acts, a level picker with per-level stars, and localStorage progress. 119 tests pass,
everything is pushed, working tree clean.

Two owner decisions reshaped the rules mid-build and are recorded in `SPEC.md`:
a swap exchanges **any two live cells** (not orthogonal neighbours), and a swap moves the
**whole piece** — colour, ability and drawing together.

## Todos

### Parallel

- [ ] #2 `data/stages.json` reads as orphaned but is not — nothing in `src/` loads it,
      yet `tests/teachingRun.test.js` checks the doc's stage bands against it and
      `tests/level.test.js` uses it. Deleting it removes one side of that check. **Small:**
      say in the file and in `SPEC.md`'s table that it is a policy record rather than
      runtime data, so it stops looking like dead weight. ~10 min.
- [ ] #3 Two of the sixteen glyphs are drawn but not implemented: `◇ Swap` (exchange with
      one neighbour) and `⬡ Flow` (next match is free). Both marked `"implemented": false`
      in `data/glyphs.json` and play as plain glyphs. **Not small, and not just code:**
      a fifth kind changes what boards yield, and every target in `data/levels.json` was
      measured against the current mixes — so the whole pack needs regenerating after.
      `◇ Swap` is also under-specified: "exchange with any one neighbour" does not say
      which, and if it is random it is unauthorable for the same reason wilds are. Wants
      an owner decision before any code.
- [ ] #4 Acts III and IV want authored trap boards rather than seeded random ones
      (`docs/teaching.html` says so). `tools/trapBoards.js --json` generates them; nothing
      wires generated boards into `data/levels.json` yet. **Medium:** a level stores a
      `seed`, not a board, so the pack would have to carry grids and `dealLevel` accept
      either. Bounded work, but it changes how Acts III–IV play — a design change wearing
      plumbing clothes.

- [ ] #7 No favicon, so every page load logs a 404 in the console. One line; the house
      rules explicitly exempt a favicon small enough to inline as an SVG data URI.
      ~5 min.

- [ ] #8 No skip-on-tap while an animation plays. Input is locked for the whole timeline
      and the worst case measured across the 25 levels is 3.55s, six times a level. A tap
      during playback should jump to the settled board. Small and self-contained: `main.js`
      already refuses input while `playing` is set — that branch becomes the skip. This is
      the highest value of the small items, because it answers a cost that was measured
      rather than guessed.

### Sequential

- [ ] #5 Graft **L2** from the studio — `GAME-SHEET.md` and `personas/`. This is the next
      real gate. The panel convenes on something playable, which now exists. The four
      lenses are **cast per game**: their questions come from what Glyph Tracer promises
      and what it descends from. Authoring, not copying. Read `shelves/L2/README.md`.
- [ ] #6 (needs: #5) Playtest with someone who isn't the owner — `shelves/L2/PLAYTEST.md`
      is method that stays on the shelf; what belongs in the game is what a test taught it.

## Context

**Repos.** Game: `~/Dropbox/ai/code/glyph_tracer` → `kleer001/glyph_tracer` (private,
HTTPS remote — **SSH is not authorized for this account**, use `gh auth setup-git`).
Studio: `~/Dropbox/ai/code/trace_rom_studio` → `kleer001/trace_rom_studio`. Reference
sibling for conventions: `~/Dropbox/ai/code/treasure_trash`.

**Studio tie.** Game pin is 0.27.0, studio `VERSION` is 0.27.0 — up to date. Two studio
bumps landed this session: 0.26.0 (write findings as costs, not as rules) and 0.27.0 (the
copy audits are personal skills, not shelf payload).

Studio delivery is clean — `python3 scripts/check_updates.py --validate` says
"Delivery mechanism is sound". The `shelves/L4/skills/*` deletion and the two CHANGELOG
citations it orphaned were both fixed and committed under 0.27.0. Studio working tree is
clean and pushed.

**Board shape is settled — do not reopen.** 5×8 at six colors. `docs/board-size.html` is
the record behind it, deliberately framed as settled rather than open; the wide tie pool
that comes with total reach is a weighed and accepted cost. Owner called it a purposeful
YAGNI violation: measured ahead of need, on purpose, and parked.

**The level run is generated, not authored.** `docs/teaching.html` is where the run is
designed; `node tools/makeLevels.js --write` reads it and writes `data/levels.json`. A
test compares them field by field. Every seed is validated by dealing the board *the way
the game deals it* (via `dealLevel`, which draws from the seeded stream for art) and
playing greedily until the target is met — a first attempt that dealt boards differently
shipped one unwinnable level.

**Stars are swaps left over**, not cells cleared: a level ends the moment its target is
met, so cells cleared cannot separate a good run from a bare pass.

**Animation timing is settled** (owner's values, in `data/animation.json`): swapMsPerCell
100, swapMinMs 150, stepMs 200, shrinkMs 200, holdMs 100, staggerMs 50, splitBeats true.
A swap is a **speed** — ms per cell travelled, floored — because any two cells can be
swapped and that distance runs 1 to ~8 cells. Cost, measured by greedy-playing all 25
levels: median 1.25s per swap, 90th 2.20s, worst 3.55s. Input is locked that whole time
and there is no skip-on-tap; if the worst case grates, that is the lever.

**Two dev instruments live in `dev/`** (promoted out of gitignored `tmp/` before the bud
would have destroyed them): `gloss.html` tunes `data/gloss.json`, `timing.html` tunes
`data/animation.json`. Both drive the real `src/` modules, so what is tuned is what ships.
Each has a `shipped` preset that reads the live data file.

**Prose discipline (studio 0.26.0).** A measurement written in the grammar of a rule reads
back next session as policy. The test: could a future session cite this sentence to refuse
the owner? If so it is an invented rule — rewrite it as the cost it measures. The whole
repo was swept for this; keep new prose to the same standard.

**`styles.css` has a load-bearing `canvas` rule.** `main.js` sizes the backing store from
the canvas's own rendered box, so with no CSS size the box comes from the backing store
and each frame multiplies it by the device pixel ratio. A block edit deleted the rule once
and the page grew to 768602px before failing. `tests/render.test.js` now asserts the rule
sets a width and a height.

**Gotcha that bit twice this session:** `re.sub`/string replacements in edit scripts that
silently don't match. Always assert the match before writing.

## Next Step

**#5 — graft L2** is the next real gate: `GAME-SHEET.md` plus a panel cast for this game.

If you want a short warm-up first, **#8 (skip-on-tap), #7 (favicon) and #2 (label
stages.json)** are all small, independent, and none of them touches the level pack —
they can be done in one pass. #3 and #4 want an owner decision before any code.

/home/menser/Dropbox/ai/code/glyph_tracer
