"""Generated data at a world box (model metres): the surfaces and boxes there (arena units), and a cell chart of the dump
(each char = one cell column at the given stride: '.' unreached, digits = reached floor height in 0.5 m steps above the street
(0..9, letters past 9, '-' below), '#' = a wall/thing top >= 1.5 m, 'o' low thing, 'v' void wall).
usage: python3 -I data_at.py <out dir> <key> x0 x1 z0 z1 [stride cells]"""
import json, sys, math
d, key, x0, x1, z0, z1 = sys.argv[1:7]; x0, x1, z0, z1 = map(float, (x0, x1, z0, z1)); stride = int(sys.argv[7]) if len(sys.argv) > 7 else 2
J = json.load(open(f'{d}/{key}.json')); C = json.load(open(f'{d}/{key}.cells.json')); T = J['transform']; S = T['scale']; cx, cz = T['cx'], T['cz']
ax0, ax1, az0, az1 = (x0 - cx) * S, (x1 - cx) * S, (z0 - cz) * S, (z1 - cz) * S
print(f'box model x {x0}..{x1} z {z0}..{z1} = arena x {ax0:.0f}..{ax1:.0f} z {az0:.0f}..{az1:.0f}')
print('--- surfaces (arena units, top above street) ---')
for s in J['surfaces']:
    if s['maxX'] < ax0 or s['minX'] > ax1 or s['maxZ'] < az0 or s['minZ'] > az1: continue
    print(' ', {k: s[k] for k in s if k not in ('maxTop',)})
print('--- obstacles ---')
for i, o in enumerate(J['obstacles']):
    if o['maxX'] < ax0 or o['minX'] > ax1 or o['maxZ'] < az0 or o['minZ'] > az1: continue
    print(' ', C['tags'][i] if i < len(C['tags']) else '?', o)
nx, nz, X0, Z0, CELL = C['nx'], C['nz'], C['X0'], C['Z0'], C['CELL']; fl, re, wh, kind = C['floorH'], C['reach'], C['wallH'], C['kind']
print(f'--- cells (stride {stride} = {stride*CELL} m), z down, x right from {x0} ---')
i0, i1 = int((x0 - X0) / CELL), int((x1 - X0) / CELL); k0, k1 = int((z0 - Z0) / CELL), int((z1 - Z0) / CELL)
def code(j):
    w = wh[j]
    if w is not None and not (isinstance(w, float) and math.isnan(w)) and w > 0:
        if w >= 20: return 'v'
        return '#' if w >= 1.5 else 'o'
    if not re[j]: return '.'
    h = fl[j]
    if h is None or (isinstance(h, float) and math.isnan(h)): return '?'
    n = int(round(h / 0.5))
    if n < 0: return '-'
    return '0123456789abcdefghijklmnopqrstuvwxyz'[min(35, n)]
for k in range(k0, k1 + 1, stride):
    print(f'z {Z0 + k * CELL:6.1f} ' + ''.join(code(k * nx + i) for i in range(i0, i1 + 1, stride)))
if len(sys.argv) > 8:   # a transect: every cell's fields along x at one z (model metres)
    zt = float(sys.argv[8]); k = int((zt - Z0) / CELL); print(f'--- transect at z {zt} (cells {k}) ---')
    for i in range(i0, i1 + 1):
        j = k * nx + i; row = {f: C[f][j] for f in ('reach', 'floorH', 'wallH', 'wallKey', 'standTop', 'lowTop', 'kind', 'H', 'ceilH') if f in C}
        print(f'  x {X0 + i * CELL:7.2f} ' + ' '.join(f'{f}={v}' for f, v in row.items()))
