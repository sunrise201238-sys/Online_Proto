"""A picture of a generator reading (cells.json): walked floor in greens by height, things in reds by height, the void
grey; with a second cells.json, the cells it walks and the first does not are painted magenta (lost) and cyan (gained).
Model metres; a 1 m grid every 10 m with labels. usage: python3 -I cells_png.py <cells.json> <out.png> x0 x1 z0 z1 [px/m=8] [other cells.json]"""
import json, sys
from PIL import Image, ImageDraw
A = json.load(open(sys.argv[1])); out = sys.argv[2]; x0, x1, z0, z1 = map(float, sys.argv[3:7]); ppm = float(sys.argv[7]) if len(sys.argv) > 7 else 8
B = json.load(open(sys.argv[8])) if len(sys.argv) > 8 else None
nx, nz, X0, Z0, CELL = A['nx'], A['nz'], A['X0'], A['Z0'], A['CELL']
re_, fl, H, kind = A['reach'], A['floorH'], A['H'], A['kind']
W, Hh = int((x1 - x0) * ppm), int((z1 - z0) * ppm); im = Image.new('RGB', (W, Hh), (40, 40, 40)); px = im.load()
def col(j):
    if B is not None:
        if re_[j] and not B['reach'][j]: return (230, 40, 230)
        if B['reach'][j] and not re_[j]: return (40, 220, 230)
    if re_[j]:
        f = fl[j] or 0
        if kind[j] == 1: return (70, 120, 220)
        if f < -0.3: return (120, 180, 200)
        g = max(0, min(1, f / 3)); return (int(228 - 170 * g), int(224 - 85 * g), int(214 - 130 * g))
    h = H[j] or 0
    if h <= 0.1: return (120, 120, 120)
    if h <= 1.5: return (242, 209, 107)
    if h <= 3: return (235, 154, 78)
    if h <= 8: return (215, 90, 58)
    return (122, 42, 90)
for py in range(Hh):
    zm = z0 + (py + 0.5) / ppm; k = int((zm - Z0) / CELL)
    for pxi in range(W):
        xm = x0 + (pxi + 0.5) / ppm; i = int((xm - X0) / CELL)
        if 0 <= i < nx and 0 <= k < nz: px[pxi, py] = col(k * nx + i)
d = ImageDraw.Draw(im)
gx = int(x0 // 10 * 10)
while gx <= x1:
    X = (gx - x0) * ppm; d.line([(X, 0), (X, Hh)], fill=(255, 255, 255), width=1); d.text((X + 2, 2), str(gx), fill=(255, 255, 255)); gx += 10
gz = int(z0 // 10 * 10)
while gz <= z1:
    Z = (gz - z0) * ppm; d.line([(0, Z), (W, Z)], fill=(255, 255, 255), width=1); d.text((2, Z + 2), str(gz), fill=(255, 255, 255)); gz += 10
im.save(out); print(out, im.size)
