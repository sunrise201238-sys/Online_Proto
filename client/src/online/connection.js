import { io } from 'socket.io-client';
import { UNIT_DATA } from '@gvg/shared/src/sim/index.js';   // (the unit tables the snapshots no longer carry)

// Vite injects import.meta.env.VITE_SERVER_URL at build time. Falls back to
// localhost for local dev.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const MAX_LOG_ENTRIES = 40;

export function createConnection() {
  // RECONNECTION (user 2026-10-25, "the web socket error"): the server sleeps between sessions (a free instance spins down
  // after 15 idle minutes, ~1 min to wake) and then warms every map's route grid before it answers anyone (Compound alone
  // ~3.4 s on a fast core, a minute or more on the free one). Five tries 600 ms apart gave up inside that window, and the
  // player was left with "Connection error: websocket error" and a dead page. Now the client never gives up: it retries
  // every 1–5 s (backing off, jittered) for as long as the page is open, and the overlay says the server is waking up.
  const socket = io(SERVER_URL, {
    // THE LOADING WAIT (b1105hh, shared loadwait.js): this page says as it connects that it reports when a match's things
    // are in hand (sendLoaded) — the server waits, at a match's start, for the pages that said so and for no other
    auth: { loadWait: 1 },
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20000
  });

  const events = [];
  const listeners = new Set();
  let playerId = null;
  let connected = false;
  let lastError = null;
  let attempts = 0;            // failed connection attempts since the last success (the overlay shows the count)
  let waitingSince = 0;        // when the current wait for the server began (open(), or the moment the link dropped)
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
    attempts = 0;
    waitingSince = 0;
    log('connect', { id: socket.id });
  });

  socket.on('disconnect', (reason) => {
    connected = false;
    if (!waitingSince) waitingSince = Date.now();
    log('disconnect', { reason });
  });

  socket.on('connect_error', (err) => {
    lastError = err?.message || String(err);
    attempts += 1;
    if (!waitingSince) waitingSince = Date.now();
    log('connect_error', { message: lastError, attempt: attempts });
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

  let matchStart = null;      // the match:start payload — carries the match's spread seed (shotSeed)
  socket.on('match:start', (payload) => {
    matchState = 'active';
    latestSnapshot = null;
    prevSnapshot = null;
    lastMatchEnd = null;
    lastKill = null; kills.length = 0;
    killQueue.length = 0; projSeen.clear(); for (const id in slotSwap) delete slotSwap[id];
    matchStart = payload ?? null;
    log('match:start', payload);
  });

  socket.on('match:end', (payload) => {
    matchState = 'ended';
    lastMatchEnd = payload ?? null;
    log('match:end', payload);
  });

  const hitQueue = [];
  const firedQueue = [];   // (THE UNIT'S SOUNDS, b1105hk: the trigger pulls of the snapshots since the last drain — see the snapshot handler)
  // THE FINALE (PT b1105gb): the last lethal hit seen, its shooter and its target — a knockout's final blow.
  // (b1105gh) And the lethal hits before it, the last eight, each with the moment it arrived: where a Trio slot's unit fell in
  // the match's last tick the server has refilled the slot before it ends the match, so the LAST lethal hit can be on a
  // unit that stands again — the finale takes the last one whose target is still down (main.js startOnlineFinale). Read
  // off the snapshots the page gets anyway: nothing more is sent or asked for.
  let lastKill = null;
  const kills = [];
  // THE KILL FEED (PT b1105gm): every lethal hit as the page draws it — which seat, with which unit, knocked out which unit of
  // which seat, and whether that knockout ended the match — worked out HERE, where every snapshot passes (the render loop sees
  // one a frame, and two can land between frames):
  //  - the fallen unit is the one its seat held in the snapshot BEFORE this one: in Trio the server refills the seat in the
  //    very tick its unit falls, so the snapshot that carries the hit already shows the roster's next unit there;
  //  - the shooter's unit is its seat's, unless that seat's roster moved after the round was fired (a hit names a seat, not a
  //    unit). So each round is remembered by the snapshot that first showed it (projSeen) and each seat by its last roster
  //    move (slotSwap). The seat's rounds that left the snapshots with this hit — gone, or a volley that lost pellets; those of
  //    the hit's own damage when some are — are all from before the move: the unit that stood there until then fired it. Some
  //    from before and some from after: the one nearest the hit decides. None left at all (a beam, a blade, a round born and
  //    spent within a tick): the seat's unit — or, the roster having moved in this very tick, the one before it, for the fresh
  //    unit has not lived a tick yet;
  //  - the match is over when the snapshot says so by the server's own rule (index.js tickLobby, step 5: a seat is out when
  //    its unit is down and its roster spent, a side when every seat of it is) — the feed does not show that knockout.
  // Read off the snapshots the page gets anyway: nothing more is sent or asked for.
  const killQueue = [];
  const projSeen = new Map();   // a server round's id -> the server clock of the snapshot that first showed it
  const slotSwap = {};          // a seat -> { at: the server clock of the snapshot its roster moved in, wasKey: the unit that stood there until then }
  const slotOut = (f) => !f || ((f.hp ?? 0) <= 0 && (!f.roster || (f.rosterIdx ?? 0) >= f.roster.length - 1));
  const snapshotEndsMatch = (snap) => {
    const F = snap.fighters ?? {};
    if (snap.mode === '2v2' || F.p3 || F.p4) return (slotOut(F.p1) && slotOut(F.p3)) || (slotOut(F.p2) && slotOut(F.p4));
    return slotOut(F.p1) || slotOut(F.p2);
  };
  const firedBy = (ev, snap, prev) => {
    const cur = snap.fighters?.[ev.ownerId]?.unitKey ?? null;
    const sw = slotSwap[ev.ownerId];
    if (!sw) return cur;
    const live = new Map();
    for (const p of snap.projectiles ?? []) live.set(p.id, p);
    let gone = (prev?.projectiles ?? []).filter((p) => p.ownerId === ev.ownerId && (!live.has(p.id) || (p.pelletMask !== undefined && live.get(p.id).pelletMask !== p.pelletMask)));
    if (!gone.length) return sw.at === snap.serverTime ? sw.wasKey : cur;
    const same = gone.filter((p) => p.damage === ev.damage);
    if (same.length) gone = same;
    const old = gone.filter((p) => (projSeen.get(p.id) ?? Infinity) <= sw.at);
    if (old.length === gone.length) return sw.wasKey;
    if (!old.length || !ev.pos || !prev) return cur;
    const dt = Math.max(0, (snap.serverTime - prev.serverTime) / 1000);
    const far = (p) => Math.hypot(p.pos.x + p.vel.x * dt - ev.pos.x, p.pos.y + p.vel.y * dt - ev.pos.y, p.pos.z + p.vel.z * dt - ev.pos.z);
    let best = gone[0];
    for (const p of gone) if (far(p) < far(best)) best = p;
    return old.includes(best) ? sw.wasKey : cur;
  };
  const noteKills = (snap, prev) => {
    const F = snap.fighters ?? {}, P = prev?.fighters ?? {};
    for (const id in F) { const f = F[id], was = P[id]; if (f && was && (f.rosterIdx ?? 0) !== (was.rosterIdx ?? 0)) slotSwap[id] = { at: snap.serverTime, wasKey: was.unitKey ?? null }; }
    if (snap.events) {
      const fell = new Set();   // (one knockout a unit: a second lethal hit on it in the same tick is the same fall)
      let last = null;
      for (const ev of snap.events) {
        if (!ev || ev.type !== 'hit' || ev.targetHp == null || ev.targetHp > 0 || fell.has(ev.targetId)) continue;
        fell.add(ev.targetId);
        if (last == null) last = snapshotEndsMatch(snap);
        killQueue.push({ ownerId: ev.ownerId, targetId: ev.targetId, ownerKey: firedBy(ev, snap, prev), targetKey: P[ev.targetId]?.unitKey ?? F[ev.targetId]?.unitKey ?? null, last });
      }
      if (killQueue.length > 32) killQueue.splice(0, killQueue.length - 32);
    }
    const live = new Set();
    for (const p of snap.projectiles ?? []) { live.add(p.id); if (!projSeen.has(p.id)) projSeen.set(p.id, snap.serverTime); }
    for (const id of projSeen.keys()) if (!live.has(id)) projSeen.delete(id);
  };
  socket.on('match:snapshot', (payload) => {
    if (!payload) return;
    // The server sends no unit tables (2026-10-25, a quarter of every snapshot): each fighter carries its unitKey, and the
    // same shared table it used to carry is re-attached here, so every reader downstream sees what it always saw.
    if (payload.fighters) for (const id in payload.fighters) { const f = payload.fighters[id]; if (f && !f.unit && f.unitKey) f.unit = UNIT_DATA[f.unitKey]; }
    // HIT X (user 2026-11-10): every snapshot's hit events, queued — the render loop applies one snapshot a frame, and
    // two can land between frames, so the events of the one skipped were lost; the loop drains this (drainHits).
    if (payload.events) for (const ev of payload.events) if (ev && ev.type === 'hit') hitQueue.push({ ownerId: ev.ownerId, targetId: ev.targetId });
    if (hitQueue.length > 256) hitQueue.splice(0, hitQueue.length - 256);
    // THE UNIT'S SOUNDS (b1105hk): every snapshot's trigger pulls, queued as the hits are. Who fired; as which unit (the
    // event's own word: in Trio the seat may hold its next unit by the snapshot's end); the pull's number in the sim's
    // shot counter and the rounds left after it — the seat's own in this snapshot, or, its roster having moved in this
    // very tick, the count of the unit that stood there plus this pull, and no rounds (that unit is down); and the
    // page's clock at arrival, for a report that waits is not sounded late.
    if (payload.events) for (const ev of payload.events) if (ev && ev.type === 'fired') {
      const cur = payload.fighters?.[ev.ownerId], was = latestSnapshot?.fighters?.[ev.ownerId];
      const moved = !!cur && !!was && (cur.rosterIdx ?? 0) !== (was.rosterIdx ?? 0);
      const n = moved ? was.shotsFired + 1 : cur?.shotsFired;
      firedQueue.push({ ownerId: ev.ownerId, unitKey: ev.weapon ?? cur?.unitKey ?? null, shot: Number.isFinite(n) ? n : null, ammo: moved ? 0 : (Number.isFinite(cur?.ammo) ? cur.ammo : null), at: performance.now() });
    }
    if (firedQueue.length > 64) firedQueue.splice(0, firedQueue.length - 64);
    if (payload.events) for (const ev of payload.events) if (ev && ev.type === 'hit' && ev.targetHp != null && ev.targetHp <= 0) { lastKill = { ownerId: ev.ownerId, targetId: ev.targetId, at: performance.now() }; kills.push(lastKill); if (kills.length > 8) kills.shift(); }
    noteKills(payload, latestSnapshot);   // (THE KILL FEED, b1105gm: against the snapshot before this one)
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

    open: () => { if (!socket.connected) { if (!waitingSince) waitingSince = Date.now(); socket.connect(); } },
    close: () => { if (socket.connected) socket.disconnect(); },

    isConnected: () => connected,
    getPlayerId: () => playerId,
    getMatchState: () => matchState,
    getMatchStart: () => matchStart,
    getLastMatchEnd: () => lastMatchEnd,
    getLastKill: () => lastKill,   // (the finale's final blow, PT b1105gb)
    getKills: () => kills,         // (the lethal hits before it too, oldest first, b1105gh)
    getLastError: () => lastError,
    getAttempts: () => attempts,
    getWaitingSince: () => waitingSince,   // 0 when connected

    // Debug log helpers (snapshot events filtered out — see log()).
    getEvents: () => events.slice(),
    drainHits: () => hitQueue.splice(0),   // (HIT X: the hit events queued since the last call)
    drainFired: () => firedQueue.splice(0), // (THE UNIT'S SOUNDS, b1105hk: the trigger pulls queued since the last call)
    drainKills: () => killQueue.splice(0), // (THE KILL FEED, b1105gm: the knockouts worked out since the last call)
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
    // mode ('sd' = Duel | 'trio') and the Sudden Death rules flag (owner
    // 2026-10-07: everyone at 1 HP — the main menu's Normal | Sudden Death
    // chip). Server rejects if not p1 or mid-match.
    sendSetMode: (mode, mainMode, suddenDeath) => {
      if (!connected) return;
      const msg = mainMode ? { mode, mainMode } : { mode };
      if (typeof suddenDeath === 'boolean') msg.suddenDeath = suddenDeath;
      socket.emit('match:set-mode', msg);
    },
    // Host-only: flip the Sudden Death rules alone (the room's rules chip).
    sendSetRules: (suddenDeath) => {
      if (!connected) return;
      socket.emit('match:set-mode', { suddenDeath: !!suddenDeath });
    },

    // Host-only (2v2): start the match now with bot-fill for empty slots.
    sendStartNow: () => {
      if (!connected) return;
      socket.emit('match:start-now');
    },

    // THE LOADING WAIT (b1105hh): everything this page's match needs is in hand and its first picture drawn — `startTime`
    // is the match's own (match:start), so the word cannot be taken for the next match's. Nothing is answered: the
    // server's clock starts when every page has said so, and shows in the snapshots (`loadUntil` 0, `introUntil`).
    sendLoaded: (startTime) => {
      if (!connected) return;
      socket.emit('match:loaded', { startTime });
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
    // `slot` (optional) targets a commandable BOT teammate instead of the
    // sender's own unit (owner 2026-08-22); omitted = own unit.
    sendOrderMove: (x, z, floorY, slot, noLadder = false) => {
      if (!connected) return;
      socket.emit('order:move', { x, z, floorY, slot, noLadder });   // (noLadder: the hold-cycled way without a ladder — main.js dioramaGestureFrame)
    },
    sendOrderLock: (target, slot) => {
      if (!connected) return;
      socket.emit('order:lock', { target, slot });
    },
    sendOrderClear: (slot, what) => {
      // what: 'move' | 'lock' | undefined (both) — server-side granular clear.
      if (!connected) return;
      socket.emit('order:clear', { slot, what });
    },
    // Fight / Hide stance (owner 2026-09-26): hide=true parks the unit out
    // of every enemy's sight (the server also wipes its move/lock orders),
    // hide=false is plain autonomy. Answered with order:result
    // { kind: 'stance', ok, hide, reason: null | 'rate' }; the standing
    // flag itself arrives as commands[slot].hide in the team snapshot.
    sendOrderStance: (hide, slot) => {
      if (!connected) return;
      socket.emit('order:stance', { slot, hide: !!hide });
    },
    // THE ALLY TACTIC (shared tactic.js; b1105gq): a classic player's call to the bot on their side — kind 'push' (FORWARD) or
    // 'hide' (BACK OFF) for 10 s, null to take the standing one back. Nothing is answered: what stands arrives as
    // commands[slot].tactic { kind, until } in the side's snapshots.
    sendAllyTactic: (kind, slot) => {
      if (!connected) return;
      socket.emit('ally:tactic', { slot, kind: kind ?? null });
    },
    getOrderResult: () => ({ seq: orderResultSeq, data: lastOrderResult }),

    onUpdate: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }
  };
}
