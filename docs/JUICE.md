# Juice

Candidate visual and animation work for this game, ranked by what it returns for what it
costs, with the place in the code each one attaches to.

Nothing here is a decision. It is a shelf of options with their prices marked, and two
measurements of the game as it stands that decide which options are worth taking.

## What the game already does

- Linear tweens throughout, timings in `data/animation.json`.
- A swap is a **speed** — `swapMsPerCell` times the distance travelled, floored at
  `swapMinMs` — so a swap across the board takes longer than a swap between neighbours.
- **Split beats**: a step plays its movement and its destruction as two beats, in the
  order the rules resolve them.
- A **stagger wave**: each piece waits by its distance from whatever fired, so a shoved
  run reads as a wave and not a rigid block.
- A destroyed cell **shrinks and turns**, the turn held under what the shrink has made
  room for (`sampleFrame` in `src/animate.js`).
- Per-phase `cleared`, so the counter reports what has landed rather than what will.

## Where an effect attaches

Three facts about the render path decide what is cheap here and what is not.

**A new effect is a new layer, and that is genuinely cheap.** The stack is ground →
glyphs → selection → hud, each `{ name, draw(ctx, frame) }`, each wrapped in its own
save/restore by the compositor. Adding a layer costs one `compositor.add` and edits
nothing that already works.

**The frame carries no clock.** `paint()` in `src/main.js` hands every layer a frame of
positions with the time already resolved out of them by `sampleFrame`. Any effect with a
life of its own — a particle, a decaying flash, a trail — needs an elapsed time threaded
into the frame first. It is a small change, and it gates a whole family of effects.

**Full-canvas trails are unavailable.** `paint()` reassigns `canvas.width` every frame to
track `devicePixelRatio`, which wipes the backing store. The standard trail trick — fill
the canvas with a low-alpha background each frame instead of clearing it — cannot work
until that resize leaves the per-frame path.

## Two measurements

### The keyline is the contrast mechanism, not a detail

WCAG contrast between every pair of the four live colours:

|        | red  | yellow | green | blue |
|--------|------|--------|-------|------|
| red    | —    | 3.18   | 1.14  | 1.08 |
| yellow | 3.18 | —      | 3.63  | 3.44 |
| green  | 1.14 | 3.63   | —     | 1.06 |
| blue   | 1.08 | 3.44   | 1.06  | —    |

Three of the six pairs sit at about 1.1:1. W3C's [G207][g207] puts the floor for
graphics that carry meaning at 3:1. Red on green, red on blue and green on blue are all
far under it — those colours are near-identical in luminance and differ only in hue.

The black keyline measures 4.62:1 to 5.27:1 against every colour. It is the only thing
separating a glyph from its tile on half the board. Treat it as load-bearing: a change
that thins it, lightens it, or drops it for a cleaner look breaks legibility outright on
three colour pairs.

Yellow against the paper background is **1.02:1**. A yellow tile and an empty cell are
the same luminance; only the gutter and the tile's own shadow separate them. Anything
meant to make emptiness legible has to work at that margin, not at an average one.

Reproduce with `node tools/contrast.js`, which prints this matrix for any named palette
in `data/palette.json`.

### The rotations are fine; the letterforms collide

Every glyph rendered as a solid silhouette and compared pairwise by intersection over
union, in `dev/silhouette.html`. The most-overlapping pairs:

| pair | IoU |
|---|---|
| `anchor` (H) / `rotate` (R) | 0.69 |
| `anchor` (H) / `rotate-rev` (mirrored R) | 0.69 |
| `rotate` / `rotate-rev` | 0.66 |
| `rotate-rev` / `sink` (S) | 0.61 |

Of the sixty-six pairs, the seven that share a letterform rank no higher than **third**.

The four A rotations — `push-up`, `push-right`, `push-down`, `push-left` — appear
nowhere near the top. A is asymmetric enough that rotating it produces four clearly
separate shapes. The collisions are between *different letters* that happen to share a
build: H and R are both tall and two-stemmed, and R against its own mirror is the
classic b/d problem.

Ink coverage runs from 5.2% of the cell (`inert`, the dot) to 9.1% (`anchor`, H) — a
1.8× spread in visual weight across a set that is meant to read as one family.

## Candidates

Ordered by return for cost. Cost is in this game's terms: **cheap** is lines inside a
layer that exists, **moderate** is a new layer or a new field on the frame, **expensive**
is a new render path.

### 1. Easing on every tween — cheap

Linear motion reads as mechanical; nothing in the world starts and stops instantly.
Replacing the linear interpolation in `sampleFrame` with a curve is the single largest
change in feel per line edited. Cubic ease-out (`1 - (1-t)³`) for a piece arriving;
ease-in-out for a cell dying. Formulas from [Penner][penner].

The sister game `treasure_trash` already runs cubic ease-out (`src/stage.js:391`) and a
custom accelerate-then-cruise curve for momentum pushes (`src/stage.js:402`).

Durations that survive contact with research: 100 ms reads as instant, and the 200–500 ms
band is where UI motion is perceptible without dragging ([Head][head]).

### 2. Hit stop on activation — cheap

Freeze the timeline for a few frames at the instant a piece lands on its own colour, then
resume. It costs a hold in the phase list — apparatus that already exists, since `holdMs`
is a still beat after each phase. The game's chains run to a dozen links, and hit stop is
the cheapest way to make a link feel like an event rather than a frame of a slideshow.

Durations in circulation cluster at 50–200 ms and scale with the weight of the hit, but
the specific frame counts quoted around fighting games are not reliably sourced. Tune it.

### 3. Segment welding across a chain — cheap

Consecutive steps currently restart the clock every beat. `treasure_trash` merges a run of
steps into one envelope (`src/stage.js:364`) so a multi-step move reads as one continuous
motion instead of a stutter. A twelve-link chain is exactly the case this fixes.

### 4. Escalation across the chain — cheap, and the best fit for this game

A chain of twelve activations currently plays each link identically. Scaling feedback with
the link index — the turn faster, the hold longer, the shrink sharper — makes a chain
build. This is the mechanic's own drama and nothing else in the list produces it.

Two cautions worth honouring. Cap the escalation rather than letting it run to twelve:
past a point more intensity stops reading as more and starts reading as noise. And
escalation is available *now*, before any new layer exists, because it is a function of
the values already passed to `phaseOf`.

### 5. Inset the board into a well — cheap, and it is about the core mechanic

Tiles float on the paper today, so a cleared cell is a hole in the page. Sitting the grid
in a subtly recessed tray makes the same hole a hole *in the board* — a state, not an
absence of rendering. For a game whose premise is that the board drains, this is the
cheapest change that makes emptiness read as progress. One inset shadow behind the grid,
in the ground layer.

The yellow-on-paper measurement above is the reason this matters more here than it would
elsewhere: emptiness currently has almost no luminance separation from a yellow tile.

### 6. A flash on activation — cheap

A brief tint on the activating cell, or across the board, at the moment of a landing.
`globalCompositeOperation = 'lighter'` gives additive brightening for the cost of a state
flag; `'screen'` is the gentler version ([MDN][gco]). The clock it needs is on the frame
now, and a beat already knows what fired on it.

Worth knowing before reaching for it: additive blending is weak on this board. Measured
on the rotate's beam, `lighter` moved a sample from `182,37,25` to `243,49,34` — real,
but far less than it would be on a dark ground, because the paper is already near-white.

### 7. Move preview — moderate, and unusually cheap for what it is

Show what a swap would do before committing to it. Normally expensive; here the engine
already resolves a swap on a copy without committing — `tools/studyBoard.js` does exactly
that. A deterministic cascade is the ideal case for it. The argument for preview over
spectacle is [Into the Breach's][itb]: sacrifice cool ideas for clarity, every time.

### 8. Particle burst on a clear — moderate

Pooled particles drawn as filled arcs, in the colour of the piece that died. Needs a
layer and a clock. `treasure_trash` has a working seeded implementation for its win state
(`src/main.js:218`): 90 particles, gravity 1500 px/s², 1.4 s fade — and seeded, so it
holds the determinism rule.

Draw cost is in `globalAlpha` changes and `beginPath`/`arc` pairs rather than geometry
([MDN][opt]). Published per-frame figures for particle counts are not well sourced;
measure rather than trust them.

### 9. Feedback for a dud swap — moderate

A swap that achieves nothing currently produces nothing. `treasure_trash` plays a
four-phase rejection — lunge, burst, hold, rewind — with timings per action type
(`src/main.js:123`). Something is owed here, if less than four phases.

### 10. Glow and bloom — expensive, and mostly not worth it

`shadowBlur` is among the slowest canvas operations ([MDN][opt]); layered strokes are the
cheaper approximation. `ctx.filter` is not Baseline everywhere. A centred halo needs only
`shadowBlur` with zero offsets and an opaque `shadowColor` — a transparent shadow colour
is what renders nothing, not a zero offset.

### Ruled out

- **Chromatic aberration, ripple, shockwave.** Canvas 2D has no displacement primitive;
  they need `getImageData`, which stalls the pipeline ([MDN][pixel]). WebGL or nothing.
- **Full-canvas trails.** Blocked by the per-frame canvas resize described above.
- **Anything depending on gravity or refill.** Most match-3 technique is about falling
  and cascading. This board neither falls nor refills.
- **Ambient occlusion in the gutters.** Invisible at tile size, muddy where it is not.
- **Parallax.** A turn-based board has nothing to parallax against.

## One disagreement worth settling deliberately

Two defensible positions, and they conflict:

- **Decorate the clear.** A burst, a flash, a pop at every activation. Standard practice
  across the genre; it is what makes a clear feel like a reward.
- **Let the absence speak.** Put nothing on an empty cell. On a board where emptiness is
  the score, silence reads louder than confetti, and effects piled on a hole compete with
  the thing they are meant to celebrate.

They reconcile in one reading: **juice the dying piece, leave the hole alone.** The piece
is an event and can be loud; the hole is a state and should be quiet. That is a design
call, not a technical one.

## The constraint every candidate is judged against

This game has no audio. Whatever the hook is, it has to read silently, at phone size, in
about three seconds. That rules out anything whose payoff depends on accumulation over a
long session, and it puts weight on the two things a still frame can show: the chain
building, and the board draining.

[g207]: https://www.w3.org/WAI/WCAG21/Techniques/general/G207
[penner]: https://robertpenner.com/easing/
[head]: https://valhead.com/2016/05/05/how-fast-should-your-ui-animations-be/
[gco]: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation
[opt]: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
[pixel]: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas
[itb]: https://www.gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-
