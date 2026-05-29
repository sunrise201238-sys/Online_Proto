import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  createMatchState,
  buildSnapshot,
  tickMatch,
  tickBot,
  pickClosestEnemyId,
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
  res.json({ ok: true, uptime: process.uptime() });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// One global lobby = one match running at a time. Phase 5 will shard this
// out for multi-match hosting.
const lobby = {
  // socketId -> 'p1' | 'p2' | 'p3' | 'p4' | 'spectator'
  players: new Map(),
  // null when no active match. Otherwise the live MatchState.
  match: null,
  // 'waiting' | 'active' | 'ended'
  state: 'waiting',
  // '1v1' (default) or '2v2'. Host (p1) toggles via `match:set-mode`.
  mode: '1v1',
  // Slots that are bot-controlled in the active match. Set at match start
  // (any active slot not occupied by a human gets botified). Empty in 1v1.
  botSlots: new Set(),
  // Last-received input frame per player. Tap flags (jump/stepTap/shootTap/
  // targetSwitch) are accumulated across input:frame messages and reset after
  // each tick. Sized for the maximum (4) so 2v2 needs no rewiring.
  inputs: {
    p1: emptyInput(), p2: emptyInput(), p3: emptyInput(), p4: emptyInput()
  },
  // Highest seq number we've received per player. Echoed back in each
  // snapshot under `acks` so clients know which predicted inputs the server
  // has consumed (everything <= this seq) vs. still in-flight.
  lastAcked: { p1: -1, p2: -1, p3: -1, p4: -1 },
  // Per-player configuration (chosen unit, map). Map is taken from p1 (host).
  // Persists across matches in the same session so rematches reuse picks.
  // Cleared per-slot on that player's disconnect.
  config: {
    p1: { unitKey: null, mapKey: null },
    p2: { unitKey: null, mapKey: null },
    p3: { unitKey: null, mapKey: null },
    p4: { unitKey: null, mapKey: null }
  },
  // Rematch-ready flags. All occupied slots must request (state === 'ended')
  // for a new match to begin. Reset on match start.
  rematchRequested: { p1: false, p2: false, p3: false, p4: false },
  startedAt: 0,
  endedAt: 0,
  winnerId: null
};

function occupiedSlots() {
  const slots = new Set();
  for (const v of lobby.players.values()) {
    if (SLOT_IDS.includes(v)) slots.add(v);
  }
  return slots;
}

function startMatch() {
  const startTime = Date.now();
  // p1 is the "host" — their map pick is used. Each occupied slot picks its
  // own unit. Unoccupied active slots become bots and use a default unit.
  const mapKey = lobby.config.p1.mapKey ?? 'arena1';
  const slots = activeSlots(lobby.mode);
  const occupied = occupiedSlots();

  lobby.botSlots.clear();
  for (const s of slots) {
    if (!occupied.has(s)) lobby.botSlots.add(s);
  }

  // Resolve unit keys for every active slot (human or bot).
  const unitFor = (s) => {
    const human = occupied.has(s);
    const cfg = lobby.config[s].unitKey;
    if (human && cfg) return cfg;
    // Bot default: cycle through unit1/unit2/unit3 by slot index for variety.
    const idx = slots.indexOf(s);
    return ['unit1', 'unit2', 'unit3'][idx % 3];
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
  io.emit('match:start', { startTime, mapKey, mode: lobby.mode });
  emitLobbyConfig();
  console.log(`[lobby] ${lobby.mode} match started (bots: ${Array.from(lobby.botSlots).join(',') || 'none'})`);
}

function endMatch(winnerId, reason) {
  if (lobby.state !== 'active') return;
  lobby.state = 'ended';
  lobby.endedAt = Date.now();
  lobby.winnerId = winnerId;
  io.emit('match:end', { winnerId, reason, endedAt: lobby.endedAt });
  console.log(`[lobby] match ended — winner: ${winnerId ?? 'none'} (${reason})`);
}

function maybeStartMatch() {
  if (lobby.state === 'active') return;
  if (lobby.mode === '1v1') {
    // 1v1: auto-start when both slots are occupied and configured.
    const slots = occupiedSlots();
    if (!slots.has('p1') || !slots.has('p2')) return;
    if (!lobby.config.p1.unitKey || !lobby.config.p2.unitKey) return;
    if (!lobby.config.p1.mapKey) return;
    startMatch();
    return;
  }
  // 2v2: no auto-start. Host (p1) explicitly triggers via `match:start-now`
  // after picking their unit + map. Empty slots will be filled with bots.
}

function emitLobbyConfig() {
  io.emit('lobby:config', {
    state: lobby.state,
    mode: lobby.mode,
    config: lobby.config,
    botSlots: Array.from(lobby.botSlots),
    rematchRequested: lobby.rematchRequested
  });
}

function tick() {
  if (lobby.state !== 'active' || !lobby.match) return;
  const now = Date.now();

  // 1. Drive bots — each bot picks its closest live enemy as targetId, then
  //    tickBot computes its intent for this tick (writing into me.vel /
  //    me.action / etc, just like applyInput does for humans).
  for (const botId of lobby.botSlots) {
    const me = lobby.match.fighters[botId];
    if (!me || me.hp <= 0) continue;
    me.targetId = pickClosestEnemyId(lobby.match, me) ?? me.targetId;
    tickBot(lobby.match, botId, now);
  }

  // 2. Run the shared sim tick. Humans drive via lobby.inputs; bot fighters
  //    are listed in botSlots so tickMatch knows to skip applyInput for them
  //    (otherwise the empty input would clobber tickBot's velocity write).
  tickMatch(lobby.match, lobby.inputs, now, TICK_DT, lobby.botSlots);

  // 3. After tickMatch consumes the inputs, clear human tap flags so they
  //    don't re-fire next tick. Continuous flags (move, boost, shootHold)
  //    persist until the client overwrites them.
  for (const slot of activeSlots(lobby.mode)) {
    if (lobby.botSlots.has(slot)) continue;
    const cur = lobby.inputs[slot];
    cur.jump = false;
    cur.stepTap = false;
    cur.shootTap = false;
    cur.targetSwitch = false;
  }

  // 4. End-of-match check. 1v1: either fighter at 0 HP. 2v2: one team fully
  //    down (both members at 0 HP).
  const f = lobby.match.fighters;
  if (lobby.mode === '2v2') {
    const teamADead = (f.p1?.hp ?? 0) <= 0 && (f.p3?.hp ?? 0) <= 0;
    const teamBDead = (f.p2?.hp ?? 0) <= 0 && (f.p4?.hp ?? 0) <= 0;
    if (teamADead || teamBDead) {
      io.emit('match:snapshot', snapshotWithAcks());
      endMatch(teamADead ? 'B' : 'A', 'ko');
      return;
    }
  } else if ((f.p1?.hp ?? 0) <= 0 || (f.p2?.hp ?? 0) <= 0) {
    const winner = f.p1.hp <= 0 ? 'p2' : 'p1';
    io.emit('match:snapshot', snapshotWithAcks());
    endMatch(winner, 'ko');
    return;
  }

  io.emit('match:snapshot', snapshotWithAcks());
}

function snapshotWithAcks() {
  // Phase 3: clients use these to know which of their predicted inputs the
  // server has consumed. Inputs with seq > acks[me] are still pending and
  // need to be replayed on top of the snapshot during reconciliation.
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

setInterval(tick, TICK_RATE_MS);

io.on('connection', (socket) => {
  // Find a free slot in the currently-active set (2 in 1v1, 4 in 2v2).
  // Slot priority is p1 → p2 → p3 → p4 so the first joiner is always host.
  const taken = occupiedSlots();
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

  // Bring the new socket up to date on lobby state. Includes mode + botSlots
  // so the client can render the right UI.
  socket.emit('lobby:config', {
    state: lobby.state,
    mode: lobby.mode,
    config: lobby.config,
    botSlots: Array.from(lobby.botSlots),
    rematchRequested: lobby.rematchRequested
  });

  // 1v1: if both player slots just filled, kick off a match (existing
  // auto-start behaviour). 2v2: host has to press "start" explicitly.
  maybeStartMatch();

  socket.on('input:frame', (frame) => {
    const slot = lobby.players.get(socket.id);
    if (!SLOT_IDS.includes(slot)) return;
    if (lobby.state !== 'active') return;
    if (lobby.botSlots.has(slot)) return; // bot slot — humans can't drive

    if (typeof frame.seq === 'number' && frame.seq > lobby.lastAcked[slot]) {
      lobby.lastAcked[slot] = frame.seq;
    }

    const cur = lobby.inputs[slot];
    lobby.inputs[slot] = {
      moveX: numericOrZero(frame.moveX),
      moveZ: numericOrZero(frame.moveZ),
      boost: !!frame.boost,
      sprintLocked: !!frame.sprintLocked,
      shootHold: !!frame.shootHold,
      jump: cur.jump || !!frame.jump,
      stepTap: cur.stepTap || !!frame.stepTap,
      shootTap: cur.shootTap || !!frame.shootTap,
      targetSwitch: cur.targetSwitch || !!frame.targetSwitch
    };
  });

  socket.on('match:configure', (cfg) => {
    const slot = lobby.players.get(socket.id);
    if (!SLOT_IDS.includes(slot)) return;
    if (lobby.state === 'active') return; // can't change picks mid-match

    let dirty = false;
    if (cfg && typeof cfg.unitKey === 'string' && UNIT_DATA[cfg.unitKey]) {
      lobby.config[slot].unitKey = cfg.unitKey;
      dirty = true;
    }
    // Map is host-only (p1). Silently ignore non-hosts trying to set map.
    if (cfg && typeof cfg.mapKey === 'string' && slot === 'p1' && MAP_DATA[cfg.mapKey]) {
      lobby.config[slot].mapKey = cfg.mapKey;
      dirty = true;
    }

    if (dirty) {
      emitLobbyConfig();
      maybeStartMatch();
    }
  });

  // Host-only mode toggle. Only valid while waiting / between matches.
  socket.on('match:set-mode', (data) => {
    const slot = lobby.players.get(socket.id);
    if (slot !== 'p1') return;
    if (lobby.state === 'active') return;
    if (data?.mode !== '1v1' && data?.mode !== '2v2') return;
    lobby.mode = data.mode;
    // 2v2 → 1v1 narrows the active set. Any p3/p4 humans become spectators.
    if (lobby.mode === '1v1') {
      const reassigned = [];
      for (const [sid, s] of lobby.players) {
        if (s === 'p3' || s === 'p4') reassigned.push(sid);
      }
      for (const sid of reassigned) lobby.players.set(sid, 'spectator');
    }
    emitLobbyConfig();
    maybeStartMatch();
  });

  // Host-only explicit start (2v2). Empty active slots get bot-filled.
  socket.on('match:start-now', () => {
    const slot = lobby.players.get(socket.id);
    if (slot !== 'p1') return;
    if (lobby.state === 'active') return;
    if (lobby.mode !== '2v2') return;
    if (!lobby.config.p1.unitKey || !lobby.config.p1.mapKey) return;
    startMatch();
  });

  socket.on('match:rematch-request', () => {
    const slot = lobby.players.get(socket.id);
    if (!SLOT_IDS.includes(slot)) return;
    if (lobby.state !== 'ended') return;

    if (lobby.rematchRequested[slot]) return;
    lobby.rematchRequested[slot] = true;
    emitLobbyConfig();

    // Start the next match when every occupied human slot has requested.
    const occ = occupiedSlots();
    const allReady = Array.from(occ).every((s) => lobby.rematchRequested[s]);
    if (lobby.mode === '1v1') {
      if (occ.has('p1') && occ.has('p2') && allReady) startMatch();
    } else if (allReady && occ.size > 0) {
      // 2v2: host must still be present; bot slots will be re-derived.
      if (occ.has('p1')) startMatch();
    }
  });

  socket.on('disconnect', () => {
    const slot = lobby.players.get(socket.id);
    lobby.players.delete(socket.id);
    if (SLOT_IDS.includes(slot) && lobby.state === 'active') {
      if (lobby.mode === '2v2') {
        // 2v2: convert the human's slot to a bot so the match can continue.
        lobby.botSlots.add(slot);
      } else {
        // 1v1: opponent wins by forfeit.
        const winner = slot === 'p1' ? 'p2' : 'p1';
        endMatch(winner, 'forfeit');
      }
    }
    if (SLOT_IDS.includes(slot)) {
      lobby.config[slot] = { unitKey: null, mapKey: null };
      lobby.rematchRequested[slot] = false;
    }
    // If every active slot is empty, reset the lobby fully.
    const occ = occupiedSlots();
    if (occ.size === 0) {
      lobby.match = null;
      lobby.state = 'waiting';
      lobby.mode = '1v1';
      lobby.botSlots.clear();
      for (const s of SLOT_IDS) {
        lobby.inputs[s] = emptyInput();
        lobby.config[s] = { unitKey: null, mapKey: null };
        lobby.rematchRequested[s] = false;
      }
    } else {
      emitLobbyConfig();
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
