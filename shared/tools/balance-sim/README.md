# Balance sims (2026-11-08)

Paired bot-vs-bot matches on the shared sim — the server's rules, no client — to compare units: every configuration (foe, map,
seat, seed) is played once by each subject in the same seat, so the subjects' numbers differ by the unit alone. Made for the user's
"Run some sims to find out how Minori and Maki is performing" (2026-11-08), with Saori (Minori's base) and Koyuki (Maki's base) as
references.

| file | what |
| --- | --- |
| `gen.mjs` | writes `jobs.json` in the current folder: 1v1 against the whole roster on every map (both seats, two seeds: 1440 configs) and 540 random 2v2s, each for every subject (7920 jobs). `SUBJECTS`, `POOL` (the roster) and `MAPS` at its top |
| `sim.mjs` | `[GVG_ROOT=<checkout>] node sim.mjs jobs.json <slot> <slots>` — plays the jobs whose index % slots == slot, one JSON line each (winner, seconds, damage, kills, HP left, CPU time). `GVG_ROOT`: the checkout whose sim runs, the line from 0.9.5 on (this branch's own sim is older and is refused with a message); `OVERRIDE='{"unit22":{"damage":4}}'` patches unit fields for the run; `CAP` a match's length in seconds (90) |
| `agg.mjs` | reads `out_<slot>.jsonl` in the current folder and prints, per subject: 1v1 win / loss / draw against the field, by foe class, by foe, by map, and the 2v2 results. `SUB` / `SN` match `gen.mjs`'s `SUBJECTS`; `NAME` is the roster of 2026-11-08 |

A run, from a scratch folder:

```
node <branch>/shared/tools/balance-sim/gen.mjs
for s in 0 1 2 3; do GVG_ROOT=<line checkout> node <branch>/shared/tools/balance-sim/sim.mjs jobs.json $s 4 > out_$s.jsonl & done; wait
node <branch>/shared/tools/balance-sim/agg.mjs
```

A match costs a fraction of a second to a few seconds of CPU; the full set takes in the order of a quarter of an hour on four
slots. A variant is the same run with `OVERRIDE` set (in its own folder, so the outputs do not mix).

The 2026-11-08 results (1v1, 1440 paired configs; the share of decided 2v2s in brackets): Minori at damage 5 won 70.1% (62%),
Saori 31.5% (28%), Maki at damage 5 68.5% (67%), Koyuki 65.3% (66%). Minori's variants: damage 4 52.5%, 700 RPM 68.5%, the M4's
bloom 73.7% — the damage did it. Maki at 4.5: 57.3%, even with Koyuki head to head. Both were set to 4.5 (b1105dt).

Known: about half the 2v2s end in a stalemate — one survivor a side who never meet — for every subject alike; compare the decided
matches.
