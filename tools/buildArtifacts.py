#!/usr/bin/env python3
"""Bundle each FX sandbox into one self-contained page.

An Artifact is served under a strict CSP with no origin of its own to fetch from, so
the page cannot import `src/` or read `data/`. This inlines both: the engine modules in
dependency order with their import/export keywords stripped, and every data file as a
const. The page's own code goes in an IIFE so its names cannot collide with the
engine's.

The point of the exercise is that the artifact runs the REAL renderer — the same
compositor, the same tile and glyph drawing, the same seeded deal — rather than a
lookalike. What is tuned on the published page is what a shipped layer would do.

Usage:
    python3 tools/buildArtifacts.py            # builds every page below
    python3 tools/buildArtifacts.py beam       # builds one
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
# Dependency order: rng, board, glyphShapes, compositor and palette import nothing;
# level needs board and rng; render needs glyphShapes.
MODULES = ['rng', 'board', 'glyphShapes', 'compositor', 'palette', 'animate', 'level', 'render', 'fx']
# Each page is a template in tools/ and a built file in artifacts/.
PAGES = {
    'burst': ('burst-artifact.template.html', 'burst-bench.html'),
    'beam': ('beam-artifact.template.html', 'beam-bench.html'),
    'rotor': ('rotor-artifact.template.html', 'rotor-bench.html'),
}
DATA = ['palette', 'gloss', 'geometry', 'glyphPaths', 'glyphs', 'rules']

IMPORT = re.compile(r"^import\s.*?;\s*$", re.MULTILINE)
# The engine's comments carry typographic dashes. Nothing outside a comment is
# non-ASCII, so transliterating them keeps the bundle ASCII without touching code.
PUNCT = {'\u2014': '--', '\u2192': '->'}
EXPORT = re.compile(r"^export\s+(?=(?:const|let|var|function|class|async)\b)", re.MULTILINE)


def bundle_modules() -> str:
    out = []
    for name in MODULES:
        src = (ROOT / 'src' / f'{name}.js').read_text(encoding='utf-8')
        src = IMPORT.sub('', src)
        src = EXPORT.sub('', src)
        for ch, plain in PUNCT.items():
            src = src.replace(ch, plain)
        if 'export' in src:
            leftover = [l for l in src.splitlines() if l.startswith('export')]
            raise SystemExit(f'{name}.js: unhandled export lines {leftover}')
        out.append(f'/* ---- src/{name}.js ---- */\n{src.strip()}\n')
    return '\n'.join(out)


def bundle_data() -> str:
    out = []
    for name in DATA:
        blob = json.loads((ROOT / 'data' / f'{name}.json').read_text(encoding='utf-8'))
        out.append(f'const DATA_{name.upper()} = {json.dumps(blob, separators=(",", ":"))};')
    return '\n'.join(out)


def build(name: str, engine: str, data: str) -> None:
    template, output = PAGES[name]
    page = (ROOT / 'tools' / template).read_text(encoding='utf-8')
    page = page.replace('/*__ENGINE__*/', engine).replace('/*__DATA__*/', data)
    non_ascii = sorted({c for c in page if ord(c) > 127})
    if non_ascii:
        raise SystemExit(f'{output} must be pure ASCII; found {non_ascii}')
    target = ROOT / 'artifacts' / output
    target.write_text(page, encoding='ascii')
    print(f'wrote {target.relative_to(ROOT)}  ({len(page):,} bytes)')


def main() -> None:
    wanted = sys.argv[1:] or list(PAGES)
    unknown = [w for w in wanted if w not in PAGES]
    if unknown:
        raise SystemExit(f'no such page {unknown}; known: {list(PAGES)}')
    # The bundle is identical across pages, so it is cut once.
    engine, data = bundle_modules(), bundle_data()
    for name in wanted:
        build(name, engine, data)


if __name__ == '__main__':
    main()
