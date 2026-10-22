"""client/src/main.js of the 0.8.9 line brought up to the PT tree's (2026-10-22): the Warehouse map's rows, the fade by the
model's objects (fadeNodes), the hull's span rule and fadeAlpha — each block or line taken from the PT file by its anchor and
put into the 0.8.9 file at the same anchor, the PT site's own additions (pt_deltas.py) left out.
usage: python3 -I port_main.py <pt main.js> <0.8.9 main.js>   (edits the second in place)"""
import sys
ptf, vf = sys.argv[1:3]
pt = open(ptf, encoding='utf-8').read(); v = open(vf, encoding='utf-8').read()
def once(t, s, what): assert t.count(s) == 1, (what, s[:70], t.count(s)); return t.index(s)
def line_starting(t, prefix): ls = [l for l in t.split('\n') if l.startswith(prefix)]; assert len(ls) == 1, (prefix, len(ls)); return ls[0] + '\n'
def between(t, start, end): i = once(t, start, 'start'); j = t.index(end, i) + len(end); return t[i:j]
# 1. the map rows
du = line_starting(v, "  dust: { file: 'maps/dust'"); wh = line_starting(pt, "  warehouse: { file: 'maps/warehouse'"); once(v, du, 'dust row'); v = v.replace(du, du + wh)
dn = line_starting(v, "  dust: { name: 'Dust' }"); wn = line_starting(pt, "  warehouse: { name: 'Warehouse' }"); once(v, dn, 'dust name'); v = v.replace(dn, dn + wn)
# 2. fadeAlpha: the fade's target and the registration
old = "    const target = blocking ? 0.25 : 1;\n"; new = line_starting(pt, "    const target = blocking ? (mesh.userData.fadeAlpha"); once(v, old, 'target'); v = v.replace(old, new)
reg = "  if (box.fadeGroup) mesh.userData.fadeGroup = box.fadeGroup;\n"; fa = line_starting(pt, "  if (box.fadeAlpha != null)"); once(v, reg, 'register'); v = v.replace(reg, reg + fa)
# 3. the fade by node: the block after tallHere
th = line_starting(pt, "  const tallHere = (cx, cy, cz, flat) =>"); once(v, th, 'tallHere')
node_block = between(pt, "  // BY NODE (`fadeNodes`): a thing is one of the model's own objects", "    return;\n  }\n")
assert node_block not in v; v = v.replace(th, th + node_block)
# 4. the seed loop's comment
seed = "  for (const mesh of meshes) {\n    const geo = geoOf.get(mesh); const pos = geo.attributes.position; const idx = indexOf(geo);\n    for (let t = 0; t + 2 < idx.length; t += 3) {\n      for (let k = 0; k < 3; k += 1) w[k].fromBufferAttribute(pos, idx[t + k]).applyMatrix4(mesh.matrixWorld);\n      const cx = (w[0].x + w[1].x + w[2].x) / 3"
once(v, seed, 'seed loop'); once(pt, seed, 'seed loop (pt)')
cm = between(pt, "  // (a face seeds the cell under its centre.", seed); cm = cm[:-len(seed)]; v = v.replace(seed, cm + seed)
# 5. the split in two passes: the segment from its marker to the function's end
mark = "  // 2. the split: each thing's triangles out of each source mesh, the claimed faces as its hull\n"; end = "    mesh.geometry = part(geo, rest);\n  }\n}\n"
vs = between(v, mark, end); ps = between(pt, mark, end); v = v.replace(vs, ps)
open(vf, 'w', encoding='utf-8').write(v); print('main.js ported: 2 rows, fadeAlpha x2, the node block (%d lines), the seed comment, the split (%d -> %d lines)' % (node_block.count('\n'), vs.count('\n'), ps.count('\n')))
