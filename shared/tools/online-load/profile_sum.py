# usage: python3 -I profile_sum.py <dir with one .cpuprofile> [top=16] : self time by function, and the time under a few named functions (all that they call)
import json, sys, os, collections
d = sys.argv[1]; top = int(sys.argv[2]) if len(sys.argv) > 2 else 16
p = [f for f in os.listdir(d) if f.endswith('.cpuprofile')][0]; j = json.load(open(os.path.join(d, p)))
nodes = {n['id']: n for n in j['nodes']}; dt = j['timeDeltas']; samples = j['samples']
self_us = collections.Counter()
for s, t in zip(samples, dt): self_us[s] += t
total = sum(self_us.values())
name = lambda n: (n['callFrame']['functionName'] or '(anon)') + ' ' + os.path.basename(n['callFrame']['url'] or '') + (':%d' % n['callFrame']['lineNumber'] if n['callFrame']['url'] else '')
byf = collections.Counter()
for i, us in self_us.items(): byf[name(nodes[i])] += us
print('total %.1f s' % (total / 1e6))
for k, v in byf.most_common(top): print('  %5.1f%%  %s' % (100 * v / total, k[:90]))
# inclusive time under named functions
kids = {n['id']: n.get('children', []) for n in j['nodes']}
def incl(i): return self_us.get(i, 0) + sum(incl(c) for c in kids[i])
sys.setrecursionlimit(100000)
want = ['findFiringPath', 'findPath', 'findHiddenSpot', 'tickBot', 'tickMatch', 'sightClear', 'botHasLineOfSight', 'segmentHitsObstacle', 'obstaclesNearSegment', 'truncateAtFiringPoint', 'navBrainTick', 'tickSdBrain']
agg = collections.Counter()
def walk(i, inside):
    fn = nodes[i]['callFrame']['functionName']
    for w in want:
        if fn == w and w not in inside: agg[w] += incl(i); inside = inside | {w}
    for c in kids[i]: walk(c, inside)
walk(j['nodes'][0]['id'], frozenset())
print('  under: ' + ', '.join('%s %.1f%%' % (k, 100 * v / total) for k, v in agg.most_common()))
