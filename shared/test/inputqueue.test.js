import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFrame, enqueueFrame, consumeFrames, drainQueue, INPUT_QUEUE_CATCHUP, INPUT_QUEUE_MAX } from '../src/sim/inputqueue.js';

// The server's input queue (2026-10-25): one frame a tick, in order, acknowledged when taken — never before; an empty tick
// keeps the last frame; past the catch-up mark a tick takes two, merged; past the cap the oldest are dropped as taken.
const frame = (seq, extra = {}) => normalizeFrame({ seq, moveX: 0, moveZ: 1, boost: true, ...extra });

test('one frame a tick, in order, acknowledged only when taken', () => {
  const q = []; for (let s = 0; s < 3; s += 1) assert.deepEqual(enqueueFrame(q, frame(s, { moveX: s })), []);
  let cur = frame(-1);
  const seen = [];
  for (let t = 0; t < 3; t += 1) { const r = consumeFrames(q, cur); cur = r.input; seen.push([r.acked, cur.moveX, r.taken]); }
  assert.deepEqual(seen, [[0, 0, 1], [1, 1, 1], [2, 2, 1]]);
  assert.equal(q.length, 0);
});

test('an empty tick keeps the last frame standing and acknowledges nothing', () => {
  const q = []; enqueueFrame(q, frame(7, { shootTap: true }));
  const first = consumeFrames(q, frame(-1)); assert.equal(first.acked, 7); assert.equal(first.input.shootTap, true);
  const standing = { ...first.input, shootTap: false };   // (the tick's own reset clears the taps after use)
  const second = consumeFrames(q, standing); assert.equal(second.acked, null); assert.equal(second.taken, 0); assert.equal(second.input, standing);
});

test('two frames in one tick are not two steps: the first waits for the next tick', () => {
  const q = []; enqueueFrame(q, frame(1, { moveX: 1 })); enqueueFrame(q, frame(2, { moveX: 2 }));
  const a = consumeFrames(q, frame(-1)); assert.equal(a.input.moveX, 1); assert.equal(a.acked, 1);
  const b = consumeFrames(q, a.input); assert.equal(b.input.moveX, 2); assert.equal(b.acked, 2);
});

test(`past ${INPUT_QUEUE_CATCHUP} waiting frames a tick takes two, merged: the later movement, every tap of both`, () => {
  const q = []; for (let s = 0; s < INPUT_QUEUE_CATCHUP + 2; s += 1) enqueueFrame(q, frame(s, { moveX: s, stepTap: s === 0, jump: s === 1 }));
  const r = consumeFrames(q, frame(-1));
  assert.equal(r.taken, 2); assert.equal(r.acked, 1); assert.equal(r.input.moveX, 1);
  assert.equal(r.input.stepTap, true, 'the first frame\'s tap was lost'); assert.equal(r.input.jump, true);
  assert.equal(q.length, INPUT_QUEUE_CATCHUP);
  const next = consumeFrames(q, r.input); assert.equal(next.taken, 1, 'at the mark a tick takes one again');
});

test(`past ${INPUT_QUEUE_MAX} waiting frames the oldest are dropped as taken, their seqs handed back for the acknowledgement`, () => {
  const q = []; const dropped = [];
  for (let s = 0; s < INPUT_QUEUE_MAX + 3; s += 1) dropped.push(...enqueueFrame(q, frame(s)));
  assert.deepEqual(dropped, [0, 1, 2]); assert.equal(q.length, INPUT_QUEUE_MAX); assert.equal(q[0].seq, 3);
});

test('a drain acknowledges everything waiting and leaves the queue empty', () => {
  const q = []; for (let s = 10; s < 14; s += 1) enqueueFrame(q, frame(s));
  assert.equal(drainQueue(q), 13); assert.equal(q.length, 0); assert.equal(drainQueue(q), null);
});

test('a frame off the wire is made safe: numbers or zero, booleans, viewAt or null, seq or -1', () => {
  const f = normalizeFrame({ moveX: 'x', moveZ: 0.5, boost: 1, jump: 'yes', viewAt: Infinity });
  assert.equal(f.moveX, 0); assert.equal(f.moveZ, 0.5); assert.equal(f.boost, true); assert.equal(f.jump, true); assert.equal(f.jumpHeld, true);
  assert.equal(f.viewAt, null); assert.equal(f.seq, -1);
});
