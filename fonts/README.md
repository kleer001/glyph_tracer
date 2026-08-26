# fonts

`glyph-serif.woff2` is DejaVu Serif Bold, subset to the six letters the glyph set uses
— **A H O R S X** — and nothing else. Under a kilobyte, so it loads before the first
frame rather than after it.

The game sets its glyphs in this face and nowhere else. It is self-hosted rather than
pulled from a CDN because Google Fonts does not carry DejaVu, and the two authored
glyphs — `+` and `.` — are built from measurements taken off *this* face: a stem of 19
and a cap height of 73 in the render spec's 100-unit cell. Substitute another serif and
those two stop matching the letters they sit beside.

Regenerate with:

```sh
python3 -m fontTools.subset /usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf \
  --text="OHAXRS" --flavor=woff2 --layout-features='' --no-hinting \
  --output-file=fonts/glyph-serif.woff2
```

`LICENSE` is the Bitstream Vera notice carried in the font's own name table. DejaVu's
changes to it are public domain; the Bitstream terms permit redistribution and
modification, and require the notice to travel with the font.
