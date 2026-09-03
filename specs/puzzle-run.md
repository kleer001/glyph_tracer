# The puzzle run

Act I is a run of authored puzzles on small frames. Every level carries a board and has a
right answer: inside a swap allowance of one, two or three, one line of swaps activates
more than any other, and only that one reaches the level's target. There is no undo — when
the allowance is spent, a tap restarts the level.

Dealt boards leave the numbered run. They stay in `src/` and become the endless act,
which is a separate piece of work.

## The shape

Nine lessons, one per glyph family, five levels each — forty-five levels.

| # | Lesson | Family | Frame | Allowance |
|---|---|---|---|---|
| 1 | the match, and total reach | inert | 4x4 | 1 |
| 2 | the pushes | `A` at four turns | 4x4 | 1 |
| 3 | the pulse | `O` | 4x4 | 1 |
| 4 | the anchor | `H` | 4x5 | 1 |
| 5 | the bars | `\|` `-` | 4x5 | 1 |
| 6 | the cross | `+` | 4x5 | 2 |
| 7 | the corners | `/` `\` `X` | 5x5 | 2 |
| 8 | the ring | `r` and its mirror | 5x5 | 2 |
| 9 | the sink | `S` | 5x5 | 3 |

The four pushes are one lesson, not four: they differ only in the turn of one drawing.
The ring pair and the three corner swaps collapse the same way. The bars have no diagram
yet, and an act cannot ship without a level in it — the picker reads its first one — so
that act appears when its first board does.

Five slots inside a lesson, in order:

1. **the diagram** — one legal move, the ability and nothing else
2. **a puzzle** — the family alone, on a board that can be read
3. **a puzzle** — the family alone, on a board that misleads
4. **a combination** — this family and one learned earlier
5. **a combination** — this family and two learned earlier

A level may carry any glyph from its own lesson or an earlier one, and carries only what
its puzzle needs. Combinations across the whole set, with no whitelist at all, are a
later act rather than the tail of this one.

## Frames are shapes, not fills

A frame is the grid a puzzle is drawn in; dead cells carve the shape out of it. What
governs how readable a board is, and how large its search is, is the live-cell count —
a 5x5 frame holding eleven live cells offers 55 pairs against the full grid's 300.

| Slot | Live cells |
|---|---|
| diagram | 2–6 |
| solo puzzle | 6–10 |
| combination | 10–16 |

The frame grows for reach: a pulse, a ring or a sink needs its glyph at least one cell
from every edge, and a 4x4 has only four such cells.

## What a level is

A level carries `id`, `teaches`, `board`, `target`, `budget` and its note. Nothing else:
`width`, `height`, `colors`, `seed` and `factor` belong to a dealt board and go with
them, and an act keeps `id`, `no` and `name` while `mix` and `means` go.

`target` is what the answer activates. That is not how much of the board went away: a
piece shoved into a sink leaves without ever landing on its own colour, and the counter
never sees it. It stays authored, and `outcome()` already reads it.

`loadRun` already branches on whether a level carries a board, and already accepts a
per-level `budget`. `statusFor` and `advance` in `src/main.js` already restart a lost
level on a tap. The pack changes; the code that reads it does not.

## The authoring tool

`tools/puzzleBoards.js`. It takes a hand-placed layout and finds the colouring that
turns it into a puzzle.

**Input**: `--layout`, one character per cell — a glyph's `mark`, `_` for a live cell with
nothing on it, `#` for a cell off the board — plus `--colors`, `--swaps` and `--iters`.
There is no whitelist flag: the layout is the whitelist, since a lesson can only be taught
with the glyphs it has placed.

**Search**: grounds and inks only. Where the pieces sit is the author's statement of what
the lesson is about, and a search that moved them would erase it. `grow` in
`tools/maxCombo.js` already repaints grounds and keeps a layout; this extends it to inks
and to a whitelist.

**Objective**, in order of weight:

1. the best line within the allowance activates as much as possible
2. exactly one opening swap reaches it
3. the swap with the highest *immediate* payoff falls short of it

The third is what makes a level hard on a small board. Size can be brute-forced by a
patient player; a lure that pays two and fizzles cannot. `tools/trapBoards.js` already
scores that gap as `deception` and already penalises more than one solver.

**Constraint**: no piece may start on its own colour. `loadRun` refuses such a board, and
a board that opens already fired teaches nothing.

**Cost**: the search is exact, and only the last swap of a line is restricted to swaps
that score — one that lands nothing adds nothing, and is the same as stopping early. Every
earlier swap is unrestricted, because setting a piece up before firing it is a move. On a
sixteen-cell board one swap is a few hundred settles per candidate colouring; two is about
seventeen milliseconds an iteration. `--iters` is the knob.

**Output**: rows in `parseBoard` format, ready to paste into the pack.

## What would prove it done

- `node tools/makeLevels.js` reports every level winnable, and for every puzzle exactly
  one swap that reaches the target
- one lesson plays end to end in the browser, diagram through both combinations
- `tests/levels.test.js` holds every shipped level to exactly one answer

## Rulings this touches

- **Six swaps a level, held fixed** stops describing Act I, which states an allowance per
  level.
- **The board is 5x8 at six colours** was measured over dealt boards, and the numbers that
  rejected 4x4 — a 1.37 deepest cascade, a 1.19 shove runway, 0.66 wasted turns — are
  properties of a random deal. An annealed board is not drawn from that distribution. The
  study stands as an argument against dealing small boards, which the endless act still
  does.
- Published pages under `docs/` are dated snapshots. `docs/teaching.html` describes a run
  that this replaces and is not edited to match; a new page is written when the act plays.
