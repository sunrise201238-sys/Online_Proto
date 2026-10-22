"""A modelled map spliced into a tree of the 0.8.9 line or the PT tree (the one-shot that put Warehouse in, 2026-10-22, made
general): the map's boundary, collision data and spawns in arena.js, its name in MAP_DATA (constants.js and the client), its
row in GLB_MAPS, the README's paragraph and count. The json is the generator's with spawns set (spawn_set.mjs first).
usage: python3 -I map_splice.py <tree root> <key> <Name> <json>   with, in the environment:
  NOTE      one line on the map for the name tables ("Cut from the Map 79 (Void) glTF (2026-10-22, README: Maps): ...")
  SOURCE    the data comment's source ("the Map 79 (Void) glTF")
  BOUNDARY  the comment after the MAP_BOUNDARY row
  ROW       the GLB_MAPS row after "key: " ("{ file: 'maps/warehouse', scale: 4, cx: 5, cz: 20, ground: 0, drop: [], ceilY: 28, modelM: 1, ... },   // (...)")
  PARA      the README's paragraph ("**Warehouse** (2026-10-22) — the sixth modelled map: ...")
  AFTER     the map key the new one follows in every table (default dust)
  COUNT     the arenas' count before and after, as words ("Fourteen,Fifteen")"""
import json, os, sys
root, key, name, jf = sys.argv[1:5]; E = os.environ
NOTE, SOURCE, BOUNDARY, ROW, PARA = E['NOTE'], E['SOURCE'], E.get('BOUNDARY', ''), E['ROW'], E['PARA']; AFTER = E.get('AFTER', 'dust'); before, after = E.get('COUNT', 'Fourteen,Fifteen').split(',')
def edit(rel, pairs):
    p = os.path.join(root, rel); t = open(p, encoding='utf-8').read()
    for old, new in pairs:
        assert t.count(old) == 1, (rel, old[:80], t.count(old)); t = t.replace(old, new)
    open(p, 'w', encoding='utf-8').write(t); print('edited', rel, len(pairs))
def line_starting(rel, prefix):
    t = open(os.path.join(root, rel), encoding='utf-8').read(); ls = [l for l in t.split('\n') if l.startswith(prefix)]; assert len(ls) == 1, (rel, prefix, len(ls)); return ls[0] + '\n'
d = json.load(open(jf, encoding='utf-8'))
fmt = lambda o: json.dumps(o, separators=(', ', ': '))
rows = lambda items: ',\n'.join('      ' + fmt(o) for o in items)
tr = d.get('transform', {})
entry = (f'  "{key}": {{\n'
         f'    // {len(d["obstacles"])} boxes and {len(d["surfaces"])} floors from {SOURCE} by shared/tools/glb_collision.mjs: crop x {tr.get("cx", "?")} z {tr.get("cz", "?")} (metres) at the origin, {tr.get("scale", "?")} units per metre, the street at y {tr.get("ground", "?")}.\n'
         '    "obstacles": [\n' + rows(d['obstacles']) + '\n    ],\n    "surfaces": [\n' + rows(d['surfaces']) + '\n    ]\n  },\n')
sp = d['spawns']; assert sp, 'no spawns in the json (spawn_set.mjs first)'
y = lambda v: 'GROUND_BASE_Y' + ('' if abs(v) < 1e-9 else f' + {v}' if v > 0 else f' - {-v}')
pt = lambda p: f"{{ x: {p['x']}, y: {y(p['y'])}, z: {p['z']} }}"
spawn_line = f"  {key}: {{ p1: {pt(sp['p1'])}, p2: {pt(sp['p2'])}" + (",\n    more: [" + ", ".join(pt(p) for p in sp['more']) + "]" if sp.get('more') else "") + (", pick: 'random'" if sp.get('pick') == 'random' else "") + " },\n"
A = 'shared/src/sim/arena.js'
bnd = line_starting(A, f"  {AFTER}:"); spn = line_starting(A, f"  {AFTER}: {{ p1:"); arn = line_starting(A, f"  {AFTER}: buildGeneratedArena(")
spawn_block = spn if spn.rstrip().endswith('},') else spn + line_starting(A, "    more: [")   # (the spawn row runs on to a second line when it has more places)
edit(A, [
    (bnd, bnd + f"  {key}:{' ' * max(1, 11 - len(key))}{{ halfX: {d['halfX']}, halfZ: {d['halfZ']} }},   // {BOUNDARY}\n"),
    ("const GENERATED_ARENA_COLLISION_DATA = {\n", "const GENERATED_ARENA_COLLISION_DATA = {\n" + entry),
    (spawn_block, spawn_block + f"  // {name}: {NOTE}\n" + spawn_line),
    (arn, arn + f"  {key}: buildGeneratedArena('{key}'),\n"),
])
C = 'shared/src/sim/constants.js'; cn = line_starting(C, f"  {AFTER}: {{ id: '{AFTER}'")
edit(C, [(cn, cn + f"  // {NOTE}\n  {key}: {{ id: '{key}', name: '{name}' }},\n")])
M = 'client/src/main.js'; du = line_starting(M, f"  {AFTER}: {{ file: 'maps/"); dn = line_starting(M, f"  {AFTER}: {{ name: '")
edit(M, [(du, du + f"  {key}: {ROW}\n"), (dn, dn + f"  {key}: {{ name: '{name}' }},   // {NOTE}\n")])
readme = open(os.path.join(root, 'README.md'), encoding='utf-8').read()
i = readme.index(f'**{AFTER.capitalize()}** ('); j = readme.index('\n\n', i)
count = [l for l in readme.split('\n') if l.startswith(f'{before} arenas: ')][0]
edit('README.md', [(count, count.replace(f'{before} arenas: ', f'{after} arenas: ').replace(f'{AFTER.capitalize()}, ', f'{AFTER.capitalize()}, {name}, ')), (readme[i:j] + "\n\n", readme[i:j] + "\n\n" + PARA + "\n\n")])
print(key, 'spliced')
