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
  surfaceHeightAtXZ, unitOverlapsObstacle, segmentHitsObstacle, walkSegmentBlocked, sightHitsSurface,
  groundHeightAt
} from './physics.js';
import { GROUND_BASE_Y } from './constants.js';

const CELL = 4;
// Max floor rise between adjacent samples. SURFACE_STEP_HEIGHT is 1.6 and a
// 4-unit cell on the steepest shipped ramp (Airport: 10 long, 4 rise) steps
// exactly 1.6 — the slack absorbs float error at that boundary.
const MAX_STEP = 1.7;
const SNAP_RADIUS = 3; // cells searched around a blocked path endpoint

// ===== LAYERS ==========================================================
// A candidate standing height becomes its own layer only when the next
// surface above it is more than LAYER_MIN_GAP up. Below that the sim's own
// step rule (SURFACE_STEP_HEIGHT 1.6) simply walks the unit onto the higher
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
  // Every distinct standing height at (x, z): base ground plus each surface
  // covering the point, ascending, deduped.
  const candidateFloors = (x, z) => {
    const hs = [0];
    for (let k = 0; k < surfaces.length; k += 1) {
      const s = surfaces[k];
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      const h = s.heightAt ? s.heightAt(x, z) : (s.top ?? s.maxTop);
      if (h == null || !Number.isFinite(h)) continue;
      hs.push(h);
    }
    hs.sort((a, b) => a - b);
    const out = [];
    for (const h of hs) if (!out.length || h - out[out.length - 1] > 0.05) out.push(h);
    return out;
  };
  // The standing height a walk between two levels passes through at the
  // midpoint: the candidate nearest the midpoint of the two floors. Ties
  // prefer the HIGHER candidate, which is what v1's "top surface" midpoint
  // probe returned — that is the parity hinge for single-layer maps.
  const midFloorOf = (cands, fa, fb) => {
    const target = (fa + fb) / 2;
    let best = target, bestD = Infinity;
    for (let k = 0; k < cands.length; k += 1) {
      const d = Math.abs(cands[k] - target);
      if (d <= bestD) { bestD = d; best = cands[k]; }
    }
    return best;
  };
  // Where the SIM would stand a unit that walks into (x, z) with its feet at
  // `fromFloor` — the same step rule movement uses. This is what stops the
  // layer split from inventing space: under the low end of a ramp the body
  // does fit and the gap to the slab above passes LAYER_MIN_GAP, but a unit
  // walking in from the open floor is STEPPED UP onto the ramp and can never
  // stand there. Requiring both directions of an edge to agree deletes those
  // phantom nodes' only connections, and the sealed-void pass then prunes
  // them. The +0.1 keeps the 1.6 step rule's float slack aligned with
  // MAX_STEP 1.7, so single-layer maps keep v1's edges exactly.
  const arriveFloor = (x, z, fromFloor) => groundHeightAt(x, z, surfaces, fromFloor + 0.1);

  // --- Layer discovery ---
  const cellLayers = new Array(n);
  const cellCovered = new Array(n);   // per kept level: is there geometry overhead?
  let layers = 1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      const x = minX + (c + 0.5) * CELL;
      const z = minZ + (r + 0.5) * CELL;
      const hs = candidateFloors(x, z);
      const keep = [];
      for (let k = 0; k < hs.length; k += 1) {
        const above = k + 1 < hs.length ? hs[k + 1] : null;
        if (above != null && above - hs[k] < LAYER_MIN_GAP) continue;   // stepped up onto the level above
        if (!fitsAt(x, z, hs[k])) continue;
        keep.push(hs[k]);
      }
      keep.reverse();                       // layer 0 = highest level
      if (keep.length > LAYER_CAP) keep.length = LAYER_CAP;
      cellLayers[i] = keep;
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
      for (let l = 0; l < keep.length; l += 1) {
        const node = l * n + i;
        floor[node] = keep[l];
        walk[node] = 1;
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
  const arriveInto = new Float32Array(layers);
  const arriveBack = new Float32Array(layers);
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
        const bx = east ? x + CELL : x, bz = east ? z : z + CELL;
        const mx = east ? x + CELL / 2 : x, mz = east ? z : z + CELL / 2;
        const cands = candidateFloors(mx, mz);
        for (let l = 0; l < layers; l += 1) {
          arriveInto[l] = walk[l * n + i] ? arriveFloor(bx, bz, floor[l * n + i]) : NaN;
          arriveBack[l] = walk[l * n + j] ? arriveFloor(x, z, floor[l * n + j]) : NaN;
        }
        for (let la = 0; la < layers; la += 1) {
          const a = la * n + i;
          if (!walk[a]) continue;
          for (let lb = 0; lb < layers; lb += 1) {
            const b = lb * n + j;
            if (!walk[b] || Math.abs(floor[a] - floor[b]) > MAX_STEP) continue;
            // Both directions must land on each other's level (see arriveFloor).
            if (Math.abs(arriveInto[la] - floor[b]) > 0.05) continue;
            if (Math.abs(arriveBack[lb] - floor[a]) > 0.05) continue;
            const mfy = midFloorOf(cands, floor[a], floor[b]);
            if (Math.abs(mfy - floor[a]) <= MAX_STEP && Math.abs(mfy - floor[b]) <= MAX_STEP
                && fitsAt(mx, mz, mfy)) {
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
    floor, walk, clearGrade, edgeE, edgeS, surfaces,
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
    const i = node % n;
    const x = minX + ((i % cols) + 0.5) * CELL;
    const z = minZ + (((i / cols) | 0) + 0.5) * CELL;
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
  const JUMP_MIN = 1.7;
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
    for (let k = 0; k < obstacles.length; k += 1) {
      const o = obstacles[k];
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
  const nodeX = (node) => minX + (((node % n) % cols) + 0.5) * CELL;
  const nodeZ = (node) => minZ + (((((node % n) / cols) | 0)) + 0.5) * CELL;
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
          if (dyF < JUMP_MIN || dyF > JUMP_MAX) continue;
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

const nodeCenterX = (grid, node) => grid.minX + (((node % grid.n) % grid.cols) + 0.5) * grid.cell;
const nodeCenterZ = (grid, node) => grid.minZ + ((((node % grid.n) / grid.cols) | 0) + 0.5) * grid.cell;

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
          const cx = minX + (c + 0.5) * cell;
          const cz = minZ + (r + 0.5) * cell;
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
    pts.push({ x: nodeCenterX(grid, i), z: nodeCenterZ(grid, i), y: floor[i] });
  }
  pts.reverse();
  return collapseWaypoints(pts);
}

// Collapse straight runs — fewer waypoints, smoother following. NEVER
// collapses across a floor jump (a jump-link crossing): the follower needs
// the waypoint on each side of the ledge to know where to vault.
function collapseWaypoints(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let k = 1; k < pts.length - 1; k += 1) {
    const a = out[out.length - 1], b = pts[k], c2 = pts[k + 1];
    const floorJump = Math.abs((b.y ?? 0) - (a.y ?? 0)) > 1.7
      || Math.abs((c2.y ?? 0) - (b.y ?? 0)) > 1.7;
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
    // Per-chord obstacle prefilter: only boxes near the chord's bounding
    // box can fail a sample — spares the full-map scan per 1u sample.
    const pad = CLEAR_WIDE + 1;
    const bx0 = Math.min(a.x, b.x) - pad, bx1 = Math.max(a.x, b.x) + pad;
    const bz0 = Math.min(a.z, b.z) - pad, bz1 = Math.max(a.z, b.z) + pad;
    const nearObs = [];
    for (const o of obstacles) {
      if (o.maxX >= bx0 && o.minX <= bx1 && o.maxZ >= bz0 && o.minZ <= bz1) nearObs.push(o);
    }
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
      if (unitOverlapsObstacle(x, ya + GROUND_BASE_Y, z, nearObs, CLEAR_WIDE)) return false;
    }
    return true;
  };
  const out = [path[0]];
  let a = 0;
  while (a < path.length - 1) {
    let best = a + 1;
    const bMax = Math.min(path.length, a + 13);
    for (let b = a + 2; b < bMax; b += 1) {
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
export function findFiringPath(grid, sx, sz, startFloor, tx, tz, targetEyeY, minD, maxD, obstacles, targetFloor = null) {
  const { n, layers, floor, clearGrade, surfaces } = grid;
  const size = n * layers;
  const start = nearestWalkable(grid, sx, sz, startFloor, obstacles);
  if (start < 0) return null;
  const pTarget = { x: tx, y: targetEyeY, z: tz };
  // Sight rule is the BOT'S rule (2026-08-14): sight-blocking invisible bars
  // count, and SURFACES count — this search used to ignore surfaces entirely
  // and happily certified firing cells whose line ran straight through the
  // Streets bridge deck, sending bots to spots they could not shoot from.
  const seesAtEye = (node, dy) => {
    const p0 = {
      x: nodeCenterX(grid, node),
      y: floor[node] + GROUND_BASE_Y + 1.6 + dy,
      z: nodeCenterZ(grid, node)
    };
    for (const o of obstacles) {
      if (o.noProjectile && !o.blocksBotSight) continue;
      if (segmentHitsObstacle(p0, pTarget, o)) return false;
    }
    if (surfaces) {
      for (let i = 0; i < surfaces.length; i += 1) if (sightHitsSurface(p0, pTarget, surfaces[i])) return false;
    }
    return true;
  };
  // BOTH eyes must see: the real one (the shot the bot will actually take)
  // and one lowered by the margin (so the cell keeps its sight when the
  // follower stops short). Testing only the lowered eye is NOT conservative
  // — a lower ray can slip UNDER overhead geometry (Streets' upper storeys,
  // the bastion hoardings at y 8..16) that the real eye runs into, which
  // measured as 14 blind "firing" cells on Factory 2 alone.
  const sees = (node) => seesAtEye(node, 0) && seesAtEye(node, -FIRING_SIGHT_MARGIN);
  // Two passes: firing nodes ON THE TARGET'S FLOOR first, anywhere second.
  // A short-range bot facing an edge-camper on a Station platform can "see"
  // the target from a ground peephole over the 4-high edge wall — accepting
  // that first meant its paths never contained a climb, and it ground the
  // wall forever instead of jumping up to fight properly.
  const run = (sameFloorOnly) => {
    // Dijkstra, not BFS (2026-08-12): this planner answers ~98% of live bot
    // routes, and as a fewest-cells BFS it hugged walls and clipped doorway
    // posts BY CONSTRUCTION — the "bots grind the wall right after spawn"
    // report from the Flashpoint room spawns. It now pays the same
    // wall-clearance tax as findPathOnGrid (TIGHT_COST on the entered
    // node), so routes prefer the middle of a corridor when the room
    // exists. The first qualifying node POPPED is the cheapest-walk firing
    // node — the BFS's nearest-cell guarantee, upgraded to clearance-aware
    // cost. No heuristic: the goal is discovered, not known in advance.
    const parent = new Int32Array(size).fill(-2); // -2 unvisited, -1 root
    const g = new Float64Array(size).fill(Infinity);
    const closed = new Uint8Array(size);
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
    parent[start] = -1;
    g[start] = 0;
    push(0, start);
    let goal = -1;
    let guard = 0;
    while (heap.length) {
      if (++guard > 30000) break;
      const cur = pop()[1];
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = nodeCenterX(grid, cur);
      const cz = nodeCenterZ(grid, cur);
      const d = Math.hypot(tx - cx, tz - cz);
      // The start node itself never qualifies: this is called when the bot
      // needs to GO somewhere (jammed, blind, out of band) — "stay where
      // you are" is a degenerate answer that starved the caller.
      const floorOk = !sameFloorOnly
        || targetFloor == null
        || Math.abs(floor[cur] - targetFloor) <= 2;
      if (cur !== start && floorOk && d >= minD && d <= maxD && sees(cur)) { goal = cur; break; }
      forEachNeighbor(grid, cur, (nb, cost) => {
        if (closed[nb]) return;
        const ng = g[cur] + cost + (clearGrade ? TIGHT_COST[clearGrade[nb]] : 0);
        if (ng < g[nb]) { g[nb] = ng; parent[nb] = cur; push(ng, nb); }
      });
    }
    if (goal < 0) return null;
    const pts = [];
    for (let i = goal; i !== -1; i = parent[i]) {
      pts.push({ x: nodeCenterX(grid, i), z: nodeCenterZ(grid, i), y: floor[i] });
    }
    pts.reverse();
    return collapseWaypoints(pts);
  };
  return run(true) ?? run(false);
}
