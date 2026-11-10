"""Simple collision for Dust, map-wide (user 2026-11-10: "照今天斜坡和箱子的做法，把整張 Dust 一區一區對照外觀改成簡單的碰撞方塊").
usage: python3 dust_clean.py <in_data.json> <out_data.json>
Three patterns the generator leaves, each rebuilt the way the ramp and the cage crate were (b1105ew):
  A. a slope cut into strips (planes of one slope, side by side, over a staircase of boxes): one plane per rectangle of the
     slope's own cells, fitted to all its strips, over solid steps that stay under it; a slope with a floor under it (a way
     through) keeps its boxes.
  B. a thing standing on the ground made of many boxes (a crate, a barrel, a pile): its outline as one box with one lid, or a
     body and a top box where its tops differ, as Town's cars; only where the outline fills 75% of itself and leaves no
     body-sized gap of ground inside.
  C. rubble: a small floor standing a little over the ground around it, with no box under it, is laid flat at that ground.
"""
import json, math, sys
from collections import defaultdict

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
ob, fl = d['obstacles'], d['surfaces']
BODY_H = 6.4

def ci(v): return int(round(v - 0.4))
def cells(o):
    for x in range(ci(o['minX']), max(ci(o['maxX']), ci(o['minX']) + 1)):
        for z in range(ci(o['minZ']), max(ci(o['maxZ']), ci(o['minZ']) + 1)):
            yield (x, z)
def touch(a, b, e=0.05):
    return a['minX'] <= b['maxX'] + e and b['minX'] <= a['maxX'] + e and a['minZ'] <= b['maxZ'] + e and b['minZ'] <= a['maxZ'] + e
def overlap_area(a, b):
    return max(0, min(a['maxX'], b['maxX']) - max(a['minX'], b['minX'])) * max(0, min(a['maxZ'], b['maxZ']) - max(a['minZ'], b['minZ']))
def area(o): return (o['maxX'] - o['minX']) * (o['maxZ'] - o['minZ'])
def py(f, x, z):   # a floor's height at a point
    if f.get('type') == 'plane': return f['y0'] + f.get('gx', 0) * (x - f['minX']) + f.get('gz', 0) * (z - f['minZ'])
    return f['maxTop']
def fmin(f):
    if f.get('type') != 'plane': return f['maxTop']
    return min(py(f, x, z) for x in (f['minX'], f['maxX']) for z in (f['minZ'], f['maxZ']))

class Grid:   # a coarse spatial index
    def __init__(s, items, k=8):
        s.k = k; s.g = defaultdict(list)
        for i, o in enumerate(items):
            for gx in range(math.floor(o['minX'] / k), math.floor(o['maxX'] / k) + 1):
                for gz in range(math.floor(o['minZ'] / k), math.floor(o['maxZ'] / k) + 1): s.g[(gx, gz)].append(i)
    def near(s, o, e=0.05):
        out_ = set()
        for gx in range(math.floor((o['minX'] - e) / s.k), math.floor((o['maxX'] + e) / s.k) + 1):
            for gz in range(math.floor((o['minZ'] - e) / s.k), math.floor((o['maxZ'] + e) / s.k) + 1): out_.update(s.g.get((gx, gz), ()))
        return out_
FG, BG = Grid(fl), Grid(ob)
gone_f, gone_b, new_f, new_b = set(), set(), [], []
stats = defaultdict(int)

# ---------- A. slopes cut into strips ----------
planes = [i for i, f in enumerate(fl) if f.get('type') == 'plane' and max(abs(f.get('gx', 0)), abs(f.get('gz', 0))) <= 0.8]
pset = set(planes); parent = {i: i for i in planes}
def find(i):
    while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
    return i
for i in planes:
    a = fl[i]
    for j in FG.near(a):
        if j <= i or j not in pset: continue
        b = fl[j]
        if not touch(a, b) or abs(a.get('gx', 0) - b.get('gx', 0)) > 0.05 or abs(a.get('gz', 0) - b.get('gz', 0)) > 0.05: continue
        # continuous where they meet: compare heights at the middle of the shared boundary
        mx = (max(a['minX'], b['minX']) + min(a['maxX'], b['maxX'])) / 2; mz = (max(a['minZ'], b['minZ']) + min(a['maxZ'], b['maxZ'])) / 2
        if abs(py(a, mx, mz) - py(b, mx, mz)) <= 0.2:
            ra, rb = find(i), find(j)
            if ra != rb: parent[ra] = rb
clusters = defaultdict(list)
for i in planes: clusters[find(i)].append(i)
for cl in clusters.values():
    if len(cl) < 4: continue
    pts = [(x, z, py(fl[i], x, z)) for i in cl for x in (fl[i]['minX'], fl[i]['maxX']) for z in (fl[i]['minZ'], fl[i]['maxZ'])]
    # least squares y = a + b x + c z
    n = len(pts); sx = sum(p[0] for p in pts); sz = sum(p[1] for p in pts); sy = sum(p[2] for p in pts)
    sxx = sum(p[0] ** 2 for p in pts); szz = sum(p[1] ** 2 for p in pts); sxz = sum(p[0] * p[1] for p in pts)
    sxy = sum(p[0] * p[2] for p in pts); szy = sum(p[1] * p[2] for p in pts)
    M = [[n, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]]; V = [sy, sxy, szy]
    def det3(m): return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    D = det3(M)
    if abs(D) < 1e-9: continue
    sol = []
    for c in range(3):
        Mc = [row[:] for row in M]
        for r in range(3): Mc[r][c] = V[r]
        sol.append(det3(Mc) / D)
    A0, GXf, GZf = sol
    err = max(abs(A0 + GXf * x + GZf * z - y) for x, z, y in pts)
    if err > 0.2: stats['A slope fit too loose'] += 1; continue
    Y = lambda x, z: A0 + GXf * x + GZf * z
    cs = set()
    for i in cl: cs.update(cells(fl[i]))
    # a floor under the slope by a body's height or more: a way through, keep the boxes
    under_way = False
    for i in cl:
        for j in FG.near(fl[i]):
            if j in pset and find(j) == find(cl[0]): continue
            g = fl[j]
            if overlap_area(g, fl[i]) > 0.25 and g['maxTop'] < fmin(fl[i]) - BODY_H: under_way = True; break
        if under_way: break
    # rectangles of the slope's cells: its outline alone where the slope fills 85% of it and no other floor lies inside
    bx0 = min(c[0] for c in cs); bx1 = max(c[0] for c in cs); bz0 = min(c[1] for c in cs); bz1 = max(c[1] for c in cs)
    whole = len(cs) / ((bx1 - bx0 + 1) * (bz1 - bz0 + 1)) >= 0.85
    if whole:
        ob_ = {'minX': bx0 + 0.4, 'maxX': bx1 + 1.4, 'minZ': bz0 + 0.4, 'maxZ': bz1 + 1.4}
        for j in FG.near(ob_):
            if j in cl or overlap_area(fl[j], ob_) <= 0.25: continue
            g = fl[j]
            if abs(py(g, (g['minX'] + g['maxX']) / 2, (g['minZ'] + g['maxZ']) / 2) - Y((g['minX'] + g['maxX']) / 2, (g['minZ'] + g['maxZ']) / 2)) < BODY_H: whole = False; break
    if whole: cs = {(x, z) for x in range(bx0, bx1 + 1) for z in range(bz0, bz1 + 1)}
    done = set(); rects = []
    for (x, z) in sorted(cs, key=lambda k: (k[1], k[0])):
        if (x, z) in done: continue
        x1 = x
        while (x1 + 1, z) in cs and (x1 + 1, z) not in done: x1 += 1
        z1 = z
        while all((xx, z1 + 1) in cs and (xx, z1 + 1) not in done for xx in range(x, x1 + 1)): z1 += 1
        for xx in range(x, x1 + 1):
            for zz in range(z, z1 + 1): done.add((xx, zz))
        rects.append((x + 0.4, x1 + 1.4, z + 0.4, z1 + 1.4))
    for i in cl: gone_f.add(i)
    for (x0, x1, z0, z1) in rects:
        ys = [Y(x, z) for x in (x0, x1) for z in (z0, z1)]
        new_f.append({'minX': round(x0, 2), 'maxX': round(x1, 2), 'minZ': round(z0, 2), 'maxZ': round(z1, 2), 'maxTop': round(max(ys), 3),
                      'type': 'plane', 'y0': round(Y(x0, z0), 3), 'gx': round(GXf, 5), 'gz': round(GZf, 5)})
    stats['A slopes'] += 1; stats['A strips in'] += len(cl); stats['A planes out'] += len(rects)
    if under_way: stats['A slopes over a way through, boxes kept'] += 1; continue
    # the staircase under it: boxes inside the slope's cells whose tops do not rise over it
    sup = []
    for j in set().union(*[BG.near(fl[i]) for i in cl]):
        o = ob[j]
        if j in gone_b: continue
        oc = list(cells(o))
        if not oc or any(c not in cs for c in oc): continue
        top_ok = o['maxY'] <= max(Y(x, z) for x in (o['minX'], o['maxX']) for z in (o['minZ'], o['maxZ'])) + 0.05
        if top_ok and o['maxY'] - o['minY'] > 0.3: sup.append(j)
    if not sup: continue
    base = min(ob[j]['minY'] for j in sup)
    steep_x = abs(GXf) > abs(GZf)
    STEP = max(1.0, math.floor(1.0 / max(abs(GXf), abs(GZf), 1e-3)))
    steps = []
    for (x0, x1, z0, z1) in rects:
        lo, hi = (x0, x1) if steep_x else (z0, z1)
        k = lo
        while k < hi - 1e-6:
            k2 = min(hi, k + STEP)
            bx = (k, k2, z0, z1) if steep_x else (x0, x1, k, k2)
            top = min(Y(x, z) for x in (bx[0], bx[1]) for z in (bx[2], bx[3])) - 0.02
            if top > base + 0.3:
                steps.append({'minX': round(bx[0], 2), 'maxX': round(bx[1], 2), 'minZ': round(bx[2], 2), 'maxZ': round(bx[3], 2), 'minY': base, 'maxY': round(top, 2), 'topBuffer': 0.8})
            k = k2
    if len(steps) >= len(sup): stats['A staircases kept (no fewer steps)'] += 1; continue
    for j in sup: gone_b.add(j)
    new_b.extend(steps)
    stats['A boxes in'] += len(sup); stats['A steps out'] += len(steps)

# ---------- B. things on the ground made of many boxes ----------
FG2 = FG
def ground_by(o):   # the floor around a box: the lowest floor touching its edges (not over it)
    hs = [fmin(fl[j]) for j in FG.near(o) if j not in gone_f and touch(fl[j], o) and overlap_area(fl[j], o) < 0.5 * area(o) and fmin(fl[j]) < o['maxY'] - 0.5]
    return min(hs) if hs else None
lidded = set()
for i, o in enumerate(ob):
    for j in FG.near(o):
        f = fl[j]
        if f.get('type') != 'plane' and abs(f['maxTop'] - o['maxY']) <= 0.05 and overlap_area(f, o) > 0: lidded.add(i)
cand = []
for i, o in enumerate(ob):
    if i in gone_b or o.get('noProjectile'): continue
    g = ground_by(o)
    if g is None: continue
    h = o['maxY'] - g
    if 1.5 <= h <= 16 and (o['maxX'] - o['minX']) <= 20 and (o['maxZ'] - o['minZ']) <= 20: cand.append((i, g))
cset = {i: g for i, g in cand}
par = {i: i for i in cset}
def f2(i):
    while par[i] != i: par[i] = par[par[i]]; i = par[i]
    return i
for i in cset:
    for j in BG.near(ob[i]):
        if j <= i or j not in cset: continue
        a, b = ob[i], ob[j]
        if touch(a, b) and a['maxY'] > b['minY'] and b['maxY'] > a['minY'] and overlap_area(a, b) >= 0 :
            ri, rj = f2(i), f2(j)
            if ri != rj: par[ri] = rj
groups = defaultdict(list)
for i in cset: groups[f2(i)].append(i)
for g in groups.values():
    if len(g) < 3: continue
    os_ = [ob[i] for i in g]
    bb = {'minX': min(o['minX'] for o in os_), 'maxX': max(o['maxX'] for o in os_), 'minZ': min(o['minZ'] for o in os_), 'maxZ': max(o['maxZ'] for o in os_)}
    if bb['maxX'] - bb['minX'] > 20 or bb['maxZ'] - bb['minZ'] > 20: stats['B too big'] += 1; continue
    gc = set()
    for o in os_: gc.update(cells(o))
    bc = set(cells(bb))
    if len(gc) / max(1, len(bc)) < 0.75: stats['B outline too empty'] += 1; continue
    free = bc - gc
    if any(all((x + a, z + b) in free for a in range(3) for b in range(3)) for (x, z) in free): stats['B ground gap inside'] += 1; continue
    # another thing's floor inside the outline (not this thing's lids, not the ground under it): leave it
    gnd = min(cset[i] for i in g); tops = sorted(o['maxY'] for o in os_)
    clash = False
    for j in FG.near(bb):
        f = fl[j]
        if j in gone_f or overlap_area(f, bb) <= 0.25: continue
        if fmin(f) <= gnd + 0.6: continue                      # the ground it stands on
        if any(abs(f['maxTop'] - o['maxY']) <= 0.05 and overlap_area(f, o) > 0 for o in os_): continue   # its own lid
        clash = True; break
    if clash: stats['B other floor inside'] += 1; continue
    base = min(o['minY'] for o in os_)
    # one height, or a body and a top (as Town's cars)
    wt = defaultdict(float)
    for o in os_: wt[round(o['maxY'], 2)] += area(o)
    med = sorted(wt.items(), key=lambda t: -t[1])[0][0]
    hiset = [o for o in os_ if o['maxY'] > med + 1.5]
    boxes = []
    if tops[-1] - tops[0] <= 3 or not hiset:
        boxes.append(dict(bb, minY=base, maxY=tops[-1] if tops[-1] - tops[0] <= 3 else med))
    else:
        hb = {'minX': min(o['minX'] for o in hiset), 'maxX': max(o['maxX'] for o in hiset), 'minZ': min(o['minZ'] for o in hiset), 'maxZ': max(o['maxZ'] for o in hiset)}
        hc = set()
        for o in hiset: hc.update(cells(o))
        if len(hc) / max(1, len(set(cells(hb)))) < 0.6: stats['B top too ragged'] += 1; continue
        boxes.append(dict(bb, minY=base, maxY=med)); boxes.append(dict(hb, minY=med, maxY=max(o['maxY'] for o in hiset)))
    for i in g: gone_b.add(i)
    for j in FG.near(bb):   # its old lids go
        f = fl[j]
        if f.get('type') != 'plane' and any(abs(f['maxTop'] - o['maxY']) <= 0.05 and overlap_area(f, o) > 0.5 * area(f) for o in os_): gone_f.add(j)
    for b in boxes:
        b = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in b.items()}; b['topBuffer'] = 0.8
        new_b.append(b)
        new_f.append({'minX': b['minX'], 'maxX': b['maxX'], 'minZ': b['minZ'], 'maxZ': b['maxZ'], 'maxTop': b['maxY'], 'type': 'flat', 'top': b['maxY'], 'lid': 1})
    stats['B things'] += 1; stats['B boxes in'] += len(g); stats['B boxes out'] += len(boxes)

# ---------- C. rubble ----------
for i, f in enumerate(fl):
    if i in gone_f or max(f['maxX'] - f['minX'], f['maxZ'] - f['minZ']) > 3: continue
    if any(abs(ob[j]['maxY'] - f['maxTop']) <= 0.1 and overlap_area(ob[j], f) > 0 for j in BG.near(f) if j not in gone_b): continue   # a box's lid
    lo = fmin(f)
    base = [fl[j]['maxTop'] for j in FG.near(f) if j != i and j not in gone_f and fl[j].get('type') != 'plane' and touch(fl[j], f)
            and max(fl[j]['maxX'] - fl[j]['minX'], fl[j]['maxZ'] - fl[j]['minZ']) > 3 and lo - 1.0 <= fl[j]['maxTop'] <= lo + 0.1]
    if not base: continue
    b = max(base)
    if 0.2 <= f['maxTop'] - b <= 1.0:
        gone_f.add(i); new_f.append({'minX': f['minX'], 'maxX': f['maxX'], 'minZ': f['minZ'], 'maxZ': f['maxZ'], 'maxTop': b, 'type': 'flat', 'top': b})
        stats['C rubble flattened'] += 1

d['surfaces'] = [f for i, f in enumerate(fl) if i not in gone_f] + new_f
d['obstacles'] = [o for i, o in enumerate(ob) if i not in gone_b] + new_b
json.dump(d, open(out, 'w', encoding='utf-8'), separators=(',', ':'))
for k in sorted(stats): print(f'{k}: {stats[k]}')
print(f'boxes {len(ob)} -> {len(d["obstacles"])}; floors {len(fl)} -> {len(d["surfaces"])}')
