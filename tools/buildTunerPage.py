#!/usr/bin/env python3
"""Assemble the tuning page: the real engine, inlined, with sliders on its knobs.

An Artifact cannot fetch this repo, so the page has to carry the code. It carries the
ACTUAL code -- every module read off disk at build time, its imports and exports
stripped, concatenated in dependency order -- so what you tune on the page is what the
game does. Nothing here reimplements an effect; a copy that drifted would be worse than
no page at all.

    python3 tools/buildTunerPage.py        # writes tmp/tuner.html
"""
import base64, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODULES = ['rng', 'board', 'level', 'glyphShapes', 'fx', 'abilityFx',
           'compositor', 'palette', 'animate', 'render', 'fxLayer']
DATA = ['palette', 'glyphs', 'glyphPaths', 'geometry', 'gloss', 'animation', 'rules']

TRANSLITERATE = {'\u2014': '--', '\u2192': '->'}

IMPORT = re.compile(r"^import\s+[\s\S]*?from\s+'[^']+';\s*$", re.M)


def flatten() -> str:
    out = []
    for name in MODULES:
        src = (ROOT / f'src/{name}.js').read_text(encoding='utf-8')
        if "from '" in IMPORT.sub('', src):
            raise SystemExit(f'{name}.js has an import this tool cannot strip')
        src = IMPORT.sub('', src)
        src = re.sub(r'^export\s+(?=(function|const|class|let)\s)', '', src, flags=re.M)
        # An Artifact is served pure ASCII. The only non-ASCII in src/ is punctuation
        # inside comments, so this is lossless -- but check that stays true rather than
        # assume it, because silently mangling a string literal would be a real bug.
        for ch, plain in TRANSLITERATE.items():
            for line in src.splitlines():
                bare = line.lstrip()
                if ch in line and not (bare.startswith(('//', '*', '/*'))):
                    raise SystemExit(f'{name}.js has {ch!r} outside a comment: {bare[:60]}')
            src = src.replace(ch, plain)
        out.append(f'// ---- src/{name}.js ----\n{src.strip()}\n')
    return '\n'.join(out)


def data_consts() -> str:
    lines = []
    for name in DATA:
        raw = json.loads((ROOT / f'data/{name}.json').read_text(encoding='utf-8'))
        lines.append(f'const DATA_{name.upper()} = {json.dumps(raw, separators=(",", ":"))};')
    return '\n'.join(lines)


def main() -> None:
    page = (ROOT / 'tools/tuner.template.html').read_text(encoding='utf-8')
    page = page.replace('/*__ENGINE__*/', flatten()).replace('/*__DATA__*/', data_consts())
    bad = sorted({c for c in page if ord(c) > 127})
    if bad:
        raise SystemExit(f'must be pure ASCII; found {bad}')
    out = ROOT / 'tmp/tuner.html'
    out.parent.mkdir(exist_ok=True)
    out.write_text(page, encoding='ascii')
    print(f'wrote {out.relative_to(ROOT)}  ({len(page) / 1e6:.2f} MB)')


if __name__ == '__main__':
    main()
