# agg2.py <names json> <1v1 files...> -- <2v2 files...> [-- <set files...>] — the league's tables over the Random cards' map
# pool: scene maps and concept maps apart and together, each unit's best and worst map, the 2v2 strength fit, the teams.
import json, sys, math, collections
args = sys.argv[1:]; names = json.load(open(args[0])); groups = [[]]
for a in args[1:]:
    if a == '--': groups.append([])
    else: groups[-1].append(a)
SCENE = {'town', 'neon', 'spacecraft', 'dust', 'warehouse', 'compound', 'hospital', 'backrooms'}
MN = {'arena2': 'Streets', 'factory2': 'Scrapyard'}
mn = lambda m: MN.get(m, m.capitalize())
def load(files):
    out = []
    for f in files:
        try:
            for line in open(f):
                line = line.strip()
                if line:
                    try: out.append(json.loads(line))
                    except ValueError: pass
        except FileNotFoundError: pass
    return out
nm = lambda k: names.get(k, k)
sc = lambda r: 1.0 if r['w'] == 'A' else (0.5 if r['w'] == 'D' else 0.0)
pct = lambda w, g: 100 * w / g if g else float('nan')
# ---- 1v1
g1 = load(groups[0]); W = collections.defaultdict(float); G = collections.defaultdict(int); BM = collections.defaultdict(lambda: [0.0, 0]); SEC = collections.defaultdict(lambda: [0.0, 0]); H = collections.defaultdict(lambda: [0.0, 0])
for r in g1:
    a, b = r['a'][0], r['b'][0]; sa = sc(r); sec = 'S' if r['map'] in SCENE else 'C'
    for u, s in ((a, sa), (b, 1 - sa)):
        W[u] += s; G[u] += 1; BM[(u, r['map'])][0] += s; BM[(u, r['map'])][1] += 1; SEC[(u, sec)][0] += s; SEC[(u, sec)][1] += 1
    H[(a, b)][0] += sa; H[(a, b)][1] += 1; H[(b, a)][0] += 1 - sa; H[(b, a)][1] += 1
maps = sorted({r['map'] for r in g1}, key=lambda m: (m not in SCENE, m)); T = sorted(r['t'] for r in g1)
print(f"1v1: {len(g1)} matches, {sum(1 for r in g1 if r['ko'])} knockouts, median {T[len(T)//2] if T else 0} s, {len(maps)} maps; per pair {len(g1) / 190:.1f}")
rank1 = sorted(G, key=lambda k: -W[k] / G[k])
print("  unit      all    n     beats  scene  concept  best map          worst map         spread")
for k in rank1:
    beats = sum(1 for o in G if o != k and H[(k, o)][1] and H[(k, o)][0] / H[(k, o)][1] > 0.5)
    pm = sorted(((pct(*BM[(k, m)]), m) for m in maps if BM[(k, m)][1]), reverse=True); vals = [p for p, _ in pm]; mu = sum(vals) / len(vals); sd = math.sqrt(sum((v - mu) ** 2 for v in vals) / len(vals))
    print(f"  {nm(k):8s} {pct(W[k], G[k]):5.1f}% {G[k]:5d}  {beats:2d}/19  {pct(*SEC[(k, 'S')]):5.1f}  {pct(*SEC[(k, 'C')]):5.1f}    {mn(pm[0][1]):11s}{pm[0][0]:4.0f}   {mn(pm[-1][1]):11s}{pm[-1][0]:4.0f}   {sd:4.1f}")
print("\n  per map (scene first):  " + ' '.join(mn(m)[:5].rjust(5) for m in maps))
for k in rank1: print(f"  {nm(k):8s}                " + ' '.join(f"{pct(*BM[(k, m)]):5.0f}" for m in maps))
print("  n per unit and map:", sorted({BM[(k, m)][1] for k in rank1 for m in maps}))
# ---- 2v2
g2 = load(groups[1]) if len(groups) > 1 else []
UW = collections.defaultdict(float); UG = collections.defaultdict(int); CW = collections.defaultdict(float); CG = collections.defaultdict(int); US = collections.defaultdict(lambda: [0.0, 0])
for r in g2:
    sa = sc(r); sec = 'S' if r['map'] in SCENE else 'C'
    for side, s in ((r['a'], sa), (r['b'], 1 - sa)):
        key = tuple(sorted(side)); CW[key] += s; CG[key] += 1
        for u in set(side): UW[u] += s; UG[u] += 1; US[(u, sec)][0] += s; US[(u, sec)][1] += 1
T2 = sorted(r['t'] for r in g2)
print(f"\n2v2: {len(g2)} matches, {sum(1 for r in g2 if r['ko'])} knockouts, median {T2[len(T2)//2] if T2 else 0} s, {len({r['map'] for r in g2})} maps")
units = sorted(UG); th = {u: 0.0 for u in units}
for it in range(300):
    grad = {u: 0.0 for u in units}
    for r in g2:
        z = sum(th[u] for u in r['a']) - sum(th[u] for u in r['b']); e = sc(r) - 1 / (1 + math.exp(-z))
        for u in r['a']: grad[u] += e
        for u in r['b']: grad[u] -= e
    for u in units: th[u] += 0.4 * grad[u] / max(1, UG[u]) - 0.0005 * th[u]
mean = sum(th.values()) / max(1, len(th))
print("  unit      win%    n    strength  scene  concept")
for u in sorted(units, key=lambda k: -th[k]): print(f"  {nm(u):8s} {pct(UW[u], UG[u]):5.1f}%  {UG[u]:4d}  {th[u] - mean:+.2f}     {pct(*US[(u, 'S')]):5.1f}  {pct(*US[(u, 'C')]):5.1f}")
MINN = int(__import__('os').environ.get('MINN', '20'))
def pred(c): return 1 / (1 + math.exp(-(th[c[0]] + th[c[1]] - 2 * mean)))
comps = sorted((c for c in CG if CG[c] >= MINN), key=lambda c: -(CW[c] / CG[c]))
print(f"\n  teams with {MINN} or more matches ({len(comps)} teams), top 16 and bottom 8:")
for c in comps[:16] + comps[-8:]: print(f"  {nm(c[0]) + ' + ' + nm(c[1]):22s} {pct(CW[c], CG[c]):5.1f}%  n={CG[c]:3d}  fit {100 * pred(c):3.0f}%")
allc = sorted(((th[a] + th[b], a, b) for i, a in enumerate(units) for b in units[i + 1:]), reverse=True)
print("\n  the fit's top 10 teams of two different units:")
for sm, a, b in allc[:10]: c = tuple(sorted((a, b))); print(f"  {nm(a) + ' + ' + nm(b):22s} fit {100 * pred(c):3.0f}%   played {CG.get(c, 0)}  won {pct(CW.get(c, 0), CG.get(c, 0)):5.1f}%")
pick = [tuple(sorted((a, b))) for _, a, b in allc[:6]]
for c in comps:
    if len(pick) >= 12: break
    if c[0] != c[1] and c not in pick: pick.append(c)
print("\nTEAMS=" + ','.join(f"{a}+{b}" for a, b in pick))
# ---- the set
if len(groups) > 2:
    g3 = load(groups[2]); SW = collections.defaultdict(float); SG = collections.defaultdict(int); SS = collections.defaultdict(lambda: [0.0, 0]); HH = collections.defaultdict(lambda: [0.0, 0])
    for r in g3:
        sa = sc(r); sec = 'S' if r['map'] in SCENE else 'C'; ka, kb = ' + '.join(nm(u) for u in r['a']), ' + '.join(nm(u) for u in r['b'])
        for k, s in ((ka, sa), (kb, 1 - sa)): SW[k] += s; SG[k] += 1; SS[(k, sec)][0] += s; SS[(k, sec)][1] += 1
        HH[(ka, kb)][0] += sa; HH[(ka, kb)][1] += 1; HH[(kb, ka)][0] += 1 - sa; HH[(kb, ka)][1] += 1
    print(f"\nround robin: {len(g3)} matches, {sum(1 for r in g3 if r['ko'])} knockouts")
    for k in sorted(SG, key=lambda k: -SW[k] / SG[k]):
        beats = sum(1 for o in SG if o != k and HH[(k, o)][1] and HH[(k, o)][0] / HH[(k, o)][1] > 0.5)
        print(f"  {k:22s} {pct(SW[k], SG[k]):5.1f}%  n={SG[k]:3d}  beats {beats:2d}/{len(SG) - 1}  scene {pct(*SS[(k, 'S')]):5.1f}  concept {pct(*SS[(k, 'C')]):5.1f}")
