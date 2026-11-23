# usage: python3 -I patch_srv.py <measuring copy>/server/src/index.js : the measuring copy's knobs and timers (never the line's own file).
# Written against the line's server/src/index.js at 33a1512 (b1105kl); every piece it replaces must be found exactly once, so on a later
# server it stops with the piece it missed rather than measure something else.
#   BOT_EVERY=n a bot thinks on every n-th tick, the bots staggered; SNAP_EVERY=n a snapshot goes out on every n-th tick; SEARCH_MS the route search's budget;
#   SNAP_ONE a team's snapshot is built only if someone reads it; SNAP_SLIM every unit but the reader's own cut to a short list; SNAP_STR the snapshot sent as text; GOD nobody falls
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
def rep(a, b):
    global s
    assert s.count(a) == 1, (a[:70], s.count(a)); s = s.replace(a, b)
rep("const SEARCH_BUDGET_MS = 2;", "const SEARCH_BUDGET_MS = Number(process.env.SEARCH_MS ?? 2);\nconst _KEEP = ['id', 'team', 'unitKey', 'pos', 'vel', 'yaw', 'hp', 'action', 'airborne', 'grounded', 'targetId', 'boost', 'lastFireAt', 'overheatedUntil', 'invulnerableUntil', 'stepUntil', 'redLock', 'freeAim', 'aimYaw', 'aimPitch'];\nconst BOT_EVERY = Number(process.env.BOT_EVERY ?? 1), SNAP_EVERY = Number(process.env.SNAP_EVERY ?? 1);\nconst _prof = { bots: 0, sim: 0, snap: 0, n: 0, cpu: process.cpuUsage(), t: 0, over: 0, late: 0 };")
rep("  for (const botId of order) {\n    const me = lobby.match.fighters[botId];", "  const _pb0 = performance.now();\n  for (const botId of order) {\n    if (BOT_EVERY > 1 && (lobby.match.tick + roster.indexOf(botId)) % BOT_EVERY !== 0) continue;\n    const me = lobby.match.fighters[botId];")
rep("    tickBot(lobby.match, botId, now);\n    tickCommandDriver(lobby.match, botId, now);\n  }\n", "    tickBot(lobby.match, botId, now);\n    tickCommandDriver(lobby.match, botId, now);\n  }\n  _prof.bots += performance.now() - _pb0;\n")
rep("  tickMatch(lobby.match, holding ? HOLD_INPUTS : lobby.inputs, now, TICK_DT, driven);", "  if (process.env.GOD) for (const f of Object.values(lobby.match.fighters)) if (f.hp > 0 && f.hp < 1e8) f.hp = 1e9;\n  { const _t = performance.now(); tickMatch(lobby.match, holding ? HOLD_INPUTS : lobby.inputs, now, TICK_DT, driven); _prof.sim += performance.now() - _t; }")
rep("\n  emitSnapshotsFor(lobby);\n}\n", "\n  if (SNAP_EVERY <= 1 || lobby.match.tick % SNAP_EVERY === 0) { const _t = performance.now(); emitSnapshotsFor(lobby); _prof.snap += performance.now() - _t; }\n}\n")
rep("  const d = performance.now() - t0;\n  _tickStats.n += 1;", "  const d = performance.now() - t0;\n  { let act = 0; for (const l of lobbies.values()) if (l.state === 'active') act += 1; if (act > 0) { _prof.n += 1; if (d > 16) _prof.over += 1; if (late) _prof.late += 1; if (!_prof.t) { _prof.t = t0; _prof.cpu = process.cpuUsage(); }\n    if (t0 - _prof.t >= 10000) { const c = process.cpuUsage(_prof.cpu); const w = (t0 - _prof.t) / 1000; console.log(`[prof] ${w.toFixed(1)} s: ticks ${_prof.n}; a tick: bots ${(_prof.bots / _prof.n).toFixed(3)} ms, shared tick ${(_prof.sim / _prof.n).toFixed(3)} ms, snapshots ${(_prof.snap / _prof.n).toFixed(3)} ms; the process's CPU ${((c.user + c.system) / 1000 / w).toFixed(1)} ms a second (user ${(c.user / 1000 / w).toFixed(1)}, system ${(c.system / 1000 / w).toFixed(1)}); over 16 ms ${_prof.over}, late ${_prof.late}; memory ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB, active ${act}`); _prof.bots = 0; _prof.sim = 0; _prof.snap = 0; _prof.n = 0; _prof.over = 0; _prof.late = 0; _prof.t = t0; _prof.cpu = process.cpuUsage(); } } else { _prof.t = 0; _prof.n = 0; _prof.bots = 0; _prof.sim = 0; _prof.snap = 0; } }\n  _tickStats.n += 1;")
a = """  const byTeam = {
    A: { ...buildSnapshotFor(lobby.match, 'A'), ...extra, commands: teamCommands('A') },
    B: { ...buildSnapshotFor(lobby.match, 'B'), ...extra, commands: teamCommands('B') }
  };
  const spectator = { ...byTeam.A, commands: {} };
  for (const [sid, slot] of lobby.players) {
    const payload = SLOT_IDS.includes(slot) ? byTeam[teamOf(slot)] : spectator;
    io.to(sid).emit('match:snapshot', payload);
  }
"""
b = """  const _need = new Set(); for (const [, slot] of lobby.players) _need.add(SLOT_IDS.includes(slot) ? teamOf(slot) : 'A');
  const _mk = (t) => ({ ...buildSnapshotFor(lobby.match, t), ...extra, commands: teamCommands(t) });
  const byTeam = process.env.SNAP_ONE ? { A: _need.has('A') ? _mk('A') : null, B: _need.has('B') ? _mk('B') : null } : { A: _mk('A'), B: _mk('B') };
  const spectator = byTeam.A ? { ...byTeam.A, commands: {} } : null;
  for (const [sid, slot] of lobby.players) {
    let payload = SLOT_IDS.includes(slot) ? byTeam[teamOf(slot)] : spectator;
    if (process.env.SNAP_SLIM && SLOT_IDS.includes(slot)) { const f = {}; for (const id in payload.fighters) { if (id === slot) { f[id] = payload.fighters[id]; continue; } const o = {}, q = payload.fighters[id]; for (const k of _KEEP) if (k in q) o[k] = q[k]; f[id] = o; } payload = { ...payload, fighters: f }; }
    io.to(sid).emit('match:snapshot', process.env.SNAP_STR ? JSON.stringify(payload) : payload);
  }
"""
rep(a, b)
open(p, 'w', encoding='utf-8').write(s); print('patched')
