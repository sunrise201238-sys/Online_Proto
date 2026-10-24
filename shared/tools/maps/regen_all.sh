#!/bin/bash
# Every modelled map's data, generated twice: with the generator as committed (git HEAD of the tree) into <out>/old/<map>,
# and with the working copy into <out>/new/<map>, both with DUMP=1, so the two readings can be compared cell by cell.
# usage: regen_all.sh <tree root> <out root> [map ...]
set -u
TREE=$1; OUT=$2; shift 2; MAPS=${@:-"town dust spacecraft backrooms warehouse"}
mkdir -p "$OUT/old" "$OUT/new"; git -C "$TREE" show HEAD:shared/tools/glb_collision.mjs > "$OUT/glb_collision_old.mjs"
run() { local gen=$1 map=$2 dir=$3; mkdir -p "$dir"; cd "$TREE" || exit 1
  case $map in
    town) DUMP=1 node "$gen" client/public/maps/invasion.glb town -68 67 -60 40 "$dir" ;;
    dust) DUMP=1 SCALE=4 GROUND=83.92 CELL=0.25 EXCLUDE= MARGIN=2 LOW_MAX=1.5 WALK_MAX=6 HEADROOM=2 UNDER_STREET=5.6 PIT_MAX=5.5 node "$gen" client/public/maps/dust.glb dust -7.1 106.7 -120.9 56.9 "$dir" ;;
    spacecraft) DUMP=1 GROUND=0 EXCLUDE= UNDER_STREET=3 CEIL=1.3 node "$gen" client/public/maps/spacecraft.glb spacecraft 2 122 -70 0 "$dir" ;;
    backrooms) DUMP=1 SCALE=4 GROUND=0 CELL=0.25 EXCLUDE= MARGIN=2 LOW_MAX=1.5 WALK_MAX=6 HEADROOM=2 UNDER_STREET=0.12 CEIL=3.8 node "$gen" client/public/maps/backrooms.glb backrooms -26.8 28 -27.2 30 "$dir" ;;
    warehouse) DUMP=1 SCALE=4 GROUND=0 CELL=0.25 EXCLUDE= MARGIN=2 LOW_MAX=1.5 WALK_MAX=6 HEADROOM=2 UNDER_STREET=0.12 node "$gen" client/public/maps/warehouse.glb warehouse -14 24 -23 39 "$dir" ;;
  esac > "$dir/log.txt" 2>&1; echo "$map $(basename "$(dirname "$dir")"): $(grep -c . "$dir/log.txt") log lines, $(grep -E '^street:' "$dir/log.txt" | cut -c1-160)"; }
for m in $MAPS; do
  # (the old generator with the old Town lid, as the committed recipe has it)
  if [ "$m" = town ]; then LIDS="-17.05,-20.2,-12.9,-19.05,2.65" run "$OUT/glb_collision_old.mjs" $m "$OUT/old/$m"; else run "$OUT/glb_collision_old.mjs" $m "$OUT/old/$m"; fi
  run "$TREE/shared/tools/glb_collision.mjs" $m "$OUT/new/$m"
  python3 -I - "$OUT/old/$m/$m.stats.json" "$OUT/new/$m/$m.stats.json" <<'EOF'
import json, sys
o = json.load(open(sys.argv[1])); n = json.load(open(sys.argv[2]))
d = [f"{k} {o.get(k)}->{n.get(k)}" for k in sorted(set(o) | set(n)) if o.get(k) != n.get(k) and k in ('obstacles', 'surfaces', 'floorCells', 'wallCells', 'guards', 'lidCells', 'deadFloor', 'slabs', 'walls')]
print('   stats:', ', '.join(d) if d else 'unchanged')
EOF
done
