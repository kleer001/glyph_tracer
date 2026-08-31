# Artifact sources

Pages published to claude.ai as Artifacts. Each file here is the source of one
published page, kept so the page can be edited and republished to the same URL
rather than rewritten from scratch.

**These are fragments, not standalone pages.** The publisher wraps each one in
`<!doctype html><head>…</head><body>`, so the files here carry no doctype, no
`<html>`, no `<head>` and no `<body>` of their own — a `<title>` at the top is
the only head-ish tag they own. Opening one directly from disk or serving it
from a static host gives quirks mode and a guessed encoding; they are written
pure-ASCII so the guess cannot corrupt them, but that is a belt, not a home.

`docs/` is where standalone pages live, and the encoding test in
`tests/teachingRun.test.js` holds them to declaring a charset. Artifact
fragments cannot satisfy that test without breaking the publisher, which is
why they sit here instead.

| file | page | source |
|---|---|---|
| `juice-bench.html` | Glyph Tracer Juice Bench -- the priced shelf of visual work, with live demos and the palette and silhouette measurements. Text version: `docs/JUICE.md`. | hand-written |
| `fx-plate.html` | Glyph Tracer Effects Plate -- every ability's effect, recorded. | **generated** |
| `fx-pair.html` | Glyph Tracer X and H -- the swap made followable and the anchor made to stop beams. | **generated** |

The generated pages are built from recordings, never edited: a still page cannot run
the engine, so each effect is captured as a GIF and inlined as a data URI. Rebuild
after re-recording:

```sh
python3 tools/buildFxPages.py            # both
python3 tools/buildFxPages.py pair       # just one
```

Edit the matching `tools/fx-*.template.html` for the page itself, never the built file.

To re-record an effect: `dev/fxframes.html` draws a named effect at an elapsed time it
is handed and runs no clock of its own, so a capture is the same frame every time.
Drive it a frame at a time from a browser, writing stills to `tmp/frames/<effect>/`,
then encode with `tools/framesToGif.sh tmp/frames/<effect> tmp/gifs/<effect>.gif 20`.

Three sandbox pages -- a slider per knob for the burst, the push beam and the rotate --
lived here while those effects were being tuned. The numbers they produced are in
`data/animation.json` and in the effects themselves, so the pages were deleted once
they had done their job rather than left to rot alongside the code they no longer
match. `dev/` still holds the live tuning instruments.
