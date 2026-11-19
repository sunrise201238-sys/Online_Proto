# glb_anim.py <glb> — per animation: channels by path, length, and the nodes whose scale goes near 0 (a part hidden by
# scale) with the times; and the node's rest scale. Read-only.
import json, struct, sys
import array
b = open(sys.argv[1], 'rb').read()
n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20+n]); off = 20 + n
bn = struct.unpack_from('<I', b, off)[0]; bin_ = b[off+8:off+8+bn]
def acc(i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; comp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    assert a['componentType'] == 5126, a['componentType']
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', 0) or comp * 4
    out = []
    for k in range(a['count']):
        out.append(struct.unpack_from('<' + 'f' * comp, bin_, start + k * stride))
    return out
names = [nd.get('name', f'#{i}') for i, nd in enumerate(j['nodes'])]
rest = {i: nd.get('scale', [1, 1, 1]) for i, nd in enumerate(j['nodes'])}
zero_rest = [(names[i], s) for i, s in rest.items() if min(abs(x) for x in s) < 0.05]
print('nodes with a near-zero rest scale:', zero_rest[:20])
for a in j.get('animations', []):
    paths = {}
    hid = []
    tmax = 0
    for c in a['channels']:
        p = c['target']['path']; paths[p] = paths.get(p, 0) + 1
        smp = a['samplers'][c['sampler']]; t = acc(smp['input']); tmax = max(tmax, t[-1][0])
        if p == 'scale':
            vals = acc(smp['output'])
            if len(vals) == 3 * len(t): vals = vals[1::3]   # (CUBICSPLINE: in-tangent, value, out-tangent per key)
            m = [min(abs(x) for x in v) for v in vals]
            if min(m) < 0.05:
                lo = [round(t[k][0], 3) for k in range(len(m)) if m[k] < 0.05]; hi = [round(t[k][0], 3) for k in range(len(m)) if m[k] >= 0.05]
                hid.append((names[c['target']['node']], smp.get('interpolation', 'LINEAR'), f'{len(lo)}/{len(m)} keys near 0', lo[:3], 'shown at', hi[:3]))
    print(f"== {a.get('name')}: {tmax:.2f} s, channels {paths}")
    for h in hid[:20]: print('   hidden by scale:', h)
