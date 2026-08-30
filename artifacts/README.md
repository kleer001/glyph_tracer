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
| `juice-bench.html` | Glyph Tracer Juice Bench — the priced shelf of visual work, with live demos and the palette and silhouette measurements. Text version: `docs/JUICE.md`. | hand-written |
| `burst-bench.html` | Glyph Tracer Burst Sandbox — tune a cleared cell's throw on a live board. | **generated** |
| `beam-bench.html` | Glyph Tracer Beam Sandbox — the directional beam a push throws. | **generated** |
| `rotor-bench.html` | Glyph Tracer Rotor Sandbox — the rotate's four arms and its quarter turn out. | **generated** |

The generated pages are built, never edited. Each is the whole engine and every data
file inlined into one page, because an Artifact has no origin to fetch from and cannot
import `src/` or read `data/`. Rebuild after changing either:

```sh
python3 tools/buildArtifacts.py            # all of them
python3 tools/buildArtifacts.py beam       # just one
```

Edit the matching `tools/*-artifact.template.html` for the page itself, never the built
file. The effects they tune live in `src/fx.js`, so a page and the game cannot drift
apart on the maths — only on the numbers, which is the whole point of tuning them here.
`dev/burst.html` stays the sandbox that loads `src/` live.
