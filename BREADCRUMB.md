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

- [ ] #1 Settle animation timing — **never chosen, still at defaults.** Verified:
      `data/animation.json` holds swapMs 180, stepMs 200, shrinkMs 200, with `holdMs`,
      `staggerMs` and `splitBeats` at no-op zeros. `dev/timing.html` tunes them against 8
      real cascades; copy settings, paste into the data file.
      Owner's stated want: ~20% slower plus "breath" between movements.
      **Do not confuse this with the gloss values**, which the owner *did* send and which
      *are* applied — `data/gloss.json` (radius 6, cellShadowA 45, sheen 34, spec 62, and
      the rest). Gloss: done. Timing: outstanding.
- [ ] #2 `data/stages.json` is orphaned from the game — target factors are now baked into
      `data/levels.json`. It remains the policy record and is still tested against
      `docs/teaching.html`. Decide whether it stays, moves into the doc, or goes.
- [ ] #3 Two of the sixteen glyphs are drawn but not implemented: `◇ Swap` (exchange with
      one neighbour) and `⬡ Flow` (next match is free). Both marked `"implemented": false`
      in `data/glyphs.json` and play as plain glyphs.
- [ ] #4 Acts III and IV want authored trap boards rather than seeded random ones
      (`docs/teaching.html` says so). `tools/trapBoards.js --json` generates them; nothing
      wires generated boards into `data/levels.json` yet.

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

**Two dev instruments live in `dev/`** (promoted out of gitignored `tmp/` before the bud
would have destroyed them): `gloss.html` tunes `data/gloss.json`, `timing.html` tunes
`data/animation.json`. Both drive the real `src/` modules, so what is tuned is what ships.
Each has a `shipped` preset that reads the live data file.

**Prose discipline (studio 0.26.0).** A measurement written in the grammar of a rule reads
back next session as policy. The test: could a future session cite this sentence to refuse
the owner? If so it is an invented rule — rewrite it as the cost it measures. The whole
repo was swept for this; keep new prose to the same standard.

**Gotcha that bit twice this session:** `re.sub`/string replacements in edit scripts that
silently don't match. Always assert the match before writing.

## Next Step

Start with **#1** — the animation timing is the one thing the owner was actively tuning
when the session ended. Open `dev/timing.html` (serve with `./run.sh`, never `file://`),
find values, hit **copy settings**, paste into `data/animation.json`. Then #5 (L2) is the
real next gate.

/home/menser/Dropbox/ai/code/glyph_tracer
