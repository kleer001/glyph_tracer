# Glyph Tracer

Swap any two glyphs on the board. One that lands on its own color activates, fires its
ability, and takes its cell off the board.

A 5-wide by 8-tall grid of colored cells, each carrying a glyph in a different color
from the same palette. Backgrounds are fixed terrain; glyphs are the pieces that move.
No gravity and no refill — the board drains over a level, and the only thing that
chains is the ability layer. A glyph's ability is readable from its drawing: side count
is the verb, fill is the magnitude, the inner mark is the targeting, nesting is the
range.

A browser game raised in [Trace ROM Studio](https://github.com/kleer001/trace_rom_studio).
Vanilla JS, ES modules, no build step.

## Play it

**[▶ Launch Glyph Tracer](https://kleer001.github.io/glyph_tracer/)**

Runs straight from GitHub Pages — no install, no build. Progress is kept in the
browser's localStorage, so it stays on the machine you played it on.

## Run it locally

```sh
./run.sh          # serves http://localhost:8000, no-cache
./run.sh 9000     # pick a port; it scans upward if that one is busy
```

Open the URL it prints. Don't open `index.html` from the filesystem — ES modules,
`fetch` and relative paths all behave differently under `file://`.

```sh
npm test          # node --test
```

## The tools

Both run on the same engine the game does, so a rule change shows up in the numbers
without being restated anywhere.

```sh
node tools/swapBudget.js                 # palette and budget sweeps
node tools/swapBudget.js --colors 4 6 8 --trials 300
node tools/trapBoards.js --target 12     # generate a board where the obvious swap is wrong
node tools/trapBoards.js --json out.json
node tools/boardShapes.js --curve     # what board size and palette size trade off
node tools/puzzleBoards.js --layout '....,.O..,....,....'   # colour a layout into a puzzle
node tools/makeLevels.js              # check every shipped level has exactly one answer
```

## Layout

- `index.html` / `styles.css` — the page and the look.
- `src/` — `board.js` is the rules, `levels.js` the shipped run, `level.js` the greedy
  measuring stick and the drawing a piece wears, `glyphShapes.js` and `render.js` the
  drawing, `animate.js` the playback, `progress.js` and `picker.js` the run's chrome,
  `main.js` the only module that touches a browser.
- `data/` — rules, palette, the sixteen glyphs, the run, the example board.
- `tools/` — the measurement sweeps, the trap generator and the puzzle builder.
- `dev/` — browser pages for tuning the look and the animation timing.
- `tests/` — `node --test`, no framework.
- `docs/` — the specimen plate, the trap write-up, the level structure, and why the
  board is the size it is.
- `CLAUDE.md` — what this game is and which studio shelf holds what it hasn't needed.
- `.trace_rom_studio.toml` — the studio version this game descends from.
- `LICENSE` — MIT.

## Where it is

Prototype, and playable end to end: forty-five levels in nine acts, one act per glyph
family, a picker that remembers what you have finished, and a star per level for the
swaps you had left over.

Every level is authored and has a right answer — inside its allowance of one swap or
two, one line clears more than any other and exactly one opening reaches it. A lesson
teaches on a 4x4 frame twice and applies it on 5x5 three times. The palette is still
placeholder.
