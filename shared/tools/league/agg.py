# agg.py <tree units json> <1v1 files...> -- <2v2 files...> [-- <set files...>] — the league's tables: each unit's 1v1 win rate
# over every opponent and map; each unit's 2v2 win rate; a strength fitted to the 2v2 results (a team's chance from the sum of
# its two units' strengths); the teams that won most, and how far each stands above what its two units' strengths foretell.
import json, sys, math, collections
args = sys.argv[1:]; names = json.load(open(args[0])); groups = [[]]
for a in args[1:]:
    if a == '--': groups.append([])
    else: groups[-1].append(a)
def load(files):
    out = []
    for f in files:
        try:
            for line in open(f):
                line = line.strip()
                if line: out.append(json.loads(line))
        except FileNotFoundError: pass
    return out
nm = lambda k: names.get(k, k)
# ---- 1v1
g1 = load(groups[0]); W = collections.defaultdict(float); G = collections.defaultdict(int); byMap = collections.defaultdict(lambda: [0.0, 0]); H = collections.defaultdict(lambda: [0.0, 0]); ko = 0; T = []
for r in g1:
    a, b = r['a'][0], r['b'][0]; sa = 1.0 if r['w'] == 'A' else (0.5 if r['w'] == 'D' else 0.0)
    W[a] += sa; W[b] += 1 - sa; G[a] += 1; G[b] += 1; byMap[(a, r['map'])][0] += sa; byMap[(a, r['map'])][1] += 1; byMap[(b, r['map'])][0] += 1 - sa; byMap[(b, r['map'])][1] += 1
    H[(a, b)][0] += sa; H[(a, b)][1] += 1; H[(b, a)][0] += 1 - sa; H[(b, a)][1] += 1; ko += 1 if r['ko'] else 0; T.append(r['t'])
maps = sorted({r['map'] for r in g1})
print(f"1v1: {len(g1)} matches, {ko} ended by knockout, median length {sorted(T)[len(T)//2] if T else 0} s; maps {maps}")
rank1 = sorted(G, key=lambda k: -W[k] / G[k])
for k in rank1:
    beats = sum(1 for o in G if o != k and H[(k, o)][1] and H[(k, o)][0] / H[(k, o)][1] > 0.5)
    print(f"  {nm(k):8s} {100 * W[k] / G[k]:5.1f}%  n={G[k]:3d}  beats {beats:2d} of 19   " + '  '.join(f"{m}:{100 * byMap[(k, m)][0] / max(1, byMap[(k, m)][1]):3.0f}" for m in maps))
# ---- 2v2
g2 = load(groups[1]) if len(groups) > 1 else []
UW = collections.defaultdict(float); UG = collections.defaultdict(int); CW = collections.defaultdict(float); CG = collections.defaultdict(int)
for r in g2:
    sa = 1.0 if r['w'] == 'A' else (0.5 if r['w'] == 'D' else 0.0)
    for side, s in ((r['a'], sa), (r['b'], 1 - sa)):
        key = tuple(sorted(side)); CW[key] += s; CG[key] += 1
        for u in set(side): UW[u] += s; UG[u] += 1
print(f"\n2v2: {len(g2)} matches, {sum(1 for r in g2 if r['ko'])} ended by knockout, median length {sorted(r['t'] for r in g2)[len(g2)//2] if g2 else 0} s")
units = sorted(UG)
# a strength per unit: logistic fit, P(A wins) = sigmoid(sum A - sum B)
th = {u: 0.0 for u in units}
for it in range(400):
    grad = {u: 0.0 for u in units}
    for r in g2:
        sa = 1.0 if r['w'] == 'A' else (0.5 if r['w'] == 'D' else 0.0)
        z = sum(th[u] for u in r['a']) - sum(th[u] for u in r['b']); p = 1 / (1 + math.exp(-z)); e = sa - p
        for u in r['a']: grad[u] += e
        for u in r['b']: grad[u] -= e
    for u in units: th[u] += 0.02 * grad[u] / max(1, UG[u]) * 20 - 0.0005 * th[u]
mean = sum(th.values()) / max(1, len(th))
print("  unit      win%   n    strength")
for u in sorted(units, key=lambda k: -th[k]): print(f"  {nm(u):8s} {100 * UW[u] / UG[u]:5.1f}%  {UG[u]:4d}  {th[u] - mean:+.2f}")
print("\n  teams with 8 or more matches, by win rate (top 14, bottom 6):")
comps = [c for c in CG if CG[c] >= 8]
def pred(c):  # the chance the fit gives this team against an average team
    z = th[c[0]] + th[c[1]] - 2 * mean; return 1 / (1 + math.exp(-z))
rows = sorted(comps, key=lambda c: -(CW[c] / CG[c]))
for c in rows[:14] + rows[-6:]: print(f"  {nm(c[0]) + ' + ' + nm(c[1]):22s} {100 * CW[c] / CG[c]:5.1f}%  n={CG[c]:2d}  the fit foretells {100 * pred(c):3.0f}%")
print("\n  the fit's own top 12 teams (the sum of two strengths):")
allc = sorted(((th[a] + th[b], a, b) for i, a in enumerate(units) for b in units[i:]), reverse=True)
for sm, a, b in allc[:12]: print(f"  {nm(a) + ' + ' + nm(b):22s} foretold {100 / (1 + math.exp(-(sm - 2 * mean))):3.0f}%   played {CG.get(tuple(sorted((a, b))), 0)}")
# ---- the set (a round robin of chosen teams)
if len(groups) > 2:
    g3 = load(groups[2]); SW = collections.defaultdict(float); SG = collections.defaultdict(int)
    for r in g3:
        sa = 1.0 if r['w'] == 'A' else (0.5 if r['w'] == 'D' else 0.0)
        ka, kb = ' + '.join(nm(u) for u in r['a']), ' + '.join(nm(u) for u in r['b']); SW[ka] += sa; SG[ka] += 1; SW[kb] += 1 - sa; SG[kb] += 1
    print(f"\nround robin of the chosen teams: {len(g3)} matches")
    for k in sorted(SG, key=lambda k: -SW[k] / SG[k]): print(f"  {k:22s} {100 * SW[k] / SG[k]:5.1f}%  n={SG[k]}")
