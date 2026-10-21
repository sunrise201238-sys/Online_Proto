"""The PT site, defined as what it adds to a tree of the 0.8.9 line (2026-10-21, after the site's own patch sources were
lost): the served models' extension .wasm (the artifact host serves no .glb) and the build tag; the infinite boost (the
human's gauge refilled every tick in tickBoost — map testing; the offline bots run their own drain path, updateEnemy, and keep it); the collision view (F8 / __COLLISION_VIEW(): the arena as the sim holds it — boxes,
floors, the bodies — the model hidden meanwhile); the map scale test (F7 / __MAP_SCALE(mPerUnit): a modelled map tried at
another size, its model and its data scaled alike, the match restarted). Every replacement asserted once.
usage: python3 -I pt_deltas.py <tree root> <tag>"""
import os, sys
root, tag = sys.argv[1:3]
def edit(rel, pairs):
    p = os.path.join(root, rel); t = open(p, encoding='utf-8').read()
    for old, new in pairs:
        assert t.count(old) == 1, (rel, old[:80], t.count(old)); t = t.replace(old, new)
    open(p, 'w', encoding='utf-8').write(t); print('edited', rel, len(pairs))
# ---- the served models and the tag
edit('client/src/main.js', [
    ("const MODEL_FILE_EXT = '.glb';", "const MODEL_FILE_EXT = '.wasm';"),
    ("const MAP_FILE_EXT = '.glb';", "const MAP_FILE_EXT = '.wasm';"),
    ("const CLIENT_BUILD_TAG = 'b1023k';", f"const CLIENT_BUILD_TAG = '{tag}';"),
])
# ---- the infinite boost: no fighter's boost drains (the dash in movement.js, the flight climb in tick.js)
with open(os.path.join(root, 'shared/src/sim/constants.js'), 'a', encoding='utf-8') as f: f.write("\n// (PT site only, pt_deltas.py: no fighter's boost drains — the maps are tested on foot and in the air without the gauge)\nexport const INFINITE_BOOST = true;\n")
# (one rule, not a guard at each of the six costs — the dash, the flight climb, the air pop, the step, the jump, the sniper's
# cancel: the gauge is refilled to its cap every tick in tickBoost, so whatever a tick spends is back before the next)
edit('shared/src/sim/movement.js', [
    ("// Boost gauge, momentum, jump physics, integration.", "import { INFINITE_BOOST } from './constants.js';   // (PT site: the boost never drains)\n// Boost gauge, momentum, jump physics, integration."),
    ("  if (consume) {\n    fighter.boost = Math.max(0, fighter.boost - drain);\n", "  if (INFINITE_BOOST) fighter.boost = cap;   // (PT site: the gauge refilled every tick, whatever the tick spent)\n  else if (consume) {\n    fighter.boost = Math.max(0, fighter.boost - drain);\n"),
])
# ---- the map scale: the sim's arena scaled alike (boxes, floors, spawns, bounds), cached per scale
edit('shared/src/sim/arena.js', [
    ("export function getArena(mapKey) {\n  const arena = ARENAS[mapKey];\n  if (!arena) throw new Error(`No arena data for map: ${mapKey}`);\n  if (!arena.floorTopsMarked) markFloorTops(arena);\n  return arena;\n}\n",
     "// (PT site, pt_deltas.py: the map scale test — a modelled map tried at another size. mapScale.k scales a modelled map's\n"
     "// boxes, floors, spawn places and bounds alike, from the street at y 0; the client scales the model the same and restarts\n"
     "// the match. 1 is the data as read; concept maps are never scaled.)\n"
     "export const mapScale = { k: 1 };\nconst scaledArenas = new Map();\n"
     "function scaleArena(a, k) {\n"
     "  const sO = (o) => ({ ...o, minX: o.minX * k, maxX: o.maxX * k, minZ: o.minZ * k, maxZ: o.maxZ * k, minY: o.minY * k, maxY: o.maxY * k });\n"
     "  const sS = (s) => ({ ...s, minX: s.minX * k, maxX: s.maxX * k, minZ: s.minZ * k, maxZ: s.maxZ * k, top: s.top == null ? s.top : s.top * k, maxTop: s.maxTop == null ? s.maxTop : s.maxTop * k, y0: s.y0 == null ? s.y0 : s.y0 * k });\n"
     "  const sP = (p) => p && { ...p, x: p.x * k, z: p.z * k, y: GROUND_BASE_Y + ((p.y ?? GROUND_BASE_Y) - GROUND_BASE_Y) * k };\n"
     "  const spawns = a.spawns ? { ...a.spawns, p1: sP(a.spawns.p1), p2: sP(a.spawns.p2), more: a.spawns.more ? a.spawns.more.map(sP) : a.spawns.more } : a.spawns;\n"
     "  return { ...a, obstacles: a.obstacles.map(sO), surfaces: a.surfaces.map(sS), spawns, floorTopsMarked: false };\n}\n"
     "export function getArena(mapKey) {\n  const base = ARENAS[mapKey];\n  if (!base) throw new Error(`No arena data for map: ${mapKey}`);\n"
     "  let arena = base;\n  if (mapScale.k !== 1 && MAP_BOUNDARY[mapKey]) { const key = `${mapKey}@${mapScale.k}`; arena = scaledArenas.get(key); if (!arena) { arena = scaleArena(base, mapScale.k); scaledArenas.set(key, arena); } }\n"
     "  if (!arena.floorTopsMarked) markFloorTops(arena);\n  return arena;\n}\n"),
    ("export function getArenaBounds(mapKey) { return MAP_BOUNDARY[mapKey] ?? { halfX: 138, halfZ: 138 }; }",
     "export function getArenaBounds(mapKey) { const b = MAP_BOUNDARY[mapKey]; if (!b) return { halfX: 138, halfZ: 138 }; const k = mapScale.k; return k === 1 ? b : { ...b, halfX: b.halfX * k, halfZ: b.halfZ * k, ceil: b.ceil == null ? b.ceil : b.ceil * k }; }"),
    ("export function getGeneratedObstacles(mapKey) { return GENERATED_ARENA_COLLISION_DATA[mapKey]?.obstacles ?? []; }",
     "export function getGeneratedObstacles(mapKey) { const list = GENERATED_ARENA_COLLISION_DATA[mapKey]?.obstacles ?? []; const k = mapScale.k; return k === 1 || !MAP_BOUNDARY[mapKey] ? list : list.map((o) => ({ ...o, minX: o.minX * k, maxX: o.maxX * k, minZ: o.minZ * k, maxZ: o.maxZ * k, minY: o.minY * k, maxY: o.maxY * k })); }"),
])
edit('shared/src/sim/index.js', [
    ("export { getArena, getArenaObstacles, getArenaSurfaces, getArenaSpawns, getArenaBounds, getGeneratedObstacles } from './arena.js';",
     "export { getArena, getArenaObstacles, getArenaSurfaces, getArenaSpawns, getArenaBounds, getGeneratedObstacles, mapScale } from './arena.js';"),
])
# ---- the client: the collision view (F8), the map scale panel (F7), the model scaled with its data
VIEW = r"""// COLLISION VIEW (PT site, a dev hook, pt_deltas.py; rebuilt 2026-10-21 after the first was lost): F8 / __COLLISION_VIEW()
// shows the arena as the sim holds it — every box (walls dark blue, the boxes a body steps onto orange), every floor as a
// quad (a plane with its corner heights), each unit's body as a cylinder — and hides the map model while it is on. One
// merged mesh per colour: the boxes are thousands.
let collisionView = null;
function collisionViewToggle(on = !collisionView) {
  if (collisionView) { scene.remove(collisionView.group); collisionView.group.traverse((o) => { o.geometry?.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }); for (const m of collisionView.hidden) m.visible = true; collisionView = null; }
  if (!on) return false;
  const group = new THREE.Group(); const hidden = [];
  for (const g of arenaDecor) if (g.isGroup) g.traverse((o) => { if (o.isMesh && o.visible) { hidden.push(o); o.visible = false; } });
  const fills = { wall: [], top: [] }, edges = { wall: [], top: [] };
  for (const o of arenaObstacles) { const w = o.maxX - o.minX, h = o.maxY - o.minY, d = o.maxZ - o.minZ; if (!(w > 0 && h > 0 && d > 0)) continue; const g = new THREE.BoxGeometry(w, h, d); g.translate((o.minX + o.maxX) / 2, (o.minY + o.maxY) / 2, (o.minZ + o.maxZ) / 2); const kind = o.topBuffer != null ? 'top' : 'wall'; fills[kind].push(g); edges[kind].push(new THREE.EdgesGeometry(g)); }
  const quads = [];
  for (const s of arenaSurfaces) { const hAt = (x, z) => s.type === 'plane' ? s.y0 + s.gx * (x - s.minX) + s.gz * (z - s.minZ) : s.top; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([s.minX, hAt(s.minX, s.minZ), s.minZ, s.maxX, hAt(s.maxX, s.minZ), s.minZ, s.maxX, hAt(s.maxX, s.maxZ), s.maxZ, s.minX, hAt(s.minX, s.maxZ), s.maxZ], 3)); g.setIndex([0, 2, 1, 0, 3, 2]); quads.push(g); }
  const mesh = (list, color, opacity) => { if (!list.length) return null; const m = new THREE.Mesh(mergeGeometries(list, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })); list.forEach((g) => g.dispose()); return m; };
  const lines = (list, color) => { if (!list.length) return null; const m = new THREE.LineSegments(mergeGeometries(list, false), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })); list.forEach((g) => g.dispose()); return m; };
  for (const m of [mesh(fills.wall, 0x34507a, 0.16), mesh(fills.top, 0xe0a040, 0.22), lines(edges.wall, 0x34507a), lines(edges.top, 0xe0a040), mesh(quads, 0x9fd3ff, 0.35)]) if (m) group.add(m);
  scene.add(group);
  collisionView = { group, hidden, bodies: new Map() }; updateCollisionView(); return true;
}
function updateCollisionView() {
  if (!collisionView) return;
  for (const f of getAllFighters()) { let c = collisionView.bodies.get(f); if (!c) { c = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 2.45, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xf2e24a, wireframe: true, transparent: true, opacity: 0.9 })); collisionView.bodies.set(f, c); collisionView.group.add(c); }   // (FIGHTER_RADIUS 1.15 u; the body's collision window runs 0.45 u under its centre to 2 u over it)
    c.position.set(f.root.position.x, f.root.position.y + 0.775, f.root.position.z); c.visible = !!f.root.visible; }
}
// MAP SCALE TEST (PT site, a dev hook, pt_deltas.py; rebuilt 2026-10-21): F7 shows a panel with the modelled map's scale —
// metres per model unit = the map's modelM × mapScale.k — and the arena's size at it; − / + step it by 5 %, reset puts it
// back; each restarts the match with the model and its data scaled alike (the sim's getArena). __MAP_SCALE(mPerUnit) from
// the console does the same. The scale stays until reset, for every modelled map.
let mapScalePanel = null;
function setMapScale(mPerUnit) { const cfg = GLB_MAPS[state.mapKey]; if (!cfg) return false; mapScale.k = mPerUnit / (cfg.modelM ?? 1); startMatch(); mapScalePanelRefresh(); return mapScale.k; }
function mapScalePanelRefresh() { if (!mapScalePanel) return; const cfg = GLB_MAPS[state.mapKey]; const b = getArenaBounds(state.mapKey); mapScalePanel.querySelector('.ms-text').textContent = cfg ? `${state.mapKey}: ${((cfg.modelM ?? 1) * mapScale.k).toFixed(2)} m per model unit (×${mapScale.k.toFixed(3)}), arena ${(2 * b.halfX / 4).toFixed(0)} × ${(2 * b.halfZ / 4).toFixed(0)} m` : `${state.mapKey}: not a modelled map`; }
function mapScalePanelToggle() {
  if (mapScalePanel) { mapScalePanel.remove(); mapScalePanel = null; return false; }
  const el = document.createElement('div'); el.id = 'mapScalePanel'; el.style.cssText = 'position:fixed;top:8px;right:8px;z-index:1000;background:rgba(0,0,0,.75);color:#fff;font:13px monospace;padding:8px 10px;border-radius:6px;pointer-events:auto';
  el.innerHTML = '<div class="ms-text"></div><div style="margin-top:6px"><button data-ms="-">-5%</button> <button data-ms="+">+5%</button> <button data-ms="reset">reset</button> <span style="opacity:.7">F7 hides</span></div>';
  el.addEventListener('click', (e) => { const btn = e.target.closest('button'); if (!btn) return; const cfg = GLB_MAPS[state.mapKey]; if (!cfg) return; const m = (cfg.modelM ?? 1) * mapScale.k; setMapScale(btn.dataset.ms === 'reset' ? (cfg.modelM ?? 1) : btn.dataset.ms === '+' ? m * 1.05 : m / 1.05); });
  document.body.appendChild(el); mapScalePanel = el; mapScalePanelRefresh(); return true;
}
"""
edit('client/src/main.js', [
    ("import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';", "import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';\nimport { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';   // (PT site: the collision view's merged boxes)"),
    ("  getGeneratedObstacles\n} from '@gvg/shared/src/sim/index.js';", "  getGeneratedObstacles,\n  mapScale\n} from '@gvg/shared/src/sim/index.js';"),
    ("function buildGlbArena(mapKey) {", VIEW + "function buildGlbArena(mapKey) {"),
    ("  group.scale.setScalar(cfg.scale);\n  group.position.set(-cfg.cx * cfg.scale, -cfg.ground * cfg.scale, -cfg.cz * cfg.scale);",
     "  const ms = cfg.scale * mapScale.k;   // (the map scale test: the model scaled as its data is)\n  group.scale.setScalar(ms);\n  group.position.set(-cfg.cx * ms, -cfg.ground * ms, -cfg.cz * ms);"),
    ("function clearArenaDecor() {\n  state.wallFadeMeshes = [];", "function clearArenaDecor() {\n  collisionViewToggle(false);   // (the collision view belongs to the arena it drew)\n  state.wallFadeMeshes = [];"),
    ("    updateMechAnimations(dt, now);", "    updateCollisionView();\n    updateMechAnimations(dt, now);"),
    ("  window.__modelCacheKeys = () => Object.keys(_modelCache);", "  window.__modelCacheKeys = () => Object.keys(_modelCache);\n  // PT site (pt_deltas.py): the collision view and the map scale test, by key and from the console.\n  window.__COLLISION_VIEW = collisionViewToggle; window.__MAP_SCALE = setMapScale; window.__MAP_SCALE_PANEL = mapScalePanelToggle;\n  window.addEventListener('keydown', (ev) => { if (ev.key === 'F8') { ev.preventDefault(); collisionViewToggle(); } else if (ev.key === 'F7') { ev.preventDefault(); mapScalePanelToggle(); } });"),
])
print('PT deltas applied:', tag)
