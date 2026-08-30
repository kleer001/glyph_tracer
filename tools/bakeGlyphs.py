#!/usr/bin/env python3
"""Bake the glyph letterforms out of a font into SVG paths.

The game ships the paths, not the font. Nothing about how a glyph looks then depends
on what the player has installed, there is no webfont to wait for, and a turn or a
mirror is a transform on a path rather than a hope about metrics.

Each path is normalised so the renderer stays in charge of size:

  * the cap height is exactly 1.0, so the renderer scales by `cap` from geometry.json
  * x = 0 is the glyph's horizontal centre
  * y = 0 is the middle of the cap height, so `centre` from geometry.json still aims it

Run from the repo root:

    python3 tools/bakeGlyphs.py            # writes data/glyphPaths.json
    python3 tools/bakeGlyphs.py --check    # fails if the file is out of date

Needs fontTools, which is a developer-machine dependency: the game itself has none.
"""

import argparse
import json
import pathlib
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT = pathlib.Path('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf')
OUT = ROOT / 'data/glyphPaths.json'

# Every letter the glyph pack draws. `+` and `.` are authored from measurements rather
# than taken from the font, so they are not baked here.
LETTERS = 'AHORSXr'

# The cap height is measured off this letter rather than read from the OS/2 table:
# the table records intent and the outline records what was drawn.
CAP_REFERENCE = 'H'


def outline(font, glyphset, letter, scale, dx, dy):
    """One letter as SVG path data, scaled and shifted into the normalised box."""
    pen = SVGPathPen(glyphset, ntos=lambda v: f'{v:.4f}'.rstrip('0').rstrip('.'))
    # SVG y runs down and font y runs up, so the vertical scale is negated.
    glyphset[letter].draw(TransformPen(pen, (scale, 0, 0, -scale, dx, dy)))
    return pen.getCommands()


def bounds(glyphset, letter):
    """The inked box of a letter, in font units."""
    from fontTools.pens.boundsPen import BoundsPen
    pen = BoundsPen(glyphset)
    glyphset[letter].draw(pen)
    return pen.bounds


def bake(font_path):
    font = TTFont(font_path)
    glyphset = font.getGlyphSet()
    cmap = font.getBestCmap()
    names = {ch: cmap[ord(ch)] for ch in LETTERS}

    x0, y0, x1, y1 = bounds(glyphset, names[CAP_REFERENCE])
    cap_units = y1 - y0
    scale = 1.0 / cap_units
    # y = 0 is the middle of the cap height, so a letter sits where type would sit.
    cap_mid = (y0 + y1) / 2

    paths = {}
    for ch, name in names.items():
        bx0, _, bx1, _ = bounds(glyphset, name)
        centre = (bx0 + bx1) / 2
        paths[ch] = outline(font, glyphset, name,
                            scale, -centre * scale, cap_mid * scale)
    return {
        'note': ('Letterforms baked out of DejaVu Serif Bold by tools/bakeGlyphs.py. The cap '
                 'height is 1.0, x=0 is the horizontal centre and y=0 the middle of the cap, '
                 'so data/geometry.json still owns the size and the vertical aim. The game '
                 'ships these paths rather than the font, so a glyph looks the same on every '
                 'machine and there is no webfont to wait for.'),
        'source': font_path.name,
        'capHeightUnits': cap_units,
        'paths': paths,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--font', type=pathlib.Path, default=FONT)
    ap.add_argument('--check', action='store_true',
                    help='exit non-zero if the baked file differs from the font')
    args = ap.parse_args()

    if not args.font.exists():
        sys.exit(f'no font at {args.font}')

    fresh = bake(args.font)
    text = json.dumps(fresh, indent=2) + '\n'

    if args.check:
        if not OUT.exists():
            sys.exit(f'{OUT} does not exist')
        if OUT.read_text() != text:
            sys.exit(f'{OUT} is out of date — rerun without --check')
        print(f'{OUT.name} is current: {len(fresh["paths"])} letters')
        return

    OUT.write_text(text)
    for ch, d in fresh['paths'].items():
        print(f'  {ch}  {len(d):4d} chars')
    print(f'wrote {OUT} ({len(text)} bytes)')


if __name__ == '__main__':
    main()
