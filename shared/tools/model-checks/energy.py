# energy.py <glb> — every animation's tracks on the energy-pack bones (and their children's), keys printed.
import json, struct, sys
b = open(sys.argv[1], 'rb').read()
n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20+n]); off = 20 + n
bn = struct.unpack_from('<I', b, off)[0]; bin_ = b[off+8:off+8+bn]
def acc(i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; comp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', 0) or comp * 4
    return [struct.unpack_from('<' + 'f' * comp, bin_, start + k * stride) for k in range(a['count'])]
names = [nd.get('name', f'#{i}') for i, nd in enumerate(j['nodes'])]
ids = [i for i, nm in enumerate(names) if 'energy' in nm.lower() or 'pack' in nm.lower()]
print('pack nodes:', [(i, names[i], j['nodes'][i].get('scale'), j['nodes'][i].get('children')) for i in ids])
for a in j['animations']:
    for c in a['channels']:
        if c['target']['node'] in ids and c['target']['path'] == 'scale':
            smp = a['samplers'][c['sampler']]; t = [x[0] for x in acc(smp['input'])]; v = acc(smp['output'])
            mid = v[1::3] if len(v) == 3 * len(t) else v
            print(a['name'], names[c['target']['node']], smp.get('interpolation', 'LINEAR'), [(round(tt, 3), tuple(round(x, 3) for x in vv)) for tt, vv in zip(t, mid)])
            if len(v) == 3 * len(t): print('   tangents in/out:', [(tuple(round(x, 2) for x in v[3*k]), tuple(round(x, 2) for x in v[3*k+2])) for k in range(len(t))])
