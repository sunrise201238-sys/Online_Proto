# spread.py <glb>... — for every morph target in each file: the widest gap between the places its vertices end up (0 = one
# place exactly), the mesh's own size, and how many targets the mesh has. Read only.
import json, struct, sys, os
FMT = {5126: 'f', 5121: 'B', 5123: 'H', 5125: 'I', 5120: 'b', 5122: 'h'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
worst = 0; least_other = 1e9; ntargets = {}
for path in sys.argv[1:]:
    b = open(path, 'rb').read()
    n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20+n]); off = 20 + n
    bn = struct.unpack_from('<I', b, off)[0]; bin_ = b[off+8:off+8+bn]
    def view(vi, f, comp, count, boff=0):
        v = j['bufferViews'][vi]; size = struct.calcsize('<' + f); start = v.get('byteOffset', 0) + boff; stride = v.get('byteStride', 0) or comp * size
        return [struct.unpack_from('<' + f * comp, bin_, start + k * stride) for k in range(count)]
    def acc(i):
        a = j['accessors'][i]; comp = NC[a['type']]; f = FMT[a['componentType']]
        out = view(a['bufferView'], f, comp, a['count'], a.get('byteOffset', 0)) if 'bufferView' in a else [tuple([0.0] * comp) for _ in range(a['count'])]
        if 'sparse' in a:
            s = a['sparse']; idx = view(s['indices']['bufferView'], FMT[s['indices']['componentType']], 1, s['count'], s['indices'].get('byteOffset', 0))
            val = view(s['values']['bufferView'], f, comp, s['count'], s['values'].get('byteOffset', 0)); out = list(out)
            for (k,), v in zip(idx, val): out[k] = v
        return out
    quant = 'KHR_mesh_quantization' in j.get('extensionsUsed', [])
    gathered = 0; other = 0; fileworst = 0
    for me in j['meshes']:
        for p in me['primitives']:
            if 'targets' not in p: continue
            ntargets[len(p['targets'])] = ntargets.get(len(p['targets']), 0) + 1
            P = acc(p['attributes']['POSITION'])
            size = max(max(q[c] for q in P) - min(q[c] for q in P) for c in range(3))
            for t in p['targets']:
                if 'POSITION' not in t: other += 1; continue
                D = acc(t['POSITION']); dest = [(P[k][0] + D[k][0], P[k][1] + D[k][1], P[k][2] + D[k][2]) for k in range(len(P))]
                gap = max(max(d[c] for d in dest) - min(d[c] for d in dest) for c in range(3))
                if gap < 0.01 * size: gathered += 1; fileworst = max(fileworst, gap)
                else: other += 1; least_other = min(least_other, gap / size); print('   NOT gathered:', os.path.basename(path), me.get('name'), 'gap', round(gap, 4), 'size', round(size, 4))
    worst = max(worst, fileworst)
    print(os.path.basename(path), 'gathered targets', gathered, 'other targets', other, 'widest gap among the gathered', f'{fileworst:.2e}', 'quantized' if quant else '')
print('targets per primitive:', ntargets, '| widest gap over all files', f'{worst:.2e}', '| narrowest other, as a share of the mesh size', least_other)
