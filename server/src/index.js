import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  createMatchState,
  respawnFighterNext,
  buildSnapshotFor,
  tickMatch,
  tickBot,
  pickBotTargetId,
  commandTargetIdOf,
  tickCommandDriver,
  clearCommands,
  emptyInput,
  TICK_RATE_MS,
  TICK_DT,
  UNIT_DATA,
  MAP_DATA,
  GLINT_CONFIRM_CAP_MS
} from '@gvg/shared/src/sim/index.js';

// Slot ids match the shared-sim fighter ids one-to-one. In 1v1 only p1/p2
// are active; in 2v2 p3/p4 join. p1+p3 = team A, p2+p4 = team B (matches
// createMatchState's team assignment).
const SLOT_IDS = ['p1', 'p2', 'p3', 'p4'];
function activeSlots(mode) {
  return mode === '2v2' ? SLOT_IDS : SLOT_IDS.slice(0, 2);
}
function teamOf(slot) {
  return (slot === 'p1' || slot === 'p3') ? 'A' : 'B';
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), lobbies: lobbies.size });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Multi-lobby. Each lobby is one independent match (or waiting room). A new
// player joins the first available 'waiting' lobby with an empty active
// slot; if none exists, a fresh lobby is created and they become p1 (host).
// socket.io rooms (socket.join(lobby.id)) isolate broadcasts per-lobby so
// events from one match never leak into another.
const lobbies = new Map();           // id -> Lobby
const socketToLobby = new Map();     // socket.id -> lobby.id
let _nextLobbyId = 1;

function createLobby() {
  const id = `L${_nextLobbyId++}`;
  const lobby = {
    id,
    players: new Map(),               // socket.id -> 'p1'..'p4' | 'spectator'
    match: null,
    state: 'waiting',                 // 'waiting' | 'active' | 'ended'
    mode: '1v1',                      // '1v1' | '2v2' — host pushes via match:set-mode
    mainMode: 'sd',                   // 'sd' ("Duel") | 'trio' — host pushes via match:set-mode
    botSlots: new Set(),              // slots filled with bots while state==='active'
    commandSlots: new Set(),          // HUMAN slots playing command mode (bot-driven + orders); populated in phase 3 R3
    botUnits: {},                     // slot -> host-chosen bot unit (Duel: key; Trio: [k,k,k])
    glintCharges: new Map(),          // slot -> "slot:chargeStartAt" of the last seen charge (floating-unlock bookkeeping)
    inputs: {
      p1: emptyInput(), p2: emptyInput(), p3: emptyInput(), p4: emptyInput()
    },
    lastAcked: { p1: -1, p2: -1, p3: -1, p4: -1 },
    config: {
      p1: { unitKey: null, unitKeys: null, mapKey: null },
      p2: { unitKey: null, unitKeys: null, mapKey: null },
      p3: { unitKey: null, unitKeys: null, mapKey: null },
      p4: { unitKey: null, unitKeys: null, mapKey: null }
    },
    rematchRequested: { p1: false, p2: false, p3: false, p4: false },
    startedAt: 0,
    endedAt: 0,
    winnerId: null
  };
  lobbies.set(id, lobby);
  console.log(`[lobbies] created ${id} (total ${lobbies.size})`);
  return lobby;
}

function destroyLobby(lobby) {
  lobbies.delete(lobby.id);
  console.log(`[lobbies] destroyed ${lobby.id} (total ${lobbies.size})`);
}

// Pick the lobby a new connection should land in. Strategy:
//   1. Reuse any 'waiting' lobby that has an empty active slot (humans
//      who arrive while a match is queueing get pooled together).
//   2. Otherwise spawn a fresh lobby — the new player becomes p1 (host).
// We deliberately do NOT match on lobby.mode at connect-time because the
// client can't communicate its preferred mode until after assignment. The
// "preferred mode" comes through as the host's match:set-mode message.
function pickLobbyForJoin() {
  for (const lobby of lobbies.values()) {
    if (lobby.state !== 'waiting') continue;
    const active = activeSlots(lobby.mode);
    const occ = occupiedSlotsOf(lobby);
    if (occ.size < active.length) return lobby;
  }
  return createLobby();
}

function lobbyForSocket(socket) {
  const id = socketToLobby.get(socket.id);
  return id ? lobbies.get(id) : null;
}

function occupiedSlotsOf(lobby) {
  const slots = new Set();
  for (const v of lobby.players.values()) {
    if (SLOT_IDS.includes(v)) slots.add(v);
  }
  return slots;
}

// The unit a bot in slot `s` should use: the host's per-slot pick if set, else
// the per-mode default (1v1 → Saori/unit1; 2v2 → cycle unit1..unit6 by slot).
// The stored pick may be a Trio roster array — its lead unit stands in for
// Duel semantics.
function botUnitKeyFor(lobby, s) {
  const stored = lobby.botUnits[s];
  if (stored) return Array.isArray(stored) ? stored[0] : stored;
  if (lobby.mode === '1v1') return 'unit1';
  const idx = activeSlots(lobby.mode).indexOf(s);
  // Visible units only — this list is what the queue room shows for empty
  // slots. unit2 (Beretta 1301) and unit5 (MG42) were hidden in 0.7.1 when
  // AA12/NEGEV took their picker slots, but stayed here and kept showing up
  // in the default 2v2 room roster (user report 2026-08-09): swapped to
  // unit11 (M1014) and unit17 (NEGEV).
  return ['unit1', 'unit11', 'unit3', 'unit4', 'unit17', 'unit6'][(idx >= 0 ? idx : 0) % 6];
}

// Trio roster for a bot slot: the host's 3-pick if stored, else 3 copies of
// the slot's Duel unit (a stored single key also expands ×3).
function botRosterFor(lobby, s) {
  const stored = lobby.botUnits[s];
  if (Array.isArray(stored) && stored.length === 3) return stored;
  const k = botUnitKeyFor(lobby, s);
  return [k, k, k];
}

// Trio roster for any active slot (human or bot). Humans without a full
// 3-pick fall back to 3 copies of their Duel unit (or unit1).
function rosterForSlot(lobby, s, occupied) {
  if (occupied.has(s)) {
    const cfg = lobby.config[s];
    if (Array.isArray(cfg.unitKeys) && cfg.unitKeys.length === 3) return cfg.unitKeys;
    const k = cfg.unitKey || 'unit1';
    return [k, k, k];
  }
  return botRosterFor(lobby, s);
}

function isValidRoster(v) {
  return Array.isArray(v) && v.length === 3 && v.every((k) => typeof k === 'string' && UNIT_DATA[k]);
}

function startMatchFor(lobby) {
  const startTime = Date.now();
  const mapKey = lobby.config.p1.mapKey ?? 'arena1';
  const slots = activeSlots(lobby.mode);
  const occupied = occupiedSlotsOf(lobby);

  lobby.botSlots.clear();
  for (const s of slots) {
    if (!occupied.has(s)) lobby.botSlots.add(s);
  }

  // Resolve unit keys for every active slot (human or bot).
  const unitFor = (s) => {
    const human = occupied.has(s);
    const cfg = lobby.config[s].unitKey;
    if (human && cfg) return cfg;
    // Bot: host-chosen per-slot unit if set, else the per-mode default.
    return botUnitKeyFor(lobby, s);
  };

  // Trio: every active slot gets an ordered 3-unit roster (humans from
  // their 3-pick, bots from the host's picks / ×3 defaults).
  let rosters = null;
  if (lobby.mainMode === 'trio') {
    rosters = {};
    for (const s of slots) rosters[s] = rosterForSlot(lobby, s, occupied);
  }

  lobby.match = createMatchState({
    mapKey,
    mode: lobby.mode,
    p1UnitKey: unitFor('p1'),
    p2UnitKey: unitFor('p2'),
    p3UnitKey: unitFor('p3'),
    p4UnitKey: unitFor('p4'),
    rosters,
    startTime
  });
  lobby.state = 'active';
  for (const s of SLOT_IDS) {
    lobby.inputs[s] = emptyInput();
    lobby.lastAcked[s] = -1;
    lobby.rematchRequested[s] = false;
  }
  lobby.startedAt = startTime;
  lobby.endedAt = 0;
  lobby.winnerId = null;
  io.to(lobby.id).emit('match:start', { startTime, mapKey, mode: lobby.mode, mainMode: lobby.mainMode });
  emitLobbyConfig(lobby);
  console.log(`[${lobby.id}] ${lobby.mode} match started (bots: ${Array.from(lobby.botSlots).join(',') || 'none'})`);
}

function endMatchFor(lobby, winnerId, reason) {
  if (lobby.state !== 'active') return;
  lobby.state = 'ended';
  lobby.endedAt = Date.now();
  lobby.winnerId = winnerId;
  io.to(lobby.id).emit('match:end', { winnerId, reason, endedAt: lobby.endedAt });
  console.log(`[${lobby.id}] match ended — winner: ${winnerId ?? 'none'} (${reason})`);
}

function maybeStartMatchFor(lobby) {
  // Both 1v1 and 2v2 start MANUALLY now — the host (p1) triggers via
  // match:start-now, choosing to start now (an empty opponent slot fills with a
  // bot) or wait for a human to take the slot. No auto-start on readiness.
  if (lobby.state === 'active') return;
}

function emitLobbyConfig(lobby) {
  const botUnits = {};
  const occupied = occupiedSlotsOf(lobby);
  for (const s of activeSlots(lobby.mode)) botUnits[s] = botUnitKeyFor(lobby, s);
  // Trio: resolved roster per active slot for the queue-room display.
  // Humans who haven't finished their 3-pick show null ("picking…").
  let rosters = null;
  if (lobby.mainMode === 'trio') {
    rosters = {};
    for (const s of activeSlots(lobby.mode)) {
      rosters[s] = (occupied.has(s) && !isValidRoster(lobby.config[s].unitKeys))
        ? null
        : rosterForSlot(lobby, s, occupied);
    }
  }
  io.to(lobby.id).emit('lobby:config', {
    state: lobby.state,
    mode: lobby.mode,
    mainMode: lobby.mainMode,
    config: lobby.config,
    botUnits,
    rosters,
    occupied: Array.from(occupied),
    botSlots: Array.from(lobby.botSlots),
    rematchRequested: lobby.rematchRequested
  });
}

// Per-team snapshots (command-mode online, phase 3 R1): each side gets its
// own filtered view — enemy boost nulled, enemy bot-intent fields stripped
// (the old single broadcast shipped everyone's full fighter objects to the
// whole room). Two variants are built once per tick and emitted per socket;
// spectators get team A's view (the client renders spectators from p1's
// perspective — owner: spectators see the classic view).
function emitSnapshotsFor(lobby) {
  const extra = {
    mode: lobby.mode,
    botSlots: Array.from(lobby.botSlots),
    acks: {
      p1: lobby.lastAcked.p1, p2: lobby.lastAcked.p2,
      p3: lobby.lastAcked.p3, p4: lobby.lastAcked.p4
    }
  };
  const byTeam = {
    A: { ...buildSnapshotFor(lobby.match, 'A'), ...extra },
    B: { ...buildSnapshotFor(lobby.match, 'B'), ...extra }
  };
  for (const [sid, slot] of lobby.players) {
    const team = SLOT_IDS.includes(slot) ? teamOf(slot) : 'A';
    io.to(sid).emit('match:snapshot', byTeam[team]);
  }
}

function tickLobby(lobby) {
  if (lobby.state !== 'active' || !lobby.match) return;
  const now = Date.now();

  // 1. Drive bots AND command-mode humans — both are tickBot-driven; a
  //    force lock (commandTargetIdOf) overrides the bot target pick, and
  //    the command driver re-steers the legs after tickBot while a move
  //    order stands (reflexes yield per tick inside the driver).
  const driven = lobby.commandSlots.size
    ? new Set([...lobby.botSlots, ...lobby.commandSlots])
    : lobby.botSlots;
  for (const botId of driven) {
    const me = lobby.match.fighters[botId];
    if (!me || me.hp <= 0) continue;
    me.targetId = commandTargetIdOf(lobby.match, botId)
      ?? pickBotTargetId(lobby.match, me) ?? me.targetId;
    tickBot(lobby.match, botId, now);
    tickCommandDriver(lobby.match, botId, now);
  }

  // 2. Shared sim tick. Humans drive via lobby.inputs; tickBot-driven
  //    fighters are listed so tickMatch skips applyInput for them.
  tickMatch(lobby.match, lobby.inputs, now, TICK_DT, driven);

  // 3. Clear human tap flags so they fire once per press. `jump` resets to
  //    the last frame's raw HELD value (not false) — held-jump must survive
  //    ticks that received no input frame, or flight climbing flickers.
  for (const slot of activeSlots(lobby.mode)) {
    if (lobby.botSlots.has(slot)) continue;
    const cur = lobby.inputs[slot];
    cur.jump = !!cur.jumpHeld;
    cur.stepTap = false;
    cur.shootTap = false;
    cur.targetSwitch = false;
  }

  // 3.5 Floating sniper unlock: a NEW charge aimed at a HUMAN defender gets
  //     its glint confirmation bumped to the pessimistic cap — the target's
  //     client ack (charge:glint-ack) then improves it to the real moment
  //     the glint rendered. Bot/offline defenders keep attemptFire's
  //     instant-confirm default, so only online-vs-human behavior changes.
  for (const s of activeSlots(lobby.mode)) {
    const fighter = lobby.match.fighters[s];
    if (!fighter || !fighter.sniperChargeTargetId) { lobby.glintCharges.delete(s); continue; }
    const key = `${s}:${fighter.sniperChargeStartAt}`;
    if (lobby.glintCharges.get(s) !== key) {
      lobby.glintCharges.set(s, key);
      const targetSlot = fighter.sniperChargeTargetId;
      const targetHuman = occupiedSlotsOf(lobby).has(targetSlot) && !lobby.botSlots.has(targetSlot);
      if (targetHuman) fighter.sniperGlintAt = fighter.sniperChargeStartAt + GLINT_CONFIRM_CAP_MS;
    }
  }

  // 4. Trio respawns — a dead slot with roster left swaps to its next unit
  //    at the recorded spawn point (fresh 3 s immunity; the killer keeps all
  //    its state). Runs before the end check so a mid-swap death is never
  //    counted as a team wipe. Respawned BOTS hold fire briefly (offline
  //    parity: respawnSlotMech's +650 ms nextFireAt).
  if (lobby.match.trio) {
    for (const s of activeSlots(lobby.mode)) {
      const fighter = lobby.match.fighters[s];
      if (fighter && fighter.hp <= 0) {
        const fresh = respawnFighterNext(lobby.match, s);
        if (fresh && lobby.botSlots.has(s)) fresh.nextFireAt = lobby.match.now + 650;
        // Trio + command: a respawned unit starts fully autonomous — its
        // standing orders die with the previous unit (offline parity).
        if (fresh) clearCommands(lobby.match, s);
      }
    }
  }

  // 5. End-of-match check. A slot is "out" when its unit is dead AND (Trio)
  //    its roster is spent — in Duel there's no roster, so out = dead.
  const slotOut = (id) => {
    const fighter = lobby.match.fighters[id];
    if (!fighter) return true;
    if (fighter.hp > 0) return false;
    return !fighter.roster || fighter.rosterIdx >= fighter.roster.length - 1;
  };
  if (lobby.mode === '2v2') {
    const teamAOut = slotOut('p1') && slotOut('p3');
    const teamBOut = slotOut('p2') && slotOut('p4');
    if (teamAOut || teamBOut) {
      emitSnapshotsFor(lobby);
      endMatchFor(lobby, teamAOut ? 'B' : 'A', 'ko');
      return;
    }
  } else if (slotOut('p1') || slotOut('p2')) {
    const winner = slotOut('p1') ? 'p2' : 'p1';
    emitSnapshotsFor(lobby);
    endMatchFor(lobby, winner, 'ko');
    return;
  }

  emitSnapshotsFor(lobby);
}

function tickAllLobbies() {
  for (const lobby of lobbies.values()) {
    tickLobby(lobby);
  }
}

setInterval(tickAllLobbies, TICK_RATE_MS);

io.on('connection', (socket) => {
  const lobby = pickLobbyForJoin();
  socketToLobby.set(socket.id, lobby.id);
  socket.join(lobby.id);

  // First free slot in the active set (p1 → p2 → p3 → p4). First joiner of
  // a fresh lobby becomes p1 (host).
  const taken = occupiedSlotsOf(lobby);
  const slots = activeSlots(lobby.mode);
  let assigned = 'spectator';
  for (const s of slots) {
    if (!taken.has(s)) { assigned = s; break; }
  }
  lobby.players.set(socket.id, assigned);

  socket.emit('player:assigned', {
    playerId: assigned,
    team: SLOT_IDS.includes(assigned) ? teamOf(assigned) : null,
    mode: assigned === 'spectator' ? 'spectator' : 'online-ready',
    lobbyId: lobby.id,
    lobbyMode: lobby.mode,
    matchState: lobby.state
  });

  socket.emit('match:hello', {
    msg: 'hello from gvg-server',
    playerId: assigned,
    serverTime: Date.now(),
    tick: lobby.match?.tick ?? 0,
    matchState: lobby.state
  });

  // Broadcast to the whole lobby (not just the joiner) so the host sees the new
  // occupant — e.g. a player taking the bot's 1v1 slot.
  emitLobbyConfig(lobby);

  maybeStartMatchFor(lobby);

  socket.on('input:frame', (frame) => {
    const lb = lobbyForSocket(socket);
    if (!lb) return;
    const slot = lb.players.get(socket.id);
    if (!SLOT_IDS.includes(slot)) return;
    if (lb.state !== 'active') return;
    if (lb.botSlots.has(slot)) return;

    if (typeof frame.seq === 'number' && frame.seq > lb.lastAcked[slot]) {
      lb.lastAcked[slot] = frame.seq;
    }

    const cur = lb.inputs[slot];
    lb.inputs[slot] = {
      moveX: numericOrZero(frame.moveX),
      moveZ: numericOrZero(frame.moveZ),
      boost: !!frame.boost,
      sprintLocked: !!frame.sprintLocked,
      shootHold: !!frame.shootHold,
      jump: cur.jump || !!frame.jump,
      // Raw held value of the LAST frame — after each tick consumes the
      // latched `jump`, it resets to this instead of false, so a held jump
      // (Aris flight climb) doesn't flicker on ticks that received no frame
      // (client sends 40 Hz vs the 62.5 Hz tick). The flicker re-armed the
      // sim's air-pop edge detector every 250 ms.
      jumpHeld: !!frame.jump,
      stepTap: cur.stepTap || !!frame.stepTap,
      shootTap: cur.shootTap || !!frame.shootTap,
      targetSwitch: cur.targetSwitch || !!frame.targetSwitch,
      aimX: numericOrZero(frame.aimX),   // Kei charged-sweep horizontal aim
      aimY: numericOrZero(frame.aimY)    // Kei charged-sweep vertical (pitch) aim
    };
  });

  socket.on('match:configure', (cfg) => {
    const lb = lobbyForSocket(socket);
    if (!lb) return;
    const slot = lb.players.get(socket.id);
    if (!SLOT_IDS.includes(slot)) return;
    if (lb.state === 'active') return;

    let dirty = false;
    if (cfg && typeof cfg.unitKey === 'string' && UNIT_DATA[cfg.unitKey]) {
      lb.config[slot].unitKey = cfg.unitKey;
      dirty = true;
    }
    // Trio: the player's ordered 3-unit roster (repeats allowed). The lead
    // unit doubles as the Duel unitKey so mainMode flips never leave a slot
    // with no pick at all.
    if (cfg && isValidRoster(cfg.unitKeys)) {
      lb.config[slot].unitKeys = cfg.unitKeys.slice();
      lb.config[slot].unitKey = cfg.unitKeys[0];
      dirty = true;
    }
    if (cfg && typeof cfg.mapKey === 'string' && slot === 'p1' && MAP_DATA[cfg.mapKey]) {
      lb.config[slot].mapKey = cfg.mapKey;
      dirty = true;
    }
    // Host picks a bot slot's unit (1v1 or 2v2). Stored per-slot in its own field
    // so it never collides with a human's pick, and only for an active non-host
    // slot that is currently an empty bot — occupancy wins if a human takes it
    // concurrently (this gate is re-checked in message order server-side).
    if (cfg && slot === 'p1' && typeof cfg.botSlot === 'string'
        && typeof cfg.botUnitKey === 'string' && UNIT_DATA[cfg.botUnitKey]
        && cfg.botSlot !== 'p1' && activeSlots(lb.mode).includes(cfg.botSlot)
        && !occupiedSlotsOf(lb).has(cfg.botSlot)) {
      lb.botUnits[cfg.botSlot] = cfg.botUnitKey;
      dirty = true;
    }
    // Trio bot roster (host only) — same occupancy gates as botUnitKey.
    if (cfg && slot === 'p1' && typeof cfg.botSlot === 'string'
        && isValidRoster(cfg.botUnitKeys)
        && cfg.botSlot !== 'p1' && activeSlots(lb.mode).includes(cfg.botSlot)
        && !occupiedSlotsOf(lb).has(cfg.botSlot)) {
      lb.botUnits[cfg.botSlot] = cfg.botUnitKeys.slice();
      dirty = true;
    }

    if (dirty) {
      emitLobbyConfig(lb);
      maybeStartMatchFor(lb);
    }
  });

  socket.on('match:set-mode', (data) => {
    const lb = lobbyForSocket(socket);
    if (!lb) return;
    const slot = lb.players.get(socket.id);
    if (slot !== 'p1') return;
    if (lb.state === 'active') return;
    // Main mode ('sd' = Duel | 'trio') rides the same message as the team
    // size — the host picks both up front.
    if (data?.mainMode === 'sd' || data?.mainMode === 'trio') {
      lb.mainMode = data.mainMode;
    }
    if (data?.mode !== '1v1' && data?.mode !== '2v2') {
      if (data?.mainMode) emitLobbyConfig(lb);
      return;
    }
    lb.mode = data.mode;
    if (lb.mode === '1v1') {
      const reassigned = [];
      for (const [sid, s] of lb.players) {
        if (s === 'p3' || s === 'p4') reassigned.push(sid);
      }
      for (const sid of reassigned) lb.players.set(sid, 'spectator');
    }
    emitLobbyConfig(lb);
    maybeStartMatchFor(lb);
  });

  // Slot swap: any player can move between p2/p3/p4 freely. The p1 host
  // slot is locked — the original host can't give it up and no one else can
  // claim it. Keeps the state machine simple (host = whoever's at p1 is
  // also the original p1).
  socket.on('match:join-slot', (data) => {
    const lb = lobbyForSocket(socket);
    if (!lb) return;
    const slot = lb.players.get(socket.id);
    if (!SLOT_IDS.includes(slot)) return;
    if (lb.state !== 'waiting') return;
    if (slot === 'p1') return;          // host can't leave p1
    const newSlot = data?.slot;
    if (!SLOT_IDS.includes(newSlot)) return;
    if (newSlot === slot) return;
    if (newSlot === 'p1') return;       // p1 can't be claimed by anyone else
    if (!activeSlots(lb.mode).includes(newSlot)) return;
    if (occupiedSlotsOf(lb).has(newSlot)) return;

    lb.players.set(socket.id, newSlot);
    lb.config[newSlot] = {
      unitKey: lb.config[slot].unitKey,
      unitKeys: lb.config[slot].unitKeys,
      mapKey: null
    };
    lb.config[slot] = { unitKey: null, unitKeys: null, mapKey: null };
    lb.lastAcked[newSlot] = -1;
    lb.lastAcked[slot] = -1;
    lb.rematchRequested[newSlot] = false;
    lb.rematchRequested[slot] = false;

    socket.emit('player:assigned', {
      playerId: newSlot,
      team: teamOf(newSlot),
      mode: 'online-ready',
      lobbyId: lb.id,
      lobbyMode: lb.mode,
      matchState: lb.state
    });
    emitLobbyConfig(lb);
  });

  socket.on('match:start-now', () => {
    const lb = lobbyForSocket(socket);
    if (!lb) return;
    const slot = lb.players.get(socket.id);
    if (slot !== 'p1') return;
    if (lb.state === 'active') return;
    if (!lb.config.p1.unitKey || !lb.config.p1.mapKey) return;
    // Trio: the host must have a complete 3-pick before starting.
    if (lb.mainMode === 'trio' && !isValidRoster(lb.config.p1.unitKeys)) return;
    startMatchFor(lb);   // 1v1 or 2v2: empty opponent slots fill with bots
  });

  // Floating sniper unlock: the charge target's client confirms the glint
  // rendered. Improves (never worsens) the pessimistic cap set in tickLobby.
  socket.on('charge:glint-ack', (data) => {
    const lb = lobbyForSocket(socket);
    if (!lb || lb.state !== 'active' || !lb.match) return;
    const slot = lb.players.get(socket.id);
    if (!SLOT_IDS.includes(slot)) return;
    const shooter = data && typeof data.shooterId === 'string' ? lb.match.fighters[data.shooterId] : null;
    if (!shooter || shooter.sniperChargeTargetId !== slot) return;
    shooter.sniperGlintAt = Math.min(shooter.sniperGlintAt, Date.now());
  });

  socket.on('match:rematch-request', () => {
    const lb = lobbyForSocket(socket);
    if (!lb) return;
    const slot = lb.players.get(socket.id);
    if (!SLOT_IDS.includes(slot)) return;
    if (lb.state !== 'ended') return;

    if (lb.rematchRequested[slot]) return;
    lb.rematchRequested[slot] = true;
    emitLobbyConfig(lb);

    const occ = occupiedSlotsOf(lb);
    const allReady = Array.from(occ).every((s) => lb.rematchRequested[s]);
    // Both modes: once every occupied slot has requested a rematch (host present),
    // restart — an empty opponent slot re-fills with a bot.
    if (allReady && occ.size > 0 && occ.has('p1')) startMatchFor(lb);
  });

  socket.on('disconnect', () => {
    const lb = lobbyForSocket(socket);
    socketToLobby.delete(socket.id);
    if (!lb) return;
    const slot = lb.players.get(socket.id);
    lb.players.delete(socket.id);
    if (SLOT_IDS.includes(slot) && lb.state === 'active') {
      if (lb.mode === '2v2') {
        lb.botSlots.add(slot);
      } else {
        const winner = slot === 'p1' ? 'p2' : 'p1';
        endMatchFor(lb, winner, 'forfeit');
      }
    }
    if (SLOT_IDS.includes(slot)) {
      lb.config[slot] = { unitKey: null, unitKeys: null, mapKey: null };
      lb.rematchRequested[slot] = false;
    }
    // Host left outside an active match (waiting room / end menu): promote
    // the longest-tenured remaining player to p1. Without this the lobby
    // sits headless — joiners can pick units but nobody can choose the map,
    // start, or rematch (field case: a host refresh mid-setup rejoined as
    // p2 while the ghost p1 socket drained, then the freed p1 stayed empty).
    if (slot === 'p1' && lb.state !== 'active' && lb.players.size > 0) {
      const entry = [...lb.players.entries()].find(([, s]) => SLOT_IDS.includes(s));
      if (entry) {
        const [sid, oldSlot] = entry;
        lb.players.set(sid, 'p1');
        lb.config.p1 = lb.config[oldSlot];
        lb.config[oldSlot] = { unitKey: null, unitKeys: null, mapKey: null };
        lb.lastAcked.p1 = -1;
        lb.rematchRequested.p1 = false;
        lb.rematchRequested[oldSlot] = false;
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.emit('player:assigned', {
            playerId: 'p1',
            team: teamOf('p1'),
            mode: 'online-ready',
            lobbyId: lb.id,
            lobbyMode: lb.mode,
            matchState: lb.state
          });
        }
        console.log(`[${lb.id}] host left — promoted ${oldSlot} to p1`);
      }
    }
    if (lb.players.size === 0) {
      // Last player left — drop the whole lobby. Otherwise it'd loiter and
      // pickLobbyForJoin would funnel future joiners into a stale 'ended'.
      destroyLobby(lb);
    } else {
      emitLobbyConfig(lb);
    }
  });
});

function numericOrZero(v) {
  return Number.isFinite(v) ? v : 0;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`GVG server listening on ${PORT}`);
});
