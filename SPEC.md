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

A glyph's ability is readable from its drawing. Six primitives:

| Primitive | Reads as | Encodes |
|---|---|---|
| Side count | how the form relates to a 4-grid | the **verb** |
| Fill | hollow → half → solid | **magnitude** — how many cells it shoves, 1 / 2 / 3 |
| Inner mark | dot, cross, X, slash | **targeting** |
| Nesting | shape inside itself | **range** (skips to distance 2) |
| Rotation | which way it points | **direction** |
| Closure | closed vs open arc | effect **stops here** vs **carries to the next swap** |

Side count is load-bearing. A square agrees with the grid's 4-fold symmetry, so it
holds. A triangle has an odd count and a point, so it pushes. A pentagon cannot agree
with anything orthogonal, so it disrupts. A hexagon tessellates, so it flows. A circle
has no sides, so direction is meaningless to it and it radiates. This does not need
teaching; it is how the shapes already behave.

Because the grammar is compositional, new glyphs need no new rules — only new
combinations. Ship 16; the rest is the upgrade pool.

## The 16

Unicode codepoints are the **drawing reference**, not the render path. A glyph is
generated from its form, fill, mark and rotation (see Rendering).

### A — Circle / RADIATE (all 8 neighbors, no direction)

| Glyph | Code | Name | Effect |
|---|---|---|---|
| ○ | U+25CB | Pulse | nudge all neighbors, mag 1 |
| ● | U+25CF | Detonate | mag 3, consumes self |
| ⊙ | U+2299 | Charged | fires twice |
| ◎ | U+25CE | Echo | fires at range 2, skips the adjacent ring |

### B — Square / EAT (agrees with the grid; stability)

| Glyph | Code | Name | Effect |
|---|---|---|---|
| □ | U+25A1 | Anchor | eats one glyph shoved into it, then behaves normally |
| ■ | U+25A0 | Wall | eats everything shoved into it, indefinitely |
| ⊞ | U+229E | Bind orthogonal | makes the 4 edge-neighbors eaters |
| ⊠ | U+22A0 | Bind diagonal | makes the 4 corner-neighbors eaters |

### C — Triangle / PUSH (apex = direction)

| Glyph | Code | Name | Effect |
|---|---|---|---|
| △ | U+25B3 | Push up | 1 cell |
| ▷ | U+25B7 | Push right | 1 cell |
| ▼ | U+25BC | Slam down | mag 3 |
| ◬ | U+25EC | Double push | pushes, then pushes again |

### D — Odd forms / OPERATORS

| Glyph | Code | Name | Effect |
|---|---|---|---|
| ◇ | U+25C7 | Swap | exchange with any one neighbor |
| ⬠ | U+2B20 | Wild | pushes a random one of the 16 subsets of its four neighbors |
| ⬡ | U+2B21 | Flow | the next match is free — it does not spend a turn |
| ⊘ | U+2298 | Void | pulls its four neighbors inward; its own cell is the sink they fall into |

Open-form candidates if visible carry-over markers are wanted later: ◠ U+25E0, ◡ U+25E1.

## Rendering

Color roles, four-layer paint order, magnitude clips, mark geometry and n-gon offsets
live in `RENDER_SPEC.md`. `src/glyphShapes.js` implements that geometry and
`src/render.js` paints it to canvas. `docs/specimen.html` is the plate — all 108 shape
combinations on a fixed pair.

## Palette

Six hues 60 degrees apart — red, yellow, green, cyan, blue, magenta — pulled in off the
pure RGB corners so they sit closer in weight to each other. A cell's background is one of
them; its glyph is a different one. Same list for both, which is why even hue spacing
matters: it is what keeps any ground/ink pair apart. Carried in `data/palette.json`.

Glyph interior and keyline are near-black. Highlight and shadow are separate tuning in
`data/gloss.json`; `RENDER_SPEC.md` says how they are painted.

## The four moving kinds

A glyph has exactly one kind. Only three of them move anything, and all three run through
the same shove-and-sink machinery — a pull is a shove aimed the other way, and a wild is a
push over a random subset.

| Kind | Glyphs | Effect |
|---|---|---|
| **push** | ○ ● ⊙ ◎ △ ▷ ▼ ◬ | shoves each of its four orthogonal neighbors one cell outward |
| **void** | ⊘ | pulls those four inward. Its own cell dies first, and that hole is the sink each arm runs into: the glyph nearest the centre is eaten and the rest of the arm advances one. Upgradable — see below |
| **wild** | ⬠ | pushes a random one of the 2⁴ = 16 subsets of its four directions — including all four, and including none |
| **block** | □ ■ ⊞ ⊠ | shoves nothing; eats whatever is shoved into it and stays put |

`ABCDE` with a void at `C`: the void's cell dies, `B` and `D` are eaten falling inward,
and `A` and `E` are drawn one step toward the centre — leaving `_ A × E _`. Verified in
`src/board.js`'s self-test alongside the ABCD eater case.

### They are texture, not throughput

Swapping a quarter of the pushers out for voids and wilds barely moves the numbers. Six
colors, neighbor swaps, 200 levels per row:

| Mix | Cascade | Deepest | 6 swaps | Left of 40 |
|---|---|---|---|---|
| 12.5% eat, 50% push | 1.20 | 2.06 | 9.9 | 26.9 |
| + 12.5% void | 1.20 | 2.04 | 9.8 | 27.3 |
| + 12.5% wild | 1.19 | 1.98 | 9.8 | 26.8 |
| + both | 1.17 | 1.95 | 9.7 | 27.1 |
| 12.5% eat, 50% void, no push | 1.15 | 1.89 | 9.2 | 28.1 |

A void moves the same quantity of material as a push, in the opposite direction; a wild
moves half as much on average. What they change is *where* material ends up — a void
compacts the board inward and opens the rim, a push does the reverse — which is a tactical
difference the aggregate cannot see.

### Void has two states, not three

An upgraded void also **destroys the squares its pull empties**. Under a clear-N goal that
is a large upgrade and a legible one — you watch the rim collapse. 250 levels, 25% voids,
six colors:

| Void | Activations | Cells gone |
|---|---|---|
| base — pulls, leaves the outer cell empty | 10.1 | 10.1 |
| upgraded — the emptied squares die too | 10.0 | **14.9** |

Note where the gain is. The upgrade does not help you *match* anything; activations go
slightly down. It converts emptied squares straight into cleared cells, which is the
objective.

A third tier that pulls new glyphs in from off-board was considered and dropped. It does
not punish the player — a void eats four glyphs, glyphs are the fuel, and handing them
back helps: 10.4 cells gone against the base 10.1. Spawning eaters instead barely differs
at 10.2. And an incoming glyph that could never activate is just an eater, which the
square family already provides, so the mechanic collapses into eater density — a dial that
already exists at level-authoring time:

| Eaters | Cascade | 6 swaps | Cells gone |
|---|---|---|---|
| 0% | 1.35 | 11.0 | 13.6 |
| 12.5% | 1.20 | 9.9 | 13.1 |
| 25% | 1.13 | 9.3 | 12.8 |
| 50% | 1.05 | 8.6 | 12.6 |

Eaters are ordinary glyphs, incidentally — one sitting on its own color activates and
clears like anything else. They absorb shoves; they are not permanent furniture.

### What an emptied square vanishing would cost

Tempting as a global rule, and it would collapse the two void states into one. The price:
an alive-but-empty cell is the only ending where a shove line advances without eating its
front glyph. Every other ending — edge, dead cell, eater — costs one. Over 200 levels,
shove lines end on an empty cell **17.2%** of the time, so the rule would tax roughly a
sixth of every pusher's work. Measured, not forbidden.

### The inflow pool

*Designed and measured this session; **not implemented**. The numbers below come from a
scratch subclass of `Board`, not from `src/board.js`.*

When a void's pull reaches the board rim the arm's outer cell is left vacant. A level
carries a **pool** — a weighted, infinite bag of glyph kinds — and that vacancy draws from
it. The pool is a level property, authored rather than chosen by the player.

**Only void arms draw from it.** Pushes shove glyphs off the edge constantly; if every rim
vacancy refilled, demand runs 6.4–7.3 draws per six-swap level and barely moves with the
board mix, so the pool empties on schedule no matter how the player plays. Restricted to
void arms, demand tracks what the player actually does:

| Board mix | Void arms only | Every rim vacancy |
|---|---|---|
| no voids | 0.0 | 6.6 |
| 12.5% void | 1.8 | 6.4 |
| 25% void | 3.1 | 7.3 |
| 50% void, no push | 6.1 | 6.1 |

**It does not break authoring.** This was the worry, since random inflow is what disqualifies
wild glyphs. It does not apply: an incoming glyph is generated so it can never land
pre-matched, so it cannot activate in the cascade that summoned it. The randomness lands
*between* moves rather than inside one. An annealed board with a 28-cell best line and a
single solver, re-scored 30 times with the pool live, returned 28 and 1 every time — no
movement at any pool weighting.

That invariant is doing double duty: it keeps every activation player-caused, and it is
what makes the pool safe for `tools/trapBoards.js`. Dropping it costs both at once, which
is worth knowing before it goes.

**The pool sets kind, not color.** Colour is still derived from the cell the glyph lands
on, which is what guarantees the no-pre-match rule. Weighting colours as well would be a
second and blunter dial; deliberately left unspecified.

The pool is where the progression layer lives: weight it toward pushers and the rim
re-arms, toward eaters and the player's own voids clog their edges. A curse the player
loads themselves.

### What a wild costs an authored board

A wild has no fixed outcome, so a board carrying one has no fixed best line. Scoring one
board 25 times with wilds at 25% of glyphs, the best line moves between 24 and 25 cells and
the solver count swings between 1 and 3 — the trap generator would be optimizing a number
that is not a property of the board. At 12.5% it held still across those runs, but by luck
rather than guarantee.

`tools/trapBoards.js` says as much when `--wilds` is non-zero. Generated and endless play
never needed a fixed answer, so a wild costs nothing there.

## Swap-budget results

Measured by `tools/swapBudget.js` — 5x8, 120 levels per row, greedy play, 50% of glyphs push
and 12.5% eat. Every figure below is a sample, so re-running a sweep moves it by a
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

Past 25% they start costing real yield. Around 12.5% — which is what the square family
would give at two glyphs in sixteen — the cost is a fifth of the cascade depth for
nothing off the total.

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

Simulated annealing over single-cell mutations — background color, glyph color, or whether
that glyph pushes or eats. Boards failing the minimum-payoff gate are penalized rather than
discarded so the search can walk through them.

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
| `src/glyphShapes.js` | the render spec's geometry, as pure functions |
| `src/render.js` | the compositor layers that paint a board to canvas |
| `src/animate.js` | folding a resolved settle back into phases you can watch |
| `src/main.js` | canvas, pointer and data loading — the only browser-facing module |
| `data/` | rules, palette, gloss, the 16 glyphs, the level pack, stage factors, animation timings, the example board |
| `tools/swapBudget.js` | palette and budget sweeps |
| `tools/trapBoards.js` | trap generation, `--json` to dump boards |
| `tools/boardShapes.js` | what board size and palette size do to the same dial |
| `tools/makeLevels.js` | builds `data/levels.json` from the run in `docs/teaching.html` |
| `LEVELS.md` | the shipped run as a list |
| `dev/` | browser pages that tune `data/gloss.json` and `data/animation.json` |
| `tests/` | `node --test`; `exampleBoard.test.js` also fails if `docs/trapping.html`'s embedded board has drifted from `data/example_board.json` |
| `docs/specimen.html` | the 108-combination glyph plate |
| `docs/trapping.html` | writeup of how trap boards are generated |
| `docs/teaching.html` | 25-level structure introducing every mechanic in dependency order |
| `docs/board-size.html` | why the board is 5x8, and what every other shape would have cost |

`ABILITIES.md` is referenced by neither the code nor the tests; the sixteen abilities
are tabulated above and carried as data in `data/glyphs.json`.

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
| Level goal | score target |

| Level goal | clear N cells in X swaps, both precomputed with margin |
| Void | two states: base, and an upgrade that also kills the squares it empties |
| Inflow | a per-level weighted pool, drawn from by void arms at the rim |

Still open: the scoring formula itself (cells cleared is the objective; whether cascades
carry a multiplier is undecided), and how the pool is earned across a run. Level structure
for the base rules is drafted in `docs/teaching.html`; the inflow pool is specified above
but not built.
