"""The floor regions one generator reading walked and another does not, each with its FRONTIER classified: what the
region's cells touch — floor the new reading walks (and the step up to it), a column with no floor layer at all (and the
surfaces it does have: a doorway under a lintel shows as a street-level surface with a ceiling 1-2 m up), a column with a
thing standing (and how tall), or floor the new reading does not walk either.
usage: python3 -I lost_regions2.py <old cells.json> <new cells.json> [top=8]"""
import json, sys
A = json.load(open(sys.argv[1])); B = json.load(open(sys.argv[2])); top = int(sys.argv[3]) if len(sys.argv) > 3 else 8
nx, nz, X0, Z0, CELL = A['nx'], A['nz'], A['X0'], A['Z0'], A['CELL']
ra, rb, fa, fb, H, L, ST, SU = A['reach'], B['reach'], A['floorH'], B['floorH'], A['H'], A['layers'], A['standTop'], A['surfs']
def regions(cells):
    S = set(cells); seen = set(); out = []
    for j in cells:
        if j in seen: continue
        st = [j]; seen.add(j); got = []
        while st:
            c = st.pop(); got.append(c); i = c % nx; k = c // nx
            for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ii, kk = i + di, k + dk
                if 0 <= ii < nx and 0 <= kk < nz:
                    m = kk * nx + ii
                    if m in S and m not in seen: seen.add(m); st.append(m)
        out.append(got)
    return sorted(out, key=len, reverse=True)
lost = [j for j in range(nx * nz) if ra[j] and not rb[j]]
print(f'LOST: {len(lost)} cells = {len(lost) * CELL * CELL:.1f} m2 in {len(regions(lost))} regions; the {top} largest:')
for r in regions(lost)[:top]:
    S = set(r); xs = [c % nx for c in r]; zs = [c // nx for c in r]; fl = [fa[c] for c in r if fa[c] is not None]
    print(f'\n{len(r):6d} cells {len(r) * CELL * CELL:7.1f} m2  x {X0 + min(xs) * CELL:7.2f}..{X0 + (max(xs) + 1) * CELL:7.2f}  z {Z0 + min(zs) * CELL:7.2f}..{Z0 + (max(zs) + 1) * CELL:7.2f}  old floor {min(fl):.2f}..{max(fl):.2f}')
    kinds = {}; ex = {}
    for c in r:
        i = c % nx; k = c // nx
        for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ii, kk = i + di, k + dk
            if not (0 <= ii < nx and 0 <= kk < nz): key = 'grid edge'
            else:
                m = kk * nx + ii
                if m in S: continue
                pos = f'({X0 + (ii + 0.5) * CELL:.1f},{Z0 + (kk + 0.5) * CELL:.1f})'
                if rb[m]: d = (fb[m] or 0) - (fa[c] or 0); key = f'walked floor, step {"<=0.65" if abs(d) <= 0.65 else ("up %.1f" % d if d > 0 else "down %.1f" % -d)}'
                elif L[m] is None: su = SU[m] if SU and SU[m] else None; key = f'no floor layer, surfaces {[round(v, 1) for v in su][:4] if su else None}, top H {round(H[m] or 0, 1)}'
                elif ST[m] is not None: key = f'thing standing {round(ST[m] - (fa[c] or 0), 1)} m over the lost floor'
                elif ra[m] and not rb[m]: key = 'lost floor of another region'
                else: key = f'floor nobody walks (old {ra[m]} new {rb[m]}), layers {[x[0] for x in L[m]]}'
                ex.setdefault(key, pos)
            kinds[key] = kinds.get(key, 0) + 1
    for key, n in sorted(kinds.items(), key=lambda kv: -kv[1])[:8]: print(f'    {n:5d}  {key}  e.g. {ex.get(key, "")}')
