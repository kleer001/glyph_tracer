# Decisions — standing rulings

<!-- The terse INDEX, not the journal. The dated reasoning — why each call was made, the
     alternatives weighed, the evidence — lives in its companion `DECISIONS-JOURNAL.md`.
     Split, don't kill: move reasoning there, never delete it.

     JOB: anti-canon. What the game DOES is `src/`, pinned by `tests/` and tuned by
     `data/`. This file records what was RULED and what was REJECTED, so a future
     session never re-opens a settled call or re-proposes a killed idea. The rejected
     alternative is the payload — restating what the code already says belongs nowhere.

     ENTRY CONTRACT:
     - Two lines per ruling: the call, plus the rejected alternative.
     - No dates. No supersession chains. When a ruling changes, OVERWRITE it —
       the journal and git history are the process record.
     - Prune, don't append. Delete a ruling nobody could re-propose.

     WHEN THIS FILE IS READ: before any structural proposal — a new glyph, a rule
     change, a new document, a change to how the board is drawn or timed. -->

---

## Rules

- **Every ability resolves the same way every time.** REJECTED: any ability that draws a
  random number — it makes a board unauthorable and a bug unreportable from its seed.
- **One kind per glyph, and no two alike.** REJECTED: sixteen drawings over four
  abilities — eight shoved identically, four absorbed identically, two did nothing.
- **A swap is a speed, not a duration.** REJECTED: one fixed duration for every swap — it
  spans an eightfold range of distances, so short swaps amble and long ones are hurled.
- **A level states its own swap allowance.** REJECTED: one budget across the run — six
  was a length chosen for a board dealt at random, and a puzzle with a right answer has
  an allowance its answer sets.
- **A level has a right answer: the most any line can clear, reached by exactly one.**
  REJECTED: clearing the board — with no ability on it a swap clears at most two pieces,
  which would cap the first lesson at a two-piece board forever.
- **The run is authored puzzles, one act per glyph family.** REJECTED: dealt boards as
  numbered levels — a board nobody chose cannot be aimed at a lesson, and a target it
  can meet several ways is a score, not an answer. Dealing stays, as a mode.

## Drawing

- **A glyph is a Roman letter or a bar, turned or mirrored.** REJECTED: the polygon
  grammar of side count, fill state and nesting — it had to be taught before a board
  could be read.
- **The swap family is two authored drawings at six turns.** REJECTED: the letter `X` for
  the diagonal pair — it never composed with the bars it is made of.
- **The rotate glyph is lowercase `r`.** REJECTED: capital `R`, which overlapped `H` at
  0.69 IoU, the closest pair in the set.
- **Letterforms ship as baked paths.** REJECTED: a subset webfont — it makes the look
  depend on the visitor's machine and leaves canvas text one silent fallback from
  breaking the authored glyphs.
- **One palette, four colours, no indirection.** REJECTED: five named alternates behind
  a `default`, and a `use` array picking live colours out of a longer list — between them
  they made changing a colour a change in three places instead of one hex.
- **The light slot is an orange, not a cream.** REJECTED: the cream it replaced, on the
  owner's call; and any deeper orange — below about 60% lightness it collapses onto green
  for protanopes, at 0.016 in OKLab against the 0.110 the palette holds now.
- **Four live colours, from a six-colour palette.** REJECTED: six — a player outside the
  project found the count intimidating.
- **The black keyline is load-bearing.** REJECTED: thinning or dropping it for a cleaner
  look — three of the six colour pairs sit near 1.1:1 and it is all that separates them.

## Feel

- **A swapping piece bows, and leaves copies behind it.** REJECTED: the straight line
  both pieces shared — along one row they travelled it in opposite directions and passed
  through each other.
- **The shake moves the board and not the readouts.** REJECTED: translating the whole
  frame — a number that moves is a number you re-read, and hit-testing that moved with it
  would put the tapped cell somewhere other than under the finger.
- **A beam is a straight stroke that never tapers and never bends.** REJECTED: a
  tentacle of discs with a travelling wave — every flourish said something the rules
  do not.
- **Beams draw behind the pieces, ghosts in front.** REJECTED: one layer for both — on
  either side, one of the two stops reading.
- **A dying cell turns on an authored curve.** REJECTED: deriving the curve at runtime
  from the room the shrink has made — it guaranteed a corner never crossed into a
  neighbour, and overlap is wanted.
- **A travelling piece squashes along its heading and stretches across.** REJECTED:
  clamping the stretch to the cell — it bulges over its neighbours and is meant to.
- **A won level clears itself away and grows the next one in.** REJECTED: waiting for a
  tap to change the board — the finale is the transition, so it commits the level itself.
- **A pointless swap is answered where it landed.** REJECTED: a rewind or a snap-back —
  the pieces really traded and the budget really went down.
- **The tray reports the drain twice: a socket per hole, and a rim that deepens.**
  REJECTED: one or the other — they answer different questions, which cells and how far.
- **A cleared cell throws particles alongside the shrink.** REJECTED: replacing the
  shrink with them, and any per-frame particle state — a burst is a closed form of how
  long ago its beat began, so it cannot drift between replays of one seed.
- **The activation flash is a soft white bloom under `screen`.** REJECTED: an opaque
  hard-edged disc of the cell's complement under `difference`, which marks rather than
  lights and reads as a cut frame; and additive `lighter` in the cell's own colour, whose
  lift ran sevenfold across the palette and so reported the tile's hue, not the event.
- **The game does not show the future board state.** REJECTED: move preview — that a
  deterministic cascade makes it cheap is not the argument; the player learns the
  cascade by playing it.
- **Consecutive steps keep their own beats.** REJECTED: segment welding — it needs the
  timeline rebuilt as per-piece envelopes, and it pulls against hit stop and escalation.

## Docs and tools

- **No prose document describes what the code does.** REJECTED: keeping `SPEC.md`,
  `RENDER_SPEC.md`, `LEVELS.md` and `docs/JUICE.md` — a second copy of the code with
  nothing checking it.
- **A measurement lives in the tool that produces it.** REJECTED: pasting sweep output
  into a document — the pasted table could not reproduce itself and was quoted for days.
- **A level's target is authored.** REJECTED: measuring a board's yield and scaling it —
  the pipeline had no caller once the pack became the run.
- **A puzzle's layout is the author's; the search only paints it.** REJECTED: annealing
  over which glyph sits where — it finds correct boards that state nothing, and where the
  pieces sit is the whole of what a lesson says.
- **Published pages under `docs/` and `artifacts/` are dated snapshots.** REJECTED:
  editing them to match the current code — that falsifies the record rather than
  correcting it.
