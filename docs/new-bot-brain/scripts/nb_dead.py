"""b1018a: THE PLAIN BRAIN'S DEAD CODE DELETED (the first step of the plain-brain rework, PT site).
Deleted in both hosts (shared/src/sim/ai.js and the client mirror main.js), nothing added:
  - the Station rules behind STATION_BOT_RULES (off since 2026-08-05): the mount hold, the perch pull, the
    low-level dwell, and the fields botMountHoldUntil / botLowDwellSince / botLowDwellTickAt;
  - four knobs nothing reads: BOT_FIRE_REACT_MS, BOT_DIRE_SEARCH_MS, BOT_OBSTACLE_AVOID_WEIGHT,
    BOT_ELEV_STEER_WEIGHT, with the stale "Cover-seek" comment;
  - the hide stance's 'nearest' tier (removed 2026-09-27; three branches still read it);
  - the random homing evade in the dispatch (homing is off in every line: the turn is 0 degrees).
Every old string must occur exactly once; a file is written only when all its edits apply.
usage: python3 -I nb_dead.py <sdplay root>"""
import pathlib, sys

ROOT = pathlib.Path(sys.argv[1])

def edit(rel, pairs):
    p = ROOT / rel
    t = p.read_text()
    for old, new in pairs:
        n = t.count(old)
        assert n == 1, f'{rel}: expected exactly one occurrence, found {n}:\n{old[:200]}'
        t = t.replace(old, new)
    p.write_text(t)
    print(f'{rel}: {len(pairs)} edits')

# ---------------------------------------------------------------- shared/src/sim/ai.js
AI = []
AI.append(("""// Projectiles are near-hitscan (500-800 u/s), so a round in flight can't be
// reacted to — the bot reacts to the enemy *firing* instead. Treat the enemy
// as "shooting at me" for this long after their last shot, which covers the
// MG's fast cadence and bridges the gaps between rounds in a burst.
const BOT_FIRE_REACT_MS = 280;
// Cover-seek: how far to look for an obstacle to hide behind, how hard to
// steer toward it, and the largest obstacle footprint still treated as cover
// (anything bigger is an arena boundary wall, which can't be flanked — skip).
// A fresh hit""", "// A fresh hit"))
AI.append(("""// No clear line to the player for this long => enter "dire search": drop all
// range discipline and beeline to the player until a clear line is regained.
const BOT_DIRE_SEARCH_MS = 4000;
""", ""))
AI.append(("const BOT_OBSTACLE_AVOID_WEIGHT = 1.8;\n", ""))
AI.append(("""// STATION-SPECIFIC BOT RULES master switch (2026-08-05): HIDDEN, not
// deleted — the deck-spawn experiment runs with these off. Flip to true to
// re-enable the station perch pull, low-level discouragement dwell, mount
// hold, and descent suppression in one move. Mirrored in client main.js.
const STATION_BOT_RULES = false;
""", ""))
AI.append(("""// Weight of the ledge-seek steering when blended into the kiting vector.
const BOT_ELEV_STEER_WEIGHT = 2.4;
""", ""))
AI.append(("""  //   exposed              -> follow / search a findHiddenSpot route to the
  //                           nearest cell no enemy sees, live and predicted
  //                           eyes first (tier 'all'), then live only, then
  //                           a cell the NEAREST enemy cannot see (tier
  //                           'nearest'); still none -> the plain pursue
  //                           legs move it while the search retries.
""", """  //   exposed              -> follow / search a findHiddenSpot route to the
  //                           nearest cell no enemy sees, live and predicted
  //                           eyes first, then live only; still none -> the
  //                           plain pursue legs move it while the search
  //                           retries.
"""))
AI.append(("""    // Is a route goal still hidden at its tier (live eyes)? (<= 2 LoS tests)
    const hideGoalStillHidden = (goal, tier) => {
      const gEye = { x: goal.x, y: (goal.y ?? 0) + GROUND_BASE_Y + BOT_LOS_EYE_HEIGHT, z: goal.z };
      const count = tier === 'nearest' ? 1 : hideEyes.length;
      for (let k = 0; k < count; k += 1) {
""", """    // Is a route goal still hidden from the live eyes?
    const hideGoalStillHidden = (goal) => {
      const gEye = { x: goal.x, y: (goal.y ?? 0) + GROUND_BASE_Y + BOT_LOS_EYE_HEIGHT, z: goal.z };
      for (let k = 0; k < hideEyes.length; k += 1) {
"""))
AI.append(("      } else if (!hideGoalStillHidden(goal, me.botHideTier)) {\n", "      } else if (!hideGoalStillHidden(goal)) {\n"))
AI.append(("""      // The 'nearest' tier only when the unit is NOT already hidden from
      // the nearest enemy — from a nearest-tier hide that search would just
      // re-issue the next nearest-hidden cell every cadence and the unit
      // would shuffle between neighbours instead of pacing its cover.
""", ""))
AI.append(("""      // the leash, (b) be walkable and (c) keep the unit's eye hidden from
      // every eye of its tier — the predicted eyes too when possible (pass
      // 0), live eyes only as the fallback (pass 1). The current leg is
""", """      // the leash, (b) be walkable and (c) keep the unit's eye hidden from
      // every eye — the predicted eyes too when possible (pass 0), live
      // eyes only as the fallback (pass 1). The current leg is
"""))
AI.append(("""      const paceEyes = hideTier === 'all' ? hideEyes : hideEyes.slice(0, 1);
      const pacePred = hideTier === 'all' ? hidePredEyes : [];
""", ""))
AI.append(("""        for (let k = 0; k < paceEyes.length; k += 1) if (botHasLineOfSight(paceEyes[k], eye, obstacles, surfaces)) return false;
        if (strict) for (let k = 0; k < pacePred.length; k += 1) if (botHasLineOfSight(pacePred[k], eye, obstacles, surfaces)) return false;
""", """        for (let k = 0; k < hideEyes.length; k += 1) if (botHasLineOfSight(hideEyes[k], eye, obstacles, surfaces)) return false;
        if (strict) for (let k = 0; k < hidePredEyes.length; k += 1) if (botHasLineOfSight(hidePredEyes[k], eye, obstacles, surfaces)) return false;
"""))
AI.append(("""      } else if (onHighGround) {
        // STATION MOUNT HOLD (map-keyed, 2026-08-05): for a beat after a
        // fresh mount, skip the descent aid so the bot doesn't yo-yo right
        // back down — the 22-wide track corridor keeps the firing band
        // valid from the deck edge, so hopping down to close a small gap
        // is a needless descent. EXCEPTIONS that still descend: sight lost,
        // or the target pulled well past the band (those need the chase).
        const holdUp = STATION_BOT_RULES && matchState.mapKey === 'station'
          && now < (me.botMountHoldUntil ?? 0)
          && playerHasLoS
          && dist < upperRange + 12;
        if (!holdUp) {
          const exit = findDescentDirection(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, dirX, dirZ);
          if (exit && exit.edgeDist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.5) {
            jumpDirX = exit.toX; jumpDirZ = exit.toZ;
            if (botTryJump(me, now)) jumpThisTick = true;
          }
        }
      } else {
""", """      } else if (onHighGround) {
        const exit = findDescentDirection(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, dirX, dirZ);
        if (exit && exit.edgeDist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.5) {
          jumpDirX = exit.toX; jumpDirZ = exit.toZ;
          if (botTryJump(me, now)) jumpThisTick = true;
        }
      } else {
"""))
AI.append(("""        if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.2) {
          jumpDirX = perch.toX; jumpDirZ = perch.toZ;
          if (botTryJump(me, now)) {
            jumpThisTick = true;
            // STATION MOUNT HOLD: see the onHighGround branch above.
            if (STATION_BOT_RULES && matchState.mapKey === 'station') me.botMountHoldUntil = now + 7000;
          }
        } else if (STATION_BOT_RULES && matchState.mapKey === 'station' && perch
            && (perch.toX * dirX + perch.toZ * dirZ > 0.2 || perch.dist < 12)) {
          // STATION-ONLY PERCH PULL (map-keyed, 2026-08-05 user order):
          // on this one map the decks are the strong positions but they're
          // jump-only (no ramps, so paths never cross them) — steer the
          // approach toward a scanned ledge that's roughly ON THE WAY
          // (within ~78° of the target direction, or already close — 12 covers
          // the track corridor half-width), and the jump above fires when it
          // comes into reach. Weight 0.6
          // keeps the target-pull dominant; every other map skips this
          // branch entirely (behavior byte-identical elsewhere).
          const tx = mx + perch.toX * 0.6;
          const tz = mz + perch.toZ * 0.6;
          const tl = Math.hypot(tx, tz) || 1;
          mx = tx / tl; mz = tz / tl;
        }
      }
""", """        if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.2) {
          jumpDirX = perch.toX; jumpDirZ = perch.toZ;
          if (botTryJump(me, now)) jumpThisTick = true;
        }
      }
"""))
AI.append(("""    // STATION LOW-LEVEL DISCOURAGEMENT (map-keyed, 2026-08-05 user order):
    // fighting on the track level is tolerated only briefly. After ~3 s of
    // continuous Engage time down there, a ramping pull (0 → 0.6 over the
    // next 3 s; the orbit/range discipline stays dominant) drifts the bot
    // toward the nearest mountable deck edge, and the perch jump below
    // completes the mount. Short exchanges and transit are untouched; the
    // continuity check restarts the clock after any gap (state change,
    // death, leaving the low floor). Other maps skip all of it.
    if (STATION_BOT_RULES && matchState.mapKey === 'station' && !onHighGround) {
      const cont = now - (me.botLowDwellTickAt ?? 0) < 250;
      me.botLowDwellTickAt = now;
      if (!cont || me.botLowDwellSince == null) me.botLowDwellSince = now;
      const dwell = now - me.botLowDwellSince;
      if (dwell > 3000) {
        const deck = findHighGroundPerch(me.pos.x, me.pos.z, myFloorY, surfaces, obstacles, BOT_PERCH_SEEK_RADIUS);
        if (deck) {
          const w = Math.min(0.6, ((dwell - 3000) / 3000) * 0.6);
          const px2 = mx + deck.toX * w;
          const pz2 = mz + deck.toZ * w;
          const pl = Math.hypot(px2, pz2) || 1;
          mx = px2 / pl; mz = pz2 / pl;
        }
      }
    }

    // On low ground? Hop onto""", "    // On low ground? Hop onto"))
AI.append(("""        if (botTryJump(me, now)) {
          jumpThisTick = true;
          // STATION MOUNT HOLD: a fresh mount suppresses the pursue descent
          // aid for a beat (see onHighGround branch) so the bot doesn't
          // yo-yo straight back down.
          if (STATION_BOT_RULES && matchState.mapKey === 'station') me.botMountHoldUntil = now + 7000;
        }
""", "        if (botTryJump(me, now)) jumpThisTick = true;\n"))
AI.append(("""          if (botTryJumpSurvival(me, now)) {
            jumpThisTick = true;
            me.botDefenseStuckTicks = 0;
            // STATION MOUNT HOLD: an escape mount also holds the deck.
            if (STATION_BOT_RULES && matchState.mapKey === 'station') me.botMountHoldUntil = now + 7000;
          }
""", """          if (botTryJumpSurvival(me, now)) {
            jumpThisTick = true;
            me.botDefenseStuckTicks = 0;
          }
"""))
AI.append(("""            if (botTryJumpSurvival(me, now)) {
              jumpThisTick = true;
              vaulted = true;
              // STATION MOUNT HOLD: an escape mount also holds the deck.
              if (STATION_BOT_RULES && matchState.mapKey === 'station') me.botMountHoldUntil = now + 7000;
              me.botDefenseStuckTicks = 0;
            }
""", """            if (botTryJumpSurvival(me, now)) {
              jumpThisTick = true;
              vaulted = true;
              me.botDefenseStuckTicks = 0;
            }
"""))
AI.append(("  if (dist > 14 && Math.random() > 0.9) me.evadeHomingUntil = now + 90;\n\n", ""))

# ---------------------------------------------------------------- client/src/main.js (the mirror)
MAIN = []
MAIN.append(("""// Projectiles are near-hitscan (500-800 u/s), so a round in flight can't be
// reacted to — the bot reacts to the enemy *firing* instead. Treat the enemy
// as "shooting at me" for this long after their last shot, which covers the
// MG's fast cadence and bridges the gaps between rounds in a burst.
const BOT_FIRE_REACT_MS = 280;
// Cover-seek: how far to look for an obstacle to hide behind, how hard to
// steer toward it, and the largest obstacle footprint still treated as cover
// (anything bigger is an arena boundary wall, which can't be flanked — skip).
// A fresh hit""", "// A fresh hit"))
MAIN.append(("""// No clear line to the player for this long => enter "dire search": drop all
// range discipline and beeline to the player until a clear line is regained.
const BOT_DIRE_SEARCH_MS = 4000;
""", ""))
MAIN.append(("const BOT_OBSTACLE_AVOID_WEIGHT = 1.8;\n", ""))
MAIN.append(("""// STATION-SPECIFIC BOT RULES master switch (2026-08-05): HIDDEN, not
// deleted — the deck-spawn experiment runs with these off. Flip to true to
// re-enable the station perch pull, low-level discouragement dwell, mount
// hold, and descent suppression in one move. Mirrored in shared ai.js.
const STATION_BOT_RULES = false;
""", ""))
MAIN.append(("""// Weight of the ledge-seek steering when blended into the kiting vector.
const BOT_ELEV_STEER_WEIGHT = 2.4;
""", ""))
MAIN.append(("""  //   exposed              -> follow / search a findHiddenSpot route to the
  //                           nearest cell no enemy sees, live and predicted
  //                           eyes first (tier 'all'), then live only, then
  //                           a cell the NEAREST enemy cannot see (tier
  //                           'nearest'); still none -> the plain pursue
  //                           legs move it while the search retries.
""", """  //   exposed              -> follow / search a findHiddenSpot route to the
  //                           nearest cell no enemy sees, live and predicted
  //                           eyes first, then live only; still none -> the
  //                           plain pursue legs move it while the search
  //                           retries.
"""))
MAIN.append(("""    // Is a route goal still hidden at its tier (live eyes)? (<= 2 LoS tests)
    const hideGoalStillHidden = (goal, tier) => {
      const gEye = { x: goal.x, y: (goal.y ?? 0) + GROUND_BASE_Y + BOT_LOS_EYE_HEIGHT, z: goal.z };
      const count = tier === 'nearest' ? 1 : hideEyes.length;
      for (let k = 0; k < count; k += 1) {
""", """    // Is a route goal still hidden from the live eyes?
    const hideGoalStillHidden = (goal) => {
      const gEye = { x: goal.x, y: (goal.y ?? 0) + GROUND_BASE_Y + BOT_LOS_EYE_HEIGHT, z: goal.z };
      for (let k = 0; k < hideEyes.length; k += 1) {
"""))
MAIN.append(("      } else if (!hideGoalStillHidden(goal, eState.botHideTier)) {\n", "      } else if (!hideGoalStillHidden(goal)) {\n"))
MAIN.append(("""      // The 'nearest' tier only when the unit is NOT already hidden from
      // the nearest enemy — from a nearest-tier hide that search would just
      // re-issue the next nearest-hidden cell every cadence and the unit
      // would shuffle between neighbours instead of pacing its cover.
""", ""))
MAIN.append(("""      // the leash, (b) be walkable and (c) keep the unit's eye hidden from
      // every eye of its tier — the predicted eyes too when possible (pass
      // 0), live eyes only as the fallback (pass 1). The current leg is
""", """      // the leash, (b) be walkable and (c) keep the unit's eye hidden from
      // every eye — the predicted eyes too when possible (pass 0), live
      // eyes only as the fallback (pass 1). The current leg is
"""))
MAIN.append(("""      const paceEyes = hideTier === 'all' ? hideEyes : hideEyes.slice(0, 1);
      const pacePred = hideTier === 'all' ? hidePredEyes : [];
""", ""))
MAIN.append(("""        for (let k = 0; k < paceEyes.length; k += 1) if (botHasLineOfSight(paceEyes[k], eye)) return false;
        if (strict) for (let k = 0; k < pacePred.length; k += 1) if (botHasLineOfSight(pacePred[k], eye)) return false;
""", """        for (let k = 0; k < hideEyes.length; k += 1) if (botHasLineOfSight(hideEyes[k], eye)) return false;
        if (strict) for (let k = 0; k < hidePredEyes.length; k += 1) if (botHasLineOfSight(hidePredEyes[k], eye)) return false;
"""))
MAIN.append(("""      } else if (onHighGround) {
        // STATION MOUNT HOLD (map-keyed, 2026-08-05): for a beat after a
        // fresh mount, skip the descent aid so the bot doesn't yo-yo right
        // back down — the 22-wide track corridor keeps the firing band
        // valid from the deck edge, so hopping down to close a small gap
        // is a needless descent. EXCEPTIONS that still descend: sight lost,
        // or the target pulled well past the band (those need the chase).
        // Mirrored in shared/src/sim/ai.js.
        const holdUp = STATION_BOT_RULES && state.mapKey === 'station'
          && now < (eState.botMountHoldUntil ?? 0)
          && playerHasLoS
          && dist < upperRange + 12;
        if (!holdUp) {
          const exit = findDescentDirection(e.x, e.z, myFloorY, dir.x, dir.z);
          if (exit && exit.edgeDist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.5) {
            jumpDirX = exit.toX; jumpDirZ = exit.toZ;
            if (botStartJump(now)) jumpThisTick = true;
          }
        }
      } else {
""", """      } else if (onHighGround) {
        const exit = findDescentDirection(e.x, e.z, myFloorY, dir.x, dir.z);
        if (exit && exit.edgeDist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.5) {
          jumpDirX = exit.toX; jumpDirZ = exit.toZ;
          if (botStartJump(now)) jumpThisTick = true;
        }
      } else {
"""))
MAIN.append(("""        if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.2) {
          jumpDirX = perch.toX; jumpDirZ = perch.toZ;
          if (botStartJump(now)) {
            jumpThisTick = true;
            // STATION MOUNT HOLD: see the onHighGround branch above.
            if (STATION_BOT_RULES && state.mapKey === 'station') eState.botMountHoldUntil = now + 7000;
          }
        } else if (STATION_BOT_RULES && state.mapKey === 'station' && perch
            && (perch.toX * dir.x + perch.toZ * dir.z > 0.2 || perch.dist < 12)) {
          // STATION-ONLY PERCH PULL (map-keyed, 2026-08-05 user order):
          // on this one map the decks are the strong positions but they're
          // jump-only (no ramps, so paths never cross them) — steer the
          // approach toward a scanned ledge that's roughly ON THE WAY
          // (within ~78° of the target direction, or already close — 12 covers
          // the track corridor half-width), and the jump above fires when it
          // comes into reach. Weight 0.6
          // keeps the target-pull dominant; every other map skips this
          // branch entirely (behavior byte-identical elsewhere).
          // Mirrored in shared/src/sim/ai.js.
          const tx = mx + perch.toX * 0.6;
          const tz = mz + perch.toZ * 0.6;
          const tl = Math.hypot(tx, tz) || 1;
          mx = tx / tl; mz = tz / tl;
        }
      }
""", """        if (perch && perch.dist < BOT_LEDGE_JUMP_REACH && Math.random() > 0.2) {
          jumpDirX = perch.toX; jumpDirZ = perch.toZ;
          if (botStartJump(now)) jumpThisTick = true;
        }
      }
"""))
MAIN.append(("""    // STATION LOW-LEVEL DISCOURAGEMENT (map-keyed, 2026-08-05 user order):
    // fighting on the track level is tolerated only briefly. After ~3 s of
    // continuous Engage time down there, a ramping pull (0 → 0.6 over the
    // next 3 s; the orbit/range discipline stays dominant) drifts the bot
    // toward the nearest mountable deck edge, and the perch jump below
    // completes the mount. Short exchanges and transit are untouched; the
    // continuity check restarts the clock after any gap (state change,
    // death, leaving the low floor). Other maps skip all of it.
    // Mirrored in shared/src/sim/ai.js.
    if (STATION_BOT_RULES && state.mapKey === 'station' && !onHighGround) {
      const cont = now - (eState.botLowDwellTickAt ?? 0) < 250;
      eState.botLowDwellTickAt = now;
      if (!cont || eState.botLowDwellSince == null) eState.botLowDwellSince = now;
      const dwell = now - eState.botLowDwellSince;
      if (dwell > 3000) {
        const deck = findHighGroundPerch(e.x, e.z, myFloorY, BOT_PERCH_SEEK_RADIUS);
        if (deck) {
          const w = Math.min(0.6, ((dwell - 3000) / 3000) * 0.6);
          const px2 = mx + deck.toX * w;
          const pz2 = mz + deck.toZ * w;
          const pl = Math.hypot(px2, pz2) || 1;
          mx = px2 / pl; mz = pz2 / pl;
        }
      }
    }

    // On low ground? Hop onto""", "    // On low ground? Hop onto"))
MAIN.append(("""        if (botStartJump(now)) {
          jumpThisTick = true;
          // STATION MOUNT HOLD: a fresh mount suppresses the pursue descent
          // aid for a beat (see onHighGround branch) so the bot doesn't
          // yo-yo straight back down.
          if (STATION_BOT_RULES && state.mapKey === 'station') eState.botMountHoldUntil = now + 7000;
        }
""", "        if (botStartJump(now)) jumpThisTick = true;\n"))
MAIN.append(("""          if (botStartJump(now, true)) {
            jumpThisTick = true;
            eState.botDefenseStuckTicks = 0;
            // STATION MOUNT HOLD: an escape mount also holds the deck.
            if (STATION_BOT_RULES && state.mapKey === 'station') eState.botMountHoldUntil = now + 7000;
          }
""", """          if (botStartJump(now, true)) {
            jumpThisTick = true;
            eState.botDefenseStuckTicks = 0;
          }
"""))
MAIN.append(("""            if (botStartJump(now, true)) {
              jumpThisTick = true;
              vaulted = true;
              // STATION MOUNT HOLD: an escape mount also holds the deck.
              if (STATION_BOT_RULES && state.mapKey === 'station') eState.botMountHoldUntil = now + 7000;
              eState.botDefenseStuckTicks = 0;
            }
""", """            if (botStartJump(now, true)) {
              jumpThisTick = true;
              vaulted = true;
              eState.botDefenseStuckTicks = 0;
            }
"""))
MAIN.append(("  if (dist > 14 && Math.random() > 0.9) eState.evadeHomingUntil = now + 90;\n\n", ""))
MAIN.append(("const CLIENT_BUILD_TAG = 'b1017h';", "const CLIENT_BUILD_TAG = 'b1018a';"))

README = [(
    "a set of Station-only behaviors was built and field-tested, then parked behind a single master switch (`STATION_BOT_RULES`, off in both sims) once repositioning Station's spawns solved the same problem more cleanly.",
    "a set of Station-only behaviors was built and field-tested, then deleted once repositioning Station's spawns solved the same problem more cleanly.")]

edit('shared/src/sim/ai.js', AI)
edit('client/src/main.js', MAIN)
edit('README.md', README)
