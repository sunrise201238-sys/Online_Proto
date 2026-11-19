#!/bin/bash
# pt_tree.sh <9.8 client/dist> <PT index.html> <PT script> <out dir> — a folder a probe can serve as PT: 9.8's built files linked
# under PT's names (models, maps' models and route grids, sounds and music all end in .wasm there), PT's page and PT's script.
set -e
D=$1; IDX=$2; JS=$3; O=$4
rm -rf "$O"; mkdir -p "$O/assets"
for d in models maps sfx bgm ui units weapons; do
  mkdir -p "$O/$d"
  for f in "$D/$d"/*; do
    b=$(basename "$f"); case "$b" in
      *.glb|*.nav|*.mp3|*.wav|*.ogg) ln -s "$f" "$O/$d/${b%.*}.wasm" ;;
      *) ln -s "$f" "$O/$d/$b" ;;
    esac
  done
done
for f in "$D"/*.png "$D"/*.svg "$D"/*.webmanifest; do ln -s "$f" "$O/$(basename "$f")"; done
for f in "$D"/assets/*.woff2 "$D"/assets/*.css; do ln -s "$f" "$O/assets/$(basename "$f")"; done
cp "$IDX" "$O/index.html"; cp "$JS" "$O/assets/index-BUZtMzc6.js"
echo "files: $(find "$O" -type f -o -type l | wc -l)"
