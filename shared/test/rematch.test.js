// THE END OF A MATCH ONLINE (rematch.js; b1105is): what the room does from what its seated players chose — everyone has to
// have chosen, one RESELECT is enough for the room to pick again, and a player who left is not waited for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { END_CHOICES, END_LEAVE_NOTICE_MS, endVerdict, endHoldLeft, leftSeats } from '../src/sim/rematch.js';

test('the room waits until every seated player has chosen', () => {
  assert.deepEqual(END_CHOICES, ['rematch', 'reselect']);
  assert.equal(endVerdict(['p1', 'p2'], { p1: null, p2: null }), null, 'nobody has chosen');
  assert.equal(endVerdict(['p1', 'p2'], { p1: 'rematch', p2: null }), null, 'one has, one has not');
  assert.equal(endVerdict(['p1', 'p2'], { p1: 'reselect', p2: null }), null, 'a RESELECT does not move the room before the other has chosen');
  assert.equal(endVerdict(['p1', 'p2', 'p3', 'p4'], { p1: 'rematch', p2: 'rematch', p3: 'reselect', p4: null }), null, 'three of four');
  assert.equal(endVerdict(['p1', 'p2'], { p1: 'rematch' }), null, 'a seat with no entry has not chosen');
  assert.equal(endVerdict(['p1'], null), null, 'no table at all');
  assert.equal(endVerdict(['p1', 'p2'], { p1: 'rematch', p2: 'leave' }), null, 'a word that is no choice is no choice');
});

test('everyone for the rematch: the rematch; one RESELECT among them: the room picks again', () => {
  assert.equal(endVerdict(['p1', 'p2'], { p1: 'rematch', p2: 'rematch' }), 'rematch');
  assert.equal(endVerdict(['p1', 'p2'], { p1: 'rematch', p2: 'reselect' }), 'reselect');
  assert.equal(endVerdict(['p1', 'p2'], { p1: 'reselect', p2: 'rematch' }), 'reselect', 'whoever asked for it');
  assert.equal(endVerdict(['p1', 'p2'], { p1: 'reselect', p2: 'reselect' }), 'reselect');
  assert.equal(endVerdict(['p1', 'p2', 'p3', 'p4'], { p1: 'rematch', p2: 'rematch', p3: 'rematch', p4: 'rematch' }), 'rematch');
  assert.equal(endVerdict(['p1', 'p2', 'p3', 'p4'], { p1: 'rematch', p2: 'rematch', p3: 'rematch', p4: 'reselect' }), 'reselect', 'one of four is enough');
  assert.equal(endVerdict(new Set(['p2', 'p4']), { p2: 'rematch', p4: 'rematch' }), 'rematch', 'a set of seats, and no host among them');
});

test('a player who left is not waited for, and an empty room does nothing', () => {
  // p2 left without choosing: the room goes by p1 alone
  assert.equal(endVerdict(['p1'], { p1: 'rematch', p2: null }), 'rematch');
  assert.equal(endVerdict(['p1'], { p1: 'reselect', p2: null }), 'reselect');
  // a choice left behind in a seat nobody sits in counts for nothing
  assert.equal(endVerdict(['p1'], { p1: 'rematch', p2: 'reselect' }), 'rematch');
  assert.equal(endVerdict(['p1', 'p3'], { p1: 'rematch', p2: 'reselect', p3: null }), null, 'and does not stand in for one who has not chosen');
  assert.equal(endVerdict([], { p1: 'rematch' }), null, 'nobody seated');
});

test('the seats whose player left: a player at the start, nobody now', () => {
  const two = ['p1', 'p2'], four = ['p1', 'p2', 'p3', 'p4'];
  assert.deepEqual(leftSeats(two, [], ['p1', 'p2']), [], 'both still here');
  assert.deepEqual(leftSeats(two, [], ['p1']), ['p2'], 'the guest left');
  assert.deepEqual(leftSeats(two, [], ['p2']), ['p1'], 'the host left');
  assert.deepEqual(leftSeats(two, ['p2'], ['p1']), [], 'a seat a bot played from the start was never left');
  assert.deepEqual(leftSeats(four, ['p3', 'p4'], ['p1']), ['p2'], 'a 2v2 with two bots: one of the two players went');
  assert.deepEqual(leftSeats(four, new Set(['p3']), new Set(['p4'])), ['p1', 'p2'], 'sets, and two who went, in seat order');
  assert.deepEqual(leftSeats(four, [], []), four, 'everyone went');
  assert.deepEqual(leftSeats(two, ['p3'], ['p1', 'p2', 'p4']), [], 'seats outside the mode are not read');
});

test('a leaving at the end page holds the room for the notice, and nothing else does', () => {
  const T = 1_700_000_000_000, N = END_LEAVE_NOTICE_MS;
  assert.ok(N >= 2000 && N <= 5000, 'long enough to be read, short enough not to be a wait');
  assert.equal(endHoldLeft(0, T), 0, 'nobody has left: no hold');
  assert.equal(endHoldLeft(undefined, T), 0, 'no record: no hold');
  assert.equal(endHoldLeft(T, T), N, 'the whole of it at the leaving');
  assert.equal(endHoldLeft(T, T + 1000), N - 1000);
  assert.equal(endHoldLeft(T, T + N - 1), 1, 'still held a millisecond before its end');
  assert.equal(endHoldLeft(T, T + N), 0, 'over at its end');
  assert.equal(endHoldLeft(T, T + 60000), 0, 'and long after');
  assert.equal(endHoldLeft(T, T - 5000), N, 'a clock that stepped back holds no longer than the hold itself');
  // the last leaving counts: a second player gone starts the hold again
  assert.equal(endHoldLeft(T + 2000, T + 2500), N - 500);
});
