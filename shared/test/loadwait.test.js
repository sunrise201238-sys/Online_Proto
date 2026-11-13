// THE LOADING WAIT (loadwait.js; b1105hh): online, a match's hold begins when every player's page has loaded, 30 s after
// the start at the latest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { beginLoadWait, loadWaitDone, loadWaitOver } from '../src/sim/loadwait.js';
import { LOAD_WAIT_MAX_MS, INTRO_MS } from '../src/sim/constants.js';

test('the loading wait: 30 s at the most, as asked', () => {
  assert.equal(LOAD_WAIT_MAX_MS, 30000);
  assert.ok(INTRO_MS > 0);
});

test('the loading wait: nobody to wait for is no wait, and no wait is over', () => {
  assert.equal(beginLoadWait([], 1000), null);
  assert.equal(loadWaitOver(null, 1000), true);
});

test('the loading wait: over when every waited seat has reported, not before', () => {
  const w = beginLoadWait(['p1', 'p2'], 1000);
  assert.equal(w.until, 1000 + LOAD_WAIT_MAX_MS);
  assert.equal(loadWaitOver(w, 1000), false);
  loadWaitDone(w, 'p1');
  assert.equal(loadWaitOver(w, 5000), false, 'p2 is still loading');
  loadWaitDone(w, 'p1');
  assert.equal(loadWaitOver(w, 5000), false, 'a seat reporting twice changes nothing');
  loadWaitDone(w, 'p2');
  assert.equal(loadWaitOver(w, 5000), true);
});

test('the loading wait: over when its time has run out, whoever is still loading', () => {
  const w = beginLoadWait(['p1', 'p2'], 1000);
  loadWaitDone(w, 'p1');
  assert.equal(loadWaitOver(w, 1000 + LOAD_WAIT_MAX_MS - 1), false);
  assert.equal(loadWaitOver(w, 1000 + LOAD_WAIT_MAX_MS), true);
  assert.deepEqual([...w.waiting], ['p2'], 'the seat that never reported is still named');
});

test('the loading wait: a seat that leaves is no longer waited for; a seat never waited for is nothing', () => {
  const w = beginLoadWait(['p1', 'p3'], 0);
  loadWaitDone(w, 'p2');   // (a bot's seat, an older page's, a spectator: never in the wait)
  assert.equal(loadWaitOver(w, 10), false);
  loadWaitDone(w, 'p3');   // (p3 left)
  loadWaitDone(w, 'p1');
  assert.equal(loadWaitOver(w, 10), true);
  loadWaitDone(null, 'p1');   // (no wait: nothing, no throw)
});

test('the loading wait: its length can be set (a test server uses a short one)', () => {
  const w = beginLoadWait(['p1'], 100, 500);
  assert.equal(loadWaitOver(w, 599), false);
  assert.equal(loadWaitOver(w, 600), true);
});
