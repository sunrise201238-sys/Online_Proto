# weights.py <glb> — per clip, the morph-weight tracks: which node, the key times and the values they take. Read only.
import json, struct, sys
b = open(sys.argv[1], 'rb').read()
n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20+n]); off = 20 + n
bn = struct.unpack_from('<I', b, off)[0]; bin_ = b[off+8:off+8+bn]
FMT = {5126: 'f', 5121: 'B', 5123: 'H', 5125: 'I', 5120: 'b', 5122: 'h'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def acc(i):
    a = j['accessors'][i]; comp = NC[a['type']]; f = FMT[a['componentType']]; v = j['bufferViews'][a['bufferView']]; size = struct.calcsize('<' + f)
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', 0) or comp * size
    out = [struct.unpack_from('<' + f * comp, bin_, start + k * stride) for k in range(a['count'])]
    if a.get('normalized'):
        mx = {'B': 255, 'H': 65535, 'b': 127, 'h': 32767}[f]; out = [tuple(x / mx for x in o) for o in out]
    return out
names = [nd.get('name', f'#{i}') for i, nd in enumerate(j['nodes'])]
for an in j['animations']:
    rows = []
    for ch in an['channels']:
        if ch['target']['path'] != 'weights': continue
        nm = names[ch['target']['node']]
        if nm.startswith('Mouth_'): continue
        s = an['samplers'][ch['sampler']]; T = [t[0] for t in acc(s['input'])]; V = [v[0] for v in acc(s['output'])]
        per = len(V) // len(T) if T else 0
        vals = sorted(set(round(x, 3) for x in V))
        rows.append(f"   {nm}: {len(T)} keys {T[0]:.2f}..{T[-1]:.2f} s, {s.get('interpolation', 'LINEAR')}, values {vals[:8]}{' …' if len(vals) > 8 else ''}" + (f" first {V[0]:.2f} last {V[-1]:.2f}" if len(vals) > 1 else ''))
    dur = 0
    for s in an['samplers']: dur = max(dur, j['accessors'][s['input']]['max'][0])
    print(f"{an.get('name')} ({dur:.2f} s)"); print('\n'.join(rows) if rows else '   (no body morph track)')
