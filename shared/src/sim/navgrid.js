// Grid navigation for bots — the universal pathfinder.
//
// Builds a walkability grid from an arena's AABB obstacles + surfaces (the
// exact same data the sim collides against), then answers "how do I WALK
// from A to B?" with A*. This replaces Maze's local guesswork (wall-follow,
// sight probes, ramp heuristics) with real routes; the heuristics remain in
// the bot as fallback for when no path exists.
//
// v1 scope, deliberate limits:
//   - SINGLE-LAYER grid: each cell has ONE floor height — the top surface at
//     that point, else base ground. Elevated decks and their ramps are fully
//     routable (ramps connect levels through the step rule); the space UNDER
//     a deck (Streets' bridge underpass) is not represented, so paths simply
//     route around or over. Local avoidance still walks under bridges fine
//     when the direct line works — the pathfinder is only consulted when it
//     doesn't.
//   - WALK edges only: no jump links. Station-style hop-up platforms are
//     still reached via the bots' perch reflex (an opportunistic shortcut),
//     not via paths.
//
// Cell walkability reuses unitOverlapsObstacle — the collision test units
// actually move with — so topBuffer semantics (e.g. the Airport plateau's
// walkable top vs its blocking side) are honored for free. Edges test both
// cell centers PLUS the midpoint: with the fighter radius (~1.15), three
// samples 2 units apart fully tile a 4-unit edge, so thin glass panes
// between two cell centers cannot slip through.

import { surfaceHeightAtXZ, unitOverlapsObstacle, segmentHitsObstacle, walkSegmentBlocked } from './physics.js';
import { GROUND_BASE_Y } from './constants.js';

const CELL = 4;
// Max floor rise between adjacent samples. SURFACE_STEP_HEIGHT is 1.6 and a
// 4-unit cell on the steepest shipped ramp (Airport: 10 long, 4 rise) steps
// exactly 1.6 — the slack absorbs float error at that boundary.
const MAX_STEP = 1.7;
const SNAP_RADIUS = 3; // cells searched around a blocked path endpoint

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
  const floor = new Float32Array(n);
  const walk = new Uint8Array(n);
  const edgeE = new Uint8Array(n); // cell i <-> i+1
  const edgeS = new Uint8Array(n); // cell i <-> i+cols

  const floorAt = (x, z) => {
    const s = surfaceHeightAtXZ(x, z, surfaces);
    return s === -Infinity ? 0 : s;
  };
  const fitsAt = (x, z, fy) => !unitOverlapsObstacle(x, fy + GROUND_BASE_Y, z, obstacles);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      const x = minX + (c + 0.5) * CELL;
      const z = minZ + (r + 0.5) * CELL;
      const fy = floorAt(x, z);
      floor[i] = fy;
      walk[i] = fitsAt(x, z, fy) ? 1 : 0;
    }
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (!walk[i]) continue;
      const x = minX + (c + 0.5) * CELL;
      const z = minZ + (r + 0.5) * CELL;
      if (c + 1 < cols && walk[i + 1] && Math.abs(floor[i] - floor[i + 1]) <= MAX_STEP) {
        const mfy = floorAt(x + CELL / 2, z);
        if (Math.abs(mfy - floor[i]) <= MAX_STEP && Math.abs(mfy - floor[i + 1]) <= MAX_STEP
            && fitsAt(x + CELL / 2, z, mfy)) {
          edgeE[i] = 1;
        }
      }
      if (r + 1 < rows && walk[i + cols] && Math.abs(floor[i] - floor[i + cols]) <= MAX_STEP) {
        const mfy = floorAt(x, z + CELL / 2);
        if (Math.abs(mfy - floor[i]) <= MAX_STEP && Math.abs(mfy - floor[i + cols]) <= MAX_STEP
            && fitsAt(x, z + CELL / 2, mfy)) {
          edgeS[i] = 1;
        }
      }
    }
  }
  // ===== Jump-links =====
  // Bridge WALK-DISCONNECTED islands (Station's 4 m platforms) with jump
  // edges: two walkable cells within 2 cells of each other, vertical gap in
  // the bots' climb window [1.7 .. 4.8], and in DIFFERENT walk components.
  // The component rule is the safety guarantee: anywhere walking already
  // works (ramped plateaus, flat maps) produces ZERO links, so existing
  // routes stay byte-identical. Links are bidirectional — traversed upward
  // the path-follower jumps; downward it simply walks off the ledge.
  const comp = new Int32Array(n).fill(-1);
  {
    const stack = new Int32Array(n);
    let compCount = 0;
    for (let seed = 0; seed < n; seed += 1) {
      if (!walk[seed] || comp[seed] !== -1) continue;
      let sp = 0;
      stack[sp++] = seed;
      comp[seed] = compCount;
      while (sp > 0) {
        const cur = stack[--sp];
        const c = cur % cols, r = (cur / cols) | 0;
        if (c + 1 < cols && edgeE[cur] && comp[cur + 1] === -1) { comp[cur + 1] = compCount; stack[sp++] = cur + 1; }
        if (c > 0 && edgeE[cur - 1] && comp[cur - 1] === -1) { comp[cur - 1] = compCount; stack[sp++] = cur - 1; }
        if (r + 1 < rows && edgeS[cur] && comp[cur + cols] === -1) { comp[cur + cols] = compCount; stack[sp++] = cur + cols; }
        if (r > 0 && edgeS[cur - cols] && comp[cur - cols] === -1) { comp[cur - cols] = compCount; stack[sp++] = cur - cols; }
      }
      compCount += 1;
    }
  }
  const JUMP_MIN = 1.7;
  const JUMP_MAX = 4.8;
  const jumpAdj = new Map();
  let jumpLinkCount = 0;
  const addLink = (a, b) => {
    if (!jumpAdj.has(a)) jumpAdj.set(a, []);
    if (!jumpAdj.has(b)) jumpAdj.set(b, []);
    jumpAdj.get(a).push(b);
    jumpAdj.get(b).push(a);
    jumpLinkCount += 1;
  };
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (!walk[i]) continue;
      const tryLink = (j) => {
        if (!walk[j] || comp[i] === comp[j]) return false;
        const dyF = Math.abs(floor[i] - floor[j]);
        if (dyF < JUMP_MIN || dyF > JUMP_MAX) return false;
        // The crossing must be PHYSICALLY jumpable: test the segment between
        // the two cell centers at the UPPER floor's body height. A thin
        // edge-seam wall (top == upper floor, topBuffer 0 — Station's
        // platform fronts) passes over its top; a real wall (boundary,
        // glass fence) blocks — without this, span-2 links bridged straight
        // THROUGH the Lobby's outer wall to ghost cells beyond it.
        const xi = minX + ((i % cols) + 0.5) * CELL;
        const zi = minZ + (((i / cols) | 0) + 0.5) * CELL;
        const xj = minX + ((j % cols) + 0.5) * CELL;
        const zj = minZ + (((j / cols) | 0) + 0.5) * CELL;
        const yHi = Math.max(floor[i], floor[j]) + GROUND_BASE_Y;
        if (walkSegmentBlocked(xi, zi, xj, zj, yHi, obstacles)) return false;
        addLink(i, j);
        return true;
      };
      // Span +1, and +2 across an unwalkable seam cell (the strip hugging an
      // invisible edge wall is often too tight to stand in).
      if (c + 1 < cols && !edgeE[i]) {
        if (!tryLink(i + 1) && c + 2 < cols && !walk[i + 1]) tryLink(i + 2);
      }
      if (r + 1 < rows && !edgeS[i]) {
        if (!tryLink(i + cols) && r + 2 < rows && !walk[i + cols]) tryLink(i + 2 * cols);
      }
    }
  }
  return { cols, rows, minX, minZ, cell: CELL, floor, walk, edgeE, edgeS, jumpAdj, jumpLinkCount };
}

// Nearest walkable cell to (x, z). `floorHint` (the actor's floor height)
// prefers cells on the SAME level — without it, a bot on the plateau could
// snap to a ground cell through the wall beneath it.
// `reachObstacles` (start pins only): the pin may additionally only land on
// a square the actor can WALK to from its true position — measured with
// real movement rules (walkSegmentBlocked). "Nearest" alone measures
// straight through walls, so a bot pressed against a ramp balustrade got
// pinned on the far side of the glass and every route began with "walk
// through the wall" (the on-a-slope grinding bug). Mid-slope the floorHint
// tolerance (±2) can't save it — a slope's own height sits within 2 of BOTH
// adjacent levels.
function nearestWalkable(grid, x, z, floorHint, reachObstacles = null) {
  const { cols, rows, cell, minX, minZ, walk, floor } = grid;
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
        if (!walk[i]) continue;
        if (reachObstacles) {
          const cx = minX + (c + 0.5) * cell;
          const cz = minZ + (r + 0.5) * cell;
          if (walkSegmentBlocked(x, z, cx, cz, reachY, reachObstacles)) continue;
        }
        if (floorHint == null || Math.abs(floor[i] - floorHint) <= 2) return i;
        if (anyMatch < 0) anyMatch = i;
      }
    }
  }
  return anyMatch;
}

// A* over the grid. Returns waypoints [{x, z}, ...] from near the start to
// near the goal (cell centers, collinear runs collapsed), or null when no
// walk route exists (e.g. target on a jump-only platform).
export function findPathOnGrid(grid, sx, sz, tx, tz, startFloor = null, goalFloor = null, obstacles = null) {
  const { cols, rows, cell, minX, minZ, edgeE, edgeS } = grid;
  const start = nearestWalkable(grid, sx, sz, startFloor, obstacles);
  const goal = nearestWalkable(grid, tx, tz, goalFloor);
  if (start < 0 || goal < 0 || start === goal) return null;
  const n = cols * rows;
  const g = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gc = goal % cols, gr = (goal / cols) | 0;
  const h = (i) => Math.abs((i % cols) - gc) + Math.abs(((i / cols) | 0) - gr);

  // Small binary heap of [f, cell].
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
    const c = cur % cols, r = (cur / cols) | 0;
    const step = (nb, cost) => {
      if (closed[nb]) return;
      const ng = g[cur] + cost;
      if (ng < g[nb]) {
        g[nb] = ng;
        parent[nb] = cur;
        push(ng + h(nb), nb);
      }
    };
    if (c + 1 < cols && edgeE[cur]) step(cur + 1, 1);
    if (c > 0 && edgeE[cur - 1]) step(cur - 1, 1);
    if (r + 1 < rows && edgeS[cur]) step(cur + cols, 1);
    if (r > 0 && edgeS[cur - cols]) step(cur - cols, 1);
    // Jump-links (island bridges) cost a bit extra so walking wins when a
    // walk route of similar length exists.
    const jl = grid.jumpAdj ? grid.jumpAdj.get(cur) : null;
    if (jl) for (const nb of jl) step(nb, 2.5);
  }
  if (!found) return null;

  const pts = [];
  for (let i = goal; i !== -1; i = parent[i]) {
    pts.push({
      x: minX + ((i % cols) + 0.5) * cell,
      z: minZ + (((i / cols) | 0) + 0.5) * cell,
      y: grid.floor[i]
    });
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

// FIRING-POSITION SEARCH. Find the nearest-by-walking cell that can FIGHT
// the target: distance to (tx, tz) inside [minD, maxD] (the weapon's band)
// AND a clear line of sight from that cell's eye height to the target's.
// BFS from the start guarantees the shortest-walk such cell. This is what
// lets a sniper route to a sniping SPOT instead of to the enemy's feet —
// sampling only along the direct path missed band positions that live off
// to the side (e.g. clear lanes past the clutter). Returns waypoints like
// findPathOnGrid, or null when no reachable firing cell exists.
export function findFiringPath(grid, sx, sz, startFloor, tx, tz, targetEyeY, minD, maxD, obstacles) {
  const { cols, rows, cell, minX, minZ, edgeE, edgeS, floor } = grid;
  const start = nearestWalkable(grid, sx, sz, startFloor, obstacles);
  if (start < 0) return null;
  const n = cols * rows;
  const parent = new Int32Array(n).fill(-2); // -2 unvisited, -1 BFS root
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  parent[start] = -1;
  queue[qt++] = start;
  const pTarget = { x: tx, y: targetEyeY, z: tz };
  const sees = (i) => {
    // Eye height at the cell = its floor + body center + eye offset (same
    // 1.6 the bot LoS tests use).
    const p0 = {
      x: minX + ((i % cols) + 0.5) * cell,
      y: floor[i] + GROUND_BASE_Y + 1.6,
      z: minZ + (((i / cols) | 0) + 0.5) * cell
    };
    for (const o of obstacles) {
      if (o.noProjectile) continue;
      if (segmentHitsObstacle(p0, pTarget, o)) return false;
    }
    return true;
  };
  let goal = -1;
  while (qh < qt) {
    const cur = queue[qh++];
    const cx = minX + ((cur % cols) + 0.5) * cell;
    const cz = minZ + (((cur / cols) | 0) + 0.5) * cell;
    const d = Math.hypot(tx - cx, tz - cz);
    // The start cell itself never qualifies: this is called when the bot
    // needs to GO somewhere (jammed, blind, out of band) — "stay where you
    // are" is a degenerate answer that starved the caller into fallbacks.
    if (cur !== start && d >= minD && d <= maxD && sees(cur)) { goal = cur; break; }
    const c = cur % cols, r = (cur / cols) | 0;
    if (c + 1 < cols && edgeE[cur] && parent[cur + 1] === -2) { parent[cur + 1] = cur; queue[qt++] = cur + 1; }
    if (c > 0 && edgeE[cur - 1] && parent[cur - 1] === -2) { parent[cur - 1] = cur; queue[qt++] = cur - 1; }
    if (r + 1 < rows && edgeS[cur] && parent[cur + cols] === -2) { parent[cur + cols] = cur; queue[qt++] = cur + cols; }
    if (r > 0 && edgeS[cur - cols] && parent[cur - cols] === -2) { parent[cur - cols] = cur; queue[qt++] = cur - cols; }
    // Jump-links participate in the firing-position search too.
    const jl = grid.jumpAdj ? grid.jumpAdj.get(cur) : null;
    if (jl) for (const nb of jl) { if (parent[nb] === -2) { parent[nb] = cur; queue[qt++] = nb; } }
  }
  if (goal < 0) return null;
  const pts = [];
  for (let i = goal; i !== -1; i = parent[i]) {
    pts.push({
      x: minX + ((i % cols) + 0.5) * cell,
      z: minZ + (((i / cols) | 0) + 0.5) * cell,
      y: floor[i]
    });
  }
  pts.reverse();
  return collapseWaypoints(pts);
}
