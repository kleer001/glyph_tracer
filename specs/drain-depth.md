# Drain depth

The board draining is the score, and the board does not show it. Progress is legible only
from the counter.

## What is there now

The grid sits in a tray: one rounded rect, one tint, one inset shadow at its rim, drawn
once in `createGroundLayer`. A cleared cell is simply not drawn, so what shows through is
flat tray. **There are no divots** — a hole is a patch of the same tint as the gutter
beside it.

## Two ways, and they are not exclusive

**Divots.** Each hole gets its own small inset shadow, so an emptied cell reads as a
socket the tile came out of. The strongest version, and the honest one: the hole is where
something was.

Needs the ground layer to know where the holes are. It draws from `tiles`, which lists
only live cells, and the layout carries no board dimensions — so `frame.board` has to
reach it, and `staticFrame` currently leaves `board` null.

**A deepening rim.** The tray's own inset shadow grows with the fraction cleared, so the
board sinks as it empties. Cheaper — one number scaled by progress, no new plumbing — but
it reports the total rather than which cells went.

## Numbers

Divots: reuse the well's shadow knobs at a smaller radius, one entry under `gloss.well`.
Rim: the existing `shadowBlur` and `shadowA` scaled between a full board and an empty
one; pick the empty-board end by eye.

## Done when

A half-drained board looks half drained with the counter covered up.

## Must not

Draw a divot under a cell that is still mid-collapse — the tile is shrinking and turning
over its own hole, and a socket appearing before the tile has gone reads as two cells.
