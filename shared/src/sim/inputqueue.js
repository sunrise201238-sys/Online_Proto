// THE SERVER'S INPUT QUEUE (user 2026-10-25, "the backtrace while sprinting"). The server used to keep ONE frame per
// player — each arriving frame overwrote the last, and was acknowledged the moment it arrived — and apply whatever it
// held once a tick. Two frames arriving within one tick meant the first was never applied yet acknowledged: the client
// had predicted its step, the server had not taken it, and the next snapshot pulled the player back by that step (0.44 u
// at a sprint). On a server whose ticks come late and bunched (the free instance's CPU quota is pulsed) that was most
// of the frames, most of the time.
//
// Now the frames queue per player and the tick takes ONE, in order, acknowledging only what it took — so the client walks
// a step for every step the server takes, and a late server means a step applied late, not a step lost. Two bounds keep
// a slow server from falling ever further behind the player: past INPUT_QUEUE_CATCHUP waiting frames a tick takes two
// (merged: the later frame's movement, every tap of both — one step of movement is skipped, the old pull-back, but only
// while the server is more than four frames behind); past INPUT_QUEUE_MAX the oldest are dropped as if taken. An empty
// queue leaves last tick's frame standing, its taps cleared (the server's own rule since the start; a held jump keeps
// its held value). Pure functions, so the rule is testable without a socket: shared/test/inputqueue.test.js.
export const INPUT_QUEUE_CATCHUP = 4;
export const INPUT_QUEUE_MAX = 16;

const numericOrZero = (v) => (Number.isFinite(v) ? v : 0);

// A frame off the wire, made safe: the fields the sim reads, nothing else; seq kept for the acknowledgement.
export function normalizeFrame(frame) {
  return {
    seq: typeof frame.seq === 'number' ? frame.seq : -1,
    moveX: numericOrZero(frame.moveX),
    moveZ: numericOrZero(frame.moveZ),
    boost: !!frame.boost,
    sprintLocked: !!frame.sprintLocked,
    shootHold: !!frame.shootHold,
    jump: !!frame.jump,
    jumpHeld: !!frame.jump,
    stepTap: !!frame.stepTap,
    shootTap: !!frame.shootTap,
    targetSwitch: !!frame.targetSwitch,
    aimX: numericOrZero(frame.aimX),
    aimY: numericOrZero(frame.aimY),
    freeAim: !!frame.freeAim,                  // (free pov, user 2026-10-30: aiming by the crosshair, with its direction)
    aimYaw: numericOrZero(frame.aimYaw),
    aimPitch: numericOrZero(frame.aimPitch),
    lockNearest: !!frame.lockNearest,          // (free pov → angled: lock the nearest enemy, a tap)
    viewAt: Number.isFinite(frame.viewAt) ? frame.viewAt : null
  };
}

// A frame into the queue. Past `max` waiting frames the oldest go, as if taken: the seqs dropped are returned so the
// caller acknowledges them (an unacknowledged frame would be replayed by the client for the rest of the match).
export function enqueueFrame(queue, frame, max = INPUT_QUEUE_MAX) {
  queue.push(frame);
  const dropped = [];
  while (queue.length > max) dropped.push(queue.shift().seq);
  return dropped;
}

// Two frames as one tick's input: the later one's movement and aim, every tap of both, the later one's held values.
function mergeFrames(a, b) {
  return {
    ...b,
    jump: a.jump || b.jump,
    stepTap: a.stepTap || b.stepTap,
    shootTap: a.shootTap || b.shootTap,
    targetSwitch: a.targetSwitch || b.targetSwitch,
    lockNearest: a.lockNearest || b.lockNearest
  };
}

// The tick's input for a player: one frame off the queue (two past the catch-up mark), or `current` left standing when
// the queue is empty. Returns { input, acked } — `acked` the last seq taken, or null when nothing was.
export function consumeFrames(queue, current, catchup = INPUT_QUEUE_CATCHUP) {
  if (queue.length === 0) return { input: current, acked: null, taken: 0 };
  const take = queue.length > catchup ? 2 : 1;
  let merged = null;
  let acked = null;
  for (let i = 0; i < take && queue.length; i += 1) {
    const f = queue.shift();
    merged = merged ? mergeFrames(merged, f) : f;
    if (f.seq > (acked ?? -1)) acked = f.seq;
  }
  return { input: merged, acked, taken: take };
}

// Every waiting frame acknowledged and discarded (a start hold: the client mutes its frames, and a backlog from before
// must not replay into the match).
export function drainQueue(queue) {
  let acked = null;
  for (let i = 0; i < queue.length; i += 1) if (queue[i].seq > (acked ?? -1)) acked = queue[i].seq;
  queue.length = 0;
  return acked;
}
