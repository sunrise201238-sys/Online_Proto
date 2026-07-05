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

import { surfaceHeightAtXZ, unitOverlapsObstacle } from './physics.js';
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
  return { cols, rows, minX, minZ, cell: CELL, floor, walk, edgeE, edgeS };
}

// Nearest walkable cell to (x, z). `floorHint` (the actor's floor height)
// prefers cells on the SAME level — without it, a bot on the plateau could
// snap to a ground cell through the wall beneath it.
function nearestWalkable(grid, x, z, floorHint) {
  const { cols, rows, cell, minX, minZ, walk, floor } = grid;
  const c0 = Math.max(0, Math.min(cols - 1, Math.floor((x - minX) / cell)));
  const r0 = Math.max(0, Math.min(rows - 1, Math.floor((z - minZ) / cell)));
  let anyMatch = -1;
  for (let rad = 0; rad <= SNAP_RADIUS; rad += 1) {
    for (let dr = -rad; dr <= rad; dr += 1) {
      for (let dc = -rad; dc <= rad; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
        const i = r * cols + c;
        if (!walk[i]) continue;
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
export function findPathOnGrid(grid, sx, sz, tx, tz, startFloor = null, goalFloor = null) {
  const { cols, rows, cell, minX, minZ, edgeE, edgeS } = grid;
  const start = nearestWalkable(grid, sx, sz, startFloor);
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
    const step = (nb) => {
      if (closed[nb]) return;
      const ng = g[cur] + 1;
      if (ng < g[nb]) {
        g[nb] = ng;
        parent[nb] = cur;
        push(ng + h(nb), nb);
      }
    };
    if (c + 1 < cols && edgeE[cur]) step(cur + 1);
    if (c > 0 && edgeE[cur - 1]) step(cur - 1);
    if (r + 1 < rows && edgeS[cur]) step(cur + cols);
    if (r > 0 && edgeS[cur - cols]) step(cur - cols);
  }
  if (!found) return null;

  const pts = [];
  for (let i = goal; i !== -1; i = parent[i]) {
    pts.push({
      x: minX + ((i % cols) + 0.5) * cell,
      z: minZ + (((i / cols) | 0) + 0.5) * cell
    });
  }
  pts.reverse();
  // Collapse straight runs — fewer waypoints, smoother following.
  const out = [pts[0]];
  for (let k = 1; k < pts.length - 1; k += 1) {
    const a = out[out.length - 1], b = pts[k], c2 = pts[k + 1];
    const cross = (b.x - a.x) * (c2.z - b.z) - (b.z - a.z) * (c2.x - b.x);
    if (Math.abs(cross) < 1e-6) continue;
    out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
