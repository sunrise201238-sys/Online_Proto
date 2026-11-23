#!/bin/bash
# usage: render_tick_lines.sh <owner id> <service id> <from, e.g. 2026-11-15T00:00:00Z> <to> <out prefix>
# The production server's own [tick] lines and its match lines, from the host's log (Render's API, GET /v1/logs): two files,
# <out prefix>_tick.json and <out prefix>_match.json, a hundred lines each at most (the newest first). `production_lines.py`
# puts them in time order and sums them up by the kind of match.
# The key: RENDER_API_KEY in the environment, or a network that adds it for api.render.com by itself. Never write a key into
# a file here. The owner id and the service ids are read from GET /v1/services (each service names its ownerId).
set -e
owner=$1; srv=$2; from=$3; to=$4; out=$5
auth=(); if [ -n "$RENDER_API_KEY" ]; then auth=(-H "Authorization: Bearer $RENDER_API_KEY"); fi
for kind in tick match; do
  text="[tick]"; [ "$kind" = match ] && text="match"
  curl -s -m 60 -G -o "${out}_${kind}.json" -w "$kind %{http_code}\n" -H "Accept: application/json" "${auth[@]}" "https://api.render.com/v1/logs" \
    --data-urlencode "ownerId=$owner" --data-urlencode "resource=$srv" --data-urlencode "text=$text" --data-urlencode "limit=100" \
    --data-urlencode "direction=backward" --data-urlencode "startTime=$from" --data-urlencode "endTime=$to"
done
