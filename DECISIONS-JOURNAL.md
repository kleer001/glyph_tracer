# Decision Journal

<!-- The decision-provenance corpus — the companion to the terse `DECISIONS.md`.

     PURPOSE: the full reasoning behind every ruling — the *why*, the alternatives
     weighed and rejected, and where the call is enforced. `DECISIONS.md` holds the
     pruned one-line verdict; THIS file holds the deliberation.

     THIS FILE IS NOT LIVE CANON. What the game does is `src/`, pinned by `tests/`
     and tuned by `data/`. An entry here is a claim about what was decided on a date,
     which is why editing the code cannot make it false.

     WHEN AN ENTRY IS WRITTEN: when a decision has a rejected alternative — when
     something was weighed and lost, and a future session could reasonably re-propose
     the loser. Not for every choice.

     ENTRY CONTRACT: dated, append-only, newest at the bottom.

       ### [YYYY-MM-DD] Short title
       **Decision:** the call.
       **Why:** the pressure or evidence that drove it.
       **Rejected:** the alternatives weighed, one clause why each lost.
       **Threaded:** where the decision is enforced in code or data — file and symbol.

     Do NOT overwrite or prune here — the superseded reasoning IS the value, because it
     shows how the project's thinking moved. When a ruling changes, add a new dated
     entry; the terse line in `DECISIONS.md` is what gets overwritten. -->

---

## Decisions

### [2026-08-26] Twelve abilities, and nothing random at resolution time

**Decision:** Sixteen drawings running four abilities become twelve glyphs, each doing
one thing that no other does.

**Why:** Eight glyphs shoved identically, four absorbed identically, and two had no
effect at all — the set looked like a vocabulary and behaved like a handful of verbs.

**Rejected:** `wild`, which picked one of sixteen direction subsets with a random draw
— it made a board's outcome unauthorable, so a level could not be designed and a bug
could not be reported from its seed. `rotate` replaced it with a turn that is the same
every time. Also rejected: leaving `inert` to be covered by accident by two
unimplemented glyphs, when it is the commonest piece on a board.

**Threaded:** `fire()` in `src/board.js`, where `rand` is threaded in and deliberately
never used. The absence is the rule, so it is written on the function that would
otherwise be where a draw crept in.

### [2026-08-26] The grammar is Roman letters, not polygons

**Decision:** A glyph is a letter, turned or mirrored. The letterform is the verb and
the turn is the direction.

**Why:** The geometric grammar needed a legend — side count, fill state and nesting all
had to be taught before a board could be read. A letter turned to point where it acts
teaches itself.

**Rejected:** The polygon system — `FORMS`, the mark table, the three fill states and
the lengths that described them. Google Fonts, which does not carry DejaVu, and the two
authored glyphs are built from measurements taken off that face: substitute another
serif and the cross and the stop stop matching the letters beside them. The per-glyph
highlight, which was clipped with `source-atop` and so dragged a sheen across the tile
underneath — and would have dragged it across the board while a swap played.

**Threaded:** `AUTHORED` and `glyphDrawing` in `src/glyphShapes.js`; the `letter` /
`rot` / `flip` fields in `data/glyphs.json`.

### [2026-08-26] Letterforms ship as baked paths, not as a font

**Decision:** The outlines are cut out of the face into `data/glyphPaths.json` and
filled as a `Path2D`.

**Why:** A glyph's shape should not depend on the machine looking at it.

**Rejected:** Shipping a subset webfont — it makes the look depend on the visitor, needs
a wait before the first frame, and leaves canvas text one silent fallback away from
breaking the two authored glyphs, which are built from this face's measurements. Canvas
text does not pull a webfont in; only DOM content does.

**Threaded:** `LETTERS` in `tools/bakeGlyphs.py`, which decides what gets baked, and
`data/glyphPaths.json`, which is what ships.

### [2026-08-26] A swap is a speed, not a duration

**Decision:** A swap takes `swapMsPerCell` times the straight-line distance the pieces
travel, floored at `swapMinMs`.

**Why:** Any two live cells can be swapped, so a swap crosses anywhere from one cell to
eight. Speed is the thing that should be constant.

**Rejected:** A fixed 180 ms for every swap — one duration across an eightfold range of
distances, so a neighbour swap ambled at 180 ms per cell while a corner-to-corner swap
was hurled at 22. Also rejected: no floor, because at any readable speed a one-cell swap
is over in three or four frames and the player has to see which two cells they picked.

**Threaded:** `swapDurationFor` in `src/animate.js`.

### [2026-08-26] The single-axis swaps merged into the cross

**Decision:** `I` and `I` turned 90° — one trading the vertical pair, one the horizontal
— were folded into a single cross that trades both.

**Why:** The cross was to *be* the two of them, drawn at once, so it could stand in for
both and the set would keep the `+` / `X` pair.

**Rejected:** Keeping both as glyphs of their own, costed at the time as a twelfth glyph
and "loses the + / X pair". In the same round: the union cross built from two serifed
I's (rejected as a Balkenkreuz), lowercase `t` (the only lowercase among capitals, and
it leans down-left), the numeral `4` (says nothing about the behaviour), and capital `T`
(spans three directions rather than two full axes). Plain bars won.

**Hazard, recorded because it cost a full session to recover:** the union cross was the
*only* thing that justified the merge — the argument was that the cross literally was
the two I's. It was rejected minutes later and plain bars chosen, which are not two I's.
The premise was withdrawn and the conclusion kept, and nobody asked whether the merge
still followed. Nothing about any of this reached a commit: `git log -S` finds no
"sideways I" and no `letter": "I"` on any branch. It lived in a dev page and then only
in chat.

**Threaded:** nowhere — that is the point of the entry.

### [2026-08-28] Four live colours, not six

**Decision:** The game plays on red, yellow, green and blue, drawn from a six-colour
palette.

**Why:** A player outside the project said the number of colours was intimidating. That
is the one channel the project cannot get by reasoning harder.

**Rejected:** Six live colours. The cost was paid in the tutorial: with two grounds in
play and only two inks matching no ground, four neighbours cannot be told apart by
colour, so on the `+`, `X` and rotate levels the four neighbours became the four `A`
rotations in one colour — the letter carries what the colour cannot.

**Threaded:** `use` in `data/palette.json`, which names which colours are live, read by
`resolvePalette` in `src/palette.js`.

### [2026-08-29] The turn waits for the shrink to make room

**Decision:** A dying cell's rotation is held under the room its own shrink has opened —
at scale `u`, no further than `asin(1 / (u·√2)) − π/4`.

**Why:** A square is wider turned than square-on, so a cell that started rotating at full
size threw its corners over the cells beside it. The room a turn needs is geometry, not
taste.

**Rejected:** Turning at a constant speed from full size, which is what produced the
overlap. Also rejected: following the containment envelope itself — its speed diverges
at the release point, so the spin runs under it on a power law instead.

**Threaded:** `spinAt` in `src/animate.js`; the invariant is pinned by the footprint test
in `tests/animate.test.js`, which now runs against the shipped curves and an exaggerated
chain.

### [2026-08-29] Lowercase r for capital R

**Decision:** The rotate glyph and its mirror are set in lowercase `r`.

**Why:** Silhouette overlap, measured pairwise as intersection over union.

**Rejected:** Keeping capital `R`, which put H against R at 0.69 overlap — the closest
pair in the set, two tall two-stemmed letters. The cost was accepted knowingly: `r`
covers 3.85% of the cell against H's 9.14%, and it sits low, because the baker puts y=0
at the cap middle and lowercase sits on the baseline.

**Threaded:** the `rotate` and `rotate-rev` entries in `data/glyphs.json`;
`dev/silhouette.html` is the instrument that produced the number.

### [2026-08-30] A beam is a stroke, not a tentacle

**Decision:** One stroke from root to tip under a single sine envelope driving width and
opacity together. A beam never tapers and never bends.

**Why:** What a beam has to say is a direction.

**Rejected:** The sister game's void tentacle — a chain of discs with a travelling wave,
a charge band and a two-pass neon fill. Good work in the game it belongs to, and every
one of those flourishes was saying something these rules do not.

**Threaded:** `drawBeam` in `src/fx.js`.

### [2026-08-30] Beams draw behind the pieces, ghosts in front

**Decision:** The fx layer sits between the ground and the glyphs; the ghost layer sits
above them.

**Why:** A beam is holding or shoving something, so drawn over the top it reads as
painted on and drawn behind it reads as gripping. A ghost comes off a piece itself, and
behind the glyph an outline a tenth bigger is entirely hidden by the glyph that cast it.

**Rejected:** One effects layer for both, on either side — whichever side it went, one of
the two effects stopped reading.

**Threaded:** the compositor order in `src/main.js`; the reasoning sits on the layers
themselves in `src/fxLayer.js`.

### [2026-08-30] The measured-target pipeline retired

**Decision:** A level's target is authored in `data/levels.json`.

**Why:** The pipeline that measured a board's yield and multiplied it by a stage factor
had had no caller since the pack became the run.

**Rejected:** Keeping `createLevel`, `measureYield`, `targetFor` and `data/stages.json`
against a future need — `stages.json` was read only by the tests of the code that read
it, which is a closed loop proving nothing.

**Threaded:** `target` in `data/levels.json`, read by `src/levels.js`.

### [2026-08-31] The single-axis swaps restored, as bars

**Decision:** Six swap abilities on two authored drawings: a bar trades the pair it lies
across, the cross is that bar and the bar turned, and the cross turned 45° is the two
diagonals.

**Why:** The 2026-08-26 merge outlived the union cross that justified it. Restoring the
singles costs the `+` / `X` pair nothing, because the superset was never the choice that
was put — the question that evening was framed as either/or.

**Rejected:** The merge itself. The letter `X`, which never composed with the bars it is
made of — it is a letterform and the family is not. Baking a serif `I` for the singles,
which would have collided with `H` the way `R` did; an authored bar has no serifs and
makes the cross genuinely two of it.

**Threaded:** `SWAP_AXES` in `src/board.js`, which `src/abilityFx.js` also reads so the
beams cannot drift from the exchanges; `AUTHORED` in `src/glyphShapes.js`. The
composition is pinned by "a both-axes swap is its two single-axis swaps, in either
order" in `tests/board.test.js`.

### [2026-08-31] The activation flash is built and not wired in

**Decision:** `createFlashLayer` exists and is absent from the game's compositor.

**Why:** Measured across the live palette, an additive flash lifts a green cell 0.40 in
relative luminance and a red one 0.06 — a sevenfold spread. A feedback signal that
reports the hue of the tile instead of the event is worse than a weak one.

**Rejected:** `lighter` with the cell's own colour, which cannot be fixed by tuning: red
sits at 243 in its own channel, so adding more of it clips on the first frame and only
the two channels that are not the colour move at all. Also rejected: per-colour alpha to
even it out, which would make the flash carry a table.

**Threaded:** `createFlashLayer` in `src/fxLayer.js`, and its absence from the compositor
in `src/main.js`. Screen-toward-white narrows the spread from sevenfold to threefold and
is approved but not yet built.

### [2026-08-31] Move preview declined

**Decision:** The game does not show the future board state.

**Why:** The player learns the cascade by playing it.

**Rejected:** An engine-driven preview of the resolved swap. That it is cheap to build
here is not the argument — the engine already resolves a swap on a copy without
committing, and a deterministic cascade is the ideal case for it. It was declined on
what it would do to the game, not on what it would cost.

**Threaded:** nothing in code — this is a decision about what not to build, which is why
it needs a written home.

### [2026-08-31] Segment welding declined

**Decision:** Consecutive steps keep their own beats.

**Why:** Split beats put a destruction beat between every pair of movement beats, so
welding here means rebuilding the timeline as per-piece envelopes instead of phases —
a new render path, not lines in an existing one.

**Rejected:** Welding a run of steps into one envelope, priced cheap by analogy with a
sister game that welds consecutive moves of *one piece*. It also pulls against hit stop
and escalation, which exist to make each link a distinct beat.

**Threaded:** the phase list built by `buildTimeline` in `src/animate.js`.

### [2026-08-31] The prose specs retired

**Decision:** `SPEC.md`, `RENDER_SPEC.md`, `LEVELS.md`, `docs/JUICE.md` and
`docs/specimen.html` deleted — 891 lines.

**Why:** More than half of `SPEC.md` was pasted tool output that could not reproduce
itself; a third restated `src/`. `RENDER_SPEC.md` described the polygon renderer,
retired on 2026-08-26. `LEVELS.md` documented four acts against a pack shipping seven.
A stale number does not retire quietly — it gets quoted.

**Rejected:** Keeping them and maintaining them, which had been the standing plan and
had failed silently for a week. Also rejected: keeping the measurements as a recorded
baseline, since the one in `SPEC.md` did not match the flags its own caption named and
nobody noticed.

**Threaded:** the conclusions moved to the tool that produces them — the header of
`tools/swapBudget.js`, told to re-run rather than be quoted — and to the data they
qualify, in the `note` on `data/levels.json`.
