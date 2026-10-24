"""b1019a, THE PRICE IN LIFE (sdbrain.js): a hit takes damage / HP of a life (1 in Sudden Death, where HP is 1 — the
price is then today's, digit for digit); a volley's hit is its mean pellets on the capsule times a pellet; THE TRADE
reads "the share of the unit's life spent to take the whole of the enemy's". THE HOLD (host.hold: a Hide or a Move
order stands): no attacks, no approach, no relocation — the wait and the escape only.
usage: python3 -I nb_price.py <sdplay root>"""
import pathlib, re, sys

P = pathlib.Path(sys.argv[1]) / 'shared/src/sim/sdbrain.js'
t = P.read_text()

def rep(old, new, n=1):
    global t
    c = t.count(old)
    assert c == n, f'expected {n}, found {c}:\n{old[:200]}'
    t = t.replace(old, new)

# ---- the host doc
rep("""//   opp {id, pos, hp, unit, invulnerableUntil}, enemies [{id, pos, vel,
//   unit, lastFireAt, bloom, hp, ammo, reloadingUntil, log}],
//   obstacles, grid, clear(p0, p1), eyeUp (a unit's muzzle above its
//   position), muzzleH (a cell's muzzle above its floor + GROUND_BASE_Y),
//   dist, sideX, sideZ, myFloorY, myShotY, avoid {rx, rz}, avoidMag,
//   playerHasLoS, groundHeightAt(x, z, fallback), startStep(dx, dz),
""", """//   opp {id, pos, hp, unit, invulnerableUntil}, enemies [{id, pos, vel,
//   unit, lastFireAt, bloom, hp}], hold (a Hide or a Move order stands: no
//   attacks, no approach, no relocation — the wait and the escape only),
//   obstacles, grid, clear(p0, p1), eyeUp (a unit's muzzle above its
//   position), muzzleH (a cell's muzzle above its floor + GROUND_BASE_Y),
//   dist, sideX, sideZ, myFloorY, myShotY, avoid {rx, rz}, avoidMag,
//   groundHeightAt(x, z, fallback), startStep(dx, dz),
""")

# ---- the volley: the chance a blast lands, and its mean pellets when it does
rep("""// then keeps its size, every pellet lethal at 1 HP. A blast lands when ANY
// slot falls on the capsule after the no-lead drift `s`: the share of the
// per-shot rotations that do. Cached on a 5 u / 0.25 u grid.
const sdVolleyCache = new Map();
function sdVolleyHitFrac(u, d, s) {
  const stretch = u.volleyStretchX ?? 1;
  const dq = Math.min(SHOTGUN_CLUSTER_SPREAD_DISTANCE, Math.round(d / 5) * 5), sq = Math.round(s * 4) / 4;
  const key = `${stretch}|${dq}|${sq}`;
  const hit = sdVolleyCache.get(key);
  if (hit != null) return hit;
  const f = Math.min(1, dq / SHOTGUN_CLUSTER_SPREAD_DISTANCE);
  const N = 36;
  let lands = 0;
  for (let i = 0; i < N; i += 1) {
    const rot = (i / N) * Math.PI * 2, c = Math.cos(rot), sn = Math.sin(rot);
    for (let k = 0; k < SHOTGUN_PATTERN.length; k += 1) {
      const px = SHOTGUN_PATTERN[k][0], py = SHOTGUN_PATTERN[k][1];
      const x = (px * c - py * sn) * stretch * f, y = (px * sn + py * c) * f;
      if (Math.abs(x - sq) < HIT_RADIUS_NORMAL && Math.abs(y) < HIT_HALF_HEIGHT + HIT_RADIUS_NORMAL) { lands += 1; break; }
    }
  }
  const frac = lands / N;
  if (sdVolleyCache.size > 4096) sdVolleyCache.clear();
  sdVolleyCache.set(key, frac);
  return frac;
}
""", """// then keeps its size. A blast lands when ANY slot falls on the capsule
// after the no-lead drift `s`: the share of the per-shot rotations that do
// (frac), and the mean pellets on the capsule when it does (pellets) — a
// landed blast's damage is that many pellets'. Cached on a 5 u / 0.25 u grid.
const sdVolleyCache = new Map();
function sdVolleyHit(u, d, s) {
  const stretch = u.volleyStretchX ?? 1;
  const dq = Math.min(SHOTGUN_CLUSTER_SPREAD_DISTANCE, Math.round(d / 5) * 5), sq = Math.round(s * 4) / 4;
  const key = `${stretch}|${dq}|${sq}`;
  const hit = sdVolleyCache.get(key);
  if (hit != null) return hit;
  const f = Math.min(1, dq / SHOTGUN_CLUSTER_SPREAD_DISTANCE);
  const N = 36;
  let lands = 0, pellets = 0;
  for (let i = 0; i < N; i += 1) {
    const rot = (i / N) * Math.PI * 2, c = Math.cos(rot), sn = Math.sin(rot);
    let n = 0;
    for (let k = 0; k < SHOTGUN_PATTERN.length; k += 1) {
      const px = SHOTGUN_PATTERN[k][0], py = SHOTGUN_PATTERN[k][1];
      const x = (px * c - py * sn) * stretch * f, y = (px * sn + py * c) * f;
      if (Math.abs(x - sq) < HIT_RADIUS_NORMAL && Math.abs(y) < HIT_HALF_HEIGHT + HIT_RADIUS_NORMAL) n += 1;
    }
    if (n) { lands += 1; pellets += n; }
  }
  const out = { frac: lands / N, pellets: lands ? pellets / lands : 0 };
  if (sdVolleyCache.size > 4096) sdVolleyCache.clear();
  sdVolleyCache.set(key, out);
  return out;
}
""")

# ---- the exposure's price: the share of a life of `hp` this exposure costs
rep("""// Chance of dying while exposed to `threat` for T ms at distance d, moving
// with lateral fraction `lat` (of `speed`, u/s) across its line. No shot in
""", """// THE PRICE of being exposed to `threat` for T ms at distance d, moving with
// lateral fraction `lat` (of `speed`, u/s) across its line: the share of a
// life of `hp` the exposure costs. A round that lands takes damage / hp of
// the life (a volley's, its pellets' damage); at 1 HP every hit is the whole
// life and the price is the chance of dying. No shot in
""")
rep("export function sdExposureRisk(threat, SD, d, lat, T, elapsed = 0, speed = SD.riskSprint, bloom = (threat.bloom ?? threat.state?.bloom ?? 0), react = SD.riskReactMs) {\n",
    "export function sdExposureRisk(threat, SD, d, lat, T, elapsed = 0, speed = SD.riskSprint, bloom = (threat.bloom ?? threat.state?.bloom ?? 0), react = SD.riskReactMs, hp = 1) {\n")
rep("""    let p = capsuleHitFrac(d * Math.tan(sa / 2), HIT_RADIUS_NORMAL, HIT_HALF_HEIGHT, sK);
    if (volley) p = Math.max(p, sdVolleyHitFrac(u, d, sK));
    survive *= 1 - p * Math.min(1, left);
  }
  return 1 - survive;
}
""", """    let p = capsuleHitFrac(d * Math.tan(sa / 2), HIT_RADIUS_NORMAL, HIT_HALF_HEIGHT, sK);
    const vh = volley ? sdVolleyHit(u, d, sK) : null;
    if (vh) p = Math.max(p, vh.frac);
    const life = Math.min(1, (u.damage ?? 1) * (vh ? Math.max(1, vh.pellets) : 1) / hp);
    survive *= 1 - p * life * Math.min(1, left);
  }
  return 1 - survive;
}
""")
# ---- the unit's own side: the share of the threat's life of `hp` its rounds take
rep("""// THE UNIT'S OWN SIDE: the chance that at least one of `me`'s rounds lands
// on `threat` inside a window of T ms at distance d — the same capsule
""", """// THE UNIT'S OWN SIDE: the share of `threat`'s life of `hp` that `me`'s
// rounds take inside a window of T ms at distance d (at 1 HP, the chance
// that at least one lands) — the same capsule
""")
rep("export function sdOwnHitChance(me, threat, d, T, SD, known = 0) {\n", "export function sdOwnHitChance(me, threat, d, T, SD, known = 0, hp = 1) {\n")
rep("""    let p = capsuleHitFrac(d * Math.tan(sa / 2), HIT_RADIUS_NORMAL, HIT_HALF_HEIGHT, s);
    if (volley) p = Math.max(p, sdVolleyHitFrac(u, d, s));
    survive *= 1 - p * Math.min(1, left);
  }
  return 1 - survive;
}
""", """    let p = capsuleHitFrac(d * Math.tan(sa / 2), HIT_RADIUS_NORMAL, HIT_HALF_HEIGHT, s);
    const vh = volley ? sdVolleyHit(u, d, s) : null;
    if (vh) p = Math.max(p, vh.frac);
    const life = Math.min(1, (u.damage ?? 1) * (vh ? Math.max(1, vh.pellets) : 1) / hp);
    survive *= 1 - p * life * Math.min(1, left);
  }
  return 1 - survive;
}
""")
# ---- the route's price carries the life
rep("""// The death chance of a route from (sx, sz) through `path` (navgrid points,
""", """// THE PRICE of a route (the share of a life of `hp`) from (sx, sz) through `path` (navgrid points,
""")
rep("export function sdRouteRisk(path, sx, sz, floorY, seen, threat, SD, speed = SD.riskSprint, react = SD.riskReactMs) {\n",
    "export function sdRouteRisk(path, sx, sz, floorY, seen, threat, SD, speed = SD.riskSprint, react = SD.riskReactMs, hp = 1) {\n")
rep("      survive *= 1 - sdExposureRisk(threat, SD, d, lat, T, elapsed, speed, undefined, react);\n",
    "      survive *= 1 - sdExposureRisk(threat, SD, d, lat, T, elapsed, speed, undefined, react, hp);\n")
rep("  riskCap: 0.15,          // the death chance accepted for a planned route, and the deaths-per-hit accepted for an attack\n",
    "  riskCap: 0.15,          // THE ONE CAP, in life: the share of its life a planned route may cost; the share of its life an attack may spend to take the whole of the enemy's (at 1 HP: the death chance; the deaths per hit)\n")

# ---- the tick: the two lives, the hold
rep("""  const sdThreatDist = Math.hypot(sdThreat.pos.x - mePos.x, sdThreat.pos.z - mePos.z);
""", """  const sdThreatDist = Math.hypot(sdThreat.pos.x - mePos.x, sdThreat.pos.z - mePos.z);
  // THE TWO LIVES the price is read in: a hit costs damage / HP of one (1 HP: the whole of it)
  const sdMyHp = Math.max(1, me.hp ?? 1), sdHisHp = Math.max(1, sdThreat.hp ?? 1);
  // THE HOLD: a Hide or a Move order stands — nothing is bought (no attacks,
  // no approach, no relocation); the wait and the escape only.
  const sdHold = !!host.hold;
""")
rep("""  // (the death chance of standing T ms at distance d, lat across the line, elapsed ms already spent, under the enemy's reaction `react`)
  const sdPriceAs = (T, d, lat, elapsed, react) => sdExposureRisk(sdThreat, SD, d, lat, T, elapsed, sdSprint, undefined, react);
""", """  // (the price of standing T ms at distance d, lat across the line, elapsed ms already spent, under the enemy's reaction `react`)
  const sdPriceAs = (T, d, lat, elapsed, react) => sdExposureRisk(sdThreat, SD, d, lat, T, elapsed, sdSprint, undefined, react, sdMyHp);
""")
rep("""  // (the chance the unit lands a hit inside T ms at distance d; none without rounds, none on an immune target)
  const sdOwnAs = (T, d, as, known = 0) => (!as.ammo || as.immune) ? 0 : sdOwnHitChance(selfRef, sdThreat, d, T, SD, known);
""", """  // (the share of his life the unit takes inside T ms at distance d; none without rounds, none on an immune target)
  const sdOwnAs = (T, d, as, known = 0) => (!as.ammo || as.immune) ? 0 : sdOwnHitChance(selfRef, sdThreat, d, T, SD, known, sdHisHp);
""")
rep("""  // THE TRADE: the deaths it takes to land one hit — each exposure pe dead,
  // 1 / pm of them needed. Under the cap, the attack is worth it.
  const sdDeathsPerHit = (pe, pm) => (pm <= 0 ? 1 : pe <= 0 ? 0 : 1 - Math.pow(1 - pe, 1 / Math.max(0.02, pm)));
""", """  // THE TRADE: the share of its life the unit spends to take the whole of
  // the enemy's by this exposure — each costs pe of its life and takes pm of
  // his, 1 / pm of them needed (at 1 HP: the deaths it takes to land one
  // hit). Under the cap, the attack is worth it.
  const sdTrade = (pe, pm) => (pm <= 0 ? 1 : pe <= 0 ? 0 : 1 - Math.pow(1 - pe, 1 / Math.max(0.02, pm)));
""")
rep("const dph = sdDeathsPerHit(rr.risk, sdOwnAs(", "const dph = sdTrade(rr.risk, sdOwnAs(")
rep("const dph = sdDeathsPerHit(pe, sdOwnAs(", "const dph = sdTrade(pe, sdOwnAs(")
rep("SD, sdSprint, as.react)", "SD, sdSprint, as.react, sdMyHp)", 2)
rep("SD, sdSprint, sdReact)", "SD, sdSprint, sdReact, sdMyHp)", 2)
rep("SD, sdSprint, SD.acquireMs)", "SD, sdSprint, SD.acquireMs, sdMyHp)")
# the attacks and the approach: nothing under the hold
rep("""  const sdAttacks = (as) => {
    if (!as.dodge) return null;""", """  const sdAttacks = (as) => {
    if (sdHold || !as.dodge) return null;""")
rep("""  const sdApproachRoute = () => {
    const oppFloor""", """  const sdApproachRoute = () => {
    if (sdHold) return null;
    const oppFloor""")
# the relocation: none under the hold — the floor of the list at once
rep("""        let stages;
        // (exposed, the nearest cell hidden on arrival; hidden, the nearest cell hidden through the horizon — the cell it will wait in)
        if (escape) { const stays = sdHidden ? sdStaysAt : hiddenGoal; stages = [{ kind: 'escape', maxPops: SD.nearPops, accept: stays, defensive: true }, { kind: 'escape', maxPops: SD.farPops, accept: stays, defensive: true }]; }
        else if (!inReach) stages = [""", """        // THE FLOOR OF THE LIST. Every option refused (or nothing to buy
        // under the hold): what is the unit waiting for? Priced once more
        // under what time brings back — the gun gone quiet, the dodge in
        // hand, the magazine and the tank full, the target's immunity over.
        // An attack or the refused route under the cap then: THE WAIT for it
        // (the plan, paced in the leash, priced again at the cadence).
        // Nothing: THE APPROACH — the pathfinder's route to the enemy, priced
        // like every route; none under the cap -> the wait, priced again at
        // the cadence.
        const sdFloor = () => {
          me.botSDSearchStage = 0;
          const refused = me.botSDRefusedPath;
          const waitFor = !!sdAttacks(sdRestored) || (!!refused && sdRouteRisk(refused, mePos.x, mePos.z, myFloorY, sdSeenRoute, sdThreat, SD, sdSprint, SD.acquireMs, sdMyHp).risk <= SD.riskCap);
          if (waitFor) {
            if (!plan || plan.kind !== 'wait') { if (plan) sdDrop(); sdTake({ kind: 'wait', cx: mePos.x, cz: mePos.z, hx: 0, hz: 0 }); }
            me.botSDWaits = (me.botSDWaits ?? 0) + 1;
          } else {
            const path = sdApproachRoute();
            if (plan) sdDrop();
            if (path) { sdTake({ kind: 'approach', path, idx: 0, goal: path[path.length - 1] }); me.botSDApproaches = (me.botSDApproaches ?? 0) + 1; }
            else { sdTake({ kind: 'wait', cx: mePos.x, cz: mePos.z, hx: 0, hz: 0 }); me.botSDUnreachable = (me.botSDUnreachable ?? 0) + 1; }   // (no route to him at all: the wait, like any other)
          }
          if (plan && plan.kind === 'wait') me.botSDSearchAt = now + SD.failRetryMs;
        };
        let stages = null;
        // (exposed, the nearest cell hidden on arrival; hidden, the nearest cell hidden through the horizon — the cell it will wait in)
        if (escape) { const stays = sdHidden ? sdStaysAt : hiddenGoal; stages = [{ kind: 'escape', maxPops: SD.nearPops, accept: stays, defensive: true }, { kind: 'escape', maxPops: SD.farPops, accept: stays, defensive: true }]; }
        else if (sdHold) sdFloor();   // (the hold: the wait, where the unit stands hidden)
        else if (!inReach) stages = [""")
rep("""        const stage = Math.min(me.botSDSearchStage ?? 0, stages.length - 1);
        if (stage === 0 && !me.botSDSearchJob) me.botSDRefusedPath = null;   // (a new cycle: no refused route yet)
""", """        const stage = stages ? Math.min(me.botSDSearchStage ?? 0, stages.length - 1) : -1;
        if (stages && stage === 0 && !me.botSDSearchJob) me.botSDRefusedPath = null;   // (a new cycle: no refused route yet)
""")
rep("""        const a = stages[stage];
        const jobKey = `${a.kind}|${stage}|${Math.round(mePos.x)},${Math.round(mePos.z)}`;
        if (!me.botSDSearchJob || me.botSDSearchJob.key !== jobKey) me.botSDSearchJob = { key: jobKey, state: null };
        let found = findHiddenSpot(sdGrid, mePos.x, mePos.z, myFloorY, sdEyes, obstacles, {
""", """        const a = stages ? stages[stage] : null;
        const jobKey = a ? `${a.kind}|${stage}|${Math.round(mePos.x)},${Math.round(mePos.z)}` : null;
        if (a && (!me.botSDSearchJob || me.botSDSearchJob.key !== jobKey)) me.botSDSearchJob = { key: jobKey, state: null };
        let found = !a ? null : findHiddenSpot(sdGrid, mePos.x, mePos.z, myFloorY, sdEyes, obstacles, {
""")
rep("""        if (!pending && !taken) {
          me.botSDSearchJob = null;
          if (stage < stages.length - 1) { me.botSDSearchStage = stage + 1; me.botSDSearchAt = now; }
          else if (!sdHidden) { me.botSDSearchStage = 0; me.botSDSearchAt = now + SD.exposedRetryMs; }
          else {
            // THE FLOOR OF THE LIST. Every option refused: what is the unit
            // waiting for? Priced once more under what time brings back — the
            // gun gone quiet, the dodge in hand, the magazine and the tank
            // full, the target's immunity over. An attack or the refused route
            // under the cap then: THE WAIT for it (the plan, paced in the leash,
            // priced again at the cadence). Nothing: THE APPROACH — the
            // pathfinder's route to the enemy, priced like every route; none
            // under the cap -> the wait, priced again at the cadence.
            me.botSDSearchStage = 0;
            const refused = me.botSDRefusedPath;
            const waitFor = !!sdAttacks(sdRestored) || (!!refused && sdRouteRisk(refused, mePos.x, mePos.z, myFloorY, sdSeenRoute, sdThreat, SD, sdSprint, SD.acquireMs, sdMyHp).risk <= SD.riskCap);
            if (waitFor) {
              if (!plan || plan.kind !== 'wait') { if (plan) sdDrop(); sdTake({ kind: 'wait', cx: mePos.x, cz: mePos.z, hx: 0, hz: 0 }); }
              me.botSDWaits = (me.botSDWaits ?? 0) + 1;
            } else {
              const path = sdApproachRoute();
              if (plan) sdDrop();
              if (path) { sdTake({ kind: 'approach', path, idx: 0, goal: path[path.length - 1] }); me.botSDApproaches = (me.botSDApproaches ?? 0) + 1; }
              else { sdTake({ kind: 'wait', cx: mePos.x, cz: mePos.z, hx: 0, hz: 0 }); me.botSDUnreachable = (me.botSDUnreachable ?? 0) + 1; }   // (no route to him at all: the wait, like any other)
            }
            if (plan && plan.kind === 'wait') me.botSDSearchAt = now + SD.failRetryMs;
          }
        }
""", """        if (a && !pending && !taken) {
          me.botSDSearchJob = null;
          if (stage < stages.length - 1) { me.botSDSearchStage = stage + 1; me.botSDSearchAt = now; }
          else if (!sdHidden) { me.botSDSearchStage = 0; me.botSDSearchAt = now + SD.exposedRetryMs; }
          else sdFloor();
        }
""")
rep("""// SUDDEN DEATH BRAIN (b1017a): ONE RULE IN FOUR PARTS, EACH WRITTEN ONCE.
//
// THE RULE: the unit stands only where it is hidden; it is exposed only to
// buy something — a firing line, a better cell, the way back — and every
// exposure is priced the same way: the chance of dying in it under the
// enemy's eyes and gun, against the chance of landing a hit. The planner
// takes the cheapest exposure that buys the most, else it holds; the legs
// run every exposure across the line.
""", """// THE BRAIN (b1017a Sudden Death, b1019a both modes): ONE RULE IN FOUR
// PARTS, EACH WRITTEN ONCE.
//
// THE RULE: the unit stands only where it is hidden; it is exposed only to
// buy something — a firing line, a better cell, the way back — and every
// exposure is priced the same way, IN LIFE: the share of its life the
// exposure costs under the enemy's eyes and gun, against the share of the
// enemy's life its own rounds take. A hit costs damage / HP of a life — in
// Sudden Death (1 HP) the whole of it, and the price is the chance of
// dying; in Health Point mode a part, and the unit behind on HP pays more
// per hit than the one ahead. No flag says which mode it is. The planner
// takes the cheapest exposure that buys the most, else it holds; the legs
// run every exposure across the line.
""")
rep("""//   2. THE PRICE (sdPrice, sdOwn, sdDeathsPerHit): the chance of dying in an
//      exposure of T ms at distance d moving lat across the line, after the
""", """//   2. THE PRICE (sdPrice, sdOwn, sdTrade): the share of its life lost in an
//      exposure of T ms at distance d moving lat across the line, after the
""")
rep("""//      (sdOwnHitChance). An attack is
//      taken when the deaths it costs to land one hit stay under riskCap; a
//      route, when its death chance does. One cap.
""", """//      (sdOwnHitChance). An attack is
//      taken when the share of its life it spends to take the whole of the
//      enemy's stays under riskCap; a route, when its price does. One cap.
""")
assert 'sdVolleyHitFrac' not in t and 'sdDeathsPerHit' not in t
P.write_text(t)
print('sdbrain.js: the price in life, the hold')
