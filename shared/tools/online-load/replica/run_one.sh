#!/bin/bash
# usage: SRV=<measuring copy of the line> run_one.sh <label> <map key> <1v1|2v2> <players> <seconds> [KNOB=value ...]
# One measured match: the measuring server (replica/patch_srv.py applied to a checkout of the line) is started on port 3055 with
# the knobs, drive.mjs plays the match, the server is stopped, and the driver's line and the server's [prof] and [tick] lines are printed.
#   SD=1 in the environment asks for Sudden Death. The logs stay in $OUT (./out beside this script unless set).
# One at a time, and nothing else heavy on the machine: the numbers are times.
HERE=$(cd "$(dirname "$0")" && pwd); OUT=${OUT:-$HERE/out}; mkdir -p "$OUT"
: "${SRV:?set SRV to the measuring copy of the line (see the README)}"
label=$1; map=$2; mode=$3; n=$4; secs=$5; shift 5
if pgrep -f "node src/index.js" > /dev/null; then echo "a server is still running"; exit 1; fi
( cd "$SRV/server" && exec env PORT=3055 "$@" node src/index.js > "$OUT/srv_$label.log" 2>&1 ) &
pid=$!
for i in $(seq 1 60); do if grep -q "\[warmup\] [0-9]*/[0-9]* steps" "$OUT/srv_$label.log" 2>/dev/null; then break; fi; sleep 0.5; done
( cd "$HERE" && timeout $((secs + 30)) node drive.mjs 3055 "$map" "$mode" "$n" "$secs" > "$OUT/drv_$label.log" 2>&1 )
kill $pid 2>/dev/null; wait $pid 2>/dev/null
echo "== $label ($map $mode, $n player(s); $*)"; cut -c 1-330 "$OUT/drv_$label.log"; grep "\[prof\]\|\[tick\]" "$OUT/srv_$label.log" | cut -c 1-330
