// Grid navigation for bots — the universal pathfinder.
//
// Builds a walkability graph from an arena's AABB obstacles + surfaces (the
// exact same data the sim collides against), then answers "how do I WALK
// from A to B?" with A*. This replaces Maze's local guesswork (wall-follow,
// sight probes, ramp heuristics) with real routes; the heuristics remain in
// the bot as fallback for when no path exists.
//
// MULTI-LAYER (2026-08-14). A cell can carry SEVERAL standing heights: the
// road under Streets' bridge and the deck above it are separate NODES of the
// same cell. The v1 grid stored one floor per cell (the top surface), so the
// underpass did not exist — a bot standing there pinned to the deck above its
// head and walked a route 8 units over its own position, and a target down
// there could not be routed to at all (measured: 15.3% of Streets bot-ticks
// had one side in that dead zone, a third of them with no route at all).
// Layers come from the same surface data the sim stands units on, so any
// future map with open space under a deck works with no special case.
// Layer 0 is always the HIGHEST level, so single-layer maps build a graph
// that is byte-identical to v1 (verified by route parity across all maps).
//
// Cell walkability reuses unitOverlapsObstacle — the collision test units
// actually move with — so topBuffer semantics (e.g. the Airport plateau's
// walkable top vs its blocking side) are honored for free. Edges test both
// node centers PLUS the midpoint: with the fighter radius (~1.15), three
// samples 2 units apart fully tile a 4-unit edge, so thin glass panes
// between two cell centers cannot slip through.

import {
  walkFloorTo, surfaceHeightAtXZ, unitOverlapsObstacle, segmentHitsObstacle, walkSegmentBlocked, sightHitsSurface,
  groundHeightAt, obstaclesNearSegment, obstaclesNearPoint } from './physics.js';
import { GROUND_BASE_Y, BOT_LOS_EYE_HEIGHT, SURFACE_STEP_HEIGHT, JUMP_RISE_MIN, NAV_FILE_EXT } from './constants.js';

const CELL = 4;
// Max floor rise between adjacent samples: the sim's step plus slack for float
// error at the boundary (a 4-unit cell on the steepest shipped ramp, Airport's
// 10 long 4 rise, steps exactly the old 1.6).
const SNAP_RADIUS = 3; // cells searched around a blocked path endpoint

// ===== LAYERS ==========================================================
// A candidate standing height becomes its own layer only when the next
// surface above it is more than LAYER_MIN_GAP up. Below that the sim's own
// step rule (SURFACE_STEP_HEIGHT) simply walks the unit onto the higher
// surface, so the two heights are the SAME standing level — that is what
// keeps kerbs, sidewalks and Station's platform lips from doubling every
// cell. LAYER_CAP bounds the arrays on pathological geometry; no shipped map
// needs more than 2.
const LAYER_MIN_GAP = 2.0;
const LAYER_CAP = 4;

// ===== WALL CLEARANCE (2026-08-08) =====================================
// Walkability uses FIGHTER_RADIUS, so a node qualifies with the body only
// just fitting — a route may hug a wall with ZERO margin, and the follower's
// normal drift (avoidance blend, momentum, waypoint skip-ahead) then rubs
// the body along it. That was the Airport ramp-corner grind.
// Nodes are graded by how much room they actually have and A* PENALISES the
// tight ones, so routes prefer the middle of a corridor and stand off wall
// RUNS. A penalty, not a ban: nothing becomes unroutable — where every node
// is tight (a real chokepoint) the penalty is uniform and the chosen route
// is unchanged.
// Only the TIGHT grade is charged. At 1.2 per node the charge tips a detour
// only for runs of TWO or more tight nodes (2.4 > the 2-move price of a
// 1-cell detour) — an ISOLATED tight node, e.g. a single convex corner or
// door jamb, is cheaper to walk through than around (1.2 < 2.0) and A*
// keeps it. That is the accepted trade: raising the cost above 2.0 to catch
// single corners also re-routes long map crossings (measured: it sent
// Streets' ground traverse up over the overpass).
// MID nodes carry a SMALL charge (0.15/node, 2026-08-12): the wall-hugging
// lane a walking body actually touches sits at clearance ≈ 2.0 — grade MID —
// so with mid free, even the clearance-taxed Dijkstra kept choosing flush-
// along-the-wall routes (measured on the Flashpoint room spawns: contact
// share 12.7% with mid free, 6.0% at 0.15). At 0.15 a one-cell sidestep
// away from a wall pays for itself after a short run, while a 40-cell map
// crossing accumulates only +6 — measured NOT enough to flip Streets'
// ground traverse onto the overpass (14/160 elevated routes, identical to
// mid-free). The alternatives measured and rejected the same day: widening
// the TIGHT band to 2.6 (nudged the overpass count and factory2 grind up)
// and combining both (worse grind on flashpoint AND factory2).
// SCOPE (2026-08-12): BOTH planners apply this cost. findPathOnGrid always
// did; findFiringPath — the first-choice planner for combat routes (see the
// navPlan order in ai.js) — was a uniform-cost BFS until the same day's
// room-spawn report ("bots grind the wall right after spawn") showed its
// fewest-cells routes hugging walls, and is now a Dijkstra over these same
// costs. Every live bot route is steered by this penalty.
const CLEAR_MID = 2.0;     // body + ~0.85 slack
const CLEAR_WIDE = 3.2;    // body + ~2 slack: comfortably off the wall
const TIGHT_COST = [1.2, 0.15, 0];   // by clearance grade 0 / 1 / 2
const JUMP_LINK_COST = 2.5;
// A firing cell is picked for its SIGHT, but the follower is allowed to stop
// up to 3 units short of a waypoint (the arrival test in ai.js), and a cell
// whose line only just grazes the lip of cover is then a trap: the bot walks
// the whole way, stops short, sees nothing, and the pathless fallback
// beelines it back the way it came (measured under the Streets bridge as a
// 7 s out-and-back loop that never resolved). Judge the cell from an eye
// lowered by this margin so the sight it was chosen for survives the slack.
const FIRING_SIGHT_MARGIN = 0.8;

export function buildNavGrid(obstacles, surfaces) {
  // Grid bounds = obstacle bounding box. Boundary walls are obstacles in
  // both sims, so this always covers the full play area.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const o of obstacles) {
    if (o.minX < minX) minX = o.minX;
    if (o.maxX > maxX) maxX = o.maxX;
    if (o.minZ < minZ) minZ = o.minZ;
    if (o.maxZ > maxZ) maxZ = o.maxZ;
  }
  if (minX === Infinity) { minX = -140; maxX = 140; minZ = -140; maxZ = 140; }
  const cols = Math.max(1, Math.round((maxX - minX) / CELL));
  const rows = Math.max(1, Math.round((maxZ - minZ) / CELL));
  const n = cols * rows;

  const floorAt = (x, z) => {
    const s = surfaceHeightAtXZ(x, z, surfaces);
    return s === -Infinity ? 0 : s;
  };
  const fitsAt = (x, z, fy) => !unitOverlapsObstacle(x, fy + GROUND_BASE_Y, z, obstacles);
  // WHERE A NODE STANDS (2026-10-24): at its cell's centre when a body fits there, else a quarter cell to one side.
  // A lane narrower than two cells — Compound's 1.5 m catwalk between a kerb and a wall, its 1.75 m mezzanine between
  // a guard rail and a balustrade — holds a body, but neither row of cell centres falls in the clear band (they miss
  // it by 3 to 27 cm), so the whole lane was no floor to the bots and the bridge between the two buildings an island
  // a bot could not route to (user 2026-10-24: "BOT seemed to have no idea how to approach"). The node sits at the
  // point the body fits; the walk edges are read between the nodes' own points (posX/posZ, below), and the fit at a
  // crossing's midpoint stays the strict one — loosening that test too let a route slip past Station's 0.5-unit
  // platform face into the hollow platforms (76 edges, measured and rejected the same day).
  const SAMPLES = [[0, 0], [CELL / 4, 0], [-CELL / 4, 0], [0, CELL / 4], [0, -CELL / 4]];
  const standAt = (x, z, fy) => { for (let s = 0; s < SAMPLES.length; s += 1) { const sx = x + SAMPLES[s][0], sz = z + SAMPLES[s][1]; if (fitsAt(sx, sz, fy)) return [sx, sz]; } return null; };
  // Every distinct standing height at (x, z): each surface covering the point,
  // and the street (0) where no surface lies within a step of it — the sim's
  // own ground rule (groundHeightAt), so the grid stands the bot where the sim
  // does. Ascending, deduped.
  const _floorScratch = [];
  const candidateFloors = (x, z) => {
    const hs = [];
    const near = obstaclesNearPoint(surfaces, x, z, 0, _floorScratch);   // (the broadphase: the surfaces whose box can cover the point; sorted below, so the same list)
    for (let k = 0; k < near.length; k += 1) {
      const s = near[k];
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      const h = s.heightAt ? s.heightAt(x, z) : (s.top ?? s.maxTop);
      if (h == null || !Number.isFinite(h)) continue;
      hs.push(h);
    }
    if (!hs.some((h) => h <= SURFACE_STEP_HEIGHT)) hs.push(0);   // (the street, where nothing lies on it; a slab higher than a step is a floor over the street, not instead of it)
    hs.sort((a, b) => a - b);
    const out = [];
    for (const h of hs) if (!out.length || h - out[out.length - 1] > 0.05) out.push(h);
    return out;
  };
  // The standing height a walk between two levels passes through at the
  // An edge is a WALK edge when a body walking it (walkFloorTo: the sim's step
  // rule every unit of the way) arrives on the far node's floor, from both
  // ends. This is what stops the layer split from inventing space: under the
  // low end of a ramp the body does fit and the gap to the slab above passes
  // LAYER_MIN_GAP, but a unit walking in from the open floor is STEPPED UP
  // onto the ramp and can never stand there — its only connections fail and
  // the sealed-void pass prunes it. And a rise the body climbs step by step
  // (a kerb's 45-degree ramp, a flight of steps) is a walk edge however much
  // it rises over the cell, where the floor difference between the two node
  // centres called it a jump (b1021s).

  // --- Layer discovery ---
  const cellLayers = new Array(n);
  const cellPos = new Array(n);       // per kept level: where the body stands in the cell
  const cellCovered = new Array(n);   // per kept level: is there geometry overhead?
  let layers = 1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      const x = minX + (c + 0.5) * CELL;
      const z = minZ + (r + 0.5) * CELL;
      const hs = candidateFloors(x, z);
      const keep = [], keepPos = [];
      for (let k = 0; k < hs.length; k += 1) {
        const above = k + 1 < hs.length ? hs[k + 1] : null;
        if (above != null && above - hs[k] < LAYER_MIN_GAP) continue;   // stepped up onto the level above
        const at = standAt(x, z, hs[k]); if (!at) continue;
        keep.push(hs[k]); keepPos.push(at);
      }
      keep.reverse(); keepPos.reverse();    // layer 0 = highest level
      if (keep.length > LAYER_CAP) { keep.length = LAYER_CAP; keepPos.length = LAYER_CAP; }
      cellLayers[i] = keep; cellPos[i] = keepPos;
      // COVERED is about real overhead geometry, not about which levels were
      // kept: where furniture blocks the deck level, the ground beneath it is
      // still under the deck, and calling it "open" would keep a sealed void
      // alive (measured on Lobby's under-mezzanine space).
      cellCovered[i] = keep.map((h) => hs.some((o) => o > h + 1.0));
      if (keep.length > layers) layers = keep.length;
    }
  }

  const size = n * layers;
  const floor = new Float32Array(size);
  const walk = new Uint8Array(size);
  const posX = new Float32Array(size), posZ = new Float32Array(size);   // where each node's body stands: the cell's centre, unless the body fits only beside it
  const clearGrade = new Uint8Array(size); // 0 tight / 1 mid / 2 wide (see TIGHT_COST)
  // edgeE[(la * layers + lb) * n + i]: cell i layer la <-> cell i+1 layer lb.
  // edgeS likewise for cell i <-> cell i+cols. With one layer these collapse
  // to v1's per-cell arrays exactly.
  const edgeE = new Uint8Array(size * layers);
  const edgeS = new Uint8Array(size * layers);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      const x = minX + (c + 0.5) * CELL;
      const z = minZ + (r + 0.5) * CELL;
      const keep = cellLayers[i];
      // Unwalkable cells still carry the top surface height in layer 0 — the
      // v1 value every floor-hint comparison was tuned against.
      if (!keep.length) floor[i] = floorAt(x, z);
      for (let l = 0; l < layers; l += 1) { posX[l * n + i] = x; posZ[l * n + i] = z; }
      for (let l = 0; l < keep.length; l += 1) {
        const node = l * n + i;
        floor[node] = keep[l];
        walk[node] = 1;
        posX[node] = cellPos[i][l][0]; posZ[node] = cellPos[i][l][1];
      }
      // clearGrade is filled AFTER the sealed-void prune — it is the most
      // expensive per-node work (two expanded-radius overlap scans) and the
      // pruned nodes are thrown away (Station alone builds 3400 of them).
    }
  }

  // --- Walk edges, per layer pair ---
  // Everything that depends only on the CELL (midpoint candidate heights) or
  // on one layer (the step-rule arrivals) is computed once per cell/layer,
  // not once per layer PAIR — the naive form re-walked the surface list
  // layers^2 times per cell and cost Station ~600 ms extra at build.
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (!cellLayers[i].length) continue;
      const x = minX + (c + 0.5) * CELL;
      const z = minZ + (r + 0.5) * CELL;
      for (const dir of [0, 1]) {                 // 0 = east, 1 = south
        const east = dir === 0;
        if (east ? c + 1 >= cols : r + 1 >= rows) continue;
        const j = east ? i + 1 : i + cols;
        if (!cellLayers[j].length) continue;
        for (let la = 0; la < layers; la += 1) {
          const a = la * n + i;
          if (!walk[a]) continue;
          const ax = posX[a], az = posZ[a];
          for (let lb = 0; lb < layers; lb += 1) {
            const b = lb * n + j;
            if (!walk[b]) continue;
            // (between the two nodes' own points: a body's walk from one to the other, and the fit at its midpoint;
            // read per pair of nodes now that a node may stand beside its cell's centre)
            const bx = posX[b], bz = posZ[b], mx = (ax + bx) / 2, mz = (az + bz) / 2;
            // Both directions must arrive on each other's level, walking (see walkFloorTo).
            if (Math.abs(walkFloorTo(ax, az, floor[a], bx, bz, surfaces) - floor[b]) > 0.05) continue;
            if (Math.abs(walkFloorTo(bx, bz, floor[b], ax, az, surfaces) - floor[a]) > 0.05) continue;
            // (and nothing stands in the walk at the lower floor's body height, the whole way: the fit at the midpoint is read
            // at the floor the walk stands on there — past a step up — so a lip before the step, Factory's belt rails, 2.9
            // units over the ground beside a 2.6-unit belt top, was never met, the belt read as walked onto, no link ever
            // bridged it, and no bot crossed a belt; user 2026-10-24)
            if (walkSegmentBlocked(ax, az, bx, bz, Math.min(floor[a], floor[b]) + GROUND_BASE_Y, obstacles)) continue;
            if (fitsAt(mx, mz, walkFloorTo(ax, az, floor[a], mx, mz, surfaces))) {
              if (east) edgeE[(la * layers + lb) * n + i] = 1;
              else edgeS[(la * layers + lb) * n + i] = 1;
            }
          }
        }
      }
    }
  }

  const grid = {
    cols, rows, n, layers, minX, minZ, cell: CELL,
    floor, walk, clearGrade, edgeE, edgeS, surfaces, posX, posZ,
    jumpAdj: new Map(), jumpLinkCount: 0
  };

  // --- Connected components over walk edges (nodes) ---
  const comp = new Int32Array(size).fill(-1);
  {
    const stack = new Int32Array(size);
    let compCount = 0;
    for (let seed = 0; seed < size; seed += 1) {
      if (!walk[seed] || comp[seed] !== -1) continue;
      let sp = 0;
      stack[sp++] = seed;
      comp[seed] = compCount;
      while (sp > 0) {
        const cur = stack[--sp];
        forEachWalkNeighbor(grid, cur, (nb) => {
          if (comp[nb] === -1) { comp[nb] = compCount; stack[sp++] = nb; }
        });
      }
      compCount += 1;
    }
  }

  // --- Prune sealed voids ---
  // The space inside a SOLID raised platform fits a body and connects to its
  // neighbours, so it builds a tidy little component that no unit can ever
  // enter (Station's platform interiors: 3400 such nodes; Lobby's
  // under-mezzanine slab: 1300). Openness test: a component that never
  // touches a node with nothing overhead is sealed inside geometry. A
  // genuine underpass always reaches out to open ground (Streets' road runs
  // out from under the bridge), so it survives.
  {
    const open = new Map();
    for (let node = 0; node < size; node += 1) {
      if (!walk[node] || comp[node] < 0) continue;
      const covered = cellCovered[node % n][(node / n) | 0];
      if (!covered) open.set(comp[node], true);
      else if (!open.has(comp[node])) open.set(comp[node], false);
    }
    for (let node = 0; node < size; node += 1) {
      if (walk[node] && open.get(comp[node]) === false) { walk[node] = 0; comp[node] = -1; }
    }
    // Drop edges that now touch a pruned node.
    for (let i = 0; i < n; i += 1) {
      for (let la = 0; la < layers; la += 1) {
        for (let lb = 0; lb < layers; lb += 1) {
          const e = (la * layers + lb) * n + i;
          const c = i % cols, r = (i / cols) | 0;
          if (edgeE[e] && (!walk[la * n + i] || c + 1 >= cols || !walk[lb * n + i + 1])) edgeE[e] = 0;
          if (edgeS[e] && (!walk[la * n + i] || r + 1 >= rows || !walk[lb * n + i + cols])) edgeS[e] = 0;
        }
      }
    }
  }

  // --- Clearance grading (survivors only; see the note at node creation) ---
  for (let node = 0; node < size; node += 1) {
    if (!walk[node]) continue;
    const x = posX[node], z = posZ[node];
    const y = floor[node] + GROUND_BASE_Y;
    clearGrade[node] = !unitOverlapsObstacle(x, y, z, obstacles, CLEAR_WIDE) ? 2
      : (!unitOverlapsObstacle(x, y, z, obstacles, CLEAR_MID) ? 1 : 0);
  }

  // ===== Jump-links =====
  // Bridge WALK-DISCONNECTED islands (Station's 4 m platforms) with jump
  // edges: two walkable nodes within 2 cells of each other, vertical gap in
  // the bots' climb window [1.7 .. 4.8], and in DIFFERENT walk components.
  // The component rule is the safety guarantee: anywhere walking already
  // works (ramped plateaus, flat maps) produces ZERO links, so existing
  // routes stay byte-identical. Links are bidirectional — traversed upward
  // the path-follower jumps; downward it simply walks off the ledge.
  const JUMP_MIN = JUMP_RISE_MIN;
  const JUMP_MAX = 4.8;
  // ==== SAME-COMPONENT SHORTCUT LINKS (2026-07-12) ====================
  // REVERSIBILITY SWITCH: set to false to restore the pre-change builder
  // exactly (island-only links). Everything below is additive — island
  // links flow through the unchanged code path regardless of this flag.
  //
  // With the flag on, a jump link may ALSO be created between two nodes of
  // the SAME walk component (e.g. Factory 2's fence-gap deck openings,
  // which are walk-reachable via the ramps but only by a long detour) when
  // ALL THREE extra guards pass:
  //   1. detour  — walking between the nodes takes >= SAME_COMP_MIN_DETOUR
  //                units (BFS, capped); short detours keep walking.
  //   2. arc     — no obstacle crossing the segment sticks up past the jump
  //                arc (top > lowFloor + JUMP_ARC_CLEARANCE). This is the
  //                guard the audit demanded: topBuffer-0 rails (top 6) sit
  //                between the two floors' body heights and pass the yHi
  //                clearance test below, but a jump from the ground (apex
  //                ~5.6) physically cannot clear them.
  //   3. the existing yHi walkSegmentBlocked clearance (shared with island
  //                links) — walls/glass still veto.
  const SAME_COMPONENT_LINKS = true;
  const SAME_COMP_MIN_DETOUR = 40;          // world units
  const JUMP_ARC_CLEARANCE = 5.2;           // jump apex ~5.6, with margin
  // Does any obstacle crossing the XZ segment stick up past `topLimit`?
  const segBlockedAbove = (x0, z0, x1, z1, topLimit) => {
    const cand = obstaclesNearSegment(obstacles, { x: x0, z: z0 }, { x: x1, z: z1 });   // (the boxes the segment can cross; the slab test below is the exact one — 2026-10-25)
    for (let k = 0; k < cand.length; k += 1) {
      const o = cand[k];
      if (o.maxY <= topLimit || o.minY > topLimit) continue;
      let tMin = 0, tMax = 1, miss = false;
      for (const [s, dl, lo, hi] of [[x0, x1 - x0, o.minX, o.maxX], [z0, z1 - z0, o.minZ, o.maxZ]]) {
        if (Math.abs(dl) < 1e-9) { if (s < lo || s > hi) { miss = true; break; } }
        else {
          const t1 = (lo - s) / dl, t2 = (hi - s) / dl;
          const tN = Math.min(t1, t2), tF = Math.max(t1, t2);
          if (tN > tMin) tMin = tN;
          if (tF < tMax) tMax = tF;
          if (tMin > tMax) { miss = true; break; }
        }
      }
      if (!miss) return true;
    }
    return false;
  };
  // Capped BFS walking distance (cells) between two nodes of one component.
  const walkDetourCells = (from, to, capCells) => {
    if (from === to) return 0;
    const dist = new Map([[from, 0]]);
    let frontier = [from];
    for (let d = 1; d <= capCells; d += 1) {
      const next = [];
      for (const cur of frontier) {
        forEachWalkNeighbor(grid, cur, (j) => {
          if (!dist.has(j)) { dist.set(j, d); next.push(j); }
        });
      }
      if (dist.has(to)) return dist.get(to);
      frontier = next;
      if (!frontier.length) return Infinity;
    }
    return Infinity;
  };
  // ====================================================================
  const addLink = (a, b) => {
    if (!grid.jumpAdj.has(a)) grid.jumpAdj.set(a, []);
    if (!grid.jumpAdj.has(b)) grid.jumpAdj.set(b, []);
    grid.jumpAdj.get(a).push(b);
    grid.jumpAdj.get(b).push(a);
    grid.jumpLinkCount += 1;
  };
  const nodeX = (node) => posX[node];
  const nodeZ = (node) => posZ[node];
  const anyWalkable = (i) => {
    for (let l = 0; l < layers; l += 1) if (walk[l * n + i]) return true;
    return false;
  };
  const hasWalkEdge = (a, b) => {
    const ia = a % n, ib = b % n;
    const la = (a / n) | 0, lb = (b / n) | 0;
    if (ib === ia + 1) return !!edgeE[(la * layers + lb) * n + ia];
    if (ib === ia - 1) return !!edgeE[(lb * layers + la) * n + ib];
    if (ib === ia + cols) return !!edgeS[(la * layers + lb) * n + ia];
    if (ib === ia - cols) return !!edgeS[(lb * layers + la) * n + ib];
    return false;   // span-2 candidates never have a direct edge
  };
  for (let i = 0; i < n; i += 1) {
    const c = i % cols, r = (i / cols) | 0;
    for (let la = 0; la < layers; la += 1) {
      const a = la * n + i;
      if (!walk[a]) continue;
      const tryLink = (j) => {
        let linked = false;
        for (let lb = 0; lb < layers; lb += 1) {
          const b = lb * n + j;
          if (!walk[b]) continue;
          if (hasWalkEdge(a, b)) continue;
          const sameComp = comp[a] === comp[b];
          if (sameComp && !SAME_COMPONENT_LINKS) continue;
          const dyF = Math.abs(floor[a] - floor[b]);
          // (an island link needs no least rise: the two components are apart, so no walk joins them whatever the rise.
          // Factory's belts — 2.6 units up, a step's height, with 2.9-unit lips a body cannot step — were islands no link
          // reached, a rise under JUMP_MIN being left to walking, and no bot ever crossed one; user 2026-10-24. A shortcut
          // within one component keeps the least rise: a step is walked.)
          if (dyF > JUMP_MAX || (sameComp && dyF < JUMP_MIN)) continue;
          // The crossing must be PHYSICALLY jumpable: test the segment between
          // the two node centers at the UPPER floor's body height. A thin
          // edge-seam wall (top == upper floor, topBuffer 0 — Station's
          // platform fronts) passes over its top; a real wall (boundary,
          // glass fence) blocks — without this, span-2 links bridged straight
          // THROUGH the Lobby's outer wall to ghost cells beyond it.
          const xi = nodeX(a), zi = nodeZ(a), xj = nodeX(b), zj = nodeZ(b);
          const yHi = Math.max(floor[a], floor[b]) + GROUND_BASE_Y;
          if (walkSegmentBlocked(xi, zi, xj, zj, yHi, obstacles)) continue;
          if (sameComp) {
            // Extra guards for shortcut links (see block comment above).
            if (segBlockedAbove(xi, zi, xj, zj, Math.min(floor[a], floor[b]) + JUMP_ARC_CLEARANCE)) continue;
            const capCells = Math.ceil(SAME_COMP_MIN_DETOUR / CELL) + 2;
            if (walkDetourCells(a, b, capCells) * CELL < SAME_COMP_MIN_DETOUR) continue;
          }
          addLink(a, b);
          linked = true;
        }
        return linked;
      };
      // Span +1, and +2 across an unwalkable seam cell (the strip hugging an
      // invisible edge wall is often too tight to stand in).
      if (c + 1 < cols) {
        if (!tryLink(i + 1) && c + 2 < cols && !anyWalkable(i + 1)) tryLink(i + 2);
      }
      if (r + 1 < rows) {
        if (!tryLink(i + cols) && r + 2 < rows && !anyWalkable(i + cols)) tryLink(i + 2 * cols);
      }
    }
  }
  return grid;
}

// Visit every walk neighbour of `node` (4-way, across layers). Jump-links are
// NOT included — callers that want them add them explicitly, because the
// component pass and the detour probe must see walking only.
function forEachWalkNeighbor(grid, node, visit) {
  const { cols, rows, n, layers, edgeE, edgeS } = grid;
  const l = (node / n) | 0;
  const i = node % n;
  const c = i % cols, r = (i / cols) | 0;
  if (c + 1 < cols) {
    for (let lb = 0; lb < layers; lb += 1) if (edgeE[(l * layers + lb) * n + i]) visit(lb * n + i + 1);
  }
  if (c > 0) {
    const j = i - 1;
    for (let la = 0; la < layers; la += 1) if (edgeE[(la * layers + l) * n + j]) visit(la * n + j);
  }
  if (r + 1 < rows) {
    for (let lb = 0; lb < layers; lb += 1) if (edgeS[(l * layers + lb) * n + i]) visit(lb * n + i + cols);
  }
  if (r > 0) {
    const j = i - cols;
    for (let la = 0; la < layers; la += 1) if (edgeS[(la * layers + l) * n + j]) visit(la * n + j);
  }
}

// Walk neighbours + jump-links, with the traversal cost of each.
function forEachNeighbor(grid, node, visit) {
  forEachWalkNeighbor(grid, node, (nb) => visit(nb, 1));
  const jl = grid.jumpAdj ? grid.jumpAdj.get(node) : null;
  if (jl) for (const nb of jl) visit(nb, JUMP_LINK_COST);
}
// Does a WALK edge join a to b? The path builders flag the node a jump link leads to (`jump`): the follower
// vaults toward that waypoint, and toward no other — a slope or a kerb's ramp the body walks is a walk edge.
function isWalkEdge(grid, a, b) { let yes = false; forEachWalkNeighbor(grid, a, (nb) => { if (nb === b) yes = true; }); return yes; }

// (a node's point: where its body stands — the cell's centre, or a quarter cell beside it; see standAt)
const nodeCenterX = (grid, node) => (grid.posX ? grid.posX[node] : grid.minX + (((node % grid.n) % grid.cols) + 0.5) * grid.cell);
const nodeCenterZ = (grid, node) => (grid.posZ ? grid.posZ[node] : grid.minZ + ((((node % grid.n) / grid.cols) | 0) + 0.5) * grid.cell);

// Nearest walkable NODE to (x, z). `floorHint` (the actor's floor height)
// picks the right LAYER as well as the right cell — without it, a bot on the
// plateau could snap to a ground cell through the wall beneath it, and since
// 2026-08-14 a bot under a bridge would snap to the deck over its head.
// `reachObstacles` (start pins only): the pin may additionally only land on
// a square the actor can WALK to from its true position — measured with
// real movement rules (walkSegmentBlocked). "Nearest" alone measures
// straight through walls, so a bot pressed against a ramp balustrade got
// pinned on the far side of the glass and every route began with "walk
// through the wall" (the on-a-slope grinding bug). Mid-slope the floorHint
// tolerance (±2) can't save it — a slope's own height sits within 2 of BOTH
// adjacent levels.
function nearestWalkable(grid, x, z, floorHint, reachObstacles = null) {
  const { cols, rows, cell, minX, minZ, n, layers, walk, floor } = grid;
  const c0 = Math.max(0, Math.min(cols - 1, Math.floor((x - minX) / cell)));
  const r0 = Math.max(0, Math.min(rows - 1, Math.floor((z - minZ) / cell)));
  const reachY = (floorHint ?? 0) + GROUND_BASE_Y;
  let anyMatch = -1;
  for (let rad = 0; rad <= SNAP_RADIUS; rad += 1) {
    for (let dr = -rad; dr <= rad; dr += 1) {
      for (let dc = -rad; dc <= rad; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
        const i = r * cols + c;
        // Layers of this cell, nearest floor to the hint first.
        let best = -1, bestD = Infinity;
        for (let l = 0; l < layers; l += 1) {
          const node = l * n + i;
          if (!walk[node]) continue;
          const d = floorHint == null ? 0 : Math.abs(floor[node] - floorHint);
          if (d < bestD) { bestD = d; best = node; }
        }
        if (best < 0) continue;
        if (reachObstacles) {
          const cx = nodeCenterX(grid, best), cz = nodeCenterZ(grid, best);
          if (walkSegmentBlocked(x, z, cx, cz, reachY, reachObstacles)) continue;
        }
        if (floorHint == null || bestD <= 2) return best;
        if (anyMatch < 0) anyMatch = best;
      }
    }
  }
  return anyMatch;
}

// A* over the graph. Returns waypoints [{x, z, y}, ...] from near the start to
// near the goal (node centers, collinear runs collapsed), or null when no
// walk route exists (e.g. target on a jump-only platform).
export function findPathOnGrid(grid, sx, sz, tx, tz, startFloor = null, goalFloor = null, obstacles = null) {
  const { cols, n, layers, floor } = grid;
  const size = n * layers;
  const start = nearestWalkable(grid, sx, sz, startFloor, obstacles);
  const goal = nearestWalkable(grid, tx, tz, goalFloor);
  if (start < 0 || goal < 0 || start === goal) return null;
  const g = new Float32Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const gCell = goal % n;
  const gc = gCell % cols, gr = (gCell / cols) | 0;
  const h = (i) => {
    const cell = i % n;
    return Math.abs((cell % cols) - gc) + Math.abs(((cell / cols) | 0) - gr);
  };

  // Small binary heap of [f, node].
  const heap = [];
  const push = (f, i) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      const t = heap[p]; heap[p] = heap[k]; heap[k] = t;
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let s = k;
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
        if (s === k) break;
        const t = heap[s]; heap[s] = heap[k]; heap[k] = t;
        k = s;
      }
    }
    return top;
  };

  g[start] = 0;
  push(h(start), start);
  let guard = 0;
  let found = false;
  while (heap.length) {
    if (++guard > 30000) break;
    const cur = pop()[1];
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) { found = true; break; }
    forEachNeighbor(grid, cur, (nb, cost) => {
      if (closed[nb]) return;
      // WALL-CLEARANCE PENALTY: entering a node whose body barely fits costs
      // extra, so A* buys its way off wall RUNS (>= 2 tight nodes) and down
      // the middle of corridors when the room exists; an isolated tight node
      // is still cheaper through than around — see the header note. Never
      // blocking — a uniformly tight chokepoint just costs more and still
      // gets used.
      const ng = g[cur] + cost + (grid.clearGrade ? TIGHT_COST[grid.clearGrade[nb]] : 0);
      if (ng < g[nb]) {
        g[nb] = ng;
        parent[nb] = cur;
        push(ng + h(nb), nb);
      }
    });
  }
  if (!found) return null;

  const pts = [];
  for (let i = goal; i !== -1; i = parent[i]) {
    pts.push({ x: nodeCenterX(grid, i), z: nodeCenterZ(grid, i), y: floor[i], jump: parent[i] !== -1 && !isWalkEdge(grid, parent[i], i) });
  }
  pts.reverse();
  return collapseWaypoints(pts);
}

// Collapse straight runs — fewer waypoints, smoother following. NEVER
// collapses across a jump link (the node it leads to is flagged `jump`): the
// follower needs the waypoint on each side of the ledge to know where to vault.
function collapseWaypoints(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let k = 1; k < pts.length - 1; k += 1) {
    const a = out[out.length - 1], b = pts[k], c2 = pts[k + 1];
    const floorJump = !!(b.jump || c2.jump);
    const cross = (b.x - a.x) * (c2.z - b.z) - (b.z - a.z) * (c2.x - b.x);
    if (!floorJump && Math.abs(cross) < 1e-6) continue;
    out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// PATH SMOOTHING (2026-08-13, user: diagonals "when it's surely safe").
// Post-plan string-pulling over the collapsed waypoints: greedily replace a
// run of grid legs with one straight (usually diagonal) leg when a swept
// corridor PROVES the walk safe. The grid stays 4-connected — every diagonal
// a bot walks comes from this pass and is corridor-verified. A leg a->b is
// accepted only if:
//   - every waypoint from a to b sits on a's floor (±0.5): never smooth
//     across ramps, jump-links, or belt/deck transitions (the same rule
//     collapseWaypoints applies to straight runs);
//   - samples every ~1u along a->b land on a WALKABLE node OF THAT SAME
//     FLOOR — no cutting over belt sides, ledges, gaps, or (since the
//     multi-layer grid) across a deck edge onto the level below;
//   - every sample clears all obstacles by CLEAR_WIDE via
//     unitOverlapsObstacle. NOT CLEAR_MID: a chord accepted at >= 2.0 lands
//     exactly in the mid-graded lane, deleting the one-cell dogleg that is
//     the 0.15 mid tax's entire route-level effect — i.e. it re-authorizes
//     the measured wall-hug lane (review 2026-08-13; the taxed route bulges
//     off the wall, smoothing collapsed the bulge right back). At 3.2 a
//     chord only exists through space the tax already grades free, so every
//     route-level tax decision survives smoothing. Doorways and clutter
//     alleys fail on purpose: their grid legs stay.
// Waypoints are only ever REMOVED, never moved — the follower's advance rule
// still sees original cell centres (statue-escape compares against the WHOLE
// remaining frozen route for this reason — see the ai.js re-commit block).
// The scan stops extending at the first failing leg and is windowed to 12
// waypoints per anchor: each accepted extension re-walks the full chord, so
// an unbounded scan is O(N^2) samples on exactly the long open-field paths
// smoothing exists for (review 2026-08-13); chained capped chords read the
// same in play.
export function smoothPath(grid, path, obstacles) {
  if (!path || path.length < 3 || !obstacles) return path;
  const { cols, rows, cell, minX, minZ, n, layers, floor, walk } = grid;
  const clearLeg = (a, b) => {
    const ya = a.y ?? 0;
    const dx = b.x - a.x, dz = b.z - a.z;
    // (the per-chord prefilter that walked every box of the map is gone — 2026-10-25: unitOverlapsObstacle reads the
    // sim's point index itself, so each sample asks only the boxes within its radius; the same boxes answer)
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz)));
    for (let s = 1; s <= steps; s += 1) {
      const x = a.x + (dx * s) / steps;
      const z = a.z + (dz * s) / steps;
      const c = Math.floor((x - minX) / cell);
      const r = Math.floor((z - minZ) / cell);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
      const i = r * cols + c;
      let onFloor = false;
      for (let l = 0; l < layers; l += 1) {
        const node = l * n + i;
        if (walk[node] && Math.abs(floor[node] - ya) <= 0.5) { onFloor = true; break; }
      }
      if (!onFloor) return false;
      if (unitOverlapsObstacle(x, ya + GROUND_BASE_Y, z, obstacles, CLEAR_WIDE)) return false;
    }
    return true;
  };
  const out = [path[0]];
  let a = 0;
  while (a < path.length - 1) {
    let best = a + 1;
    const bMax = Math.min(path.length, a + 13);
    for (let b = a + 2; b < bMax; b += 1) {
      if (path[b].jump) break;   // (never a chord across a jump link)
      if (Math.abs((path[b].y ?? 0) - (path[a].y ?? 0)) > 0.5) break;
      if (!clearLeg(path[a], path[b])) break;
      best = b;
    }
    out.push(path[best]);
    a = best;
  }
  return out;
}

// FIRING-POSITION SEARCH. Find the cheapest-by-walking node that can FIGHT
// the target: distance to (tx, tz) inside [minD, maxD] (the weapon's band)
// AND a clear line of sight from that node's eye height to the target's.
// Dijkstra over the same clearance-taxed costs as findPathOnGrid
// guarantees the cheapest-walk such node (2026-08-12; was a fewest-cells
// BFS, whose routes hugged walls by construction). This is what
// lets a sniper route to a sniping SPOT instead of to the enemy's feet —
// sampling only along the direct path missed band positions that live off
// to the side (e.g. clear lanes past the clutter). Returns waypoints like
// findPathOnGrid, or null when no reachable firing node exists.
// 2026-10-25 (user, the online lag on Compound — "the firing-position search is the main traffic"): three things, the
// answer unchanged.
//   - The sight test is sightClear's (the broadphase): a candidate used to be tested against EVERY box and EVERY floor of
//     the map, twice (two eye heights). On Compound that is 22,666 boxes and 16,878 floors per candidate.
//   - The expansion is DIRECTED (A*): each node's key is its walking cost plus a lower bound of the walk still needed to
//     reach the band — the straight-line distance to the band's outer edge, in cells, over 1.5 (a walk edge joins two
//     node points up to 1.5 cells apart for its cost of 1, so the bound never exceeds the true cost; a jump link's 2.5
//     covers its two cells). With an admissible bound the first qualifying node popped is still a cheapest-walk firing
//     node; only ties between equally cheap spots may fall the other way. The far side of the map is expanded only when
//     the walls force a detour.
//   - RESUMABLE, like findHiddenSpot: with opts.job and opts.deadline (a performance.now() instant), a search that runs out
//     of its slice parks its open set in job.state and returns { pending: true }; the next call with the same job goes
//     on from there. Without a job the deadline ends the search as a miss, as before.
export function findFiringPath(grid, sx, sz, startFloor, tx, tz, targetEyeY, minD, maxD, obstacles, targetFloor = null, opts = {}) {
  const { n, layers, floor, clearGrade, surfaces } = grid;
  const size = n * layers;
  const pTarget = { x: tx, y: targetEyeY, z: tz };
  // Sight rule is the BOT'S rule (2026-08-14): sight-blocking invisible bars count, and SURFACES count — this search
  // used to ignore surfaces entirely and happily certified firing cells whose line ran straight through the Streets
  // bridge deck, sending bots to spots they could not shoot from.
  const seesAtEye = (node, dy) => sightClear(
    { x: nodeCenterX(grid, node), y: floor[node] + GROUND_BASE_Y + 1.6 + dy, z: nodeCenterZ(grid, node) },
    pTarget, obstacles, surfaces
  );
  // BOTH eyes must see: the real one (the shot the bot will actually take) and one lowered by the margin (so the cell
  // keeps its sight when the follower stops short). Testing only the lowered eye is NOT conservative — a lower ray can
  // slip UNDER overhead geometry (Streets' upper storeys, the bastion hoardings at y 8..16) that the real eye runs into,
  // which measured as 14 blind "firing" cells on Factory 2 alone.
  const sees = (node) => seesAtEye(node, 0) && seesAtEye(node, -FIRING_SIGHT_MARGIN);
  const job = opts.job ?? null;
  const deadline = opts.deadline ?? 0;
  const resume = !!(job && job.state);
  const st = resume ? job.state : null;
  const start = resume ? st.start : nearestWalkable(grid, sx, sz, startFloor, obstacles);
  if (start < 0) { if (job) job.state = null; return null; }
  const H_SCALE = 1 / (CELL * 1.5);
  const hOf = (node) => { const d = Math.hypot(tx - nodeCenterX(grid, node), tz - nodeCenterZ(grid, node)) - maxD; return d > 0 ? d * H_SCALE : 0; };
  // Two passes: firing nodes ON THE TARGET'S FLOOR first, anywhere second. A short-range bot facing an edge-camper on a
  // Station platform can "see" the target from a ground peephole over the 4-high edge wall — accepting that first meant
  // its paths never contained a climb, and it ground the wall forever instead of jumping up to fight properly.
  const run = (sameFloorOnly, parked) => {
    let parent, g, closed, heap, pops;
    if (parked) { ({ parent, g, closed, heap, pops } = parked); }
    else {
      parent = new Int32Array(size).fill(-2); // -2 unvisited, -1 root
      g = new Float64Array(size).fill(Infinity);
      closed = new Uint8Array(size);
      heap = createMinHeap();
      pops = 0;
      parent[start] = -1;
      g[start] = 0;
      heap.push(hOf(start), start);
    }
    let goal = -1;
    while (heap.size()) {
      if (++pops > 30000) break;
      const cur = heap.pop()[1];
      if (deadline && (pops & 31) === 0 && performance.now() > deadline) {
        if (job) { heap.push(g[cur] + hOf(cur), cur); pops -= 1; return { parked: { parent, g, closed, heap, pops } }; }   // (this node pops first next time)
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = nodeCenterX(grid, cur);
      const cz = nodeCenterZ(grid, cur);
      const d = Math.hypot(tx - cx, tz - cz);
      // The start node itself never qualifies: this is called when the bot needs to GO somewhere (jammed, blind, out of
      // band) — "stay where you are" is a degenerate answer that starved the caller.
      const floorOk = !sameFloorOnly
        || targetFloor == null
        || Math.abs(floor[cur] - targetFloor) <= 2;
      if (cur !== start && floorOk && d >= minD && d <= maxD && sees(cur)) { goal = cur; break; }
      forEachNeighbor(grid, cur, (nb, cost) => {
        if (closed[nb]) return;
        const ng = g[cur] + cost + (clearGrade ? TIGHT_COST[clearGrade[nb]] : 0);
        if (ng < g[nb]) { g[nb] = ng; parent[nb] = cur; heap.push(ng + hOf(nb), nb); }
      });
    }
    if (goal < 0) return { none: true };
    const pts = [];
    for (let i = goal; i !== -1; i = parent[i]) {
      pts.push({ x: nodeCenterX(grid, i), z: nodeCenterZ(grid, i), y: floor[i], jump: parent[i] !== -1 && !isWalkEdge(grid, parent[i], i) });
    }
    pts.reverse();
    return { path: collapseWaypoints(pts) };
  };
  let pass = resume ? st.pass : 0;
  let parked = resume ? st.run : null;
  while (pass < 2) {
    const r = run(pass === 0, parked);
    if (r.parked) { job.state = { start, pass, run: r.parked }; return { pending: true }; }
    if (r.path) { if (job) job.state = null; return r.path; }
    pass += 1; parked = null;
  }
  if (job) job.state = null;
  return null;
}

// The bot's sight rule (ai.js botHasLineOfSight, mirrored in client main.js):
// invisible unit-fences pass unless flagged blocksBotSight, and surfaces
// (deck/ramp masses) count. findFiringPath's inline seesAtEye is this same
// rule; the hide-spot search below shares it through this helper.
function sightClear(p0, p1, obstacles, surfaces) {
  // SD proto (2026-10-05): the broadphase cuts a 400-obstacle map to the
  // handful of boxes near the segment — the hidden-spot search tested every
  // box for every eye of every node and a single search ran 100-370 ms.
  const cand = obstaclesNearSegment(obstacles, p0, p1);
  const P = globalThis.__sdProf;
  if (P) { P.sightCalls += 1; P.sightCand += cand.length; }
  for (let i = 0; i < cand.length; i += 1) {
    const o = cand[i];
    if (o.noProjectile && !o.blocksBotSight) continue;
    if (segmentHitsObstacle(p0, p1, o)) return false;
  }
  if (surfaces) {
    // (the floors through the same index — 2026-10-25: the walk over all of Compound's 16,878 floors per eye was the other half of the cost)
    const sc = obstaclesNearSegment(surfaces, p0, p1);
    for (let i = 0; i < sc.length; i += 1) if (sightHitsSurface(p0, p1, sc[i])) return false;
  }
  return true;
}

// Minimal binary min-heap of [key, node] pairs — the same heap the two
// planners above inline.
function createMinHeap() {
  const heap = [];
  const push = (f, i) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      const t = heap[p]; heap[p] = heap[k]; heap[k] = t;
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let s = k;
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
        if (s === k) break;
        const t = heap[s]; heap[s] = heap[k]; heap[k] = t;
        k = s;
      }
    }
    return top;
  };
  return { push, pop, size: () => heap.length };
}

// HIDE-SPOT SEARCH (owner 2026-09-26 — the Fight/Hide stance order). The
// cheapest-by-walking node whose EYE POINT (cell centre, floor + eyeHeight)
// has NO line of sight from ANY of `eyes` ({x, y, z} enemy eye points).
// Same Dijkstra + wall-clearance tax as findFiringPath, over WALK edges
// ONLY: a hide never vaults (jump-links are excluded, like the cover-reload
// ring search), so the follower needs no jump handling. The goal is
// discovered in walk-distance order — the first hidden node popped is the
// nearest reachable hide. Sight rule = the bot's own (sightClear above).
// `opts.maxPops` (default 600) bounds the cost, deliberately with NO
// distance cap (owner: the unit may walk as far as it takes); the LoS work
// is at most maxPops x eyes.length segment tests, early-exiting on the first
// eye that sees a node. Returns { path: [{x, z, y}], goal: {x, z, y} }
// (collapsed + corridor-smoothed like every other route) or null when
// nothing hidden lies within the budget.
// `opts.within` ({x, z, r}) requires the goal to lie inside that disc (the
// COVER HIDE's first tier: cover inside the order's area; the route may
// still pass outside it). `opts.minDistFrom` ({x, z, d}) additionally requires the goal to lie at
// least d from that point — the hide order's SLIP search (owner
// 2026-09-26: an enemy closing in makes the unit move to a cell farther
// from it while staying hidden). The START node counts only when the actor
// stands more than 1 u off its
// centre: a node the actor already occupies — exposed at its real eye yet
// hidden at the centre test — would otherwise be re-issued forever as a
// zero-length route, and the caller's no-progress bail would loop on it.
// SD prototype: COVER PROXIMITY (play test 2026-10-05, "walks into open dead
// space like taking a walk"). Per node, the horizontal distance to the nearest
// obstacle tall enough to block a muzzle line from that node's floor (top at
// least COVER_MIN_ABOVE_BASE above floor + GROUND_BASE_Y; bullets pass
// noProjectile fences). Open ground is far from any such cover — never
// "safe" whatever the enemy's current line, because the enemy can appear
// from anywhere. Cached on the grid on first use (one pass over nodes x
// obstacles, ~1.4 M box distances on Factory).
const COVER_MIN_ABOVE_BASE = 3.0;   // muzzle line sits 3.15 above the standing base
function coverDistFor(grid, obstacles) {
  if (grid.coverDist) return grid.coverDist;
  const { n, layers, floor, walk } = grid;
  const size = n * layers;
  const out = new Float32Array(size).fill(1e9);
  for (let node = 0; node < size; node += 1) {
    if (!walk[node]) continue;
    const cx = nodeCenterX(grid, node), cz = nodeCenterZ(grid, node);
    const base = floor[node] + GROUND_BASE_Y;
    let best = 1e9;
    for (let i = 0; i < obstacles.length; i += 1) {
      const o = obstacles[i];
      if (o.noProjectile) continue;
      if (o.maxY - base < COVER_MIN_ABOVE_BASE) continue;
      if (o.minY > base + COVER_MIN_ABOVE_BASE) continue;   // floating above the line
      const dx = Math.max(o.minX - cx, 0, cx - o.maxX);
      const dz = Math.max(o.minZ - cz, 0, cz - o.maxZ);
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < best) best = d;
    }
    out[node] = best;
  }
  grid.coverDist = out;
  return out;
}
// Distance from (x, z) on floorY to the nearest muzzle-blocking cover (1e9
// when the point snaps to no walkable node).
export function coverDistanceAt(grid, x, z, floorY, obstacles) {
  const node = nearestWalkable(grid, x, z, floorY, obstacles);
  if (node < 0) return 1e9;
  return coverDistFor(grid, obstacles)[node];
}

export function findHiddenSpot(grid, sx, sz, startFloor, eyes, obstacles, opts = {}) {
  const maxPops = opts.maxPops ?? 600;
  const eyeHeight = opts.eyeHeight ?? BOT_LOS_EYE_HEIGHT;
  const minFrom = opts.minDistFrom ?? null;
  const within = opts.within ?? null;
  // SD prototype: an extra goal predicate (x, z, floorY) and a walk-cost cap.
  const accept = opts.accept ?? null;
  const maxCost = opts.maxCost ?? Infinity;
  // SD prototype: exposure-weighted routing — an EXPOSED node (some eye sees
  // its eye point) costs exposurePenalty extra to step onto, so the route to
  // the goal hugs cover and the goal itself is the hidden cell nearest by
  // covered walking, not by raw distance. Hidden-ness is cached per node
  // (popped nodes evaluate it anyway for the goal test).
  const exposurePenalty = opts.exposurePenalty ?? 0;
  // SD prototype: cover proximity — an OPEN node (no muzzle-blocking cover
  // within openDist) costs openPenalty extra, goalCoverMax requires the goal
  // itself to stand within that distance of cover, and anyGoal drops the
  // hidden requirement (the goal is then the nearest cell passing the other
  // filters — the "no hidden cell anywhere, at least reach cover" fallback;
  // the exposure penalty still steers the route).
  const openPenalty = opts.openPenalty ?? 0;
  const openDist = opts.openDist ?? 6;
  const goalCoverMax = opts.goalCoverMax ?? null;
  const anyGoal = !!opts.anyGoal;
  // SD prototype (play test 2026-10-05, "deadly openings when the moving
  // angle is not perpendicular"): an exposed step costs more the more it
  // runs ALONG the line to `threat` ({x, z}) — exposurePenalty x (1 +
  // alongWeight x along^2). A gap crossed sideways is a quick, hard-to-hit
  // flash; the same gap crossed toward the shooter is a straight shot, so
  // the route prefers flanking lines whose crossings are lateral.
  const threat = opts.threat ?? null;
  const alongWeight = threat ? (opts.alongWeight ?? 0) : 0;
  // SD prototype: BEST-OF search — opts.score(x, z, floorY) rates every node
  // that passes the filters; the search keeps the highest (nearest on ties,
  // since nodes pop in cost order) and stops early at opts.scoreStop. The
  // watch-spot search uses it: "the hidden cell that covers most of the
  // enemy's exits".
  const score = opts.score ?? null;
  const scoreStop = opts.scoreStop ?? Infinity;
  let bestGoal = -1, bestScore = -Infinity;
  // SD prototype (owner 2026-10-05, Station: "don't let that happen"):
  // opts.allowJump lets the search cross the grid's jump-links (walk-island
  // bridges, JUMP_LINK_COST each) — the route then carries a floor change
  // at the link and the SD follower vaults it. Default off: a hide never
  // vaults.
  const allowJump = !!opts.allowJump;
  // SD prototype: opts.avoid — circles [{x, z, r}] no route may pass through
  // (the first exposed stretch of a hop rejected for risk, a corridor the
  // unit refused to enter). The start node is never blocked.
  const avoid = (opts.avoid && opts.avoid.length) ? opts.avoid : null;
  const avoided = (node) => {
    const x = nodeCenterX(grid, node), z = nodeCenterZ(grid, node);
    for (let i = 0; i < avoid.length; i += 1) {
      const a = avoid[i];
      if (Math.hypot(x - a.x, z - a.z) <= a.r) return true;
    }
    return false;
  };
  if (!anyGoal && (!eyes || eyes.length === 0)) return null;
  if (!eyes) eyes = [];
  const { n, layers, floor, clearGrade, surfaces } = grid;
  const size = n * layers;
  // RESUMABLE SEARCH (owner 2026-10-08, "BOT sometimes freezes"): opts.job
  // is an object the caller keeps between ticks. When this call runs out of
  // its slice — opts.deadline (a performance.now() instant) or
  // opts.popsPerCall — with a job given, the open set, costs and caches are
  // parked in job.state and the call returns { pending: true }; the next
  // call with the same job resumes where it stopped, so a 50 ms Dijkstra
  // becomes a dozen 4 ms slices instead of a dropped frame (offline) or a
  // search that never completes (a slow server). Without a job a deadline
  // cut ends the search as before (null, like an exhausted pop budget).
  const job = opts.job ?? null;
  const resume = !!(job && job.state);
  const st = resume ? job.state : null;
  const start = resume ? st.start : nearestWalkable(grid, sx, sz, startFloor, obstacles);
  if (start < 0) return null;
  const coverDist = (openPenalty > 0 || goalCoverMax != null) ? coverDistFor(grid, obstacles) : null;
  const parent = resume ? st.parent : new Int32Array(size).fill(-2); // -2 unvisited, -1 root
  const g = resume ? st.g : new Float64Array(size).fill(Infinity);
  const closed = resume ? st.closed : new Uint8Array(size);
  const hiddenCache = resume ? st.hiddenCache : new Int8Array(size).fill(-1);
  // (anyGoal keeps hiddenAt true for the GOAL test; the route penalty below
  // still asks the real eyes through this helper.)
  const hiddenCached = (node) => {
    let v = hiddenCache[node];
    if (v < 0) {
      let h = true;
      if (eyes.length) {
        const p0 = { x: nodeCenterX(grid, node), y: floor[node] + GROUND_BASE_Y + eyeHeight, z: nodeCenterZ(grid, node) };
        for (let e = 0; e < eyes.length; e += 1) {
          if (sightClear(p0, eyes[e], obstacles, surfaces)) { h = false; break; }
        }
      }
      v = h ? 1 : 0;
      hiddenCache[node] = v;
    }
    return v === 1;
  };
  // SD prototype: opts.goalEyes — the GOAL must be hidden from these (the
  // spread eyes: the spot holds for a sidestep) while the ROUTE is costed
  // against `eyes` only (live + predicted). A narrow shadow behind a crate
  // is then a legal approach lane — the "sprint behind a distant obstacle
  // and walk up in its shadow" move — even though a sidestep would open it.
  const goalEyes = opts.goalEyes ?? null;
  // opts.goalShoulder (SD, owner 2026-10-06): the GOAL hides the unit's
  // width — its centre and the two points goalShoulder to either side
  // across each eye's line — not the centre point alone; a cell at a
  // cover's edge with a shoulder out is no goal. With no goalEyes the
  // route eyes are the goal's eyes (escapes), still at the full width.
  // The ROUTE cells stay centre-tested (the exposure estimate).
  const goalShoulder = opts.goalShoulder ?? 0;
  // opts.goalUp (SD, owner 2026-10-15, "腰高的牆不是掩體"): the GOAL hides the
  // capsule's TOP too — the point goalUp above the eye-height point; a hip-
  // high wall hides the muzzle line and leaves the head out.
  const goalUp = opts.goalUp ?? 0;
  const goalTestEyes = goalEyes ?? ((goalShoulder > 0 || goalUp > 0) ? eyes : null);
  const goalHiddenCache = resume ? st.goalHiddenCache : (goalTestEyes ? new Int8Array(size).fill(-1) : null);
  const seenFrom = (p0, eye) => {
    if (sightClear(p0, eye, obstacles, surfaces)) return true;
    if (goalUp > 0 && sightClear({ x: p0.x, y: p0.y + goalUp, z: p0.z }, eye, obstacles, surfaces)) return true;
    if (goalShoulder <= 0) return false;
    let nx = eye.z - p0.z, nz = p0.x - eye.x;
    const nl = Math.hypot(nx, nz) || 1;
    nx = nx / nl * goalShoulder; nz = nz / nl * goalShoulder;
    return sightClear({ x: p0.x + nx, y: p0.y, z: p0.z + nz }, eye, obstacles, surfaces)
      || sightClear({ x: p0.x - nx, y: p0.y, z: p0.z - nz }, eye, obstacles, surfaces);
  };
  const goalHidden = (node) => {
    if (!goalTestEyes) return hiddenCached(node);
    let v = goalHiddenCache[node];
    if (v < 0) {
      let h = true;
      const p0 = { x: nodeCenterX(grid, node), y: floor[node] + GROUND_BASE_Y + eyeHeight, z: nodeCenterZ(grid, node) };
      for (let e = 0; e < goalTestEyes.length; e += 1) {
        if (seenFrom(p0, goalTestEyes[e])) { h = false; break; }
      }
      v = h ? 1 : 0;
      goalHiddenCache[node] = v;
    }
    return v === 1;
  };
  const heap = resume ? st.heap : createMinHeap();
  if (!resume) {
    parent[start] = -1;
    g[start] = 0;
    heap.push(0, start);
  } else {
    bestGoal = st.bestGoal;
    bestScore = st.bestScore;
  }
  let goal = -1;
  let pops = resume ? st.pops : 0;
  // (the slice: pops this call, against opts.popsPerCall)
  const popsPerCall = opts.popsPerCall ?? Infinity;
  let callPops = 0;
  const park = () => {
    job.state = { start, parent, g, closed, hiddenCache, goalHiddenCache, heap, pops, bestGoal, bestScore };
    return { pending: true };
  };
  // (profiling hooks: globalThis.__sdProf, set by the harness --prof)
  const P = globalThis.__sdProf;
  const tStart = P ? performance.now() : 0;
  let cAccept = 0, cScore = 0, tAccept = 0, tScore = 0, sightBefore = P ? P.sightCalls : 0;
  // TIME BUDGET (owner 2026-10-07, "online SD is very lag"): `opts.deadline`
  // (a performance.now() instant) ends the search like an exhausted pop
  // budget — the server hands every search of a tick the same deadline, so
  // one 50 ms Dijkstra on a slow instance can no longer stall the 16 ms
  // tick; the caller retries at its own cadence. The sim harness sets none,
  // so measured results stay reproducible. Checked every 32 pops.
  const deadline = opts.deadline ?? 0;
  while (heap.size()) {
    const cur = heap.pop()[1];
    if (closed[cur]) continue;
    if (++pops > maxPops) break;
    if (job && ++callPops > popsPerCall) { heap.push(g[cur], cur); pops -= 1; return park(); }   // (slice over: this node pops first next time)
    if (deadline && (pops & 31) === 0 && performance.now() > deadline) {
      if (P) P.cuts = (P.cuts ?? 0) + 1;
      if (job) { heap.push(g[cur], cur); pops -= 1; return park(); }
      break;
    }
    if (g[cur] > maxCost) break;
    closed[cur] = 1;
    const startHere = cur === start
      && Math.hypot(nodeCenterX(grid, cur) - sx, nodeCenterZ(grid, cur) - sz) <= 1;
    const farEnough = !minFrom
      || Math.hypot(nodeCenterX(grid, cur) - minFrom.x, nodeCenterZ(grid, cur) - minFrom.z) >= minFrom.d;
    const inside = !within
      || Math.hypot(nodeCenterX(grid, cur) - within.x, nodeCenterZ(grid, cur) - within.z) <= within.r;
    // (the cheap filters and the cached hidden test go first; the caller's
    // accept — a line-capability probe of a dozen segments — only runs on
    // the nodes that pass them: it was 85% of a 116 ms search)
    const covered = goalCoverMax == null || coverDist[cur] <= goalCoverMax;
    let ok = !startHere && farEnough && inside && covered && (anyGoal || goalHidden(cur));
    if (ok && accept) {
      const ta = P ? performance.now() : 0;
      ok = accept(nodeCenterX(grid, cur), nodeCenterZ(grid, cur), floor[cur]);
      if (P) { cAccept += 1; tAccept += performance.now() - ta; }
    }
    if (ok) {
      if (!score) { goal = cur; break; }
      const ts = P ? performance.now() : 0;
      const s = score(nodeCenterX(grid, cur), nodeCenterZ(grid, cur), floor[cur]);
      if (P) { cScore += 1; tScore += performance.now() - ts; }
      if (s > bestScore) { bestScore = s; bestGoal = cur; if (s >= scoreStop) break; }
    }
    const expand = (nb, stepCost) => {
      if (closed[nb]) return;
      if (avoid && avoided(nb)) return;
      let ng = g[cur] + stepCost + (clearGrade ? TIGHT_COST[clearGrade[nb]] : 0);
      if (exposurePenalty > 0 && eyes.length && !hiddenCached(nb)) {
        let pen = exposurePenalty;
        if (alongWeight > 0) {
          const nx = nodeCenterX(grid, nb), nz = nodeCenterZ(grid, nb);
          let sx2 = nx - nodeCenterX(grid, cur), sz2 = nz - nodeCenterZ(grid, cur);
          const sl = Math.hypot(sx2, sz2) || 1;
          let lx = threat.x - nx, lz = threat.z - nz;
          const ll = Math.hypot(lx, lz) || 1;
          const along = Math.abs((sx2 * lx + sz2 * lz) / (sl * ll));
          pen *= 1 + alongWeight * along * along;
        }
        ng += pen;
      }
      if (openPenalty > 0 && coverDist[nb] > openDist) ng += openPenalty;
      if (ng < g[nb]) { g[nb] = ng; parent[nb] = cur; heap.push(ng, nb); }
    };
    if (allowJump) forEachNeighbor(grid, cur, expand);
    else forEachWalkNeighbor(grid, cur, (nb) => expand(nb, 1));
  }
  if (P) {
    const dt = performance.now() - tStart;
    P.searches += 1; P.t += dt;
    if (dt > P.max) { P.max = dt; P.maxInfo = { pops, sight: P.sightCalls - sightBefore, cAccept, tAccept: +tAccept.toFixed(1), cScore, tScore: +tScore.toFixed(1), eyes: eyes.length, goalEyes: goalEyes ? goalEyes.length : 0, maxPops, found: goal >= 0 || bestGoal >= 0 }; }
  }
  if (job) job.state = null;   // (finished, found or not: the next call starts afresh)
  if (score) goal = bestGoal;
  if (goal < 0) return null;
  const pts = [];
  for (let i = goal; i !== -1; i = parent[i]) {
    pts.push({ x: nodeCenterX(grid, i), z: nodeCenterZ(grid, i), y: floor[i], jump: parent[i] !== -1 && !isWalkEdge(grid, parent[i], i) });
  }
  pts.reverse();
  let path = collapseWaypoints(pts);
  if (path.length > 2) path = smoothPath(grid, path, obstacles);
  const last = path[path.length - 1];
  return { path, goal: { x: last.x, z: last.z, y: last.y }, score: score ? bestScore : null };
}

// ===== THE GRID AS DATA (user 2026-10-25, "the route grid precomputed") =====
// A grid built here can be written out and read back whole: every array, the jump links in their order, the scalars —
// so a map's grid is built once, by shared/tools/maps/navgrid_build.mjs, and served beside the map model
// (maps/<mapKey>_nav<NAV_FILE_EXT>). The server's warm-up and the client read the file and skip the build: Compound's is
// 3.4 s on a fast core, a minute on the free instance, during which neither answered anyone (the "websocket error" at
// boot, the offline match-start stall). A read-back grid is the built grid to the byte (shared/test/navdata.test.js
// rebuilds every shipped file and compares), so routes do not change.
// SAFETY: the file carries a signature of the collision data it was built from (navDataSignature — every box's and
// floor's fields), and the loader refuses a file whose signature is not the arena's: a regenerated map or a boundary
// change falls back to building, never to a stale grid. A change to the BUILDER itself is not caught by the signature;
// it is caught by the test, which fails until the files are regenerated.
export const NAV_DATA_VERSION = 1;
export const navDataFile = (mapKey) => `maps/${mapKey}_nav${NAV_FILE_EXT}`;
export function navDataSignature(obstacles, surfaces) {
  let h = 0x811c9dc5;
  const mix = (s) => { for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } };
  const one = (o) => {
    const keys = Object.keys(o).sort();
    let s = '';
    for (let i = 0; i < keys.length; i += 1) { const v = o[keys[i]]; if (typeof v === 'function') continue; s += keys[i] + '=' + (typeof v === 'number' ? String(v) : JSON.stringify(v)) + ';'; }
    return s + '|';
  };
  mix(`o${obstacles.length}:`); for (let i = 0; i < obstacles.length; i += 1) mix(one(obstacles[i]));
  mix(`s${surfaces.length}:`); for (let i = 0; i < surfaces.length; i += 1) mix(one(surfaces[i]));
  return (h >>> 0).toString(16).padStart(8, '0');
}
const NAV_ARRAYS = ['floor', 'walk', 'clearGrade', 'edgeE', 'edgeS', 'posX', 'posZ'];
const NAV_TYPES = { Float32Array, Uint8Array, Int32Array, Float64Array, Uint16Array, Int8Array };
const _pad8 = (n) => (n + 7) & ~7;
export function serializeNavGrid(grid, sig) {
  const arrays = NAV_ARRAYS.map((name) => ({ name, type: grid[name].constructor.name, length: grid[name].length, bytes: grid[name].byteLength }));
  const links = [];
  for (const [node, nbs] of grid.jumpAdj) { links.push(node, nbs.length); for (let i = 0; i < nbs.length; i += 1) links.push(nbs[i]); }
  const linkArr = Int32Array.from(links);
  const meta = {
    version: NAV_DATA_VERSION, sig, cols: grid.cols, rows: grid.rows, n: grid.n, layers: grid.layers,
    minX: grid.minX, minZ: grid.minZ, cell: grid.cell, jumpLinkCount: grid.jumpLinkCount, arrays, links: linkArr.length
  };
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  let size = _pad8(8 + metaBytes.length);
  for (const a of arrays) size += _pad8(a.bytes);
  size += _pad8(linkArr.byteLength);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out.set([0x47, 0x56, 0x47, 0x4e], 0);   // 'GVGN'
  dv.setUint32(4, metaBytes.length, true);
  out.set(metaBytes, 8);
  let off = _pad8(8 + metaBytes.length);
  for (const name of NAV_ARRAYS) { const a = grid[name]; out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), off); off += _pad8(a.byteLength); }
  out.set(new Uint8Array(linkArr.buffer, linkArr.byteOffset, linkArr.byteLength), off);
  return out;
}
// The grid read back, or null when the bytes are not a grid file, another version, or another map's data (the signature).
export function deserializeNavGrid(bytes, surfaces, sig) {
  try {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    if (bytes.length < 8 || bytes[0] !== 0x47 || bytes[1] !== 0x56 || bytes[2] !== 0x47 || bytes[3] !== 0x4e) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const metaLen = dv.getUint32(4, true);
    const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + metaLen)));
    if (meta.version !== NAV_DATA_VERSION || meta.sig !== sig) return null;
    const grid = {
      cols: meta.cols, rows: meta.rows, n: meta.n, layers: meta.layers, minX: meta.minX, minZ: meta.minZ, cell: meta.cell,
      surfaces, jumpAdj: new Map(), jumpLinkCount: meta.jumpLinkCount
    };
    let off = _pad8(8 + metaLen);
    for (const a of meta.arrays) {
      const T = NAV_TYPES[a.type]; if (!T) return null;
      grid[a.name] = new T(bytes.slice(off, off + a.bytes).buffer);   // (a copy: its own buffer, aligned)
      off += _pad8(a.bytes);
    }
    const links = new Int32Array(bytes.slice(off, off + meta.links * 4).buffer);
    for (let i = 0; i < links.length;) { const node = links[i++], count = links[i++]; const nbs = new Array(count); for (let k = 0; k < count; k += 1) nbs[k] = links[i++]; grid.jumpAdj.set(node, nbs); }
    return grid;
  } catch (e) { return null; }
}
