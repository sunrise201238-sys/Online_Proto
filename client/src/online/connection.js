import { io } from 'socket.io-client';

// Vite injects import.meta.env.VITE_SERVER_URL at build time. Falls back to
// localhost for local dev.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const MAX_LOG_ENTRIES = 40;

export function createConnection() {
  const socket = io(SERVER_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 600
  });

  const events = [];
  const listeners = new Set();
  let playerId = null;
  let connected = false;
  let lastError = null;
  let snapshotCount = 0;
  const snapshotTimes = [];

  // Snapshot-stream state used by the online match runtime.
  let latestSnapshot = null;
  let prevSnapshot = null;
  let lastSnapshotAt = 0;

  // Match lifecycle bits.
  let matchState = 'waiting'; // 'waiting' | 'active' | 'ended'
  let lastMatchEnd = null;    // { winnerId, reason, endedAt } or null
  let lobbyConfig = null;     // { state, config: { p1: {unitKey, mapKey}, p2: {...} } }

  const notify = () => {
    listeners.forEach((cb) => {
      try { cb(); } catch (err) { console.error('[online] listener error', err); }
    });
  };

  const log = (kind, payload) => {
    if (kind === 'match:snapshot') {
      snapshotCount += 1;
      const now = Date.now();
      snapshotTimes.push(now);
      while (snapshotTimes.length && now - snapshotTimes[0] > 1000) snapshotTimes.shift();
      notify();
      return;
    }
    events.push({ kind, payload, t: Date.now() });
    if (events.length > MAX_LOG_ENTRIES) events.shift();
    notify();
  };

  socket.on('connect', () => {
    connected = true;
    lastError = null;
    log('connect', { id: socket.id });
  });

  socket.on('disconnect', (reason) => {
    connected = false;
    log('disconnect', { reason });
  });

  socket.on('connect_error', (err) => {
    lastError = err?.message || String(err);
    log('connect_error', { message: lastError });
  });

  socket.on('player:assigned', (payload) => {
    playerId = payload?.playerId ?? null;
    matchState = payload?.matchState ?? matchState;
    log('player:assigned', payload);
  });

  socket.on('match:hello', (payload) => {
    matchState = payload?.matchState ?? matchState;
    log('match:hello', payload);
  });

  socket.on('match:start', (payload) => {
    matchState = 'active';
    latestSnapshot = null;
    prevSnapshot = null;
    lastMatchEnd = null;
    log('match:start', payload);
  });

  socket.on('match:end', (payload) => {
    matchState = 'ended';
    lastMatchEnd = payload ?? null;
    log('match:end', payload);
  });

  socket.on('match:snapshot', (payload) => {
    if (!payload) return;
    prevSnapshot = latestSnapshot;
    latestSnapshot = payload;
    lastSnapshotAt = Date.now();
    log('match:snapshot', { tick: payload.tick, t: payload.serverTime });
  });

  socket.on('lobby:config', (payload) => {
    lobbyConfig = payload;
    if (payload?.state) matchState = payload.state;
    log('lobby:config', payload);
  });

  // COMMAND MODE (phase 3): order acknowledgements. The render loop polls
  // getOrderResult and compares seq to know when a fresh one landed.
  let lastOrderResult = null;
  let orderResultSeq = 0;
  socket.on('order:result', (payload) => {
    lastOrderResult = payload;
    orderResultSeq += 1;
    log('order:result', payload);
  });

  return {
    serverUrl: SERVER_URL,
    socket,

    open: () => { if (!socket.connected) socket.connect(); },
    close: () => { if (socket.connected) socket.disconnect(); },

    isConnected: () => connected,
    getPlayerId: () => playerId,
    getMatchState: () => matchState,
    getLastMatchEnd: () => lastMatchEnd,
    getLastError: () => lastError,

    // Debug log helpers (snapshot events filtered out — see log()).
    getEvents: () => events.slice(),
    getSnapshotCount: () => snapshotCount,
    getSnapshotHz: () => snapshotTimes.length,

    // Snapshot stream — used by the render loop.
    getLatestSnapshot: () => latestSnapshot,
    getPreviousSnapshot: () => prevSnapshot,
    getLastSnapshotAt: () => lastSnapshotAt,

    // Send the player's current input frame to the server. Cheap; called
    // every render frame from the online match loop.
    sendInput: (frame) => {
      if (!connected) return;
      socket.emit('input:frame', frame);
    },

    requestRematch: () => {
      if (!connected) return;
      socket.emit('match:rematch-request');
    },

    // Floating sniper unlock: confirm to the server that a charge aimed at
    // ME just rendered its glint — the shooter's 0.5 s cancel floor counts
    // from this confirmation instead of their button press.
    sendGlintAck: (shooterId) => {
      if (!connected) return;
      socket.emit('charge:glint-ack', { shooterId });
    },

    // Send a config choice (unitKey and/or mapKey). Server validates and
    // echoes the new state back via lobby:config.
    sendConfigure: (cfg) => {
      if (!connected) return;
      socket.emit('match:configure', cfg);
    },

    // Host-only: set lobby mode ('1v1' | '2v2') and optionally the main
    // mode ('sd' = Duel | 'trio'). Server rejects if not p1 or mid-match.
    sendSetMode: (mode, mainMode) => {
      if (!connected) return;
      socket.emit('match:set-mode', mainMode ? { mode, mainMode } : { mode });
    },

    // Host-only (2v2): start the match now with bot-fill for empty slots.
    sendStartNow: () => {
      if (!connected) return;
      socket.emit('match:start-now');
    },

    // Move to a different (empty) slot during the lobby. Used by the team
    // swap UI so two players can co-op on the same team. Server rejects if
    // the slot is taken, not active in the current mode, or is p1.
    sendJoinSlot: (slot) => {
      if (!connected) return;
      socket.emit('match:join-slot', { slot });
    },

    getLobbyConfig: () => lobbyConfig,

    // COMMAND MODE (phase 3): order transport. The server validates and
    // answers with order:result to this socket only; the standing command
    // state itself arrives via the team-scoped snapshot `commands` block.
    sendOrderMove: (x, z, floorY) => {
      if (!connected) return;
      socket.emit('order:move', { x, z, floorY });
    },
    sendOrderLock: (target) => {
      if (!connected) return;
      socket.emit('order:lock', { target });
    },
    sendOrderClear: () => {
      if (!connected) return;
      socket.emit('order:clear');
    },
    getOrderResult: () => ({ seq: orderResultSeq, data: lastOrderResult }),

    onUpdate: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }
  };
}
