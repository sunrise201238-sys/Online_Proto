import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  createMatchState,
  buildSnapshot,
  tickMatch,
  tickBot,
  pickBotTargetId,
  emptyInput,
  TICK_RATE_MS,
  TICK_DT,
  UNIT_DATA,
  MAP_DATA
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
    botSlots: new Set(),              // slots filled with bots while state==='active'
    botUnits: {},                     // slot -> host-chosen bot unit; empty = per-mode default
    inputs: {
      p1: emptyInput(), p2: emptyInput(), p3: emptyInput(), p4: emptyInput()
    },
    lastAcked: { p1: -1, p2: -1, p3: -1, p4: -1 },
    config: {
      p1: { unitKey: null, mapKey: null },
      p2: { unitKey: null, mapKey: null },
      p3: { unitKey: null, mapKey: null },
      p4: { unitKey: null, mapKey: null }
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
function botUnitKeyFor(lobby, s) {
  if (lobby.botUnits[s]) return lobby.botUnits[s];
  if (lobby.mode === '1v1') return 'unit1';
  const idx = activeSlots(lobby.mode).indexOf(s);
  return ['unit1', 'unit2', 'unit3', 'unit4', 'unit5', 'unit6'][(idx >= 0 ? idx : 0) % 6];
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

  lobby.match = createMatchState({
    mapKey,
    mode: lobby.mode,
    p1UnitKey: unitFor('p1'),
    p2UnitKey: unitFor('p2'),
    p3UnitKey: unitFor('p3'),
    p4UnitKey: unitFor('p4'),
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
  io.to(lobby.id).emit('match:start', { startTime, mapKey, mode: lobby.mode });
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
  for (const s of activeSlots(lobby.mode)) botUnits[s] = botUnitKeyFor(lobby, s);
  io.to(lobby.id).emit('lobby:config', {
    state: lobby.state,
    mode: lobby.mode,
    config: lobby.config,
    botUnits,
    occupied: Array.from(occupiedSlotsOf(lobby)),
    botSlots: Array.from(lobby.botSlots),
    rematchRequested: lobby.rematchRequested
  });
}

function snapshotWithAcks(lobby) {
  return {
    ...buildSnapshot(lobby.match),
    mode: lobby.mode,
    botSlots: Array.from(lobby.botSlots),
    acks: {
      p1: lobby.lastAcked.p1, p2: lobby.lastAcked.p2,
      p3: lobby.lastAcked.p3, p4: lobby.lastAcked.p4
    }
  };
}

function tickLobby(lobby) {
  if (lobby.state !== 'active' || !lobby.match) return;
  const now = Date.now();

  // 1. Drive bots — closest live enemy as targetId, then tickBot writes
  //    velocity/action just like applyInput would for humans.
  for (const botId of lobby.botSlots) {
    const me = lobby.match.fighters[botId];
    if (!me || me.hp <= 0) continue;
    me.targetId = pickBotTargetId(lobby.match, me) ?? me.targetId;
    tickBot(lobby.match, botId, now);
  }

  // 2. Shared sim tick. Humans drive via lobby.inputs; bot fighters are
  //    listed in botSlots so tickMatch skips applyInput for them.
  tickMatch(lobby.match, lobby.inputs, now, TICK_DT, lobby.botSlots);

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

  // 4. End-of-match check.
  const f = lobby.match.fighters;
  if (lobby.mode === '2v2') {
    const teamADead = (f.p1?.hp ?? 0) <= 0 && (f.p3?.hp ?? 0) <= 0;
    const teamBDead = (f.p2?.hp ?? 0) <= 0 && (f.p4?.hp ?? 0) <= 0;
    if (teamADead || teamBDead) {
      io.to(lobby.id).emit('match:snapshot', snapshotWithAcks(lobby));
      endMatchFor(lobby, teamADead ? 'B' : 'A', 'ko');
      return;
    }
  } else if ((f.p1?.hp ?? 0) <= 0 || (f.p2?.hp ?? 0) <= 0) {
    const winner = f.p1.hp <= 0 ? 'p2' : 'p1';
    io.to(lobby.id).emit('match:snapshot', snapshotWithAcks(lobby));
    endMatchFor(lobby, winner, 'ko');
    return;
  }

  io.to(lobby.id).emit('match:snapshot', snapshotWithAcks(lobby));
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
    if (data?.mode !== '1v1' && data?.mode !== '2v2') return;
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
      mapKey: null
    };
    lb.config[slot] = { unitKey: null, mapKey: null };
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
    startMatchFor(lb);   // 1v1 or 2v2: empty opponent slots fill with bots
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
      lb.config[slot] = { unitKey: null, mapKey: null };
      lb.rematchRequested[slot] = false;
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
