import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  createMatchState,
  buildSnapshot,
  tickMatch,
  emptyInput,
  TICK_RATE_MS,
  TICK_DT,
  UNIT_DATA,
  MAP_DATA
} from '@gvg/shared/src/sim/index.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// One global lobby = one match running at a time. Phase 5 will sharded this
// out for multi-match hosting.
const lobby = {
  // socketId -> 'p1' | 'p2' | 'spectator'
  players: new Map(),
  // null when no active match. Otherwise the live MatchState.
  match: null,
  // 'waiting' | 'active' | 'ended'
  state: 'waiting',
  // Last-received input frame per player. Tap flags (jump/stepTap/shootTap)
  // are accumulated across input:frame messages and reset after each tick.
  inputs: { p1: emptyInput(), p2: emptyInput() },
  // Highest seq number we've received per player. Echoed back in each
  // snapshot under `acks` so clients know which predicted inputs the server
  // has consumed (everything <= this seq) vs. still in-flight.
  lastAcked: { p1: -1, p2: -1 },
  // Per-player configuration (chosen unit, map). Map is taken from p1 (host).
  // Persists across matches in the same session so rematches reuse picks.
  // Cleared per-slot on that player's disconnect.
  config: {
    p1: { unitKey: null, mapKey: null },
    p2: { unitKey: null, mapKey: null }
  },
  // Rematch-ready flags. Both must be true (state === 'ended') for a new
  // match to begin. Reset on match start.
  rematchRequested: { p1: false, p2: false },
  startedAt: 0,
  endedAt: 0,
  winnerId: null
};

function occupiedSlots() {
  const slots = new Set();
  for (const v of lobby.players.values()) {
    if (v === 'p1' || v === 'p2') slots.add(v);
  }
  return slots;
}

function startMatch() {
  const startTime = Date.now();
  // p1 is the "host" — their map pick is used. Both pick their own unit.
  // Fall back to defaults if anything's missing (shouldn't happen because
  // maybeStartMatch gates on these being set).
  const mapKey = lobby.config.p1.mapKey ?? 'arena1';
  const p1UnitKey = lobby.config.p1.unitKey ?? 'unit1';
  const p2UnitKey = lobby.config.p2.unitKey ?? 'unit1';
  lobby.match = createMatchState({
    mapKey,
    p1UnitKey,
    p2UnitKey,
    startTime
  });
  lobby.state = 'active';
  lobby.inputs = { p1: emptyInput(), p2: emptyInput() };
  lobby.lastAcked = { p1: -1, p2: -1 };
  lobby.rematchRequested = { p1: false, p2: false };
  lobby.startedAt = startTime;
  lobby.endedAt = 0;
  lobby.winnerId = null;
  io.emit('match:start', { startTime, mapKey: 'arena1' });
  console.log('[lobby] match started');
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
  const slots = occupiedSlots();
  if (!slots.has('p1') || !slots.has('p2')) return;
  // Both players must have picked a unit; p1 (host) must have picked a map.
  if (!lobby.config.p1.unitKey || !lobby.config.p2.unitKey) return;
  if (!lobby.config.p1.mapKey) return;
  startMatch();
}

function emitLobbyConfig() {
  io.emit('lobby:config', {
    state: lobby.state,
    config: lobby.config,
    rematchRequested: lobby.rematchRequested
  });
}

function tick() {
  if (lobby.state !== 'active' || !lobby.match) return;
  const now = Date.now();
  tickMatch(lobby.match, lobby.inputs, now, TICK_DT);

  // After tickMatch consumes the inputs, clear the tap flags so they don't
  // re-fire next tick. Continuous flags (move, boost, shootHold) persist
  // until the client overwrites them.
  for (const slot of ['p1', 'p2']) {
    const cur = lobby.inputs[slot];
    cur.jump = false;
    cur.stepTap = false;
    cur.shootTap = false;
  }

  // End-of-match check.
  const p1 = lobby.match.fighters.p1;
  const p2 = lobby.match.fighters.p2;
  if (p1.hp <= 0 || p2.hp <= 0) {
    const winner = p1.hp <= 0 ? 'p2' : 'p1';
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
    acks: { p1: lobby.lastAcked.p1, p2: lobby.lastAcked.p2 }
  };
}

setInterval(tick, TICK_RATE_MS);

io.on('connection', (socket) => {
  // Find a free slot. Counts get out of sync after disconnects, so we walk
  // the actual map of taken slots.
  const taken = occupiedSlots();
  let assigned = 'spectator';
  if (!taken.has('p1')) assigned = 'p1';
  else if (!taken.has('p2')) assigned = 'p2';
  lobby.players.set(socket.id, assigned);

  socket.emit('player:assigned', {
    playerId: assigned,
    mode: assigned === 'spectator' ? 'spectator' : 'online-ready',
    matchState: lobby.state
  });

  socket.emit('match:hello', {
    msg: 'hello from gvg-server',
    playerId: assigned,
    serverTime: Date.now(),
    tick: lobby.match?.tick ?? 0,
    matchState: lobby.state
  });

  // Bring the new socket up to date on what's been picked so far. The client
  // uses this to decide what config UI to show.
  socket.emit('lobby:config', {
    state: lobby.state,
    config: lobby.config,
    rematchRequested: lobby.rematchRequested
  });

  // If both player slots just filled and we're not already running, kick
  // off a match. Spectators get the same snapshot stream — no special-case.
  maybeStartMatch();

  socket.on('input:frame', (frame) => {
    const slot = lobby.players.get(socket.id);
    if (slot !== 'p1' && slot !== 'p2') return;
    if (lobby.state !== 'active') return;

    // Track the highest seq we've seen so the client knows what's been
    // consumed (echoed back as `acks` in each snapshot).
    if (typeof frame.seq === 'number' && frame.seq > lobby.lastAcked[slot]) {
      lobby.lastAcked[slot] = frame.seq;
    }

    const cur = lobby.inputs[slot];
    // Continuous fields overwrite. Tap fields are sticky-OR so a tap that
    // arrives between two server ticks isn't dropped.
    lobby.inputs[slot] = {
      moveX: numericOrZero(frame.moveX),
      moveZ: numericOrZero(frame.moveZ),
      boost: !!frame.boost,
      sprintLocked: !!frame.sprintLocked,
      shootHold: !!frame.shootHold,
      jump: cur.jump || !!frame.jump,
      stepTap: cur.stepTap || !!frame.stepTap,
      shootTap: cur.shootTap || !!frame.shootTap
    };
  });

  socket.on('match:configure', (cfg) => {
    const slot = lobby.players.get(socket.id);
    if (slot !== 'p1' && slot !== 'p2') return;
    if (lobby.state === 'active') return; // can't change picks mid-match

    let dirty = false;
    if (cfg && typeof cfg.unitKey === 'string' && UNIT_DATA[cfg.unitKey]) {
      lobby.config[slot].unitKey = cfg.unitKey;
      dirty = true;
    }
    // Map is host-only (p1). Silently ignore p2 trying to set map.
    if (cfg && typeof cfg.mapKey === 'string' && slot === 'p1' && MAP_DATA[cfg.mapKey]) {
      lobby.config[slot].mapKey = cfg.mapKey;
      dirty = true;
    }

    if (dirty) {
      emitLobbyConfig();
      maybeStartMatch();
    }
  });

  socket.on('match:rematch-request', () => {
    const slot = lobby.players.get(socket.id);
    if (slot !== 'p1' && slot !== 'p2') return;
    if (lobby.state !== 'ended') return;

    if (lobby.rematchRequested[slot]) return; // already requested
    lobby.rematchRequested[slot] = true;
    emitLobbyConfig();

    // Start a new match only when BOTH players have requested.
    const slots = occupiedSlots();
    if (slots.has('p1') && slots.has('p2')
      && lobby.rematchRequested.p1 && lobby.rematchRequested.p2) {
      startMatch();
    }
  });

  socket.on('disconnect', () => {
    const slot = lobby.players.get(socket.id);
    lobby.players.delete(socket.id);
    if ((slot === 'p1' || slot === 'p2') && lobby.state === 'active') {
      const winner = slot === 'p1' ? 'p2' : 'p1';
      endMatch(winner, 'forfeit');
    }
    // Clear that slot's config + rematch flag so the next player taking the
    // slot starts fresh and can't inherit a stale "ready for rematch".
    if (slot === 'p1' || slot === 'p2') {
      lobby.config[slot] = { unitKey: null, mapKey: null };
      lobby.rematchRequested[slot] = false;
    }
    // If both player slots are empty, reset the lobby fully.
    const slots = occupiedSlots();
    if (slots.size === 0) {
      lobby.match = null;
      lobby.state = 'waiting';
      lobby.inputs = { p1: emptyInput(), p2: emptyInput() };
      lobby.config = {
        p1: { unitKey: null, mapKey: null },
        p2: { unitKey: null, mapKey: null }
      };
      lobby.rematchRequested = { p1: false, p2: false };
    } else {
      // Tell remaining clients about the slot config / rematch change.
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
