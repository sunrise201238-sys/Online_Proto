# hand_bones.py <glb> [L|R] — one hand of a unit's model: the bones under its hand bone, which meshes hang on them and how
# many vertices (wholly on the hand's bones, or shared with bones outside it), and the triangles that lie wholly on them. Read only.
import json, struct, sys
path = sys.argv[1]; side = sys.argv[2] if len(sys.argv) > 2 else 'L'
b = open(path, 'rb').read(); n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20+n]); off = 20 + n
bn = struct.unpack_from('<I', b, off)[0]; bin_ = b[off+8:off+8+bn]
FMT = {5126: 'f', 5121: 'B', 5123: 'H', 5125: 'I', 5120: 'b', 5122: 'h'}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def acc(i):
    a = j['accessors'][i]; comp = NC[a['type']]; f = FMT[a['componentType']]; v = j['bufferViews'][a['bufferView']]; size = struct.calcsize('<' + f)
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', 0) or comp * size
    out = [struct.unpack_from('<' + f * comp, bin_, start + k * stride) for k in range(a['count'])]
    if a.get('normalized'):
        mx = {'B': 255, 'H': 65535, 'b': 127, 'h': 32767}[f]; out = [tuple(x / mx for x in o) for o in out]
    return out
nodes = j['nodes']; name = lambda i: nodes[i].get('name', f'#{i}')
hand = next(i for i, nd in enumerate(nodes) if nd.get('name') == f'Bip001 {side} Hand')
sub = []
def walk(i, d):
    sub.append((i, d))
    for c in nodes[i].get('children', []): walk(c, d + 1)
walk(hand, 0)
print(path.split('/')[-1], f'— the {side} hand: {len(sub)} nodes under it')
for i, d in sub: print('   ' + '  ' * d + name(i), '' if 'mesh' not in nodes[i] else '(a mesh node)')
handset = {i for i, _ in sub}
parent = {}
for i, nd in enumerate(nodes):
    for c in nd.get('children', []): parent[c] = i
print('   the hand bone hangs on:', name(parent[hand]), '<', name(parent[parent[hand]]))
for ni, nd in enumerate(nodes):
    if 'mesh' not in nd or 'skin' not in nd: continue
    joints = j['skins'][nd['skin']]['joints']
    me = j['meshes'][nd['mesh']]
    for pi, p in enumerate(me['primitives']):
        at = p['attributes']
        if 'JOINTS_0' not in at: continue
        J = acc(at['JOINTS_0']); W = acc(at['WEIGHTS_0']); idx = [k for (k,) in acc(p['indices'])] if 'indices' in p else list(range(len(J)))
        used = sorted(set(idx)); whole = set(); part = set()
        for k in used:
            wh = sum(W[k][q] for q in range(4) if W[k][q] > 0 and joints[J[k][q]] in handset)
            if wh > 0.999: whole.add(k)
            elif wh > 0.001: part.add(k)
        if not whole and not part: continue
        tris = len(idx) // 3; tw = sum(1 for t in range(tris) if all(idx[t * 3 + c] in whole for c in range(3))); tp = sum(1 for t in range(tris) if any(idx[t * 3 + c] in whole or idx[t * 3 + c] in part for c in range(3)))
        print(f"   mesh {me.get('name')} prim {pi} (material {p.get('material')}): {len(used)} vertices used, {len(whole)} wholly on the hand's bones, {len(part)} shared with bones outside it; {tris} triangles, {tw} wholly on the hand, {tp} touching it")
