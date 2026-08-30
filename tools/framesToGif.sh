#!/usr/bin/env bash
# Turn a directory of stills into a looping GIF.
#
# The two-pass palette is the whole point: a single pass quantises to a generic 256
# colours and bands the tile gradients badly, while palettegen reads the actual frames
# first. `bayer` dithering holds flat colour flat, which is most of this board.
#
#   tools/framesToGif.sh tmp/frames/pulse tmp/gifs/pulse.gif [fps]
set -euo pipefail
src="$1"; out="$2"; fps="${3:-25}"
mkdir -p "$(dirname "$out")"
pal="$(mktemp --suffix=.png)"
ffmpeg -v error -y -framerate "$fps" -i "$src/%03d.png" \
  -vf "palettegen=stats_mode=diff" "$pal"
ffmpeg -v error -y -framerate "$fps" -i "$src/%03d.png" -i "$pal" \
  -lavfi "paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
  -loop 0 "$out"
rm -f "$pal"
printf '%-16s %s frames  %s\n' "$(basename "$out")" \
  "$(ls "$src" | wc -l)" "$(du -h "$out" | cut -f1)"
