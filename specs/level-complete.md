# Level complete

Clearing the target changes a line of text and nothing else. This is the one moment the
game is allowed to be loud.

## Shape

1. Every cell still standing shrinks to nothing, together.
2. The board holds empty for 500 ms.
3. The next level's cells grow from nothing to full.

## Numbers

| | |
|---|---|
| shrink | reuse `shrinkMs`; all cells at once, no stagger |
| hold | 500 ms |
| grow | the shrink, reversed |
| curve | `inOutCubic`, the one a dying cell already uses |

Open: whether the survivors also spin on the way out, or only the cells the rules kill.
Spinning them reuses the containment envelope; not spinning them keeps the turn meaning
"this one activated".

## Where it attaches

`buildTimeline` in `src/animate.js` — two more phases appended when a swap wins the
level, built from `tilesOf` with every live cell marked dying. The grow half needs the
*next* board, so `advance()` in `src/main.js` has to deal before the timeline is built
rather than after.

## Done when

A won level plays shrink, pause, grow without a frame of the next board appearing early,
and a lost level is untouched.

## Must not

Play on a level that was already won and is being replayed from the picker.
