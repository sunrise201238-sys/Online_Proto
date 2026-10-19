"""Dust spliced into a tree of the 0.8.9 line (after the session's patch sources were lost, 2026-10-19): the map's boundary,
collision data and spawns in arena.js, its name in MAP_DATA (constants.js and the client) listed before Backrooms (user
2026-10-19), its row in GLB_MAPS, the README's paragraph and count; the served models' extension (.glb on the release
lines, .wasm on the PT site, whose host serves no .glb) and the build tag. usage: python3 -I dust_splice.py <tree root> <dust.json> <tag> <ext>"""
import json, os, sys
root, jf, tag, ext = sys.argv[1:5]
def edit(rel, pairs):
    p = os.path.join(root, rel); t = open(p, encoding='utf-8').read()
    for old, new in pairs:
        assert t.count(old) == 1, (rel, old[:80], t.count(old)); t = t.replace(old, new)
    open(p, 'w', encoding='utf-8').write(t); print('edited', rel, len(pairs))
d = json.load(open(jf, encoding='utf-8'))
fmt = lambda o: json.dumps(o, separators=(', ', ': '))
rows = lambda items: ',\n'.join('      ' + fmt(o) for o in items)
entry = ('  "dust": {\n'
         f'    // {len(d["obstacles"])} boxes and {len(d["surfaces"])} floors from the Dust2-short glTF by shared/tools/glb_collision.mjs: crop x 49.8 z -32 (metres) at the origin, 4 units per metre, the street at y 0.\n'
         '    "obstacles": [\n' + rows(d['obstacles']) + '\n    ],\n    "surfaces": [\n' + rows(d['surfaces']) + '\n    ]\n  },\n')
sp = d['spawns']; y = lambda v: 'GROUND_BASE_Y' + ('' if abs(v) < 1e-9 else f' + {v}' if v > 0 else f' - {-v}')
NOTE = "Cut from the Dust2-short glTF (2026-10-19, README: Maps): the middle of the map — the site, the pit, the roofed hall, the yards."
edit('shared/src/sim/arena.js', [
    ("  backrooms:  { halfX: 109.6, halfZ: 114.4, ceil: 15.2 },",
     f"  dust:       {{ halfX: {d['halfX']}, halfZ: {d['halfZ']} }},   // Dust2-short, the middle of the map — the site, the pit, the yards (114 x 178 m at 4 units per metre, 142.23 m per model unit)\n"
     "  backrooms:  { halfX: 109.6, halfZ: 114.4, ceil: 15.2 },"),
    ("const GENERATED_ARENA_COLLISION_DATA = {\n", "const GENERATED_ARENA_COLLISION_DATA = {\n" + entry),
    ("  // Backrooms: the homes at the north-west and south-east corners, two more places from the user's marked plan (2026-10-19); respawns at random among them, as Spacecraft's.\n",
     "  // Dust: two clear spots far apart on the middle (the plateau's east ramp top, the lower yard's south end), until the user marks places.\n"
     f"  dust: {{ p1: {{ x: {sp['p1']['x']}, y: {y(sp['p1']['y'])}, z: {sp['p1']['z']} }}, p2: {{ x: {sp['p2']['x']}, y: {y(sp['p2']['y'])}, z: {sp['p2']['z']} }} }},\n"
     "  // Backrooms: the homes at the north-west and south-east corners, two more places from the user's marked plan (2026-10-19); respawns at random among them, as Spacecraft's.\n"),
    ("  backrooms: buildGeneratedArena('backrooms'),\n", "  dust: buildGeneratedArena('dust'),\n  backrooms: buildGeneratedArena('backrooms'),\n"),
])
edit('shared/src/sim/constants.js', [
    ("  // Cut from the Original Backrooms glTF (2026-10-19, README: Maps): the whole hall, indoors; the usual HUD and rules.\n  backrooms: { id: 'backrooms', name: 'Backrooms' },",
     f"  // {NOTE}\n  dust: {{ id: 'dust', name: 'Dust' }},\n  // Cut from the Original Backrooms glTF (2026-10-19, README: Maps): the whole hall, indoors; the usual HUD and rules.\n  backrooms: {{ id: 'backrooms', name: 'Backrooms' }},"),
])
main = open(os.path.join(root, 'client/src/main.js'), encoding='utf-8').read()
br = [l for l in main.split('\n') if l.startswith("  backrooms: { file: 'maps/backrooms'")][0]
edit('client/src/main.js', [
    (br + "\n", "  dust: { file: 'maps/dust', scale: 4, cx: 49.8, cz: -32, ground: 83.92, drop: [], ceilY: 28, modelM: 142.23, fadeTall: 2 * GROUND_BASE_Y, fadeOwn: true, fadeWalls: true, edge: false },   // (142.23 m per model unit, the user's pick with the map scale test; the Backrooms' fade rules: a maze of walls)\n" + br + "\n"),
    ("  backrooms: { name: 'Backrooms' },   // Cut from the Original Backrooms glTF (2026-10-19, README: Maps): the whole hall, indoors; the usual HUD and rules.",
     f"  dust: {{ name: 'Dust' }},   // {NOTE}\n  backrooms: {{ name: 'Backrooms' }},   // Cut from the Original Backrooms glTF (2026-10-19, README: Maps): the whole hall, indoors; the usual HUD and rules."),
    ("const MODEL_FILE_EXT = '.glb';", f"const MODEL_FILE_EXT = '{ext}';"),
    ("const MAP_FILE_EXT = '.glb';", f"const MAP_FILE_EXT = '{ext}';"),
    ("const CLIENT_BUILD_TAG = 'b1023i';", f"const CLIENT_BUILD_TAG = '{tag}';"),
])
DUST = ("**Dust** (2026-10-19) — the fifth modelled map: *Dust2-short* by frostychaos144 on Sketchfab, licensed CC-BY-4.0 ([the model](https://sketchfab.com/3d-models/dust2-short-211b9b2535e144fb9d1021228cc93d53)), served as `client/public/maps/dust.glb` (4.3 MB: the piece cut to its own box and 12 m around it — a few stray props lie far off in the model — and its ten 2 MB textures re-encoded at 1024 px as JPEG; 19 MB → under 5). The model is a thumbnail — the piece 0.7 × 1.1 units, its walls 0.11–0.14 tall — so it is served at **142.23 m per model unit** (the user's pick with the PT site's map scale test, 2026-10-19): the walls 16–20 m, the piece 114 × 178 m (455 × 711 units), its floor at y 0.59 (`ground` 83.92 m). The generator reads it with Town's parameters but `UNDER_STREET` 3.6 (a floor lies 1.4 m under the main one). The model is a game rip: every material is double-sided and its gates are shut — the long path to the north and the yard to the south-west lie behind closed gates, walls to a body, so the arena is the middle (the site on its plateau, the pit, the roofed hall, the lower yards); the rest stands as background. Reading it taught the generator rules it now applies to every model (2026-10-19): a one-sided face seen only from below (a roof's underside, a lintel) is a ceiling, never a floor, while a double-sided material's face is seen from both sides; the model's own sloped faces (1 degree or more, 3 m² or more) are read as ramps with their exact plane, so a street's long gentle grade is one slope and not a stair of 5 cm bands; the void's wall stands from the street whatever floor lies beside it; a slope's skirt stands only where a walked floor lies more than a step under its edge; and a ceiling nothing stands on merges by its own height class alone. A maze of walls like the Backrooms, it takes the same fade rules: every wall fades while it hides the player's own character, a straight wall at a time (`fade_tall` 'body', `fade_own`, `fade_walls`). The piece's own walls confine the map (`edge: false`). Listed before Backrooms in the picker (user 2026-10-19). **Spawn places**: two clear spots far apart on the middle, until the user marks them.")
readme = open(os.path.join(root, 'README.md'), encoding='utf-8').read()
i = readme.index('**Backrooms** (2026-10-19)'); j = readme.index('\n\n', i)
edit('README.md', [
    ("Thirteen arenas: Plain Field, Streets, Factory, Scrapyard, Square, Lobby, Station, Flashpoint, Airport, Town, Spacecraft, Backrooms, Backrooms (Anomaly).",
     "Fourteen arenas: Plain Field, Streets, Factory, Scrapyard, Square, Lobby, Station, Flashpoint, Airport, Town, Spacecraft, Dust, Backrooms, Backrooms (Anomaly)."),
    (readme[i:j] + "\n\n", readme[i:j] + "\n\n" + DUST + "\n\n"),
])
print('spliced', tag, ext)
