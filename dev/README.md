# dev — tuning instruments

Browser pages that drive the game's own rendering and playback code with the knobs
exposed. They are not part of the game and nothing in `src/` imports them;
they exist so a value in `data/` can be chosen by looking at it rather than guessed.

Serve the game root and open them — never as `file://`, since they import from
`../src/` as ES modules:

```sh
./run.sh
# then open /dev/cell.html, /dev/gloss.html, /dev/timing.html, ...
```

| | |
|---|---|
| `cell.html` | All twelve glyphs at once, each on a random ground with a different random ink, and every length on a slider. Writes `data/geometry.json`, and `data/gloss.json` from the same page. Carries the palette editor. |
| `gloss.html` | Highlight and shadow on one cell and one glyph. Drives `drawTile()` and `drawGlyph()` from `src/render.js`, so what is tuned is what ships. Writes `data/gloss.json`. |
| `timing.html` | Animation timing across eight canned cascades, each a real board resolved by `src/board.js` and played back by `src/animate.js`. Writes `data/animation.json`. |
| `silhouette.html` | Every glyph as a solid shape, compared pairwise by overlap. Says which two pieces are hardest to tell apart, and how much of the cell each one inks. |
| `fxframes.html` | Not a sandbox: a harness. It draws one named ability effect at an elapsed time it is handed and runs no clock of its own, so a capture is the same frame every run. Drive it a frame at a time from a browser and encode the stills with `tools/framesToGif.sh`. |

Each has a **copy** button that emits the matching `data/` file, and a `shipped` preset
that reads that file back, so a page always shows what the game is doing now.

Sliders in `timing.html` rebuild but do not play — press a scenario, or `replay`.

`palette-panel.css` styles the swatch editor that `palettePanel.js` mounts, beside it
here because both are dev-only. The game screen does not mount it — `cell.html` does, where the palette is what the plate draws
from, so the six colours are picked against the twelve glyphs rather than against one.
