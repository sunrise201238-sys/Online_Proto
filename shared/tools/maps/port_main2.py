"""client/src/main.js of the 0.8.9 line brought up to the PT tree's (2026-10-23): Kurumi's unit block and clip map, the reload
hold and the one hit-stun routine in the player's and the bots' paths, the hit stamp in the state, the build tag — each block
taken from the PT file by its anchor and put into the 0.8.9 file at the same anchor; the PT site's own additions left out.
usage: python3 -I port_main2.py <pt main.js> <0.8.9 main.js>   (edits the second in place)"""
import sys
ptf, vf = sys.argv[1:3]
pt = open(ptf, encoding='utf-8').read(); v = open(vf, encoding='utf-8').read()
def once(t, s, what): assert t.count(s) == 1, (what, s[:70], t.count(s)); return t.index(s)
def between(t, start, end):
    i = once(t, start, 'start'); j = t.index(end, i) + len(end); return t[i:j]
def rep(old, new, what):
    global v; once(v, old, what); v = v.replace(old, new)
# 1. Kurumi's unit block: from her comment to the UNIT_DATA closing, in place of the closing after unit15
TAIL = "    stun: { ms: 50, moveScale: 0.50 }\n  }\n};\n"
blk = between(pt, "  // Kurumi / UMP45 (user 2026-10-23", "\n  }\n};\n")   # (her block ends on her own stun line, whatever it says)
yu_tail = "    reloadMs: 1500,\n    autoReload: false,\n" + TAIL   # (Yuuka's: the last block of the 0.8.9 file)
rep(yu_tail, yu_tail[:-len("  }\n};\n")] + "  },\n" + blk, 'unit15 tail')
# 2. her clip map, after Yuuka's
yk = "  yuuka: { file: 'models/yuuka', height: UNIT_SPRITE_HEIGHT, clips: MODEL_CLIPS_DEFAULT },\n"
mdl = between(pt, "  // (Kurumi's form,", "    reload: { name: 'Normal01_Reload', speed: 1, fit: 'reload', once: true } } },\n")
rep(yk, yk + mdl, 'yuuka model line')
# 3. the shared imports
rep("  getGeneratedObstacles\n} from '@gvg/shared/src/sim/index.js';", "  getGeneratedObstacles,\n  reloadHolds,\n  applyHitStun\n} from '@gvg/shared/src/sim/index.js';", 'imports')
# 4. the player's reload hold (updatePlayer), as in the PT file
hold = between(pt, "  const planted = now < stepState.plantUntil;\n  // The reload hold", "  const reloadHeld = reloadHolds(state.player.unit, stepState, now);\n")
rep("  const planted = now < stepState.plantUntil;\n", hold, 'planted line')
rep("  input.boost = !planted && (input.boostHeld || input.sprintLocked);   // (no dash out of a plant)",
    "  input.boost = !planted && !reloadHeld && (input.boostHeld || input.sprintLocked);   // (no dash out of a plant, nor out of a held reload)", 'boost line')
rep("    state.player.body.velocity.x = canInputMove && !planted ? move.x * speed * hitStunScale : 0;\n    state.player.body.velocity.z = canInputMove && !planted ? move.z * speed * hitStunScale : 0;",
    "    state.player.body.velocity.x = canInputMove && !planted && !reloadHeld ? move.x * speed * hitStunScale : 0;\n    state.player.body.velocity.z = canInputMove && !planted && !reloadHeld ? move.z * speed * hitStunScale : 0;", 'velocity lines')
# 5. the bot's reload hold (updateEnemy)
bi = once(pt, "  // The reload hold (shared actions.js reloadHolds; mirrors ai.js)", 'bot hold'); bh = pt[bi:pt.index("\n", pt.index("\n", bi) + 1) + 1]   # (the comment line and the line after it)
rep("  if (now < eState.hitStunUntil) {\n    mech.body.velocity.x *= eState.hitStunScale;", bh + "  if (now < eState.hitStunUntil) {\n    mech.body.velocity.x *= eState.hitStunScale;", 'enemy hit-stun')
# 6. the one hit-stun routine at the four offline hit paths
for old, new in [
  ("        if (now >= tgtState.hitStunUntil || p.hitStunScale < tgtState.hitStunScale) {\n          tgtState.hitStunScale = p.hitStunScale;\n          tgtState.hitStunUntil = now + p.hitStunMs;\n        }\n", "        applyHitStun(tgtState, p.target.unit, p.hitStunMs, p.hitStunScale, now);\n"),
  ("      if (now >= _ts.hitStunUntil || p.hitStunScale < _ts.hitStunScale) {\n        _ts.hitStunScale = p.hitStunScale;\n        _ts.hitStunUntil = now + p.hitStunMs;\n      }\n", "      applyHitStun(_ts, p.target.unit, p.hitStunMs, p.hitStunScale, now);\n"),
  ("      if (now >= st.hitStunUntil || b.hitStunScale < st.hitStunScale) {\n        st.hitStunScale = b.hitStunScale;\n        st.hitStunUntil = now + b.hitStunMs;\n      }\n", "      applyHitStun(st, m.unit, b.hitStunMs, b.hitStunScale, now);\n"),
  ("      if (now >= tst.hitStunUntil || (u.stun?.moveScale ?? 0.25) < tst.hitStunScale) {\n        tst.hitStunScale = u.stun?.moveScale ?? 0.25;\n        tst.hitStunUntil = now + (u.stun?.ms ?? 100);\n      }\n", "      applyHitStun(tst, t.unit, u.stun?.ms ?? 100, u.stun?.moveScale ?? 0.25, now);\n")]:
    rep(old, new, 'hit-stun site')
# 7. the hit stamp in the client's state, 8. the build tag
rep("      hitStunUntil: 0,\n", "      hitStunUntil: 0,\n      lastHitAt: 0,\n", 'state init')
rep("const CLIENT_BUILD_TAG = 'b1023m';", "const CLIENT_BUILD_TAG = 'b1023n';", 'build tag')
open(vf, 'w', encoding='utf-8').write(v); print('ported', vf)
