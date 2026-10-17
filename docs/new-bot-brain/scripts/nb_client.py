"""b1018b, the client side: updateEnemy becomes the bot host of the shared plain brain (nbrain.js); the client's
copies of the knobs and helpers go. Every marker must occur exactly once. usage: python3 -I nb_client.py <sdplay root>"""
import pathlib, re, sys

P = pathlib.Path(sys.argv[1]) / 'client/src/main.js'
t = P.read_text()

def rep(old, new, n=1):
    global t
    c = t.count(old)
    assert c == n, f'expected {n}, found {c}:\n{old[:200]}'
    t = t.replace(old, new)

def cut_out(start, end, new=''):
    """remove [start, end) — both markers must occur once"""
    global t
    assert t.count(start) == 1 and t.count(end) == 1, f'markers: {t.count(start)} / {t.count(end)}\n{start[:80]}\n{end[:80]}'
    a = t.index(start); b = t.index(end)
    assert a < b
    t = t[:a] + new + t[b:]

# ---- imports: the brain's module in, the Sudden Death brain's direct import out (the brain calls it)
rep("import { sdBrainTick } from '@gvg/shared/src/sim/sdbrain.js';\n",
    "import { nbBrainTick, botHasLineOfSight, resetBotHideFields, BOT_TARGET_BLOCKED_PENALTY, BOT_TARGET_SWITCH_MARGIN } from '@gvg/shared/src/sim/nbrain.js';\n")

# ---- the mirrored knobs and helpers
cut_out("// --- Bot tactical-sprint tunables (mirrored in shared/src/sim/ai.js) ---\n", "const BOT_GLINT_REACT_FAST_CHANCE = 0.5;\n")
rep("const BOT_GLINT_REACT_FAST_CHANCE = 0.5;\n\n", "")
cut_out("// ===== Universal bot AI helpers =====\n", "const BOT_LOS_EYE_HEIGHT = 1.6;\n",
        "// ===== The bot host's own pieces — the brain is shared/src/sim/nbrain.js =====\n")
cut_out("// RELOAD HIDE (the 2026-08-08 cover reload, re-based on the Hide stance by\n", "// Frame stamp of the last hidden-spot search — the offline twin of\n")
cut_out("// Null every hide-order scratch field on a mech state (the shared brain\n", "// Repulsion vector from blocking obstacles within `radius` of (px, py, pz).\n")
cut_out("// Repulsion vector from blocking obstacles within `radius` of (px, py, pz).\n", "// Can the SHOT actually land? The fire gate has to test the line the BULLET\n")
cut_out("// Burst size for continuous-fire weapons (spreadCount === 1). Units with a\n", "// Inline jump bookkeeping for the bot — mirrors the gating the player jump\n")
cut_out("// Scan for the nearest walkable surface whose lip sits a jump-height above\n", "// DEATH REPORT (owner 2026-10-15): the Sudden Death brain's tape (see the\n")

# ---- the jump: the mechanic stays here, the funding policy is the brain's
rep("""// Inline jump bookkeeping for the bot — mirrors the gating the player jump
// uses (boost cost + cooldown) plus the bot's extra BOT_SPRINT_MIN_BOOST
// margin so it never jumps itself completely dry. Returns true if a jump
// started this tick.
function botStartJump(now, survival = false) {
  const eState = state.enemy.state;
  const jumpBoostCost = state.enemy.unit.jumpBoostCost ?? JUMP_BOOST_COST;
  if (!state.enemy.grounded || eState.airborne) return false;
  if (now < eState.jumpCooldownUntil) return false;
  // Jump funding respects the strategic reserve (falls back to cost + floor
  // if the reserve is ever tuned below that). SURVIVAL jumps (the Defense
  // hop/vault, 2026-08-05) fire from the flat MANDATED tier (owner
  // 2026-08-22: 60, shared with commanded-travel route jumps — was raw
  // cost + sprint floor 56) — same doctrine as the other survival
  // exemptions (Defense sprints to the hard floor, anti-glint dodge at raw
  // step cost). Discretionary jumps keep the reserve gate.
  // Mirrored in shared/src/sim/ai.js (botTryJumpSurvival).
  const funded = survival
    ? MANDATED_JUMP_MIN_BOOST
    : Math.max(BOT_TRAVEL_SPRINT_FLOOR, jumpBoostCost + BOT_SPRINT_MIN_BOOST);
  if (eState.boost < funded) return false;
  eState.boost = Math.max(0, eState.boost - jumpBoostCost);
""", """// The bot's jump mechanic — the player jump's gating (raw boost cost +
// cooldown) and bookkeeping on the aliased state.enemy. The brain's funding
// policy (the strategic reserve, the survival tier) sits in nbrain.js
// (botTryJump / botTryJumpSurvival) and calls this. Returns true if a jump
// started this frame.
function botStartJump(now) {
  const eState = state.enemy.state;
  const jumpBoostCost = state.enemy.unit.jumpBoostCost ?? JUMP_BOOST_COST;
  if (!state.enemy.grounded || eState.airborne) return false;
  if (now < eState.jumpCooldownUntil) return false;
  if (eState.boost < jumpBoostCost) return false;
  eState.boost = Math.max(0, eState.boost - jumpBoostCost);
""")

# ---- the two sight tests outside the brain use the shared rule with the arena
rep("""      { x: e.body.position.x, y: e.body.position.y + BOT_LOS_EYE_HEIGHT, z: e.body.position.z }
    );
""", """      { x: e.body.position.x, y: e.body.position.y + BOT_LOS_EYE_HEIGHT, z: e.body.position.z },
      arenaObstacles, arenaSurfaces
    );
""")
rep("""    { x: bp.x, y: bp.y, z: bp.z }
  );
""", """    { x: bp.x, y: bp.y, z: bp.z },
    arenaObstacles, arenaSurfaces
  );
""")

# ---- the host replaces updateEnemy
HOST = """// ===== THE BOT HOST, CLIENT SIDE (owner 2026-10-17) =====
// The brain is the shared module (nbrain.js — the Health Point brain with
// the Sudden Death brain inside it), one brain for the server and the
// client. This host hands it the unit's body, its enemies (the true
// fighters: the player and any 2v2 enemy), the arena and the body's
// actions, and runs the client's own physics after it: the hover floor,
// the momentum, the hit-stun slowdown, the boost tick. runBotAIForMech
// aliases state.enemy / state.player to drive any bot mech.
const botMechIds = new WeakMap();
let botMechSeq = 0;
function botMechId(m) {
  let id = botMechIds.get(m);
  if (!id) { botMechSeq += 1; id = `m${botMechSeq}`; botMechIds.set(m, id); }
  return id;
}
// An enemy as the brain sees it: the body centre, the live velocity, the gun's
// clocks. (The mirror stamps lastFireAt at spawn for the cooldown clock — a
// shot is only "heard" after that stamp.)
function botEnemyView(f) {
  const st = f.state, b = f.body.position;
  return {
    id: botMechId(f), pos: { x: b.x, y: b.y, z: b.z }, vel: f.body.velocity, hp: st.hp, unit: f.unit ?? {},
    lastFireAt: ((st.lastFireAt ?? -1e9) > (st.fireInitAt ?? -1e9)) ? st.lastFireAt : -1e9,
    bloom: st.bloom ?? 0, invulnerableUntil: st.invulnerableUntil,
    chargeStartAt: st.sniperChargeStartAt, chargingAtMe: st.sniperChargeTarget === state.enemy
  };
}
// The command entry the brain reads and writes, over the mech's own fields
// (the diorama HUD reads mech.cmdMove / cmdLock / cmdHide directly).
function botCmdView(m) {
  return {
    get hide() { return m.cmdHide; }, set hide(v) { m.cmdHide = v; },
    get hideAuto() { return m.cmdHideAuto; }, set hideAuto(v) { m.cmdHideAuto = v; },
    get move() { return m.cmdMove; }, set move(v) { m.cmdMove = v; },
    get lockTargetId() { return m.cmdLock; }, set lockTargetId(v) { m.cmdLock = v; }
  };
}
// The step's lerp (mirrors the player's step block in updatePlayer): while
// mid-step the lerp owns position / velocity / action and the boost ticks as
// a step; the first frame after it ends pays out the queued momentum.
function botTickStep(mech, now) {
  const st = mech.state;
  if (now <= (st.stepUntil || 0)) {
    const span = Math.max(1, st.stepUntil - st.stepStartAt);
    const progress = THREE.MathUtils.clamp((now - st.stepStartAt) / span, 0, 1);
    const targetX = THREE.MathUtils.lerp(st.stepFromX, st.stepToX, progress);
    const targetZ = THREE.MathUtils.lerp(st.stepFromZ, st.stepToZ, progress);
    // Bonk: the next lerp point lands inside an obstacle. Halt the dodge here for
    // the rest of the step — collapse the lerp path to this spot so a later point
    // on the FAR side of a thin wall can't tunnel the unit through. The step is
    // NOT ended early, so the animation + i-frames run the full duration.
    if (!unitOverlapsObstacle(targetX, mech.body.position.y, targetZ)) {
      mech.body.position.x = targetX;
      mech.body.position.z = targetZ;
    } else {
      st.stepFromX = mech.body.position.x; st.stepToX = mech.body.position.x;
      st.stepFromZ = mech.body.position.z; st.stepToZ = mech.body.position.z;
    }
    mech.body.velocity.x = 0;
    mech.body.velocity.z = 0;
    st.action = 'step';
    updateBoost(mech, now, 'step');
  } else if ((st.stepUntil || 0) > 0) {
    st.stepUntil = 0;
    st.momentumVX += st.queuedMomentumVX || 0;
    st.momentumVZ += st.queuedMomentumVZ || 0;
    st.queuedMomentumVX = 0;
    st.queuedMomentumVZ = 0;
  }
}
function updateEnemy(now) {
  const mech = state.enemy, eState = mech.state;
  if (!offlineNavGrid) offlineNavGrid = buildNavGrid(arenaObstacles, arenaSurfaces);
  const myTeam = getTeamOf(mech);
  const enemies = [];
  for (const f of (_botTrueFighters ?? getAllFighters())) {
    if (!f || f === mech || f.state.hp <= 0 || getTeamOf(f) === myTeam) continue;
    enemies.push(botEnemyView(f));
  }
  const targetId = botMechId(state.player);
  const opp = enemies.find((v) => v.id === targetId) ?? botEnemyView(state.player);
  // Offline works in root space: root = body + modelYOffset; the eye and the
  // muzzle sit BOT_LOS_EYE_HEIGHT / BOT_MUZZLE_ABOVE_ROOT above the root.
  const rootUp = mech.modelYOffset ?? 2.35;
  const b = mech.body.position;
  const ran = nbBrainTick({
    now, me: eState, pos: { x: b.x, y: b.y, z: b.z }, vel: mech.body.velocity, grounded: mech.grounded, unit: mech.unit ?? {},
    opp, enemies, cmd: botCmdView(mech),
    obstacles: arenaObstacles, surfaces: arenaSurfaces, grid: offlineNavGrid,
    eyeUp: rootUp + BOT_LOS_EYE_HEIGHT, muzzleUp: rootUp + BOT_MUZZLE_ABOVE_ROOT,
    mode: state.mode, tickMs: 16,
    charging: !!eState.sniperChargeTarget,
    sd: state.suddenDeathActive ? BOT_SD : null,
    wall: mech.wallTouch ?? null,   // (physics' note from the last frame — resolveUnitObstacleCollisions)
    clear: botShotCanLand,
    startStep: (dx, dz) => sdBotStartStep(mech, dx, dz, now),
    tickStep: () => botTickStep(mech, now),
    startJump: () => botStartJump(now),
    fire: () => attemptFire(mech, state.player, now),
    inheritMomentum: (k) => inheritMomentum(mech, k),
    navGet: () => eState.botNav ?? null,
    navSet: (v) => { eState.botNav = v; },
    // (one route search per frame across every driven unit)
    searchSlot: () => { if (botHideSearchFrameAt === now) return false; botHideSearchFrameAt = now; return true; },
    // (a search gets SD_FRAME_SEARCH_MS of this frame; what is left parks in botSDSearchJob and continues next frame)
    deadline: () => performance.now() + SD_FRAME_SEARCH_MS,
    // DEATH REPORT TAPE: one line per 100 ms, the last 8 s kept; printed the frame the unit dies (sdDeathReport) or on demand (window.__SD_REPORT())
    tape: (row) => { const tape = eState.botSDTape ?? (eState.botSDTape = []); tape.push(row); if (tape.length > 80) tape.splice(0, tape.length - 80); }
  });
  if (ran === 'locked') { updateBoost(mech, now, 'shoot'); return; }
  if (ran === 'step') return;   // (the step's own boost update ran in botTickStep)
  if (mech.grounded && now > eState.hoverUntil && eState.action !== 'jump') {
    mech.body.velocity.y = 0;
  }
  applyMomentum(mech);
  // Hit-stun parity: the player keeps moving at a reduced speed (the hitting
  // weapon's move-scale, stored on the victim) while stunned rather than
  // freezing. Applied AFTER momentum so sprint + momentum scale together,
  // matching the player's velocity exactly.
  if (now < eState.hitStunUntil) {
    mech.body.velocity.x *= eState.hitStunScale;
    mech.body.velocity.z *= eState.hitStunScale;
  }
  if (ran !== 'stepping') updateBoost(mech, now, eState.action);   // (the step's own update ran in botTickStep)
}

"""
cut_out("function updateEnemy(now) {\n", "// How long the reticle stays red after each enemy shot. Re-armed on every\n", HOST)

rep("const CLIENT_BUILD_TAG = 'b1018a';", "const CLIENT_BUILD_TAG = 'b1018b';")

# ---- imports from the shared index that nothing reads any more
head_end = t.index("} from '@gvg/shared/src/sim/index.js';")
head = t[:head_end]; rest = t[head_end:]
code = re.sub(r'//[^\n]*', '', rest)
removed = []
for name in re.findall(r'^  ([A-Za-z_][A-Za-z0-9_]*)(?: as [A-Za-z_]+)?,?\n', head, re.M):
    alias = re.search(r'^  ' + re.escape(name) + r' as ([A-Za-z_]+)', head, re.M)
    used = alias.group(1) if alias else name
    if not re.search(r'\b' + re.escape(used) + r'\b', code):
        head = re.sub(r'^  ' + re.escape(name) + r'(?: as [A-Za-z_]+)?,?\n', '', head, count=1, flags=re.M)
        removed.append(name)
t = head + rest
P.write_text(t)
print('client host in; shared-index imports dropped:', removed)
