# Squash and stretch

A shoved piece is rigid the whole way. Compressing it along its travel says it was hit.

## Shape

While a piece is moving it narrows along its direction of travel and widens across it.
Fully square at both ends, most compressed mid-flight.

| | |
|---|---|
| along travel | down to 60% |
| across travel | up by whatever holds the area |

At 60% along, across goes to 1 / 0.6 = 1.667. That keeps the piece looking like the same
piece rather than a smaller or larger one, which is the whole reason squash is paired
with stretch.

## Numbers

| | |
|---|---|
| floor | 0.6 of full width, one knob |
| profile | `sin(pi * t)` — square at both ends |

Careful: 1.667 across is wider than a cell. Either clamp the growth to what the cell can
hold, or accept the overlap and let the glyph layer's clip cut it at the board edge. Look
at both before choosing; a piece bulging over its neighbour may read as force or as a bug.

## Where it attaches

`sampleFrame` in `src/animate.js` returns one `scale`; this needs two, `scaleX`/`scaleY`,
picked from the travel axis. `placed()` in `src/render.js` builds a square box from one
number and has to take both. The dying-cell shrink stays uniform.

## Done when

A shoved run reads as pieces being knocked along, and a piece at rest is exactly square.

## Must not

Squash a dying cell — its shrink is uniform and the turn is held under it. Two different
non-uniform scales on one sprite would put the corners outside the footprint the spin
derivation assumes.
