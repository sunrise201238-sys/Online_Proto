# morph.py <glb> — every morph target in the file: which vertices it moves, how far, where they end up (how many distinct
# places), and which bones those vertices hang on. Read only.
import json, struct, sys
b = open(sys.argv[1], 'rb').read()
n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20+n]); off = 20 + n
bn = struct.unpack_from('<I', b, off)[0]; bin_ = b[off+8:off+8+bn]
FMT = {5126: 'f', 5121: 'B', 5123: 'H', 5125: 'I', 5120: 'b', 5122: 'h'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def view(vi, f, comp, count, boff=0):
    v = j['bufferViews'][vi]; size = struct.calcsize('<' + f); start = v.get('byteOffset', 0) + boff; stride = v.get('byteStride', 0) or comp * size
    return [struct.unpack_from('<' + f * comp, bin_, start + k * stride) for k in range(count)]
def acc(i):
    a = j['accessors'][i]; comp = NC[a['type']]; f = FMT[a['componentType']]
    out = view(a['bufferView'], f, comp, a['count'], a.get('byteOffset', 0)) if 'bufferView' in a else [tuple([0.0] * comp) for _ in range(a['count'])]
    if 'sparse' in a:
        s = a['sparse']; idx = view(s['indices']['bufferView'], FMT[s['indices']['componentType']], 1, s['count'], s['indices'].get('byteOffset', 0))
        val = view(s['values']['bufferView'], f, comp, s['count'], s['values'].get('byteOffset', 0))
        out = list(out)
        for (k,), v in zip(idx, val): out[k] = v
    if a.get('normalized') and f in 'BH': mx = 255 if f == 'B' else 65535; out = [tuple(x / mx for x in o) for o in out]
    return out
names = [nd.get('name', f'#{i}') for i, nd in enumerate(j['nodes'])]
for ni, nd in enumerate(j['nodes']):
    if 'mesh' not in nd: continue
    me = j['meshes'][nd['mesh']]
    if not any('targets' in p for p in me['primitives']): continue
    if me.get('name', '').startswith('Mouth_'): continue
    joints = j['skins'][nd['skin']]['joints'] if 'skin' in nd else None
    print(f"node {names[ni]} mesh {me.get('name')} default weights {me.get('weights')} target names {me.get('extras', {}).get('targetNames')}")
    for pi, p in enumerate(me['primitives']):
        if 'targets' not in p: continue
        P = acc(p['attributes']['POSITION']); J = acc(p['attributes']['JOINTS_0']) if 'JOINTS_0' in p['attributes'] else None; W = acc(p['attributes']['WEIGHTS_0']) if 'WEIGHTS_0' in p['attributes'] else None
        used = set()
        if 'indices' in p:
            for (k,) in acc(p['indices']): used.add(k)
        else: used = set(range(len(P)))
        for ti, t in enumerate(p['targets']):
            if 'POSITION' not in t: print(f"  prim {pi} target {ti}: no POSITION"); continue
            D = acc(t['POSITION']); moved = [k for k in range(len(D)) if (D[k][0] ** 2 + D[k][1] ** 2 + D[k][2] ** 2) ** 0.5 > 1e-5]
            movedUsed = [k for k in moved if k in used]
            if not moved: print(f"  prim {pi} target {ti}: moves nothing ({len(P)} vertices, {len(used)} used by this primitive)"); continue
            mx = max((D[k][0] ** 2 + D[k][1] ** 2 + D[k][2] ** 2) ** 0.5 for k in moved)
            dest = [(P[k][0] + D[k][0], P[k][1] + D[k][1], P[k][2] + D[k][2]) for k in moved]
            distinct = {(round(x, 3), round(y, 3), round(z, 3)) for x, y, z in dest}
            xs = [d[0] for d in dest]; ys = [d[1] for d in dest]; zs = [d[2] for d in dest]
            bx = [P[k][0] for k in moved]; by = [P[k][1] for k in moved]; bz = [P[k][2] for k in moved]
            bones = {}
            if J:
                for k in moved:
                    for q in range(4):
                        if W[k][q] > 0.001: nm = names[joints[J[k][q]]]; bones[nm] = bones.get(nm, 0) + 1
            print(f"  prim {pi} (material {p.get('material')}) target {ti}: {len(P)} vertices, {len(used)} used here; moves {len(moved)} ({len(movedUsed)} used here), longest move {mx:.3f}")
            print(f"     before: x {min(bx):.3f}..{max(bx):.3f} y {min(by):.3f}..{max(by):.3f} z {min(bz):.3f}..{max(bz):.3f}")
            print(f"     after : x {min(xs):.3f}..{max(xs):.3f} y {min(ys):.3f}..{max(ys):.3f} z {min(zs):.3f}..{max(zs):.3f}; distinct places {len(distinct)}", sorted(distinct)[:6])
            print('     bones:', sorted(bones.items(), key=lambda kv: -kv[1])[:16])
allP = None
