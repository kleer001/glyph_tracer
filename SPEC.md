# Glyph Tracer — design spec

Working title. Phone game. A 5-wide by 8-tall grid of colored cells, each carrying a
monochrome glyph in a different color from the same palette. Backgrounds are fixed
terrain; glyphs are the pieces that move. No spelling, no dictionary, no reaction test —
shape and pattern only.

## Core rules

- **The board.** 5 wide, 8 tall. Cell backgrounds are fixed and never move.
- **The swap.** Tap one cell, then any other. Their pieces exchange places — a piece
  carries its colour, its ability and its drawing, so all three travel together.
- **The match.** A glyph that lands on a cell whose background is its own color
  **activates** — its ability fires and the cell goes away.
- **No gravity, no refill.** Nothing falls. The board drains over the course of a level.
- **The combo.** Abilities are the only thing that chains. A pusher shoves nearby glyphs
  into other cells, and any glyph that lands on its own color activates in turn. Without
  the ability layer there are no combos at all — it is the engine, not a payload.
- **Sinks.** A shove travels down a line of glyphs and ends at a sink. Every sink behaves
  the same way: the glyph at the front of the line is **eaten**, everything behind it
  advances one. Three sinks — the board edge, a destroyed cell, and a glyph that eats what
  is pushed into it. A line only advances intact when it ends on a live empty cell.
- **Worked example.** Row reads `A B C D`. `D` lands on its own color and activates,
  pushing left. `A` is an eater. Result: `A C _ ×` — `A` stays, `B` is eaten, `C` advances
  into `B`'s slot, and `D`'s cell is destroyed by activating. (`_` empty cell, `×` cell gone.)
- **Clean opening.** A glyph never spawns on its own color, so a board opens with nothing
  matched. Every activation is something the player caused.
- **The level.** Clear N cells in X swaps. Both are precomputed from the board's measured
  yield, with margin — see the target policy in `docs/teaching.html`, implemented in
  `src/level.js`.

## The grammar

A glyph is a Roman letter, turned or mirrored. The letterform is the verb and the turn
is the direction — `A` sends its line the way its apex points, and a mirrored `R` turns
the ring the other way round. Eight drawings carry the twelve glyphs: six letters
(`A H O R S X`) plus two authored forms, a cross and a full stop, sized off the same
face's stem width and cap height.

Direction lives in the **kind**, not in the drawing. Every glyph has its own kind and no
two share one, which is why `src/board.js` never reads the art layer: the drawing says
what a piece is without deciding what it does. `data/glyphs.json` pairs the two.

Nothing resolves randomly. Given a board and a swap, the outcome is fixed — see *Why
nothing is random at resolution time* below.

## The twelve

`data/glyphs.json` is the set — letter, turn, mirror, kind — and `src/board.js`'s
`fire()` is what each kind does. The table is here for the shape of the family; where it
and the code disagree, the code is right.

| Glyph | Name | Kind | Effect |
|---|---|---|---|
| `.` | Inert | — | nothing. It matches, its cell goes, and no ability runs |
| `O` | Pulse | `pulse` | advances the line in all four directions by one |
| `H` | Anchor | `anchor` | absorbs whatever is shoved into it and stays put |
| `A` | Push up | `pushUp` | advances the line above by one |
| `A` turned 90° | Push right | `pushRight` | advances the line to the right by one |
| `A` turned 180° | Push down | `pushDown` | advances the line below by one |
| `A` turned 270° | Push left | `pushLeft` | advances the line to the left by one |
| `+` | Swap orthogonal | `swapOrth` | exchanges upper with lower, and left with right |
| `X` | Swap diagonal | `swapDiag` | exchanges both corner pairs — the only ability that reaches a corner |
| `R` | Rotate | `rotate` | turns the four neighbours one step clockwise |
| `R` mirrored | Rotate reversed | `rotateRev` | the same turn anticlockwise |
| `S` | Sink | `sink` | draws all four lines inward; its own cell dies first and is the hole they fall into |

Inert is the commonest piece on a board and the only one with no kind. How much of a
board is anything else is a `mix` — one per act in `data/levels.json`, and a default in
`data/rules.json`.

## Rendering

Color roles, paint order and the gloss live in `RENDER_SPEC.md`. `src/glyphShapes.js`
turns a glyph into primitives and `src/render.js` paints them to canvas.

The letterforms ship as SVG paths in `data/glyphPaths.json`, baked out of DejaVu Serif
Bold by `tools/bakeGlyphs.py` and normalised to a cap height of 1, so size and vertical
aim stay `data/geometry.json`'s to set and no webfont is waited on before the first
frame. `fonts/README.md` carries the licence trail and the rebake commands. `+` and `.`
are authored from that face's stem width and cap height rather than baked, which is why
substituting another face means remeasuring and not just rebaking.

## Palette

Six hues 60 degrees apart — red, yellow, green, cyan, blue, magenta — pulled in off the
pure RGB corners so they sit closer in weight to each other. A cell's background is one of
them; its glyph is a different one. Same list for both, which is why even hue spacing
matters: it is what keeps any ground/ink pair apart. Carried in `data/palette.json`.

Glyph interior and keyline are near-black. Highlight and shadow are separate tuning in
`data/gloss.json`; `RENDER_SPEC.md` says how they are painted.

## The kinds

A glyph has exactly one kind, and the kinds are exported by name from `src/board.js`.
Four families:

| Family | Kinds | What they do to the board |
|---|---|---|
| **Inert** | `''` | nothing. Matching is the whole of it |
| **Shove** | `pulse`, `pushUp`, `pushRight`, `pushDown`, `pushLeft` | advance a line by one — all four for a pulse, the one it names for a push |
| **Sink** | `anchor`, `sink` | an anchor swallows a line's front glyph where it stands; a sink kills its own cell and pulls all four arms into the hole |
| **Rearrange** | `swapOrth`, `swapDiag`, `rotate`, `rotateRev` | move pieces between cells without a line, and without consuming any |

Shove and sink run through the same machinery: a pull is a shove aimed the other way, so
to draw an arm inward it is the far end that gets shoved. The rearrangers do not touch it
at all — an exchange or a turn moves pieces directly and consumes none of them, where a
shove eats the front of its line unless the line ends on a live empty cell. What a
rearranger moves can still land on its own colour and activate, so it chains without
paying for the chain.

An anchor is an ordinary piece and not furniture: one standing on its own colour matches,
activates, and its cell goes like any other.

`ABCDE` with a sink at `C`: the sink's cell dies, `B` and `D` are eaten falling inward,
and `A` and `E` are drawn one step toward the centre — leaving `. A x E .`. Pinned in
`tests/board.test.js` alongside the ABCD anchor case.

### Why nothing is random at resolution time

A piece whose ability picked its own outcome would leave an authored board with no fixed
best line, and the trap generator in `tools/trapBoards.js` would be annealing toward a
number that is not a property of the board. Every ability therefore resolves the same way
every time. Randomness belongs to the deal — seeded, reproducible from a level's seed —
and never to a swap. `tools/swapBudget.js` and `tools/trapBoards.js` take `--rotators` as
the knob for the rearranger that touches the most cells without shoving.

## Swap-budget results

Measured by `tools/swapBudget.js` — 5x8, 120 levels per row, greedy play, half the glyphs
shoving all four ways and an eighth of them eating what is shoved in (`--pushers 0.5
--blockers 0.125`). Every figure below is a sample, so re-running a sweep moves it by a
decimal or two; the shape of each column is the result, not its last digit.

**Any two cells:**

| Colors | Per swap | Cascade | Deepest | 3 swaps | 6 swaps | 10 swaps | Left of 40 |
|---|---|---|---|---|---|---|---|
| 3 | 2.3 | 1.37 | 2.71 | 10.3 | 17.1 | 22.6 | 17.4 |
| 4 | 2.1 | 1.27 | 2.35 | 8.5 | 15.3 | 21.5 | 18.5 |
| 5 | 2.0 | 1.22 | 2.30 | 8.3 | 14.7 | 20.5 | 19.5 |
| 6 | 1.9 | 1.19 | 2.12 | 7.8 | 14.1 | 19.5 | 20.5 |
| 8 | 1.8 | 1.15 | 2.02 | 7.3 | 13.1 | 17.9 | 22.1 |

The sections below this one were measured when a swap could only exchange orthogonal
neighbors, and they say so where it matters. Lifting that restriction roughly doubles a
palette's per-swap yield without moving cascade depth much — the board opens faster
because a useful pair is always reachable, not because chains got longer. Re-run any of
them with `node tools/swapBudget.js` to bring a figure forward.

### Eaters are a brake, not an accelerator

Sweeping the eater fraction at six colors, neighbor swaps:

| Eaters | Cascade | Deepest | 6 swaps | 10 swaps |
|---|---|---|---|---|
| 0% | 1.33 | 2.31 | 10.8 | 13.2 |
| 6.2% | 1.29 | 2.21 | 10.4 | 13.2 |
| 12.5% | 1.19 | 2.02 | 9.8 | 13.2 |
| 25% | 1.11 | 1.75 | 9.6 | 13.3 |
| 50% | 1.02 | 1.20 | 8.5 | 12.6 |

An eater destroys material mid-line that would otherwise have travelled on and possibly
matched, so chains get shorter as eaters get commoner. What it does **not** change is the
level total: 13.2 cleared at ten swaps whether there are no eaters or a quarter of them.
Eaters redistribute the clearing rather than reducing it — they slow the opening (6.0 at
three swaps versus 7.3 with none) and the level catches up later.

Past 25% they start costing real yield. Around 12.5% the cost is a fifth of the cascade
depth for nothing off the total, which is where the anchor share in `data/rules.json`
sits.

### The edge rule is what makes combos work

Letting a shoved glyph fall off the board roughly triples the chaining. On a six-color
neighbor-swap board, cascade depth goes from 1.05 to **1.38** and the deepest combo in a
level goes from 1.42 to **2.51** steps.

The mechanism: a shove needs an opening, and previously the only openings were dead cells,
which pushers shove *away* from. An open edge means every shove moves something, so the
board starts loosening from the first swap instead of staying locked until holes
accumulate.

### The budget has a ceiling now

Because glyphs leave the board by being shoved off it as well as by activating, a level
runs out of material. On a six-color neighbor-swap board:

| Swaps | Cells cleared | Gained per swap in that band |
|---|---|---|
| 1–3 | 7.6 | 2.5 |
| 4–6 | +3.8 | 1.3 |
| 7–10 | +2.4 | 0.6 |

Swaps seven through ten add 2.4 cells between them. **Six is where the curve flattens** —
past that the board is too thin to reward another move.

### Two colors collapses the game

At two colors a glyph is by definition the opposite of its own background, so a swap
between two cells activates **both** if their backgrounds differ and **neither** if they
match. Verified across 200 boards: every neighbor swap is a double hit exactly when the
two backgrounds differ. The glyph layer carries no information at spawn — the player reads
backgrounds only.

It shows in the choice count. Openings on a fresh board and how many are double hits:

| Colors | Openings | Double | Single | % double |
|---|---|---|---|---|
| 2 | 33.3 | 33.3 | 0.0 | 100% |
| 3 | 33.3 | 11.2 | 22.1 | 34% |
| 4 | 27.8 | 5.6 | 22.2 | 20% |
| 5 | 23.5 | 3.4 | 20.1 | 14% |
| 6 | 19.7 | 2.2 | 17.5 | 11% |
| 8 | 15.2 | 1.1 | 14.1 | 7% |

Two colors offers 33 openings and every one is maximally good. Three colors offers the
same 33 openings but only a third are double hits, so ranking them starts to matter.

Three is also where the front-loading is worst: 12.7 of the level's 18.4 total lands in
the first three swaps. Below four colors the level is effectively over before the budget
is spent.

### Palette as the difficulty curve

Neighbor swaps, six-swap level: three colors clears 17.2, four clears 14.2, five clears
12.1, six clears 11.2, eight clears 9.1, twelve clears 7.4. Palette size sets the score
target; the swap budget stays fixed.

## Trap board generation

`tools/trapBoards.js` generates boards where the obvious swap is the wrong one.

A player cannot simulate a cascade in their head. What they can see is a swap's
*immediate* payoff — does it land one glyph on its color, or two? A board is a trap when
that visible ranking misleads. Three measurements over every legal swap:

| | |
|---|---|
| **best** | activations from the best swap, cascade included |
| **lure** | activations from the swap with the highest *visible* payoff — what a greedy read picks |
| **median** | activations from a typical productive swap |

and the objectives built from them: **deception** = best − lure, **spread** = best −
median (both differences, not totals), **solvers** = how many swaps reach 80% of best
(1 is a clean puzzle).

Simulated annealing over single-cell mutations — background color, glyph color, or the
cell's kind, drawn from the mix the run was given plus inert. Boards failing the
minimum-payoff gate are penalized rather than discarded so the search can walk through
them.

### It works, and easily

Six colors, 2500 annealing steps, three boards in a row:

Cells cleared, out of 40, at 12.5% eaters:

| Board | Best line | Greedy pick | Typical swap | Ratio | Solvers | Productive swaps |
|---|---|---|---|---|---|---|
| 1 | 29 | 2 | 1 | 14.5x | 1 | 245 |
| 2 | 26 | 2 | 1 | 13.0x | 1 | 228 |
| 3 | 22 | 2 | 1 | 11.0x | 1 | 251 |

Opening the board up did not cost the generator its teeth. With every pair legal there are
around 240 productive swaps to keep unproductive rather than around 33, and the search
still lands a single solver every time.

*Deception* and *spread* in the tool's output are differences, not totals — a best of 30
against a greedy pick of 2 is a deception of 28.

Median 1 on every board: outside the intended line, a swap clears exactly the cell the
player aimed at. Lure and line are *visually indistinguishable* — both show two matches,
one clearing 2 and the other twenty-odd.

`--target` caps how much a bigger cascade keeps helping, so the search aims for a chosen
size instead of running away to clearing the whole board. At `--target 12` on six colors:
best line 14 against a greedy pick of 2 and a typical swap of 1, still one solver.

## Measured under a retired engine

The figures in this section were taken on an engine that had four kinds — named push,
block, void and wild — behind sixteen drawings. That engine is gone; the kinds above
replaced it. These are **costs measured under it, not rules**: nothing here is current
policy and nothing here is a reason to refuse a change. Re-run `tools/swapBudget.js` to
bring any of it forward.

### Void and wild were texture, not throughput

Swapping a quarter of the pushers out for voids and wilds barely moved the numbers. Six
colors, neighbor swaps, 200 levels per row:

| Mix | Cascade | Deepest | 6 swaps | Left of 40 |
|---|---|---|---|---|
| 12.5% eat, 50% push | 1.20 | 2.06 | 9.9 | 26.9 |
| + 12.5% void | 1.20 | 2.04 | 9.8 | 27.3 |
| + 12.5% wild | 1.19 | 1.98 | 9.8 | 26.8 |
| + both | 1.17 | 1.95 | 9.7 | 27.1 |
| 12.5% eat, 50% void, no push | 1.15 | 1.89 | 9.2 | 28.1 |

A void moved the same quantity of material as a push, in the opposite direction. What it
changed is *where* material ends up — a void compacts the board inward and opens the rim,
a push does the reverse — which is a tactical difference the aggregate cannot see. That
much still describes what `sink` does against a pulse.

### A sink upgrade that also kills the squares it empties

Never implemented — `src/board.js`'s `sink` kills its own cell and no other. Under a
clear-N goal it measured as a large upgrade and a legible one, since the rim visibly
collapses. 250 levels, 25% voids, six colors:

| Void | Activations | Cells gone |
|---|---|---|
| base — pulls, leaves the outer cell empty | 10.1 | 10.1 |
| upgraded — the emptied squares die too | 10.0 | **14.9** |

Note where the gain is. The upgrade does not help you *match* anything; activations go
slightly down. It converts emptied squares straight into cleared cells, which is the
objective.

A further tier that pulled new glyphs in from off-board was measured and dropped. It did
not punish the player — a void eats four glyphs, glyphs are the fuel, and handing them
back helped: 10.4 cells gone against the base 10.1. Spawning eaters instead barely
differed at 10.2. And an incoming glyph that can never activate is just an eater, so the
mechanic collapses into eater density — a dial that already exists at level-authoring
time, as `mix` in `data/levels.json`.

### What an emptied square vanishing would cost

An alive-but-empty cell is the only ending where a shove line advances without eating its
front glyph; every other ending — edge, dead cell, eater — costs one. That is still true
of `shove()`, and it is why an emptied square cannot simply vanish. Over 200 levels of
the retired engine, shove lines ended on an empty cell **17.2%** of the time, so a rule
that killed emptied squares would have taxed roughly a sixth of every pusher's work.

### The inflow pool

A weighted per-level bag of glyph kinds, drawn from when a void's pull left a rim cell
vacant. Designed and measured against the retired engine and **never implemented** —
nothing in `src/` or `data/` carries it. What survives is the constraint it was designed
around: an incoming piece must be generated so it cannot land pre-matched, or the
board's best line stops being a property of the board.

## Files

| | |
|---|---|
| `SPEC.md` | this file — rules, glyph grammar, measurements |
| `RENDER_SPEC.md` | how to draw a glyph: geometry and paint order |
| `src/board.js` | board, shove, settle, swap resolution — the rules themselves |
| `src/level.js` | greedy measurement, the target policy, dealing a board |
| `src/levels.js` | the shipped run: acts, level specs, win and loss |
| `src/progress.js` | what the player has finished, and how well |
| `src/picker.js` | the level sheet, one fold per act |
| `src/glyphShapes.js` | what to draw for one glyph, as pure functions |
| `src/render.js` | the compositor layers that paint a board to canvas |
| `src/animate.js` | folding a resolved settle back into phases you can watch |
| `src/main.js` | canvas, pointer and data loading — the only browser-facing module |
| `data/` | rules, palette, glyph geometry, gloss, the baked letterforms, the twelve glyphs, the level pack, stage factors, animation timings, the example board |
| `tools/swapBudget.js` | palette and budget sweeps |
| `tools/trapBoards.js` | trap generation, `--json` to dump boards |
| `tools/boardShapes.js` | what board size and palette size do to the same dial |
| `tools/makeLevels.js` | builds `data/levels.json` from the run in `docs/teaching.html` |
| `tools/bakeGlyphs.py` | cuts `data/glyphPaths.json` out of the face; `--check` fails if it is stale |
| `LEVELS.md` | the shipped run as a list |
| `fonts/` | the licence trail for the baked letterforms. No font ships |
| `dev/` | browser pages that tune `data/geometry.json`, `data/gloss.json` and `data/animation.json` |
| `tests/` | `node --test`; `exampleBoard.test.js` also fails if `docs/trapping.html`'s embedded board has drifted from `data/example_board.json` |
| `docs/specimen.html` | the specimen plate the render spec was locked against |
| `docs/trapping.html` | writeup of how trap boards are generated |
| `docs/teaching.html` | the run: every mechanic introduced in dependency order, and the target policy |
| `docs/board-size.html` | why the board is 5x8, and what every other shape would have cost |

## Settled so far

| | |
|---|---|
| Board | 5 wide, 8 tall. The wide tie pool that comes with total reach is a weighed and accepted cost, not an oversight — `docs/board-size.html` has what every other shape would have cost |
| Swap | any two live cells exchange pieces — colour, ability and drawing together |
| Match | glyph lands on its own color → activates → cell gone |
| Movement | no gravity, no refill; shoves chain down a line |
| Sinks | edge, dead cell, eater — each eats the front of the line, rest advance |
| Swap budget | 6, held fixed across a run. It was chosen where the yield curve flattened under neighbour swaps; with total reach on this board the curve keeps paying past twelve, so six is now a choice rather than a measured floor |
| Palette size | the difficulty curve once pushers are on the board. With no pushers and total reach it stops mattering — a double hit is always somewhere |
| Palette | six hues 60 degrees apart — three primaries, three secondaries, off the pure corners |
| Level goal | clear N cells in X swaps, both precomputed with margin |
| Glyph set | twelve, one deterministic ability each. Roman letters, turned or mirrored |
| Determinism | a swap's outcome is fixed. Randomness is in the seeded deal only |
| Drawing | baked SVG paths ship with the game; no font, no webfont |

Still open: the scoring formula itself (cells cleared is the objective; whether cascades
carry a multiplier is undecided), and whether a glyph is ever upgraded across a run. The
run is designed in `docs/teaching.html` and generated from it.
