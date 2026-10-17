"""b1019a, the hosts and the deletions: nbrain.js replaced by the one-brain tick; ai.js / main.js / command.js /
state.js follow; the bloom gate and its unit fields go; the tests of the deleted behaviours go, the hide-order tests
read the brain's own state. usage: python3 -I nb_hosts.py <scratchpad> <sdplay root>"""
import pathlib, re, sys

S = pathlib.Path(sys.argv[1]); ROOT = pathlib.Path(sys.argv[2])

def edit(rel, pairs, regex=()):
    p = ROOT / rel
    t = p.read_text()
    for old, new in pairs:
        n = t.count(old)
        assert n == 1, f'{rel}: expected one occurrence, found {n}:\n{old[:200]}'
        t = t.replace(old, new)
    for pat, new, n in regex:
        t, c = re.subn(pat, new, t, flags=re.M)
        assert c == n, f'{rel}: regex {pat!r} expected {n}, replaced {c}'
    p.write_text(t)
    print(f'{rel}: {len(pairs) + len(regex)} edits')

def cut(rel, start, end, new=''):
    p = ROOT / rel
    t = p.read_text()
    assert t.count(start) == 1 and t.count(end) == 1, f'{rel}: markers {t.count(start)} / {t.count(end)}'
    a = t.index(start); b = t.index(end); assert a < b
    p.write_text(t[:a] + new + t[b:])
    print(f'{rel}: cut {b - a} chars')

# ---- the tick
(ROOT / 'shared/src/sim/nbrain.js').write_text((S / 'nbrain_b1019a.js').read_text())
print('nbrain.js: the one-brain tick')

# ---- the server host
edit('shared/src/sim/ai.js', [
    ("""// THE BOT HOST, SERVER SIDE. The brain is shared/src/sim/nbrain.js (the
// Health Point brain, with the Sudden Death brain sdbrain.js inside it); this
""", """// THE BOT HOST, SERVER SIDE. The brain is shared/src/sim/sdbrain.js inside
// the tick shared/src/sim/nbrain.js (one brain, both modes, both hosts); this
"""),
    ("    eyeUp: BOT_LOS_EYE_HEIGHT, muzzleUp: PROJECTILE_MUZZLE_Y_OFFSET,\n", "    muzzleUp: PROJECTILE_MUZZLE_Y_OFFSET,\n"),
    ("    mode: matchState.mode, tickMs: TICK_RATE_MS,\n", "    tickMs: TICK_RATE_MS,\n"),
    ("    sd: me.botSD ? (me.botSDOpts ? { ...BOT_SD, ...me.botSDOpts } : BOT_SD) : null,\n", "    sd: me.botSDOpts ? { ...BOT_SD, ...me.botSDOpts } : BOT_SD,\n"),
])

# ---- the client host
edit('client/src/main.js', [
    ("import { nbBrainTick, botHasLineOfSight, resetBotHideFields, BOT_TARGET_BLOCKED_PENALTY, BOT_TARGET_SWITCH_MARGIN } from",
     "import { nbBrainTick, botHasLineOfSight, BOT_TARGET_BLOCKED_PENALTY, BOT_TARGET_SWITCH_MARGIN } from"),
    ("""  // The eye is BOT_LOS_EYE_HEIGHT above the body centre, as online (owner
  // 2026-10-17; the mirror had it above the ROOT, 2.35 higher). The muzzle
  // is BOT_MUZZLE_ABOVE_ROOT above the root (root = body + modelYOffset), the
  // same point as the sim's PROJECTILE_MUZZLE_Y_OFFSET above the body.
""", """  // The muzzle (the brain's one eye) is BOT_MUZZLE_ABOVE_ROOT above the root
  // (root = body + modelYOffset), the same point as the sim's
  // PROJECTILE_MUZZLE_Y_OFFSET above the body.
"""),
    ("    eyeUp: BOT_LOS_EYE_HEIGHT, muzzleUp: (mech.modelYOffset ?? 2.35) + BOT_MUZZLE_ABOVE_ROOT,\n", "    muzzleUp: (mech.modelYOffset ?? 2.35) + BOT_MUZZLE_ABOVE_ROOT,\n"),
    ("    mode: state.mode, tickMs: 16,\n", "    tickMs: 16,\n"),
    ("    sd: state.suddenDeathActive ? BOT_SD : null,\n", "    sd: BOT_SD,\n"),
    ("  if (ran === 'step') return;   // (the step's own boost update ran in botTickStep)\n", ""),
    ("    get hideAuto() { return m.cmdHideAuto; }, set hideAuto(v) { m.cmdHideAuto = v; },\n", ""),
    ("""  return st.botState === 'defense'
    || !!st.botCH                          // COVER HIDE (owner 2026-09-26): the hit reflex of an ordered unit
""", """  return now < (st.botDodgeUntil ?? 0)   // the anti-glint dodge's run
    || st.botSDReact != null               // THE REACTION, THE RETREAT, an escape's crossing legs
"""),
    ("      if (m.state.botHideHold != null) resetBotHideFields(m.state);\n", ""),
    ("const CLIENT_BUILD_TAG = 'b1018c';", "const CLIENT_BUILD_TAG = 'b1019a';"),
], regex=[
    (r'^\s*machineBurstRemaining: 0,\n', '', 1),
    (r'^\s*botSuppressRemaining: 0,.*\n', '', 1),
    (r'^\s*botHoldDist: 0,.*\n', '', 1),
    (r'^\s*state\.player\.state\.machineBurstRemaining = 0;\n', '', 1),
])

# ---- the command layer: the reflexes it yields to, the automatic hide gone
edit('shared/src/sim/command.js', [
    ("""//   HIDE STANCE — (owner 2026-09-26) cmd.hide: the Hide stance. While it
//                 stands, tickBot's HIDE block owns the legs (break every
//                 enemy's line of sight, pace the cover, slip away from a
//                 closing enemy; fire back only from where it stands — see
//                 ai.js). setStance(true) wipes the move order and the lock;
//                 a move order or force lock that LANDS releases the stance
//                 again (owner 2026-09-26), as do clearCommands and
//                 setStance(false). A manual reload of BOT_RELOAD_HIDE_MIN_MS
//                 or more enters it automatically (hideAuto, ai.js tickBot)
//                 and leaves it when the reload completes; a manual stance or
//                 a landed order clears hideAuto. tickBot reads
//                 the flag straight off matchState.commands[slot].hide: this
//                 module imports ai.js (navGridFor), so ai.js importing
//                 isHideOrdered back would close an import cycle.
""", """//   HIDE STANCE — (owner 2026-09-26) cmd.hide: the Hide stance. While it
//                 stands the brain's hold is on (nbrain.js: nothing is
//                 bought — no attacks, no approach, no relocation; the wait
//                 in cover and the escape only; it fires back only from
//                 where it stands). setStance(true) wipes the move order
//                 and the lock; a move order or force lock that LANDS
//                 releases the stance again (owner 2026-09-26), as do
//                 clearCommands and setStance(false). The brain reads the
//                 flag off its host's cmd entry (matchState.commands[slot]).
"""),
    ("  if (!cmd) cmd = matchState.commands[slot] = { move: null, lockTargetId: null, orbitFlip: false, hide: false, hideAuto: false };\n",
     "  if (!cmd) cmd = matchState.commands[slot] = { move: null, lockTargetId: null, orbitFlip: false, hide: false };\n"),
    ("  cmd.hideAuto = false;   // a manual stance, either way, is never released by a reload ending\n", ""),
    (" cmd.hide = false; cmd.hideAuto = false; return; }", " cmd.hide = false; return; }"),
    ("""  return f.botState === 'defense'
    || f.botCH != null                     // COVER HIDE (owner 2026-09-26): the hit reflex of an ordered unit
""", """  return now < (f.botDodgeUntil ?? 0)    // the anti-glint dodge's run
    || f.botSDReact != null                // THE REACTION, THE RETREAT, an escape's crossing legs
"""),
], regex=[(r'^ *cmd\.hideAuto = false;\n', '', 4)])

# ---- the snapshot: every bot carries the brain's scratch now
edit('shared/src/sim/state.js', [
    ("      if (!f.botSD) { fighters[id] = f; continue; }\n", "      if (!f.botControlled) { fighters[id] = f; continue; }\n"),
    ("      // but not the Sudden Death brain's scratch (botSD*: ~50 fields with\n", "      // but not the brain's scratch (botSD*: ~50 fields with\n"),
], regex=[
    (r'^\s*botSuppressRemaining: 0,.*\n', '', 1),
    (r'^\s*botHoldDist: 0,.*\n', '', 1),
    (r'^\s*machineBurstRemaining: 0,\n', '', 1),
])

# ---- the bloom gate: the brain's trigger is the only trigger
cut('shared/src/sim/bloom.js', "// Bot fire-gate line for a cone of full angle `spread` (owner 2026-09-22):\n", "// Standing-still tracking (owner 2026-09-21).")
edit('shared/src/sim/bloom.js', [
    ("import { SURE_HIT_WIDTH, BOT_GATE_WIDTH_AUTO, BOT_SUPPRESS_BURST, BLOOM_STILL_SPEED, BLOOM_STILL_DWELL_MS } from './constants.js';",
     "import { SURE_HIT_WIDTH, BLOOM_STILL_SPEED, BLOOM_STILL_DWELL_MS } from './constants.js';"),
])
cut('shared/src/sim/constants.js', "// Bot fire-gate line (owner 2026-09-22: \"33% for the auto weapons, 100% for\n", "// Standing-still accuracy (owner 2026-09-21): a fighter that has been on the\n")
edit('shared/src/sim/constants.js', [], regex=[(r'^\s*bot(FireCap|GateWidth|SuppressBurst):.*\n', '', 19)])
edit('shared/src/sim/index.js', [
    ("botGateDistance, botMayFire, botNoteShot, botClearFireRule, ", ""),
])

# ---- the tests of the deleted behaviours
cut('shared/test/bloom.test.js', "// Bot harness: p2 is the bot, p1 the pinned target at `dist` units.\n", "test('botMayFire state machine', () => {")
p = ROOT / 'shared/test/bloom.test.js'
t = p.read_text()
t = t[:t.index("test('botMayFire state machine', () => {")]
t = t.replace("test('sure-hit closed form and the bot gate', () => {", "test('sure-hit closed form', () => {")
t = t.replace("  createMatchState, tickMatch, tickBot, emptyInput, TICK_RATE_MS, TICK_DT, UNIT_DATA, BOT_GATE_WIDTH_AUTO,\n  effectiveSpread, bloomAfterShot, bloomAfterTime, bloomFraction, sureHitDistance, withinSureHit, botGateDistance, botMayFire\n",
              "  createMatchState, tickMatch, emptyInput, TICK_RATE_MS, TICK_DT, UNIT_DATA,\n  effectiveSpread, bloomAfterShot, bloomAfterTime, bloomFraction, sureHitDistance, withinSureHit\n")
p.write_text(t.rstrip('\n') + '\n')
(ROOT / 'shared/test/travel_sprint.test.js').unlink()
print('bloom.test.js: the gate tests gone; travel_sprint.test.js gone')

# ---- the command tests: the deleted behaviours go, the hide order reads the brain
p = ROOT / 'shared/test/command.test.js'
t = p.read_text()
def drop_test(title):
    global t
    a = t.index(f"test('{title}'")
    b = t.find("\ntest(", a + 1)
    t = t[:a] + (t[b + 1:] if b >= 0 else '')
for title in [
    'hide order: an enemy closing in makes the hider slip to a farther hidden cell before it is seen',
    'hide order: a fresh hit while hidden-ordered never enters Defense (and does without the order)',
    'reload hide: a manual reload of 3 s+ enters the Hide stance (wiping orders) and leaves it when the reload completes',
    'reload hide: a manual Hide survives the reload end; an order during the reload releases it for the rest of it',
    'reload under a move order: a cover hide bound to the order — the order stays, the unit hides for the whole reload and resumes after; a new order takes over at once',
    'reload hide: a bot without a command entry (an enemy) runs the behaviour off botReloadHide alone',
    'no cover anywhere: a hidden-ordered unit falls back to Defense on a fresh hit (Plain Field)',
    'a hit under a move order runs Defense (the hit-triggered cover hide was retired 2026-09-27); the order stands',
    'reload cover hide: a travelling unit skips the in-area tier; no cover anywhere gives the reload up (Plain Field)',
]: drop_test(title)
def rep(old, new, n=1):
    global t
    c = t.count(old); assert c == n, f'command.test.js: expected {n}, found {c}:\n{old[:160]}'
    t = t.replace(old, new)
rep("""// Fight/Hide stance order (owner 2026-09-26): the command side-table
// semantics, the hide behaviour in tickBot (hidden from every enemy, then
// pacing the cover and slipping away from a closing enemy; Defense
// suppressed; clean resume on Fight) and the cost of
// the hidden-spot search.
""", """// Fight/Hide stance order (owner 2026-09-26): the command side-table
// semantics, the hide behaviour of the brain under its hold (hidden from
// every enemy, then pacing the cover — THE WAIT; re-hiding when exposed —
// THE ESCAPE; clean resume on Fight) and the cost of the hidden-spot search.
""")
# the brain's "hidden and settled": THE WAIT stands
rep("const hiddenFrom = (arena, me, enemy) =>\n", "const waiting = (f) => f.botSDPlan?.kind === 'wait';\nconst hiddenFrom = (arena, me, enemy) =>\n")
rep("    if (hiddenFromBoth() && m.fighters.p1.botHideHold === true) { hiddenAtMs = now - t0; break; }\n",
    "    if (hiddenFromBoth() && waiting(m.fighters.p1)) { hiddenAtMs = now - t0; break; }\n")
rep("""  assert.ok(hiddenAtMs != null, 'the hider never broke both lines of sight within 10 s');
  assert.equal(m.fighters.p1.botHideTier, 'all');
""", """  assert.ok(hiddenAtMs != null, 'the hider never broke both lines of sight within 10 s');
""")
rep("""    assert.equal(f.botHidePath, null, 'no route while pacing');
    assert.equal(f.botHideHold, true, 'hidden flag stays up while pacing');
""", """    assert.equal(waiting(f), true, 'the wait stands while pacing');
""")
rep("""  for (let i = 0; i < 10000 / TICK_RATE_MS && !(hiddenFromBoth() && m.fighters.p1.botHideHold); i += 1) step();
  assert.ok(hiddenFromBoth(), 'precondition: hidden first');
  const firstSpot""", """  for (let i = 0; i < 10000 / TICK_RATE_MS && !(hiddenFromBoth() && waiting(m.fighters.p1)); i += 1) step();
  assert.ok(hiddenFromBoth(), 'precondition: hidden first');
  const firstSpot""")
rep("    if (hiddenFromBoth() && m.fighters.p1.botHideHold === true) { rehiddenAtMs = now - t0; break; }\n",
    "    if (hiddenFromBoth() && waiting(m.fighters.p1)) { rehiddenAtMs = now - t0; break; }\n")
rep("""test('hide order: clearing the order (Fight) resumes normal movement within 2 s and nulls the hide scratch', () => {
  const { m, step, hiddenFromBoth } = streetsHideFixture();
  setStance(m, 'p1', true);
  for (let i = 0; i < 10000 / TICK_RATE_MS && !(hiddenFromBoth() && m.fighters.p1.botHideHold); i += 1) step();
  assert.ok(hiddenFromBoth(), 'precondition: hidden and pacing');
  for (let i = 0; i < 20; i += 1) step();
  assert.equal(m.fighters.p1.botHideHold, true);
  assert.equal(setStance(m, 'p1', false), true);
  step();
  assert.equal(m.fighters.p1.botHideHold, null, 'the hide scratch is nulled on the first tick after Fight');
""", """test('hide order: clearing the order (Fight) resumes normal movement within 2 s', () => {
  const { m, step, hiddenFromBoth } = streetsHideFixture();
  setStance(m, 'p1', true);
  for (let i = 0; i < 10000 / TICK_RATE_MS && !(hiddenFromBoth() && waiting(m.fighters.p1)); i += 1) step();
  assert.ok(hiddenFromBoth(), 'precondition: hidden and pacing');
  for (let i = 0; i < 20; i += 1) step();
  assert.equal(waiting(m.fighters.p1), true);
  assert.equal(setStance(m, 'p1', false), true);
""")
rep("""  assert.ok(movingAtMs != null, 'the unit stayed frozen after Fight');
  const f = m.fighters.p1;
  for (const k of ['botHidePath', 'botHidePathIdx', 'botHideGoal', 'botHideSearchAt', 'botHideSearchStage', 'botHideFailedAt',
    'botHideHold', 'botHideDashArmed', 'botHideTier', 'botHideMoveAnchor', 'botHideAnchor', 'botHideDriftX', 'botHideDriftZ', 'botHideDriftUntil']) {
    assert.equal(f[k], null, `${k} nulled on clear`);
  }
});
""", """  assert.ok(movingAtMs != null, 'the unit stayed frozen after Fight');
});
""")
rep("""  const paths1 = [m.fighters.p1.botHidePath, m.fighters.p3.botHidePath].filter((p) => p != null).length;
  assert.equal(paths1, 1, 'exactly one search on the first tick');
  step(['p1', 'p3']);
  const paths2 = [m.fighters.p1.botHidePath, m.fighters.p3.botHidePath].filter((p) => p != null).length;
""", """  const routed = () => [m.fighters.p1, m.fighters.p3].filter((f) => f.botSDPlan?.path != null).length;
  const paths1 = routed();
  assert.equal(paths1, 1, 'exactly one search on the first tick');
  step(['p1', 'p3']);
  const paths2 = routed();
""")
p.write_text(t)
print('command.test.js: the deleted behaviours gone, the hide order reads the brain')
