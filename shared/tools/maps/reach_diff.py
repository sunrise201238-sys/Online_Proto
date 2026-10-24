"""Two reach_fill dumps (REACHED_OUT) compared: the cells a body reaches in one and not the other, as regions with their
box (model metres) and floors; and each dump's pits. usage: python3 -I reach_diff.py <old.json> <new.json> [top=10]"""
import json, sys
A = json.load(open(sys.argv[1])); B = json.load(open(sys.argv[2])); top = int(sys.argv[3]) if len(sys.argv) > 3 else 10
x0, z0, CELL, nz = A['x0'], A['z0'], A['CELL'], A['nz']
ca = {(i, k): f for i, k, f in A['cells']}; cb = {(i, k): f for i, k, f in B['cells']}
def regions(keys):
    S = set(keys); seen = set(); out = []
    for c in keys:
        if c in seen: continue
        st = [c]; seen.add(c); got = []
        while st:
            q = st.pop(); got.append(q)
            for d in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                m = (q[0] + d[0], q[1] + d[1])
                if m in S and m not in seen: seen.add(m); st.append(m)
        out.append(got)
    return sorted(out, key=len, reverse=True)
def show(name, keys, floors):
    print(f'{name}: {len(keys)} cells = {len(keys) * CELL * CELL:.1f} m2 in {len(regions(keys))} regions')
    for r in regions(keys)[:top]:
        xs = [c[0] for c in r]; zs = [c[1] for c in r]; fl = [floors[c] / 4 for c in r]
        print(f'  {len(r):6d} cells {len(r) * CELL * CELL:7.1f} m2  x {x0 + min(xs) * CELL:7.2f}..{x0 + (max(xs) + 1) * CELL:7.2f}  z {z0 + min(zs) * CELL:7.2f}..{z0 + (max(zs) + 1) * CELL:7.2f}  floor {min(fl):.2f}..{max(fl):.2f} m')
show('LOST to the body (reached before, not now)', [c for c in ca if c not in cb], ca)
show('GAINED by the body (reached now, not before)', [c for c in cb if c not in ca], cb)
for name, D in (('old', A), ('new', B)):
    P = [(i, k) for i, k, f in D['pits']]; pf = {(i, k): f for i, k, f in D['pits']}
    print(f'pits {name}: {len(P)} cells in {len(regions(P))} regions' + ''.join(f'\n  {len(r):5d} cells  x {x0 + min(c[0] for c in r) * CELL:7.2f}..{x0 + (max(c[0] for c in r) + 1) * CELL:7.2f}  z {z0 + min(c[1] for c in r) * CELL:7.2f}..{z0 + (max(c[1] for c in r) + 1) * CELL:7.2f}  floor {min(pf[c] for c in r) / 4:.2f}..{max(pf[c] for c in r) / 4:.2f}' for r in regions(P)[:top]))
