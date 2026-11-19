# packverts.py <glb> — the vertices weighted to the energy-pack bones: per mesh primitive, how many, with what weight
# (full or partial), and where they sit in the bind pose (bounding box of their positions).
import json, struct, sys
b = open(sys.argv[1], 'rb').read()
n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20+n]); off = 20 + n
bn = struct.unpack_from('<I', b, off)[0]; bin_ = b[off+8:off+8+bn]
FMT = {5126: 'f', 5121: 'B', 5123: 'H', 5125: 'I'}
def acc(i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; comp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    f = FMT[a['componentType']]; size = struct.calcsize('<' + f)
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', 0) or comp * size
    out = [struct.unpack_from('<' + f * comp, bin_, start + k * stride) for k in range(a['count'])]
    if a.get('normalized') and f in 'BH': mx = 255 if f == 'B' else 65535; out = [tuple(x / mx for x in o) for o in out]
    return out
names = [nd.get('name', f'#{i}') for i, nd in enumerate(j['nodes'])]
packs = {i for i, nm in enumerate(names) if 'energypack' in nm}
for ni, nd in enumerate(j['nodes']):
    if 'mesh' not in nd or 'skin' not in nd: continue
    skin = j['skins'][nd['skin']]; joints = skin['joints']
    pj = {k for k, jn in enumerate(joints) if jn in packs}
    if not pj: continue
    me = j['meshes'][nd['mesh']]
    for pi, p in enumerate(me['primitives']):
        at = p['attributes']; J = acc(at['JOINTS_0']); W = acc(at['WEIGHTS_0']); P = acc(at['POSITION'])
        hits = []
        for k in range(len(J)):
            w = sum(W[k][q] for q in range(4) if J[k][q] in pj and W[k][q] > 0)
            if w > 0: hits.append((k, w))
        if not hits: continue
        full = sum(1 for _, w in hits if w > 0.999); part = len(hits) - full
        xs = [P[k][0] for k, _ in hits]; ys = [P[k][1] for k, _ in hits]; zs = [P[k][2] for k, _ in hits]
        print(f"node {names[ni]} mesh {me.get('name')} prim {pi} (material {p.get('material')}): {len(hits)} vertices on a pack bone, {full} fully, {part} partly",
              f"| bind box x {min(xs):.3f}..{max(xs):.3f} y {min(ys):.3f}..{max(ys):.3f} z {min(zs):.3f}..{max(zs):.3f}",
              '| partial weights e.g.', sorted(set(round(w, 2) for _, w in hits if w <= 0.999))[:8])
print('pack joints in skins:', [(si, [names[jn] for jn in s['joints'] if jn in packs]) for si, s in enumerate(j['skins'])])
