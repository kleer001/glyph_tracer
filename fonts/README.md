# fonts

**The game ships no font.** `data/glyphPaths.json` carries the letterforms as SVG
paths, baked out of DejaVu Serif Bold by `tools/bakeGlyphs.py`. Nothing about how a
glyph looks depends on what the player has installed, there is no webfont to wait for
before the first frame, and a turn or a mirror is a transform on a path.

Rebake after changing the face or the letters used:

```sh
python3 tools/bakeGlyphs.py           # writes data/glyphPaths.json
python3 tools/bakeGlyphs.py --check   # fails if the file is out of date
```

Each path is normalised to a cap height of 1, centred on x=0, with y=0 at the middle of
the cap — so `data/geometry.json` still owns the size and the vertical aim. Two glyphs
are not baked: `+` and `.` are authored from that face's stem width and cap height,
which is why substituting another face means remeasuring rather than just rebaking.

`LICENSE` is the Bitstream Vera notice carried in DejaVu's own name table. DejaVu's
changes to it are public domain; the Bitstream terms permit modification and
redistribution, and the outlines here are a derivative of that work.
