"""The generator's v6 rules applied to the assembled v5 generator (glb_collision.mjs as the 0.8.9 line carries it at b1023i),
after the session's scratch sources were lost (2026-10-19): (1) a one-sided face seen only from below is a ceiling, never a
floor — a double-sided material's face is seen from both sides; (2) the model's own sloped faces (1 degree, 3 m2 or more) are
ramps with their exact plane, before any plane is fitted through 5 cm height classes; (3) the void's wall stands from the
street whatever floor lies beside it; (4) a slope's skirt only where a walked floor lies more than a step under its edge;
(5) a ceiling nothing stands on merges by its own height class alone; (6) the DUMP names the rule behind every box (tags).
usage: python3 -I v6_apply.py <glb_collision.mjs>   (in place; every replacement asserted once)"""
import sys
p = sys.argv[1]; t = open(p, encoding='utf-8').read()
def rep(old, new):
    global t
    assert t.count(old) == 1, (old[:90], t.count(old)); t = t.replace(old, new)
# ---- the raster
old_inter = "const inter = new Array(N);                            // horizontal surfaces crossing the cell centre: heights\n"
rep(old_inter, old_inter
    + "const interUp = new Array(N);   // of those, the heights reached by a face that faces UP: a one-sided face seen only from below (a roof's underside, a lintel, a stair's soffit) is a ceiling, never a floor\n"
    + "const facePlanes = [];   // the model's own sloped faces (facing up, lean FACE_MIN_DEG..STAIR_MAX_DEG, FACE_MIN_AREA or more): the plane h = a + b x + c z over the street and the cells the face covers — read as ramps before any plane is fitted through cells\n"
    + "const facePlane = (a, b, c, lean, area) => { const nX = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), nY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nZ = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); const B = -nX / nY, C = -nZ / nY; const fp = { a: a[1] - GROUND - B * a[0] - C * a[2], b: B, c: C, lean, area, cells: [] }; facePlanes.push(fp); return fp; };\n")
rep("const markInterior = (j, px, pz, y) => { if (y > topAll[j]) topAll[j] = y; const q = Math.round(y * 20) / 20; const l = inter[j] ?? (inter[j] = []); if (!l.includes(q)) l.push(q); if (y - GROUND >= STEP) extend(j, px, pz); };",
    "const markInterior = (j, px, pz, y, up) => { if (y > topAll[j]) topAll[j] = y; const q = Math.round(y * 20) / 20; const l = inter[j] ?? (inter[j] = []); if (!l.includes(q)) l.push(q); if (up) { const u = interUp[j] ?? (interUp[j] = []); if (!u.includes(q)) u.push(q); } if (y - GROUND >= STEP) extend(j, px, pz); };")
rep("    const pos = accessor(p.attributes.POSITION);", "    const ds = !!json.materials?.[p.material]?.doubleSided; const pos = accessor(p.attributes.POSITION);   /* (a double-sided material is seen from both sides: the Skeld's, the Backrooms' and Dust's are all double-sided; Town's are not) */")
old_d = "      if (Math.abs(d) < 1e-9) continue;\n"
rep(old_d, old_d + "      // (the winding tells a one-sided face's side: a glTF front face runs counter-clockwise seen from its front, so d < 0 is a face that faces up; a double-sided material's face is seen from both sides)\n"
    + "      const up = ds || d < 0; const lean = Math.acos(Math.min(1, area2 / 2 / area3)) * 180 / Math.PI; const fp = (up && area3 >= FACE_MIN_AREA && lean >= FACE_MIN_DEG && lean <= STAIR_MAX_DEG) ? facePlane(a, b, c, lean, area3) : null;\n")
rep("if (yy < GROUND + CEIL) markInterior(k * nx + i, px, pz, yy); }", "if (yy < GROUND + CEIL) { markInterior(k * nx + i, px, pz, yy, up); if (fp) fp.cells.push(k * nx + i); } }")
old_seam = "const SEAM_TALL = 3.0;            // a slim run no taller than this, rising from under a floor the same on both of its sides, is a seam of the model's terrain tiles: nothing stands there (a building's wall plane is taller)\n"
rep(old_seam, old_seam + "const FACE_MIN_DEG = 1, FACE_MIN_AREA = 3;   // the model's own sloped faces are read as ramps, their plane exact: at least this lean (a street's long gentle grade; flatter is a deck) and this area in m2 (a step's tread is less)\n")
# ---- the reading
rep("    let b = a, top = l[a] - GROUND;\n    while (b + 1 < l.length && l[b + 1] - GROUND <= top + SLAB) { b += 1; top = l[b] - GROUND; }\n",
    "    let b = a, top = l[a] - GROUND;\n    while (b + 1 < l.length && l[b + 1] - GROUND <= top + SLAB) { b += 1; top = l[b] - GROUND; }\n"
    "    { const u = interUp[j]; let t = NaN; for (let c = a; c <= b; c += 1) if (u && u.includes(l[c])) t = l[c] - GROUND; if (Number.isNaN(t)) { a = b + 1; continue; } top = t; }   // (the stack's floor is its highest face that faces up; a stack of one-sided faces seen only from below — a roof's underside, a lintel, a stair's soffit — is a ceiling, no floor)\n")
rep("  for (let j = 0; j < N; j += 1) { if (oct[j] < 0 || regionOf[j] >= 0) continue;",
    "  // the model's own sloped faces first: a face's cells (reached, their floor on the face's plane within RAMP_TOL) are\n"
    "  // one stretch with the face's own plane, the faces of one plane one stretch — a street's long gentle grade read from\n"
    "  // the model, not fitted through 5 cm height classes (Dust's 2-degree path of 374 m2 was 25 deck bands and 545 boxes)\n"
    "  { const byPlane = new Map(); for (const fp of facePlanes) { const key = `${Math.round(fp.b * 1e4)},${Math.round(fp.c * 1e4)},${Math.round(fp.a * 100)}`; const g = byPlane.get(key); if (g) { g.cells.push(...fp.cells); g.area += fp.area; } else byPlane.set(key, { a: fp.a, b: fp.b, c: fp.c, lean: fp.lean, area: fp.area, cells: fp.cells.slice() }); }\n"
    "    for (const g of [...byPlane.values()].sort((p, q) => q.area - p.area)) { const cells = []; for (const q of new Set(g.cells)) { if (!reach[q] || regionOf[q] >= 0) continue; const h = g.a + g.b * (X0 + (q % nx + 0.5) * CELL) + g.c * (Z0 + (Math.floor(q / nx) + 0.5) * CELL); if (Math.abs(h - floorH[q]) <= RAMP_TOL) cells.push(q); }\n"
    "      if (cells.length < RAMP_MIN_CELLS) continue; const id = regions.length; for (const q of cells) regionOf[q] = id; regions.push({ id, cells, stairs: g.lean > RAMP_MAX_DEG, face: g }); } }\n"
    "  for (let j = 0; j < N; j += 1) { if (oct[j] < 0 || regionOf[j] >= 0) continue;")
rep("    let cells = r.cells, a = 0, b = 0, c2 = 0;\n    for (let pass = 0; pass < 2 && cells.length >= RAMP_MIN_CELLS; pass += 1) {",
    "    let cells = r.cells, a = 0, b = 0, c2 = 0;\n    if (r.face) { a = r.face.a; b = r.face.b; c2 = r.face.c; }   // (the model's own face: its plane, its cells already on it)\n    else for (let pass = 0; pass < 2 && cells.length >= RAMP_MIN_CELLS; pass += 1) {")
rep("  const o = box(w, w.h); if (w.baseLo > 0 && w.h - w.baseLo > FLOOR_MIN) o.minY = U(w.baseLo); if (w.key === 9) voids += 1;",
    "  // (the void's wall stands from the street whatever floor lies beside it: raised beside Dust's long path, it floated 4.5 m up and the nav grid found street under it, 2026-10-19)\n"
    "  const o = box(w, w.h); if (w.key !== 9 && w.baseLo > 0 && w.h - w.baseLo > FLOOR_MIN) o.minY = U(w.baseLo); if (w.key === 9) voids += 1;")
rep("const obstacles = [], surfaces = [];", "const obstacles = [], surfaces = [], tags = []; const emit = (o, t) => { obstacles.push(o); tags.push(t); };   /* (tags: the rule behind each box, for the DUMP) */")
rep("  obstacles.push(o);\n  // (a floor on top of what is wide enough", "  emit(o, w.key === 9 ? 'void' : w.low ? 'low' : o.noProjectile ? 'fence' : w.stand ? 'stand' : 'wall');\n  // (a floor on top of what is wide enough")
rep("obstacles.push({ ...o, topBuffer: 0.8 }); deckBodies += 1; }", "emit({ ...o, topBuffer: 0.8 }, 'deck'); deckBodies += 1; }")
rep("if (o.maxY > o.minY) obstacles.push({ ...o, topBuffer: 0.8 }); }", "if (o.maxY > o.minY) emit({ ...o, topBuffer: 0.8 }, 'rim'); }")
rep("if (o.maxY <= o.minY) o.maxY = o.minY + 1; obstacles.push(o);", "if (o.maxY <= o.minY) o.maxY = o.minY + 1; emit(o, 'beam');")
rep("obstacles.push({ ...o, topBuffer: 0.8 }); planeBodies += 1;", "emit({ ...o, topBuffer: 0.8 }, 'plane'); planeBodies += 1;")
rep("obstacles.push({ ...o, topBuffer: 0.8, noProjectile: true }); skirts += 1;", "emit({ ...o, topBuffer: 0.8, noProjectile: true }, 'skirt'); skirts += 1;")
rep("JSON.stringify({ nx, nz, X0, Z0, CELL, GROUND, SCALE, cx, cz, STEP,", "JSON.stringify({ tags, nx, nz, X0, Z0, CELL, GROUND, SCALE, cx, cz, STEP,")
# the ceilings: roofs as before; the rest merged by the ceiling's own class
rep("let roofSlabs = 0;\n", "let roofSlabs = 0; const ceilMerge = new Float64Array(N);   // (the ceilings that are no roof: merged below by their height class alone)\n")
rep("  if (roof) { o.topBuffer = 0.8; surfaces.push({ minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ, maxTop: o.maxY, type: 'flat', top: o.maxY }); roofSlabs += 1; }\n  obstacles.push(o); }\n",
    "  if (!roof) { for (let kk = c.k; kk < c.k + c.d; kk += 1) for (let ci = c.i; ci < c.i + c.w; ci += 1) ceilMerge[kk * nx + ci] = 3000 + Math.round(ceilH[kk * nx + ci] / 0.5); continue; }\n"
    "  o.topBuffer = 0.8; surfaces.push({ minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ, maxTop: o.maxY, type: 'flat', top: o.maxY }); roofSlabs += 1; emit(o, 'roof'); }\n"
    "// (a ceiling nothing stands on merges by its own height class alone, its box up to the highest point over it: what rises\n"
    "// above it — a chimney, a parapet, a railing on the roof — cut Dust's hall ceiling into 825 boxes, 2026-10-19)\n"
    "for (const c of rects(ceilMerge).filter(inCrop)) { const o = box(c, Math.ceil(maxIn(c, H))); o.minY = U(Math.floor(minIn(c, ceilH) * 2) / 2); if (o.maxY <= o.minY) continue; emit(o, 'ceil'); }\n")
# the skirts
rep("        if (i < 0 || k < 0 || i >= nx || k >= nz) { need = true; break; } const j = k * nx + i; if (regionOf[j] === r.id) continue;\n        const here = alongX ? hAt(X0 + (i + 0.5) * CELL, side === 'z0' ? rr.z0 : rr.z1) : hAt(side === 'x0' ? rr.x0 : rr.x1, Z0 + (k + 0.5) * CELL); if (!reach[j] || Math.abs(floorH[j] - here) > STEP) need = true; }\n",
    "        if (i < 0 || k < 0 || i >= nx || k >= nz) { need = true; break; } const j = k * nx + i; if (regionOf[j] === r.id) continue;\n        // (a skirt where a walked floor lies more than a step under the plane's edge, or nothing solid at all; beside the void, a wall, a thing or a higher floor the box already there is the solid — a path's slanted edge along the void grew a skirt per cell row, 1,500 boxes in Dust, 2026-10-19)\n        const here = alongX ? hAt(X0 + (i + 0.5) * CELL, side === 'z0' ? rr.z0 : rr.z1) : hAt(side === 'x0' ? rr.x0 : rr.x1, Z0 + (k + 0.5) * CELL); if (reach[j] ? floorH[j] < here - STEP : Number.isNaN(thingTop[j])) need = true; }\n")
assert t.count('obstacles.push(') == 1   # (emit's own)
open(p, 'w', encoding='utf-8').write(t); print('v6 applied to', p, len(t.splitlines()), 'lines')
