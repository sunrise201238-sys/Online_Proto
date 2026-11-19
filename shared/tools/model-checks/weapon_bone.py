# weapon_bone.py <glb>... — the weapon bone of each file: its parent chain, its rest pose, the Move_Ing clip's tracks on it,
# and the rest lengths of the arm bones (to compare two rigs' proportions). Read only.
import json, struct, sys, math
FMT = {5126: 'f', 5121: 'B', 5123: 'H', 5125: 'I', 5120: 'b', 5122: 'h'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
for path in sys.argv[1:]:
    b = open(path, 'rb').read(); n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20+n]); off = 20 + n
    bn = struct.unpack_from('<I', b, off)[0]; bin_ = b[off+8:off+8+bn]
    def acc(i):
        a = j['accessors'][i]; comp = NC[a['type']]; f = FMT[a['componentType']]; v = j['bufferViews'][a['bufferView']]; size = struct.calcsize('<' + f)
        start = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', 0) or comp * size
        return [struct.unpack_from('<' + f * comp, bin_, start + k * stride) for k in range(a['count'])]
    nodes = j['nodes']; parent = {}
    for i, nd in enumerate(nodes):
        for c in nd.get('children', []): parent[c] = i
    name = lambda i: nodes[i].get('name', f'#{i}')
    print('==', path.split('/')[-1])
    for i, nd in enumerate(nodes):
        if nd.get('name') in ('Bip001_Weapon',):
            ch = []; k = i
            while k in parent: k = parent[k]; ch.append(name(k))
            print('  Bip001_Weapon under:', ' < '.join(ch[:6]))
            print('    rest t', [round(x, 4) for x in nd.get('translation', [0, 0, 0])], 'r', [round(x, 4) for x in nd.get('rotation', [0, 0, 0, 1])], 's', nd.get('scale'))
            print('    children:', [name(c) for c in nd.get('children', [])])
    for nm in ('Bip001', 'Bip001 Pelvis', 'Bip001 Spine', 'Bip001 Spine1', 'Bip001 R Clavicle', 'Bip001 R UpperArm', 'Bip001 R Forearm', 'Bip001 R Hand', 'Bip001 L Hand', 'Bip001 R Thigh', 'Bip001 R Calf', 'Bip001 R Foot', 'Bip001 Neck', 'Bip001 Head'):
        for i, nd in enumerate(nodes):
            if nd.get('name') == nm:
                t = nd.get('translation', [0, 0, 0]); print(f"    {nm}: rest t {[round(x, 4) for x in t]} len {math.sqrt(sum(x * x for x in t)):.4f} parent {name(parent[i]) if i in parent else None}")
    for an in j['animations']:
        if an.get('name') != 'Move_Ing': continue
        for ch in an['channels']:
            if nodes[ch['target']['node']].get('name') in ('Bip001_Weapon', 'Bip001'):
                s = an['samplers'][ch['sampler']]; V = acc(s['output']); T = acc(s['input'])
                comps = len(V[0]); lo = [min(v[c] for v in V) for c in range(comps)]; hi = [max(v[c] for v in V) for c in range(comps)]
                print(f"    Move_Ing {nodes[ch['target']['node']].get('name')}.{ch['target']['path']}: {len(T)} keys, {s.get('interpolation', 'LINEAR')}, min {[round(x, 4) for x in lo]} max {[round(x, 4) for x in hi]}")
    # which mesh hangs on the weapon bone
    for i, nd in enumerate(nodes):
        if 'mesh' in nd and 'Weapon' in nd.get('name', ''):
            sk = j['skins'][nd['skin']] if 'skin' in nd else None
            print('    weapon mesh node', nd.get('name'), 'skin joints:', [name(x) for x in (sk['joints'][:6] if sk else [])], 'parent', name(parent[i]) if i in parent else None)
