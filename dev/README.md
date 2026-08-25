# dev — tuning instruments

Two browser pages that drive the game's own rendering and playback code with the
knobs exposed. They are not part of the game and nothing in `src/` imports them;
they exist so a value in `data/` can be chosen by looking at it rather than guessed.

Serve the game root and open them — never as `file://`, since they import from
`../src/` as ES modules:

```sh
./run.sh
# then open /dev/gloss.html and /dev/timing.html
```

| | |
|---|---|
| `gloss.html` | Highlight and shadow on one cell and one glyph. Drives `drawTile()` and `drawGlyph()` from `src/render.js`, so what is tuned is what ships. Writes `data/gloss.json`. |
| `timing.html` | Animation timing across eight canned cascades, each a real board resolved by `src/board.js` and played back by `src/animate.js`. Writes `data/animation.json`. |

Both have a **copy settings** button that emits the matching `data/` file. Each page's
`shipped` preset reads that file, so it always shows what the game is doing now.

Sliders in `timing.html` rebuild but do not play — press a scenario, or `replay`.
