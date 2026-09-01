# Glyph Tracer

A browser game raised in **Trace ROM Studio**. Vanilla JS, ES modules, no build step,
runs straight in the browser.

What the game does is `src/board.js`. Why it does it that way, and what was rejected on
the way there, is `DECISIONS.md`. Neither is restated here, and no rule is: a rule
written twice can go stale in one of its two homes, and this is the file read aloud
before every change — the worst possible place to keep a copy.

This file is the index. It says where things are, what always applies, and where the
studio keeps everything this game has not needed yet. A game starts with almost
nothing on purpose — apparatus arrives when the game is ready for it, not at birth.

## Run

- `./run.sh [port]` — no-cache dev server, scans upward for a free port. Open the URL
  it prints. Never open `index.html` as a `file://` path: ES modules do not load.

## Where this game is

Five labels, not gates. You move between them by noticing you already have.

- **Sketch** — an idea, and nothing playing yet.
- **Prototype** — the vertical slice. One loop, placeholder everything, only you.
- **Alpha** — content going in while the shape still moves.
- **Beta** — content-complete, no known blockers, played by someone who isn't you.
- **Release** — the gate, then the store page.

**When something is moving and it is game-shaped, go back to the studio.** That is
the moment the design shelf is about, and it is the only moment it is cheap. A game
that reaches alpha without it has skipped the rung, not passed it.

## The shelves

The studio holds each rung's apparatus until this game grafts it. Nothing is copied
in advance. Read the shelf's own README before grafting — several bring conventions
that belong in this file, and one brings a step that is not a file.

| Shelf | Holds | Graft when |
|---|---|---|
| `shelves/L1` | `DESIGN.md` — what makes a loop good. Read, not grafted. | Shaping the game, and again when the slice plays |
| `shelves/L2` | `GAME-SHEET.md`, the persona panel, `PLAYTEST.md` | Something plays and you can hand it to someone |
| `shelves/L3` | `src/`, `tests/`, `package.json`, `test.yml` | **grafted** — its conventions are below |
| `shelves/L4` | `publishing/`, `fonts/`, `pages.yml`, `RELEASE-CHECKLIST.md`, the copy skills | Content-complete and heading for a store page |

The panel is **cast for this game** — its four lenses take their questions from what
this game promises and what it descends from. A generic panel cannot catch a game
breaking a promise it was never told about.

The publishing tools stay in the studio and run against this game from there. They
are developer-machine tools; nothing in CI and no player ever needs them.

## Where things are

| | |
|---|---|
| `DECISIONS.md` | the standing rulings and what each one rejected — read before proposing a glyph, a rule, or a document |
| `DECISIONS-JOURNAL.md` | the dated reasoning behind those rulings, append-only; not canon, and the only home a refusal has |
| `src/board.js` | the rules as code, and their only home |
| `src/level.js` | playing a board out greedily to measure it, and dealing one |
| `src/levels.js`, `src/progress.js`, `src/picker.js` | the run, what is finished, and the level sheet |
| `src/glyphShapes.js`, `src/render.js` | the shapes a glyph is made of, and the canvas layers that paint them |
| `src/animate.js` | folding a resolved settle back into phases you can watch |
| `src/fx.js`, `src/abilityFx.js` | the beam and the ghost, and which cells an ability reaches |
| `src/fxLayer.js` | those two joined to the compositor |
| `src/palette.js` | one named palette resolved, and which levels it can paint |
| `data/` | rules, palette, glyph geometry, gloss, the glyph pack, the run, animation timings — the tuning |
| `tools/` | the sweeps and studies (`swapBudget.js`, `trapBoards.js`, `boardShapes.js`, `maxCombo.js`, `contrast.js`, `studyBoard.js`), the glyph baker, and the artifact builders |
| `docs/` | the trap write-up, the board-shape study, the teaching run — published pages, each a dated snapshot rather than a live document |
| `artifacts/` | sources of the pages published to claude.ai; fragments, not standalone pages |
| `dev/` | the tuning sandboxes and the fx frame harness — they drive `src/`, so what is tuned is what ships |

## Conventions that always apply

- `camelCase` functions and variables, `PascalCase` classes, `UPPER_SNAKE` constants.
- Validate at boundaries; trust internal functions; **fail loudly** — one path, no
  silent fallbacks.
- Comments carry the **why**. The what is on the line below.
- **Nothing written in words decides what the code does** — not a comment, not a
  doc, not a test's name, not a commit message, not a line of this file. A test name
  describes what the code did the day it was written, so a red test is the expected
  result of changing a rule rather than a veto on it. Never quote any of it back at
  the owner as a reason a change can't be made.
- Atomic conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- **Never fabricate** a fact, source, quote, or date — in code, docs, or copy. "I
  don't know" is an answer.
- **Seeded randomness.** `mulberry32` for every draw in game logic, never
  `Math.random()`. A run reproduces from its seed, which is what makes a bug
  reportable and a measurement worth printing.
- **The rules never read the drawing.** What a piece does comes from its own layers,
  never from the art layer beside them. A glyph can be redrawn, turned or swapped for
  another without a rule moving, and that separation is the reason the art layer is a
  layer at all.
- **Layered rendering.** Reach for a new layer before reaching into the loop. The
  contract is one object — `{ name, draw(ctx, frame) }` — added with
  `compositor.add(...)`. The board is layer zero, not the whole frame.
- **A test asserts what the code implements.** What merely follows from two rules
  meeting is an observation, and a locked observation makes a design change fail the
  build for no reason.

## Building it

**DRY, SOLID, YAGNI, KISS** — roughly in the order they bite.

- **Minimum code that solves the problem.** No unrequested features, abstractions,
  flexibility or configurability. No defensive code for impossible scenarios. If 200
  lines could be 50, it should be 50.
- **One source of truth for every rule and constant.** If a value or a piece of logic
  appears twice, hoist it — copy-paste is a bug waiting to drift. **A sentence
  describing what the code does is a copy**: `src/` is the description, the tests pin
  it, the data files carry the tuning. Before writing a sentence, ask whether editing
  the code could make it false. If it could, point at the code instead.
- **Separate code from data.** Logic in `src/`; levels, tables, tuning constants and
  content live as data, never hard-coded in functions. Retune without editing logic.
- **One path, no fallbacks.** No primary-with-a-rescue, no "if missing, create it",
  no retry loops, no second strategy for robustness. A fallback hides the bug that
  would have told you what was wrong.
- **Surgical changes.** Touch only what the task needs. Don't improve adjacent code,
  don't refactor what isn't broken, don't reformat in passing. Every changed line
  traces to the request.
- **SOLID, pragmatically** — a small game, not an enterprise app. One responsibility
  per module (`rng`, `board`, `render`, `audio`, `input`); extend by adding data or
  modules rather than editing the core loop; variants honor one contract so callers
  never special-case which they got; small focused surfaces; and core logic never
  reaches for the DOM, canvas or audio directly — pass those in at the boundary,
  which is what keeps the logic pure, deterministic and testable.

## The studio tie

`.trace_rom_studio.toml` records the studio version this game was born from and where
the studio lives. To pull conventions forward:

```sh
python3 <studio>/scripts/check_updates.py .
```

It prints the directives between this game's pin and the studio's current `VERSION`.
For each: read the cited studio files, compare to this game, propose changes to the
user — **never auto-apply**. `--mark-read` advances the pin, and only after the
directives are actually resolved. An advanced pin with unadopted directives is worse
than a stale one: it is a lie the tooling believes.

Refusing a directive is allowed — every entry carries a **Skip if** for exactly that.
Put the refusal in a commit message, or the next session re-litigates it.

If this game solves something the studio got wrong, that is the most valuable thing
the studio can be told.

## The panel on disk

A lens **definition** belongs on disk — who this game's four are, and what each was
cast to ask. A lens's **verdict** does not. Never write a persona's words to a file,
and never cite one in a doc, comment, test, or commit message. What survives a panel
is a decision you author in your own voice, defended on its merits: an invented
character's opinion, written down, reads back next session as a specification.
