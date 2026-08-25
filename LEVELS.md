# LEVELS — Glyph Tracer

Index of the shipped run. **The levels themselves live in
[`data/levels.json`](./data/levels.json)** — every seed, target and board mix. This file is
not a second copy of them; it is the list.

Nothing here says what the pieces do. That is `src/board.js`, and it moves.

The run is generated from [`docs/teaching.html`](./docs/teaching.html), which is where it is
designed and why each level sits where it does. Change the run there and rebuild:

```sh
node tools/makeLevels.js --write
```

Every seed is a board greedy play clears the target on, so no level ships unwinnable — a
test re-proves that for all of them on every run. A level's **target** is the measured mean
yield for its configuration times its **factor**, and the factor is the difficulty curve.

**Stars are swaps left over**, not cells cleared: a level ends the moment its target is met,
so what separates a good run from a bare pass is how much of the budget was still in hand.
Three for two or more swaps spare, two for one, one for finishing at all.

### Act I — The match

Levels 01–05 · 0% pushers · 0.0% eaters · 6 swaps

| Level | Colors | Teaches | Factor | Target |
|---|---|---|---|---|
| 01 | 2 | A glyph on its own color activates | 0.33 | 4 |
| 02 | 2 | You move glyphs, not cells | 0.42 | 5 |
| 03 | 2 | Any two cells swap — the whole board is in reach | 0.50 | 6 |
| 04 | 3 | A swap can miss | 0.55 | 7 |
| 05 | 4 | The cell is gone; the board drains, and the budget bites | 0.67 | 8 |


### Act II — The shove

Levels 06–13 · 50% pushers · 0.0% eaters · 6 swaps

| Level | Colors | Teaches | Factor | Target |
|---|---|---|---|---|
| 06 | 4 | Activating shoves its neighbors | 0.62 | 11 |
| 07 | 4 | A shoved glyph can activate — the combo | 0.72 | 12 |
| 08 | 4 | A glyph shoved off the edge is gone | 0.80 | 14 |
| 09 | 4 | A shove leaves an empty cell — and you can move into it | 0.88 | 15 |
| 10 | 5 | Side count is the verb — circle radiates, triangle points | 0.80 | 13 |
| 11 | 5 | Rotation is the direction | 0.88 | 14 |
| 12 | 5 | Fill is magnitude — how far it shoves | 0.95 | 15 |
| 13 | 5 | Nothing — first real test | 1.05 | 17 |


### Act III — The sink

Levels 14–20 · 50% pushers · 12.5% eaters · 6 swaps

| Level | Colors | Teaches | Factor | Target |
|---|---|---|---|---|
| 14 | 5 | The square eats what is shoved into it | 0.88 | 13 |
| 15 | 5 | The eater takes the front of the line | 0.96 | 14 |
| 16 | 6 | Feeding an eater on purpose | 0.92 | 13 |
| 17 | 6 | The inner mark is targeting — ⊞ orthogonal, ⊠ diagonal | 1.02 | 14 |
| 18 | 6 | Nesting is range — it acts at distance two | 1.02 | 14 |
| 19 | 6 | ⊘ Void pulls its four neighbors inward | 1.02 | 14 |
| 20 | 6 | Pulling on purpose — compacting the rim | 1.12 | 16 |


### Act IV — The haystack

Levels 21–25 · 50% pushers · 12.5% eaters · 6 swaps

| Level | Colors | Teaches | Factor | Target |
|---|---|---|---|---|
| 21 | 6 | Thirty moves show two matches; one of them pays | 1.02 | 14 |
| 22 | 6 | The greedy read costs you | 1.12 | 16 |
| 23 | 8 | The palette opens | 1.06 | 14 |
| 24 | 8 | The winning move looks worse | 1.18 | 15 |
| 25 | 8 | Nothing — the full set, unassisted | 1.29 | 17 |
