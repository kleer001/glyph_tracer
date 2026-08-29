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

| file | page |
|---|---|
| `juice-bench.html` | Glyph Tracer Juice Bench — the priced shelf of visual work, with live demos and the palette and silhouette measurements. Text version: `docs/JUICE.md`. |
