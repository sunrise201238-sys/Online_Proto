# usage: python3 -I glb_count.py <file.glb>... : each model's size, nodes that carry a mesh, primitives (draws before any merging), triangles, materials, textures
import json, struct, sys, os
for p in sys.argv[1:]:
    with open(p, 'rb') as f:
        magic, ver, total = struct.unpack('<4sII', f.read(12)); n, kind = struct.unpack('<I4s', f.read(8)); j = json.loads(f.read(n))
    acc = j.get('accessors', []); meshes = j.get('meshes', []); tris = 0; prims = 0
    use = {}
    for nd in j.get('nodes', []):
        if 'mesh' in nd: use[nd['mesh']] = use.get(nd['mesh'], 0) + 1
    for mi, m in enumerate(meshes):
        k = use.get(mi, 0)
        for pr in m.get('primitives', []):
            c = acc[pr['indices']]['count'] if 'indices' in pr else acc[pr['attributes']['POSITION']]['count']
            prims += k; tris += k * (c // 3)
    print('%-16s %6.1f MB  mesh nodes %5d  draws %5d  triangles %8d  materials %4d  textures %3d' % (os.path.basename(p), os.path.getsize(p) / 1e6, sum(use.values()), prims, tris, len(j.get('materials', [])), len(j.get('textures', []))))
