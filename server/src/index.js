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
  TICK_DT
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
  lobby.match = createMatchState({
    mapKey: 'arena1',
    p1UnitKey: 'unit1',
    p2UnitKey: 'unit1',
    startTime
  });
  lobby.state = 'active';
  lobby.inputs = { p1: emptyInput(), p2: emptyInput() };
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
  if (slots.has('p1') && slots.has('p2')) startMatch();
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
    io.emit('match:snapshot', buildSnapshot(lobby.match));
    endMatch(winner, 'ko');
    return;
  }

  io.emit('match:snapshot', buildSnapshot(lobby.match));
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

  // If both player slots just filled and we're not already running, kick
  // off a match. Spectators get the same snapshot stream — no special-case.
  maybeStartMatch();

  socket.on('input:frame', (frame) => {
    const slot = lobby.players.get(socket.id);
    if (slot !== 'p1' && slot !== 'p2') return;
    if (lobby.state !== 'active') return;
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

  socket.on('match:rematch-request', () => {
    // Either player can request rematch once a match has ended; both ready
    // semantics are deferred to Phase 4. For now, any request restarts.
    if (lobby.state === 'ended') {
      const slots = occupiedSlots();
      if (slots.has('p1') && slots.has('p2')) startMatch();
    }
  });

  socket.on('disconnect', () => {
    const slot = lobby.players.get(socket.id);
    lobby.players.delete(socket.id);
    if ((slot === 'p1' || slot === 'p2') && lobby.state === 'active') {
      const winner = slot === 'p1' ? 'p2' : 'p1';
      endMatch(winner, 'forfeit');
    }
    // If both player slots are empty, reset the lobby fully.
    const slots = occupiedSlots();
    if (slots.size === 0) {
      lobby.match = null;
      lobby.state = 'waiting';
      lobby.inputs = { p1: emptyInput(), p2: emptyInput() };
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
