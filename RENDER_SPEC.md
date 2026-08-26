# Glyph Tracer — render spec

Implementation reference for drawing a glyph. Locked as of specimen plate 01
(`docs/specimen.html`). Design rationale lives in `SPEC.md`; this file is geometry and
paint order only.

## Canvas

`src/glyphShapes.js` implements the forms below and `src/render.js` paints them. The
lengths are tuning and live in `data/geometry.json`; this document names them and says
where each one lands. `docs/specimen.html` is the plate the spec was locked against —
SVG, with its own copy of the numbers, so it records that moment rather than tracking
the data file.

- A 100x100 cell. One glyph per cell; the renderer scales the cell to the view.
- Cell rect: `x=0 y=0 width=100 height=100`, corner radius from `data/gloss.json`.
- Glyph inscribed in a circle of `radius` centered at `(50,50)`.
- The ink ring wants 3.5px to read, so the minimum render size is whatever cell size
  puts `inkWidth` at 3.5px — `dev/cell.html` prints it for the numbers in force.

## Colors

Three roles. Ground and ink are two different colors from the palette; the palette itself
is the designer's to set.

| Role | Token |
|---|---|
| Cell ground | `--ground` |
| Glyph ink | `--ink` |
| Interior | `--core` |
| Keyline | `--key` |

The specimen plate hard-codes two placeholder values at the top of its script so the
matrix has something to draw. Swap them; nothing else depends on them.

## Paint order

The cell first, then the glyph on top of it. Every layer below the cell's own is drawn
on one path.

**The cell** — `drawTile()`:

| # | Layer | Paint |
|---|---|---|
| 0 | Cast shadow | the rounded rect filled again with a shadow under it |
| 1 | Ground | `fill: ground` |
| 2 | Sheen | white gradient from the top edge, fading out by `sheenStop`% of the cell |
| 3 | Bevel | inset stroke, white around the edge and a darker line along the bottom |

**The glyph** — `drawGlyph()`:

| # | Layer | Paint |
|---|---|---|
| 0 | Cast shadow | the silhouette filled *and* stroked once in `key`, with a shadow under it |
| 1 | Silhouette | `fill: core`, `stroke: key`, `stroke-width: keyWidth`, `stroke-linejoin: round` |
| 2 | Fill state | `fill: ink` on the same path, clipped — **skipped at mag 1** |
| 3 | Ink ring | `fill: none`, `stroke: ink`, `stroke-width: inkWidth`, `stroke-linejoin: round` |
| 4 | Mark | `stroke-width: markWidth`, `stroke-linecap: round` |
| 5 | Specular | white gradient across the top-left, clipped to the silhouette |

Both strokes center on the path, so the keyline showing outside the ring is half the
difference between the two widths. The fill state goes **under** the ring so the ring
stays crisp.

The glyph's shadow is cast by one opaque copy of the silhouette rather than by the
layers above it: with a shadow set on the context, every one of those fills and strokes
would cast its own and they would stack into mud. Layer 1 then covers the copy.

Sheen and bevel share the cell's clip, and the specular shares the glyph's, so the light
lands on both from the same direction the shadows fall away from.

## Geometry

Every length above is tuning and lives in `data/geometry.json` — `radius`, `keyWidth`,
`inkWidth`, `markWidth`, `dotRadius`, `nestRadius`. `src/glyphShapes.js` takes them as
an argument and holds none of them, so a retune is a data edit. `dev/cell.html` drives
`drawTile()` and `drawGlyph()` across all sixteen glyphs at once, which is where the
balance between them is judged.

## Gloss

Highlight and shadow are tuning, so they live in `data/gloss.json` rather than in the
renderer. Lengths are in this document's 100-unit cell and scale with the board; alphas
and the sheen are percentages. `dev/gloss.html` drives `drawTile()` and `drawGlyph()`
directly, so what is tuned there is what ships.

## Fill state (magnitude)

Clip rects against the interior:

| Mag | Ink clip | Core clip | Result |
|---|---|---|---|
| 1 | none | full | interior is core |
| 2 | `y=50 h=50` | `y=0 h=50` | lower half ink, reads as a gauge |
| 3 | full | none | interior is ink |

## Mark

The mark is painted **twice**, each copy clipped to one region: `ink` inside the core
clip, `core` inside the ink clip. That single rule makes the mark contrast at every fill
state with no per-glyph art.

| Mark | Geometry |
|---|---|
| `none` | — |
| `dot` | circle `r=dotRadius` at `(50,50)`, filled |
| `cross` | lines `(36,50)–(64,50)` and `(50,36)–(50,64)` |
| `ex` | lines `(40,40)–(60,60)` and `(60,40)–(40,60)` |
| `slash` | line `(38,62)–(62,38)` |
| `nest` | the same polygon at `r=nestRadius`, stroked, unfilled |

## Polygon geometry

Regular n-gons, vertex `i` at angle `offset + i·360/n`, radius `radius`, center `(50,50)`.
SVG y is down, so `-90°` puts a vertex at top.

| Form | n | Offset | Verb |
|---|---|---|---|
| Circle | — | — | Radiate |
| Triangle | 3 | `-90` | Push |
| Square | 4 | `-45` | Hold |
| Diamond | 4 | `-90` | Swap |
| Pentagon | 5 | `-90` | Wild |
| Hexagon | 6 | `0` | Flow |

Square at `-45` puts vertices on the diagonals, giving flat sides to the grid. Diamond at
`-90` puts vertices on the axes. Hexagon at `0` is flat-top.

## Rotation

A separate axis, not part of the polygon table. Triangles rotate in 90° steps by adding
`{0, 90, 180, 270}` to the offset; the apex is the push direction. `△` and `▷` are the
same cell in the specimen matrix.

## Combination space

6 polygons × 3 fill states × 6 marks = **108**, before rotation. The proposed 16 glyphs
occupy 15 of those cells (see `SPEC.md`). New glyphs are new combinations, not new rules —
the remainder is the upgrade unlock pool.
