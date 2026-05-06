import { io } from 'socket.io-client';

// Vite injects import.meta.env.VITE_SERVER_URL at build time. Falls back to
// localhost for local dev. The trailing slash matters; Socket.IO is forgiving
// either way but keep it absent for consistency.
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
  let listeners = new Set();
  let playerId = null;
  let connected = false;
  let lastError = null;
  let snapshotCount = 0;
  const snapshotTimes = [];

  const notify = () => {
    listeners.forEach((cb) => {
      try { cb(); } catch (err) { console.error('[online] listener error', err); }
    });
  };

  const log = (kind, payload) => {
    // Snapshots arrive at the server tick rate (~40 Hz) and would evict every
    // other event from the buffer within ~1 second. Track them separately as
    // a counter + recent-times list for Hz computation.
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
    log('player:assigned', payload);
  });

  socket.on('match:hello', (payload) => {
    log('match:hello', payload);
  });

  // Catch-all for snapshots so Phase 0 already shows them arriving once we
  // hook them up later. Harmless if the server doesn't send any yet.
  socket.on('match:snapshot', (payload) => {
    log('match:snapshot', { tick: payload?.tick, t: payload?.serverTime });
  });

  return {
    serverUrl: SERVER_URL,
    socket,
    open: () => { if (!socket.connected) socket.connect(); },
    close: () => { if (socket.connected) socket.disconnect(); },
    isConnected: () => connected,
    getPlayerId: () => playerId,
    getEvents: () => events.slice(),
    getSnapshotCount: () => snapshotCount,
    getSnapshotHz: () => snapshotTimes.length,
    getLastError: () => lastError,
    onUpdate: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }
  };
}
