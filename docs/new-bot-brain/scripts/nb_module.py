"""b1018b: THE PLAIN BRAIN IN ONE MODULE (step 4 of the plain-brain rework, PT site).
shared/src/sim/nbrain.js is generated from the brain's text in ai.js: the knobs, the helpers and the whole tick,
with every host-specific read or write replaced by the host interface (the same shape as sdbrain's host).
ai.js becomes the server host; the client host replaces updateEnemy (client edits are in nb_client.py).
Every replaced string must occur exactly the expected number of times. usage: python3 -I nb_module.py <sdplay root>"""
import pathlib, re, sys

ROOT = pathlib.Path(sys.argv[1])
SIM = ROOT / 'shared/src/sim'
src = (SIM / 'ai.js').read_text()

def cut(text, start, end, include_end=False):
    a = text.index(start)
    b = text.index(end, a)
    if include_end: b += len(end)
    return text[a:b]

def rep(text, old, new, n=1):
    c = text.count(old)
    assert c == n, f'expected {n} occurrence(s), found {c}:\n{old[:160]}'
    return text.replace(old, new)

# ---------------------------------------------------------------- the pieces of ai.js
knobs_a = cut(src, '// --- Bot tactical-sprint tunables (mirrored in client/src/main.js) ---', '// The Sudden Death brain, its knobs and its risk models live in sdbrain.js')
reset_fn = cut(src, '// Every hide scratch field, nulled when a hide ends', 'const BOT_JUMP_HEIGHT_DIFF = 2.5;')
jump_diff = 'const BOT_JUMP_HEIGHT_DIFF = 2.5;\n'
target_knobs = cut(src, '// LoS-aware 2v2 targeting: an enemy with no line of sight', '// Nav grids are built once per arena object')
nav_grid_fn = cut(src, '// Nav grids are built once per arena object', '// --- Elevation-kiting tunables ---')
elev_knobs = cut(src, '// --- Elevation-kiting tunables ---', '// Repulsion vector from blocking obstacles within `radius`.')
helpers = cut(src, '// Repulsion vector from blocking obstacles within `radius`.', '// Can the SHOT actually land? The fire gate has to test the line the BULLET')
burst_perch = cut(src, '// Burst size for continuous-fire weapons (spreadCount === 1).', '// Drives the bot\'s velocity directly (legacy-style')
pick_fn = cut(src, '// LoS-aware bot target pick (2v2). Score = real distance', '// Bot jump funding: the shared tryStartJump gates at the raw jump cost')
body = src[src.index('export function tickBot(matchState, botId, now) {'):]

# ---------------------------------------------------------------- the tick, host-ified
# the head: the host already found the unit and its target; the charge lock and the beam channel stand still
body = rep(body, """export function tickBot(matchState, botId, now) {
  const me = matchState.fighters[botId];
  if (!me || me.hp <= 0) return;
  // Mark bot control for shared helpers that behave differently for bots
  // (tryStartJump floors zero-cooldown jumps at 1.5 s for bots so the perch
  // reflex can't bunny-hop Aris — bots play flight units grounded).
  me.botControlled = true;
  // Bot's opp is its current targetId. In 1v1 there's only ever one enemy so
  // this is equivalent to the old hardcoded pair lookup. In 2v2 the server
  // (or the caller) picks the closest live enemy via pickClosestEnemyId and
  // writes it onto me.targetId before this call.
  const opp = me.targetId ? matchState.fighters[me.targetId] : null;
  if (!opp || opp.hp <= 0) return;

  // Sniper-charge lock: stand still until the charge resolves.
  if (me.sniperChargeTargetId) {
    me.vel.x = 0;
    me.vel.z = 0;
    me.momentumVX = 0;
    me.momentumVZ = 0;
    me.action = 'shoot';
    return;
  }
  // Locked while channeling a charged sweep (beam tracks target in tickChargedBeams).
  if (me.chargedBeamUntil > now) {
    me.vel.x = 0;
    me.vel.z = 0;
    me.momentumVX = 0;
    me.momentumVZ = 0;
    me.action = 'shoot';
    return;
  }

  const arena = getArena(matchState.mapKey);
  const obstacles = arena.obstacles;
  const surfaces = arena.surfaces;

  const dx = opp.pos.x - me.pos.x;
  const dz = opp.pos.z - me.pos.z;
""", """export function nbBrainTick(host) {
  const { now, me, pos, vel, grounded, unit, opp, enemies, obstacles, surfaces, grid, eyeUp, muzzleUp, mode, sd } = host;

  // Sniper-charge lock: stand still until the charge resolves.
  if (host.charging) {
    vel.x = 0;
    vel.z = 0;
    me.momentumVX = 0;
    me.momentumVZ = 0;
    me.action = 'shoot';
    return 'locked';
  }
  // Locked while channeling a charged sweep (beam tracks target in tickChargedBeams).
  if (me.chargedBeamUntil > now) {
    vel.x = 0;
    vel.z = 0;
    me.momentumVX = 0;
    me.momentumVZ = 0;
    me.action = 'shoot';
    return 'locked';
  }

  // Which enemies have a sniper charge on this unit (the glint the unit sees).
  const chargers = enemies.filter((f) => f.chargingAtMe);

  const dx = opp.pos.x - pos.x;
  const dz = opp.pos.z - pos.z;
""")
# the glint scan: the enemies' views carry the charge
body = rep(body, """  const sniperCharging = opp.sniperChargeTargetId === me.id;
  let glintThreat = null;
  for (const f of Object.values(matchState.fighters)) {
    if (!f || f === me || f.hp <= 0) continue;
    if (f.sniperChargeTargetId !== me.id) continue;
    if (!glintThreat || f.sniperChargeStartAt < glintThreat.sniperChargeStartAt) glintThreat = f;
  }
  if (glintThreat) {
    const glintKey = `${glintThreat.id}:${glintThreat.sniperChargeStartAt}`;
""", """  const sniperCharging = chargers.some((c) => c.id === opp.id);
  let glintThreat = null;
  for (const f of chargers) {
    if (!glintThreat || f.chargeStartAt < glintThreat.chargeStartAt) glintThreat = f;
  }
  if (glintThreat) {
    const glintKey = `${glintThreat.id}:${glintThreat.chargeStartAt}`;
""")
body = rep(body, """      const glintAtk = me.botGlintAttackerId ? matchState.fighters[me.botGlintAttackerId] : null;
      if (glintAtk && glintAtk !== opp && glintAtk.hp > 0) {
        const adx = me.pos.x - glintAtk.pos.x;
        const adz = me.pos.z - glintAtk.pos.z;
""", """      const glintAtk = me.botGlintAttackerId ? (enemies.find((f) => f.id === me.botGlintAttackerId) ?? null) : null;
      if (glintAtk && glintAtk.id !== opp.id) {
        const adx = pos.x - glintAtk.pos.x;
        const adz = pos.z - glintAtk.pos.z;
""")
body = rep(body, "      if (tryStartStep(matchState, me, sdx, sdz, now, obstacles)) {\n", "      if (host.startStep(sdx, sdz)) {\n")
# the step: the host's lerp; the plain bot sits it out
body = rep(body, """  const sdStepping = !!me.botSD && now <= me.stepUntil;
  if (now <= me.stepUntil) {
    tickStep(me, now, obstacles);
    if (!sdStepping) return;
  } else if (me.stepUntil > 0) tickStep(me, now, obstacles);
""", """  const sdStepping = !!sd && now <= me.stepUntil;
  if (now <= me.stepUntil) {
    host.tickStep();
    if (!sdStepping) return 'step';
  } else if (me.stepUntil > 0) host.tickStep();
""")
body = rep(body, "  const lockRange = (matchState.mode === '2v2' && me.unit?.lockRange2v2)\n", "  const lockRange = (mode === '2v2' && unit?.lockRange2v2)\n")
# the command side-table entry comes from the host
body = rep(body, "  const cmdEntry = matchState.commands?.[botId] ?? null;\n", "  const cmdEntry = host.cmd ?? null;\n")
body = rep(body, "  const hideMode = me.botSD ? null : (hideOrdered ? 'stance' : (me.botCH ? 'cover' : null));\n",
           "  const hideMode = sd ? null : (hideOrdered ? 'stance' : (me.botCH ? 'cover' : null));\n")
body = rep(body, """    const hideEnemies = [];
    for (const f of Object.values(matchState.fighters)) {
      if (f.team !== me.team && f.hp > 0) hideEnemies.push(f);
    }
    // Nearest first: eyes[0] is the threat the pacing steers away from.
    hideEnemies.sort((a, b) =>
""", """    // Nearest first: eyes[0] is the threat the pacing steers away from.
    const hideEnemies = enemies.slice().sort((a, b) =>
""")
body = rep(body, """        && now >= (me.botHideSearchAt ?? 0)
        && matchState.hideSearchTick !== matchState.tick) {
      matchState.hideSearchTick = matchState.tick;
""", """        && now >= (me.botHideSearchAt ?? 0)
        && host.searchSlot()) {
""")
body = rep(body, """        navGridFor(arena), me.pos.x, me.pos.z, myFloorY, attempt.eyes, obstacles,
        { maxPops: BOT_HIDE_MAX_POPS, minDistFrom: attempt.minDistFrom, within: attempt.within ?? null, goalShoulder: BOT_HIDE_SHOULDER, deadline: matchState.searchDeadline ?? 0 }
""", """        grid, pos.x, pos.z, myFloorY, attempt.eyes, obstacles,
        { maxPops: BOT_HIDE_MAX_POPS, minDistFrom: attempt.minDistFrom, within: attempt.within ?? null, goalShoulder: BOT_HIDE_SHOULDER, deadline: host.deadline() }
""")
# the Sudden Death brain: its host is this host
body = rep(body, """  // ===== SUDDEN DEATH BRAIN (see sdbrain.js — one module, both hosts) =====
  // Per-fighter overrides (me.botSDOpts) let the harness A/B two rule sets
  // inside one match; the fire block below reads SDG too.
  const SDG = me.botSD ? (me.botSDOpts ? { ...BOT_SD, ...me.botSDOpts } : BOT_SD) : null;
  if (me.botSD && !defenseLive) {
    const sdEnemies = [];
    for (const f of Object.values(matchState.fighters)) {
      if (f.team !== me.team && f.hp > 0) sdEnemies.push(f);
    }
    coverMove = sdBrainTick({
      now, SD: SDG, me, pos: me.pos, unit: me.unit, vel: me.vel, grounded: me.grounded,
      wall: matchState.walls?.[me.id] ?? null,   // (physics' note from the last tick: the face the body was pushed out of — tick.js stage 5)
      opp, enemies: sdEnemies,
      obstacles, grid: navGridFor(arena), clear: makeMuzzleClear(obstacles, surfaces),
      eyeUp: PROJECTILE_MUZZLE_Y_OFFSET, muzzleH: PROJECTILE_MUZZLE_Y_OFFSET,
      dist, sideX, sideZ, myFloorY, myShotY, avoid, avoidMag, playerHasLoS,
      groundHeightAt: (x, z, fallback) => groundHeightAt(x, z, surfaces, fallback),
      startStep: (dx, dz) => tryStartStep(matchState, me, dx, dz, now, obstacles),
      startJump: () => tryStartJump(me, now),
      // (one route search per tick per match — shares the hide search's slot)
      searchSlot: () => { if (matchState.hideSearchTick === matchState.tick) return false; matchState.hideSearchTick = matchState.tick; return true; },
      // (the server's per-tick CPU budget — see findHiddenSpot; the sim sets none)
      deadline: () => matchState.searchDeadline ?? 0,
      tape: null
    });
  } else if (me.botSD) {
    me.botSDState = 'dodge';
  }
""", """  // ===== SUDDEN DEATH BRAIN (see sdbrain.js — one module, both hosts) =====
  // Its host is this host: the same body, enemies, arena and actions; the
  // fire block below reads `sd` too.
  if (sd && !defenseLive) {
    coverMove = sdBrainTick({
      now, SD: sd, me, pos, unit, vel, grounded,
      wall: host.wall,   // (physics' note from the last tick: the face the body was pushed out of)
      opp, enemies,
      obstacles, grid, clear: host.clear,
      eyeUp: muzzleUp, muzzleH: muzzleUp,
      dist, sideX, sideZ, myFloorY, myShotY, avoid, avoidMag, playerHasLoS,
      groundHeightAt: (x, z, fallback) => groundHeightAt(x, z, surfaces, fallback),
      startStep: host.startStep,
      startJump: host.startJump,
      searchSlot: host.searchSlot,
      deadline: host.deadline,
      tape: host.tape ?? null
    });
  } else if (sd) {
    me.botSDState = 'dodge';
  }
""")
# the nav plan: paths live where the host keeps them
body = rep(body, """  const navPlan = () => {
    const grid = navGridFor(arena);
""", """  const navPlan = () => {
""")
body = rep(body, """    if (path && path.length > 2) path = smoothPath(grid, path, obstacles);
    if (matchState._navPaths == null) matchState._navPaths = {};
    if (path && path.length > 1) {
      // idx 0: walk to the pinned start square first — beelining to square
      // #2 from an off-grid position can clip the corner between them.
      matchState._navPaths[botId] = {
        path, idx: 0, gx: opp.pos.x, gz: opp.pos.z, at: now
      };
      me.botMazeLosBlockedAtEntry = !playerHasLoS;
      return true;
    }
    delete matchState._navPaths[botId];
    return false;
  };
""", """    if (path && path.length > 2) path = smoothPath(grid, path, obstacles);
    if (path && path.length > 1) {
      // idx 0: walk to the pinned start square first — beelining to square
      // #2 from an off-grid position can clip the corner between them.
      host.navSet({ path, idx: 0, gx: opp.pos.x, gz: opp.pos.z, at: now });
      me.botMazeLosBlockedAtEntry = !playerHasLoS;
      return true;
    }
    host.navSet(null);
    return false;
  };
""")
body = rep(body, "  const sdParks = !!(me.botSD && coverMove);\n", "  const sdParks = !!(sd && coverMove);\n")
body = rep(body, "    const navPrev = matchState._navPaths ? matchState._navPaths[botId] : null;\n", "    const navPrev = host.navGet();\n")
body = rep(body, "      const fresh = matchState._navPaths[botId];\n", "      const fresh = host.navGet();\n")
body = rep(body, """      if (retraced) {
        delete matchState._navPaths[botId];
""", """      if (retraced) {
        host.navSet(null);
""")
body = rep(body, "    let nav = matchState._navPaths ? matchState._navPaths[botId] : null;\n", "    let nav = host.navGet();\n")
body = rep(body, "        if (nav) delete matchState._navPaths[botId];\n", "        if (nav) host.navSet(null);\n")
body = rep(body, "          const fresh = matchState._navPaths ? matchState._navPaths[botId] : null;\n", "          const fresh = host.navGet();\n")
body = rep(body, """        if (!replaced) {
          delete matchState._navPaths[botId];
""", """        if (!replaced) {
          host.navSet(null);
""")
body = rep(body, "        const fresh = matchState._navPaths ? matchState._navPaths[botId] : null;\n", "        const fresh = host.navGet();\n")
# the jumps: the funding policy stays here, the mechanic is the host's
body = rep(body, "botTryJump(me, now)", "botTryJump(host)", 6)
body = rep(body, "botTryJumpSurvival(me, now)", "botTryJumpSurvival(host)", 2)
body = rep(body, "    inheritMomentum(me, MOMENTUM_STANDARD * 1.5);\n", "    host.inheritMomentum(MOMENTUM_STANDARD * 1.5);\n")
# the hit-stun slowdown is the host's physics (each host applies its own rule after the brain)
body = rep(body, """  // Hit-stun parity: the player keeps moving at a reduced speed (the hitting
  // weapon's move-scale, stored on the victim) while stunned rather than
  // freezing. Mirrors offline main.js updateEnemy.
  if (now < me.hitStunUntil) {
    me.vel.x *= me.hitStunScale;
    me.vel.z *= me.hitStunScale;
  }

""", "")
# the fire block
body = rep(body, "    } else if (SDG ? !me.botSDFire : !botMayFire(u, me, Math.hypot(opp.pos.x - me.pos.x, opp.pos.y - me.pos.y, opp.pos.z - me.pos.z), matchState.mode)) {\n",
           "    } else if (sd ? !me.botSDFire : !botMayFire(u, me, Math.hypot(opp.pos.x - pos.x, opp.pos.y - pos.y, opp.pos.z - pos.z), mode)) {\n")
body = rep(body, "      me.nextFireAt = now + TICK_RATE_MS;\n", "      me.nextFireAt = now + host.tickMs;\n")
body = rep(body, "    } else if (!botShotCanLand(myShotY, me, opp, obstacles, surfaces)) {\n",
           "    } else if (!host.clear({ x: pos.x, y: myShotY, z: pos.z }, { x: opp.pos.x, y: opp.pos.y + muzzleUp, z: opp.pos.z })) {\n")
body = rep(body, "      me.nextFireAt = now + (SDG ? SDG.firePollMs : 220);", "      me.nextFireAt = now + (sd ? sd.firePollMs : 220);")
body = rep(body, "      const fired = attemptFire(matchState, me, opp, now);\n", "      const fired = host.fire();\n")
body = rep(body, "      attemptFire(matchState, me, opp, now);\n", "      host.fire();\n")
body = rep(body, "      const sdDump = !!(SDG && me.botSDFire);\n", "      const sdDump = !!(sd && me.botSDFire);\n")
assert body.endswith("    }\n  }\n}\n"), body[-40:]
body = body[:-2] + "  return sdStepping ? 'stepping' : 'ran';\n}\n"
# the body, its velocity and its unit are the host's
body = re.sub(r'\bme\.pos\.', 'pos.', body)
body = re.sub(r'\bme\.vel\.', 'vel.', body)
body = re.sub(r'\bme\.unit\b', 'unit', body)
body = re.sub(r'\bme\.grounded\b', 'grounded', body)
body = body.replace('BOT_LOS_EYE_HEIGHT', 'eyeUp').replace('PROJECTILE_MUZZLE_Y_OFFSET', 'muzzleUp')
body = rep(body, """  // HIDE STANCE flag (owner 2026-09-26): read straight off the command
  // side-table (matchState.commands[slot].hide — command.js imports this
  // module, so importing isHideOrdered back would close a cycle), OR the
""", """  // HIDE STANCE flag (owner 2026-09-26): read off the host's command entry
  // (the server's side-table matchState.commands[slot]), OR the
""")
body = rep(body, """  // the detectors re-fire. Paths live on matchState._navPaths, NOT on the fighter: the
  // fighter object is serialized into every snapshot.
""", """  // the detectors re-fire. Paths live where the host keeps them (navGet /
  // navSet — the server keeps them off the fighter, which is serialized
  // into every snapshot).
""")
code_only = re.sub(r'//[^\n]*', '', body)
for leftover in ['matchState', 'botId', 'me.botSD ', 'me.botSD)', 'me.id', 'SDG', 'me.team', 'navGridFor', 'arena', 'tryStartStep(', 'tryStartJump(', 'tickStep(me', 'attemptFire', 'TICK_RATE_MS', 'botShotCanLand']:
    assert leftover not in code_only, f'host-specific text left in the module: {leftover}'

# ---------------------------------------------------------------- the jump funding (policy here, mechanic in the host)
jump_fns = """// Bot jump funding: the host's jump (the shared tryStartJump online, the
// client's botStartJump offline) gates at the raw jump cost — human
// mechanics, untouched; bots additionally respect the strategic reserve so a
// hop never leaves them without an emergency dodge.
function botTryJump(host) {
  const funded = Math.max(BOT_TRAVEL_SPRINT_FLOOR, (host.unit?.jumpBoostCost ?? 48) + BOT_SPRINT_MIN_BOOST);
  if (host.me.boost < funded) return false;
  return host.startJump();
}

// SURVIVAL jump funding (2026-08-05): the Defense hop/vault is an escape
// move, and Defense's own sprint drains below the 250 travel reserve within
// a few ticks — reserve-gated funding made the hop nearly unaffordable in
// practice. Same doctrine as the two existing survival exemptions (Defense
// sprints to the hard floor, the anti-glint dodge pays raw step cost).
// Owner 2026-08-22: the gate is the flat MANDATED tier (60 — shared with
// commanded-travel route jumps, was cost+sprint-floor 56). Discretionary
// jumps (pursue perch, elevation aids) keep the reserve gate — bots still
// hoard for the road.
function botTryJumpSurvival(host) {
  if (host.me.boost < MANDATED_JUMP_MIN_BOOST) return false;
  return host.startJump();
}

"""

HEADER = """// THE PLAIN BRAIN (Health Point mode) — one module for both hosts (owner
// 2026-10-17, the plain-brain rework: "one place, one structure, patchless").
// The server's tickBot (ai.js) and the offline client's updateEnemy (main.js)
// each build a host and call nbBrainTick once a tick; there is no second copy.
// The brain is the b1018a brain unchanged (the equivalence test
// shared/test/nb_equiv.test.js plays it tick for tick against the frozen
// host): the state machine Defense > Maze > Engage > Pursue, the hide stance,
// the anti-glint dodge, the stuck detectors, the pathfinder's Maze, the
// velocity dispatch and the fire block. The Sudden Death brain (sdbrain.js)
// runs inside it on the same host.
//
// THE HOST — what the brain reads and does through it:
//   now, me          the clock; the unit's state object (its bot* scratch,
//                    boost, ammo, reload, fire clocks, momentum, action...)
//   pos, vel         the body centre {x, y, z} and the velocity it writes
//   grounded, unit   the body's ground contact; the unit's data
//   opp, enemies     views of the target and of every live enemy: {id, pos,
//                    vel, hp, unit, lastFireAt, bloom, invulnerableUntil,
//                    chargeStartAt, chargingAtMe}; opp is one of enemies
//   cmd              the command entry {hide, hideAuto, move, lockTargetId}
//                    the brain reads and writes, or null
//   obstacles, surfaces, grid   the arena and its nav grid
//   eyeUp, muzzleUp  the eye and the muzzle above the body centre
//   mode, tickMs     the match mode; the host's tick length (the fire poll)
//   charging         the unit holds a sniper charge (stands still)
//   sd               the Sudden Death knobs when that brain runs, else null
//   wall             physics' note of the face the body was pushed out of
//   clear(p0, p1)    can a round fly p0 -> p1 (the projectile rules)
//   startStep(dx, dz), tickStep(), startJump(), fire()   the body's actions
//   inheritMomentum(k), navGet(), navSet(v), searchSlot(), deadline(), tape
// Returns 'locked' (charge or beam: standing), 'step' (the plain bot sat the
// dodge out), 'stepping' (the Sudden Death brain watched it) or 'ran'.

import { between } from './math.js';
import { segmentHitsObstacle, groundHeightAt, unitOverlapsObstacle, walkSegmentBlocked, sightHitsSurface } from './physics.js';
import { findPathOnGrid, findFiringPath, findHiddenSpot, smoothPath } from './navgrid.js';
import { GROUND_BASE_Y, BOOST_MOVE_SPEED, WALK_SPEED, MOMENTUM_STANDARD, SNIPER_CANCEL_MIN_CHARGE_MS, MANDATED_JUMP_MIN_BOOST, CMD_TRAVEL_BOOST_FLOOR, HIT_RADIUS_NORMAL } from './constants.js';
import { botMayFire, botNoteShot, botClearFireRule } from './bloom.js';
import { sdBrainTick } from './sdbrain.js';

"""

# the reset helper is exported (the client wipes a corpse's hide fields with it)
reset_fn = rep(reset_fn, """// Every hide scratch field, nulled when a hide ends (stance cleared, cover
// hide over) so the normal brain resumes from a clean slate. Offline twin:
// client resetBotHideFields.
function resetBotHideFields(f) {""", """// Every hide scratch field, nulled when a hide ends (stance cleared, cover
// hide over) so the normal brain resumes from a clean slate; the client also
// wipes a corpse with it.
export function resetBotHideFields(f) {""")
target_knobs = rep(target_knobs, "const BOT_TARGET_BLOCKED_PENALTY = 50;\nconst BOT_TARGET_SWITCH_MARGIN = 6;",
                   "export const BOT_TARGET_BLOCKED_PENALTY = 50;\nexport const BOT_TARGET_SWITCH_MARGIN = 6;")
knobs_a = rep(knobs_a, "// --- Bot tactical-sprint tunables (mirrored in client/src/main.js) ---", "// --- Bot tactical-sprint tunables ---")

module = HEADER + knobs_a + reset_fn + jump_diff + target_knobs + elev_knobs + helpers + burst_perch + jump_fns + body
# the mirror is gone: its notes go with it
for stale in ['Mirrored in client main.js.', ' Mirrored in client main.js', 'Mirrored in client\n// updateEnemy (fields eState.botHide*).',
              'Mirrors offline main.js updateEnemy.', ' Mirrors offline main.js.', 'Mirrors\n    // offline main.js.', ' Mirrored in main.js navPlan.',
              '(mirrored\n// in client/src/main.js)', 'Mirrored\n// in client/src/main.js.', ' (mirrored\n// in client/src/main.js)', ' Mirrored in client updateEnemy.',
              'Mirrors updateEnemy.', ' Mirrored in\n// client/src/main.js.']:
    module = module.replace(stale, '')
(SIM / 'nbrain.js').write_text(module)

# ---------------------------------------------------------------- ai.js: the server host
AI = """// THE BOT HOST, SERVER SIDE. The brain is shared/src/sim/nbrain.js (the
// Health Point brain, with the Sudden Death brain sdbrain.js inside it); this
// file finds the unit and its target, builds the host the brain reads and
// acts through, and keeps the server's own pieces: the nav-grid cache, the
// 2v2 target pick, the per-fighter Sudden Death overrides, the hit-stun
// slowdown after the brain's velocity.

import { attemptFire, tryStartJump, tryStartStep, tickStep } from './actions.js';
import { getArena } from './arena.js';
import { buildNavGrid } from './navgrid.js';
import { inheritMomentum } from './movement.js';
import { PROJECTILE_MUZZLE_Y_OFFSET, TICK_RATE_MS, BOT_LOS_EYE_HEIGHT } from './constants.js';
import { nbBrainTick, botHasLineOfSight, BOT_TARGET_BLOCKED_PENALTY, BOT_TARGET_SWITCH_MARGIN } from './nbrain.js';
import { makeMuzzleClear, BOT_SD } from './sdbrain.js';
// The Sudden Death brain, its knobs and its risk models live in sdbrain.js
// (one module for the server and the client); re-exported here for the
// client's imports. The plain brain's sight rule is re-exported for the
// hide-order tests, which judge "hidden" by the bot's own rule.
export { BOT_SD, capsuleHitFrac, sdExposureRisk, sdOwnHitChance, sdOwnReach, sdRouteRisk } from './sdbrain.js';
export { botHasLineOfSight } from './nbrain.js';

""" + nav_grid_fn + pick_fn + """export function tickBot(matchState, botId, now) {
  const me = matchState.fighters[botId];
  if (!me || me.hp <= 0) return;
  // Mark bot control for shared helpers that behave differently for bots
  // (tryStartJump floors zero-cooldown jumps at 1.5 s for bots so the perch
  // reflex can't bunny-hop Aris — bots play flight units grounded).
  me.botControlled = true;
  // Bot's opp is its current targetId. In 1v1 there's only ever one enemy so
  // this is equivalent to the old hardcoded pair lookup. In 2v2 the server
  // (or the caller) picks the closest live enemy via pickClosestEnemyId and
  // writes it onto me.targetId before this call.
  const target = me.targetId ? matchState.fighters[me.targetId] : null;
  if (!target || target.hp <= 0) return;
  const arena = getArena(matchState.mapKey);
  const obstacles = arena.obstacles;
  const surfaces = arena.surfaces;
  // The enemies as the brain sees them (one view each; the target is among them).
  const enemies = [];
  for (const f of Object.values(matchState.fighters)) {
    if (f.team !== me.team && f.hp > 0) {
      enemies.push({
        id: f.id, pos: f.pos, vel: f.vel, hp: f.hp, unit: f.unit,
        lastFireAt: f.lastFireAt, bloom: f.bloom, invulnerableUntil: f.invulnerableUntil,
        chargeStartAt: f.sniperChargeStartAt, chargingAtMe: f.sniperChargeTargetId === me.id
      });
    }
  }
  const opp = enemies.find((v) => v.id === target.id);
  nbBrainTick({
    now, me, pos: me.pos, vel: me.vel, grounded: me.grounded, unit: me.unit,
    opp, enemies,
    // the command side-table entry (matchState.commands[slot] — command.js
    // imports this module, so importing isHideOrdered back would close a cycle)
    cmd: matchState.commands?.[botId] ?? null,
    obstacles, surfaces, grid: navGridFor(arena),
    eyeUp: BOT_LOS_EYE_HEIGHT, muzzleUp: PROJECTILE_MUZZLE_Y_OFFSET,
    mode: matchState.mode, tickMs: TICK_RATE_MS,
    charging: !!me.sniperChargeTargetId,
    // Per-fighter overrides (me.botSDOpts) let the harness A/B two rule sets inside one match.
    sd: me.botSD ? (me.botSDOpts ? { ...BOT_SD, ...me.botSDOpts } : BOT_SD) : null,
    wall: matchState.walls?.[me.id] ?? null,   // (tick.js stage 5)
    clear: makeMuzzleClear(obstacles, surfaces),
    startStep: (dx, dz) => tryStartStep(matchState, me, dx, dz, now, obstacles),
    tickStep: () => tickStep(me, now, obstacles),
    startJump: () => tryStartJump(me, now),
    fire: () => attemptFire(matchState, me, target, now),
    inheritMomentum: (k) => inheritMomentum(me, k),
    // Paths live on matchState._navPaths, NOT on the fighter: the fighter
    // object is serialized into every snapshot.
    navGet: () => (matchState._navPaths ? matchState._navPaths[botId] ?? null : null),
    navSet: (v) => {
      if (v) (matchState._navPaths ??= {})[botId] = v;
      else if (matchState._navPaths) delete matchState._navPaths[botId];
    },
    // (one route search per tick per match)
    searchSlot: () => { if (matchState.hideSearchTick === matchState.tick) return false; matchState.hideSearchTick = matchState.tick; return true; },
    // (the server's per-tick CPU budget — see findHiddenSpot; the sim sets none)
    deadline: () => matchState.searchDeadline ?? 0,
    tape: null
  });
  // Hit-stun parity: the player keeps moving at a reduced speed (the hitting
  // weapon's move-scale, stored on the victim) while stunned rather than
  // freezing — the host's physics, applied to whatever velocity the brain set.
  if (now < me.hitStunUntil) {
    me.vel.x *= me.hitStunScale;
    me.vel.z *= me.hitStunScale;
  }
}
"""
(SIM / 'ai.js').write_text(AI)
print(f'nbrain.js {module.count(chr(10))} lines, ai.js {AI.count(chr(10))} lines')
