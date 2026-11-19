# scan_all.py <glb>... — per file: every mesh that has a morph target; whether the target gathers all its vertices in one
# place; how many bones those vertices hang on; and the values every clip gives that morph. Read only.
import json, struct, sys, os
FMT = {5126: 'f', 5121: 'B', 5123: 'H', 5125: 'I', 5120: 'b', 5122: 'h'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
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
        if a.get('normalized'):
            mx = {'B': 255, 'H': 65535, 'b': 127, 'h': 32767}[f]; out = [tuple(x / mx for x in o) for o in out]
        return out
    names = [nd.get('name', f'#{i}') for i, nd in enumerate(j['nodes'])]
    # clip values per node
    clipvals = {}
    for an in j.get('animations', []):
        for ch in an['channels']:
            if ch['target']['path'] != 'weights': continue
            s = an['samplers'][ch['sampler']]; V = [v[0] for v in acc(s['output'])]
            clipvals.setdefault(ch['target']['node'], {})[an.get('name')] = sorted(set(round(x, 3) for x in V))
    nclips = len(j.get('animations', []))
    print(os.path.basename(path), f"({nclips} clips)")
    mouths = 0; mouthMulti = 0
    for ni, nd in enumerate(j['nodes']):
        if 'mesh' not in nd: continue
        me = j['meshes'][nd['mesh']]
        if not any('targets' in p for p in me['primitives']): continue
        joints = j['skins'][nd['skin']]['joints'] if 'skin' in nd else None
        rows = []
        for pi, p in enumerate(me['primitives']):
            if 'targets' not in p: continue
            P = acc(p['attributes']['POSITION']); J = acc(p['attributes']['JOINTS_0']) if joints and 'JOINTS_0' in p['attributes'] else None; W = acc(p['attributes']['WEIGHTS_0']) if J else None
            used = sorted({k for (k,) in acc(p['indices'])}) if 'indices' in p else list(range(len(P)))
            for ti, t in enumerate(p['targets']):
                if 'POSITION' not in t: rows.append((pi, ti, 'no position', 0)); continue
                D = acc(t['POSITION']); dest = {(round(P[k][0] + D[k][0], 3), round(P[k][1] + D[k][1], 3), round(P[k][2] + D[k][2], 3)) for k in used}
                bones = set()
                if J:
                    for k in used:
                        for q in range(4):
                            if W[k][q] > 0.001: bones.add(joints[J[k][q]])
                rows.append((pi, ti, 'ONE PLACE' if len(dest) == 1 else f'{len(dest)} places', len(bones)))
        cv = clipvals.get(ni, {})
        allvals = sorted({v for vs in cv.values() for v in vs}); missing = nclips - len(cv)
        if names[ni].startswith('Mouth_') or me.get('name', '').startswith('Mouth_'):
            mouths += 1
            if any(r[3] > 1 for r in rows) or any(r[2] != 'ONE PLACE' for r in rows): mouthMulti += 1; print('   MOUTH', names[ni], rows)
            continue
        print(f"   {names[ni]}: {[(f'prim {r[0]} target {r[1]}', r[2], f'{r[3]} bones') for r in rows]}; clip values {allvals}; clips without a track {missing}")
        if len(allvals) > 1:
            for cn, vs in cv.items(): print(f"        {cn}: {vs}")
    print(f"   mouth meshes {mouths}, of which not one-place or on more than one bone: {mouthMulti}")
