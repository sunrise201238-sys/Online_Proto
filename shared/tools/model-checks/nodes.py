# nodes.py <glb> — the nodes that carry a mesh, with their parents; and every name that appears more than once. Read only.
import json, struct, sys, collections
b = open(sys.argv[1], 'rb').read()
n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20+n])
nodes = j['nodes']; parent = {}
for i, nd in enumerate(nodes):
    for c in nd.get('children', []): parent[c] = i
def chain(i):
    out = []
    while i in parent: i = parent[i]; out.append(nodes[i].get('name', f'#{i}'))
    return ' < '.join(out)
for i, nd in enumerate(nodes):
    if 'mesh' in nd:
        me = j['meshes'][nd['mesh']]
        if me.get('name', '').startswith('Mouth_'): continue
        print(f"node {i} '{nd.get('name')}' mesh '{me.get('name')}' prims {len(me['primitives'])} skin {nd.get('skin')} | under: {chain(i)}")
cnt = collections.Counter([nd.get('name') for nd in nodes] )
print('names used more than once among nodes:', {k: v for k, v in cnt.items() if v > 1})
print('scenes:', [(s.get('name'), [nodes[r].get('name') for r in s['nodes']]) for s in j['scenes']])
