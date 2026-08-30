#!/usr/bin/env python3
"""Assemble the recorded effects into one self-contained page.

An Artifact has no origin to fetch from, so every GIF is inlined as a data URI. They
are small -- flat colour on a flat board is what GIF was built for -- and the whole
plate comes in well under the size a page is allowed.

    python3 tools/buildFxPlate.py        # reads tmp/gifs, writes artifacts/fx-plate.html
"""

import base64
import json
import pathlib

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
    ('swapOrth', '+', 'swap', 'Trades the pair above and below, and the pair left and right.',
     'Beams reach out, take hold, and the pieces cross over on them before they let go.'),
    ('swapDiag', 'X', 'swap', 'The same trade, on the two diagonals.',
     'The same effect turned forty-five degrees, which is also the difference between '
     'the two letterforms.'),
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


def data_uri(name: str) -> str:
    raw = (GIFS / f'{name}.gif').read_bytes()
    return 'data:image/gif;base64,' + base64.b64encode(raw).decode('ascii')


def main() -> None:
    cards = []
    for name, mark, kind, does, effect in PLATE:
        if not (GIFS / f'{name}.gif').exists():
            raise SystemExit(f'no recording for {name}; capture it first')
        cards.append(f'''
    <figure class="card">
      <img src="{data_uri(name)}" alt="the {kind} effect playing on a board" loading="lazy" />
      <figcaption>
        <p class="mark" aria-hidden="true">{mark}</p>
        <h3>{kind}</h3>
        <p class="does">{does}</p>
        <p class="effect">{effect}</p>
      </figcaption>
    </figure>''')

    page = (ROOT / 'tools/fx-plate.template.html').read_text(encoding='utf-8')
    page = page.replace('<!--__CARDS__-->', ''.join(cards))
    target = ROOT / 'artifacts/fx-plate.html'
    target.write_text(page, encoding='utf-8')
    print(f'wrote {target.relative_to(ROOT)}  ({len(page) / 1e6:.2f} MB)')


if __name__ == '__main__':
    main()
