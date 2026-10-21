"""A modelled map's generated data replaced in a tree's arena.js (the GENERATED_ARENA_COLLISION_DATA entry), the old entry
saved beside the new json as <key>_old.json for comparison. usage: python3 -I data_splice.py <tree root> <key> <json> <source note>"""
import json, os, re, sys
root, key, jf, note = sys.argv[1:5]
p = os.path.join(root, 'shared/src/sim/arena.js'); t = open(p, encoding='utf-8').read()
m = re.search(r'(  "' + re.escape(key) + r'": \{\n)(.*?)(\n  \},?\n)', t, re.S); assert m, key
old = '{' + re.sub(r'^\s*//.*$', '', m.group(2), flags=re.M) + '}'
try:
    od = json.loads(old); hb = re.search(r'^  ' + re.escape(key) + r':\s*\{ halfX: ([\d.]+), halfZ: ([\d.]+)', t, re.M)
    if hb: od['halfX'] = float(hb.group(1)); od['halfZ'] = float(hb.group(2))
    json.dump(od, open(jf.replace('.json', '_old.json'), 'w')); print(key, 'old entry:', len(od['obstacles']), 'boxes', len(od['surfaces']), 'floors ->', jf.replace('.json', '_old.json'))
except Exception as e: print(key, 'old entry not parsed:', e)
d = json.load(open(jf, encoding='utf-8'))
fmt = lambda o: json.dumps(o, separators=(', ', ': ')); rows = lambda items: ',\n'.join('      ' + fmt(o) for o in items)
hb = re.search(r'^  ' + re.escape(key) + r':\s*\{ halfX: ([\d.]+), halfZ: ([\d.]+)', t, re.M)
cx = d.get('transform', {}).get('cx'); cz = d.get('transform', {}).get('cz')
body = (f'    // {len(d["obstacles"])} boxes and {len(d["surfaces"])} floors from {note} by shared/tools/glb_collision.mjs: crop x {cx} z {cz} (metres) at the origin, 4 units per metre, the street at y 0.\n'
        '    "obstacles": [\n' + rows(d['obstacles']) + '\n    ],\n    "surfaces": [\n' + rows(d['surfaces']) + '\n    ]')
t = t[:m.start()] + m.group(1) + body + m.group(3) + t[m.end():]
open(p, 'w', encoding='utf-8').write(t); print(key, 'spliced:', len(d['obstacles']), 'boxes', len(d['surfaces']), 'floors; json halfX', d.get('halfX'), 'tree halfX', hb.group(1) if hb else '?')
