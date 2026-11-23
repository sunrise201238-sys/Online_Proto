# usage: python3 -I bench_table.py <bench.json> : what bench.mjs wrote, as tables: the maps by what they hold, then each kind of match with
# the maps ranked by the mean cost of a tick (ms on the machine that ran it), the bots' part, the shared tick's, and the worst ticks.
# (Reads the first run's file of 2026-11-23 too, which is the list of maps alone.)
import json, sys
j = json.load(open(sys.argv[1])); rows = j['rows'] if isinstance(j, dict) else j; names = [s['name'] for s in rows[0]['scen']]
if isinstance(j, dict): print('ticks counted a match %s, rounds %s, bots think every %s tick(s), search budget %s ms, players %s, Node %s' % (j.get('ticks'), j.get('rounds'), j.get('botEvery'), j.get('searchMs'), 'standing' if j.get('still') else 'walking', j.get('node')))
print('%-18s %6s %6s %6s %5s' % ('map', 'boxes', 'floors', 'nodes', 'links'))
for r in sorted(rows, key=lambda r: -r['boxes']): print('%-18s %6d %6d %6d %5d' % (r['map'], r['boxes'], r['floors'], r['nodes'], r['jumps'] + r['drops']))
for si, n in enumerate(names):
    print('== %s: mean ms a tick | of it the bots | the shared tick | 99 in 100 under | worst | ticks over 1.6 ms of %d' % (n, rows[0]['scen'][si].get('n', 0)))
    rk = sorted([r for r in rows if 'mean' in r['scen'][si]], key=lambda r: -r['scen'][si]['mean'])
    for i, r in enumerate(rk):
        s = r['scen'][si]; print('  %2d %-18s %.3f | %.3f | %.3f | %.2f | %.1f | %d' % (i + 1, r['map'], s['mean'], s['bots'], s['sim'], s['p99'], s['max'], s['over16']))
    for r in rows:
        if 'error' in r['scen'][si]: print('     %-18s %s' % (r['map'], r['scen'][si]['error']))
