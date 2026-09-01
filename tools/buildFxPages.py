#!/usr/bin/env python3
"""Assemble the recorded effects into the pages that show them.

An Artifact has no origin to fetch from, so every GIF is inlined as a data URI. They
are small -- flat colour on a flat board is what GIF was built for -- and the whole
plate comes in well under the size a page is allowed.

    python3 tools/buildFxPages.py            # reads tmp/gifs, writes both pages
    python3 tools/buildFxPages.py pair       # just one
"""

import base64
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GIFS = ROOT / 'tmp/gifs'

# Ordered as a reader meets them: the ones that shove, the ones that take hold, the
# ones with no ability at all.
PLATE = [
    ('push', 'A', 'push', 'Shoves the piece in front of it, the way the letter points.',
     'One beam thrown along the heading. It runs its reach and dissipates, and never '
     'depended on hitting anything &mdash; a shove sends a piece away.'),
    ('pulse', 'O', 'pulse', 'Shoves in all four directions at once.',
     'The push four times over. A beam per direction, but only where a piece is '
     'standing: on a drained board it throws fewer.'),
    ('swapVert', '|', 'swap', 'Trades the pair above and below, and nothing else.',
     'Two beams where the cross throws four. The bar lies along the axis it acts on, so '
     'which pair is about to move is readable before it moves.'),
    ('swapOrth', '+', 'swap', 'Trades the pair above and below, and the pair left and right.',
     'Beams reach out, take hold, and the pieces cross over on them before they let go.'),
    ('swapDiagUp', '/', 'swap', 'Trades one corner pair, the one its bar lies across.',
     'The same bar turned onto a diagonal. Its mirror leans the other way and takes the '
     'other pair.'),
    ('swapDiag', '+', 'swap', 'The same trade, on the two diagonals.',
     'The same effect turned forty-five degrees, which is also the difference between '
     'the two drawings.'),
    ('rotate', 'r', 'rotate', 'Steps the four neighbours one place around the ring.',
     'Four beams that hold on. Each tip rides the piece it has hold of, so the beams '
     'turn at exactly the speed the pieces do.'),
    ('sink', 'S', 'sink', 'Becomes a hole, then pulls the far end of each arm inward.',
     'Beams shoot out past everything between, take hold of the piece that will '
     'actually move, and reel it in.'),
    ('anchorSwallow', 'H', 'anchor', 'Eats whatever is shoved into it, and stays put.',
     'It never fires, so it has no beam. A tenth-bigger outline pulses off it once per '
     'swallow &mdash; several at once still count as one.'),
    ('anchorClear', 'H', 'anchor', 'When it lands on its own colour it goes like anything else.',
     'The same outline, but the whole way: half again as big, opaque to gone.'),
    ('inert', '.', 'none', 'No ability at all.',
     'Nothing thrown and nothing to say, so it swells a quarter as it fades. The least '
     'a piece can do on its way out.'),
]


# Cards whose mark is the drawing turned rather than a character of its own. The
# diagonal swap is the cross at forty-five degrees, and there is no ASCII for that.
TURNED = {'swapDiag'}


# The two-up page: one recording each, keyed by the placeholder it fills.
PAIR = {'__XGIF__': 'swapDiag', '__HGIF__': 'anchorSwallow'}

# The preview page: two recordings of one effect a single knob apart, and a still of
# the tray. Keyed by file rather than by effect name, because not all of them are
# recordings of an ability.
PREVIEW = {
    '__ONGIF__': 'flash-on.gif',
    '__SCREENGIF__': 'flash-screen.gif',
    '__OFFGIF__': 'flash-off.gif',
    '__WELLPNG__': 'well-tray.png',
}

MIME = {'.gif': 'image/gif', '.png': 'image/png'}


def inline(path: pathlib.Path) -> str:
    if not path.exists():
        raise SystemExit(f'no {path.name}; capture it first')
    return f'data:{MIME[path.suffix]};base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def data_uri(name: str) -> str:
    return inline(GIFS / f'{name}.gif')


def build_plate() -> None:
    cards = []
    for name, mark, kind, does, effect in PLATE:
        if not (GIFS / f'{name}.gif').exists():
            raise SystemExit(f'no recording for {name}; capture it first')
        cards.append(f'''
    <figure class="card">
      <img src="{data_uri(name)}" alt="the {kind} effect playing on a board" loading="lazy" />
      <figcaption>
        <p class="{'mark turned' if name in TURNED else 'mark'}" aria-hidden="true">{mark}</p>
        <h3>{kind}</h3>
        <p class="does">{does}</p>
        <p class="effect">{effect}</p>
      </figcaption>
    </figure>''')

    page = (ROOT / 'tools/fx-plate.template.html').read_text(encoding='utf-8')
    write(page.replace('<!--__CARDS__-->', ''.join(cards)), 'fx-plate.html')


def build_pair() -> None:
    page = (ROOT / 'tools/fx-pair.template.html').read_text(encoding='utf-8')
    for slot, name in PAIR.items():
        if not (GIFS / f'{name}.gif').exists():
            raise SystemExit(f'no recording for {name}; capture it first')
        page = page.replace(slot, data_uri(name))
    write(page, 'fx-pair.html')


def build_preview() -> None:
    page = (ROOT / 'tools/juice-preview.template.html').read_text(encoding='utf-8')
    for slot, filename in PREVIEW.items():
        page = page.replace(slot, inline(GIFS / filename))
    # The one number the page quotes that the game could retune underneath it.
    anim = json.loads((ROOT / 'data/animation.json').read_text(encoding='utf-8'))
    page = page.replace('__SPREAD__', f"{anim['flash']['spread']:g}")
    write(page, 'juice-preview.html')


def write(page: str, name: str) -> None:
    # The page carries its own gifs, so it has to survive a host that guesses at the
    # encoding. Pure ASCII is the cheapest way to make that impossible to get wrong.
    non_ascii = sorted({c for c in page if ord(c) > 127})
    if non_ascii:
        raise SystemExit(f'{name} must be pure ASCII; found {non_ascii}')
    target = ROOT / 'artifacts' / name
    target.write_text(page, encoding='ascii')
    print(f'wrote {target.relative_to(ROOT)}  ({len(page) / 1e6:.2f} MB)')


BUILDERS = {'plate': build_plate, 'pair': build_pair, 'preview': build_preview}


def main() -> None:
    wanted = sys.argv[1:] or list(BUILDERS)
    unknown = [w for w in wanted if w not in BUILDERS]
    if unknown:
        raise SystemExit(f'no such page {unknown}; known: {list(BUILDERS)}')
    for name in wanted:
        BUILDERS[name]()


if __name__ == '__main__':
    main()
