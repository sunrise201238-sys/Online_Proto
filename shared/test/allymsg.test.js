// THE TEAMMATE'S MESSAGES (allymsg.js; b1105js): in an online 2v2, a player's four messages to the player beside them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLY_MSG_KINDS, ALLY_MSG_TEXT, ALLY_MSG_SHOW_MS, ALLY_MSG_COOLDOWN_MS, ALLY_MSG_SLACK_MS, allyMsgMate, allyMsgTo } from '../src/sim/allymsg.js';

// two players on side A (p1, p3), a player and a bot on side B (p2, p4's is a bot), every unit standing
const room = (over = {}) => ({ mode: '2v2', humans: new Set(['p1', 'p2', 'p3']), bots: new Set(['p4']), commanders: new Set(), hpOf: () => 100, lastAt: -Infinity, now: 10000, ...over });

test('the messages: four, as asked, shown 2 s and 3 s apart', () => {
  assert.deepEqual(ALLY_MSG_KINDS, ['go', 'back', 'askGo', 'askBack']);
  assert.deepEqual(ALLY_MSG_KINDS.map((k) => ALLY_MSG_TEXT[k]), ["I'LL GO FORWARD", "I'LL PULL BACK", 'PLEASE GO FORWARD', 'PLEASE PULL BACK']);
  assert.equal(ALLY_MSG_SHOW_MS, 2000);
  assert.equal(ALLY_MSG_COOLDOWN_MS, 3000);
  assert.ok(ALLY_MSG_SLACK_MS > 0 && ALLY_MSG_SLACK_MS < 1000);
});

test('the messages: the seat beside one\'s own', () => {
  assert.equal(allyMsgMate('p1'), 'p3'); assert.equal(allyMsgMate('p3'), 'p1');
  assert.equal(allyMsgMate('p2'), 'p4'); assert.equal(allyMsgMate('p4'), 'p2');
  assert.equal(allyMsgMate('spectator'), null); assert.equal(allyMsgMate(undefined), null);
});

test('the messages: a player to the player beside them, each of the four, either way', () => {
  for (const kind of ALLY_MSG_KINDS) {
    assert.equal(allyMsgTo(room({ sender: 'p1', kind })), 'p3');
    assert.equal(allyMsgTo(room({ sender: 'p3', kind })), 'p1');
  }
});

test('the messages: none to a bot beside one, none from a bot, a spectator or a seat nobody sits in', () => {
  assert.equal(allyMsgTo(room({ sender: 'p2', kind: 'go' })), null);          // p4 is a bot: the button there is the bot's two calls
  assert.equal(allyMsgTo(room({ sender: 'p4', kind: 'go' })), null);
  assert.equal(allyMsgTo(room({ sender: 'spectator', kind: 'go' })), null);
  assert.equal(allyMsgTo(room({ sender: undefined, kind: 'go' })), null);
  assert.equal(allyMsgTo(room({ sender: 'p1', kind: 'go', humans: new Set(['p1']) })), null);   // nobody in p3
});

test('the messages: a mate who left is a bot from then on, and gets none', () => {
  assert.equal(allyMsgTo(room({ sender: 'p1', kind: 'askGo', humans: new Set(['p1', 'p2']), bots: new Set(['p3', 'p4']) })), null);
});

test('the messages: only the four, only in a 2v2', () => {
  for (const kind of ['push', 'hide', '', null, undefined, 7, {}]) assert.equal(allyMsgTo(room({ sender: 'p1', kind })), null);
  assert.equal(allyMsgTo(room({ sender: 'p1', kind: 'go', mode: '1v1' })), null);
});

test('the messages: none to a mate whose unit is down; the sender\'s own unit is not asked about', () => {
  assert.equal(allyMsgTo(room({ sender: 'p1', kind: 'go', hpOf: (s) => (s === 'p3' ? 0 : 100) })), null);
  assert.equal(allyMsgTo(room({ sender: 'p1', kind: 'go', hpOf: (s) => (s === 'p1' ? 0 : 100) })), 'p3');
  assert.equal(allyMsgTo(room({ sender: 'p1', kind: 'go', hpOf: () => undefined })), null);
});

test('the messages: none from command mode, where there is no such button; a commander still receives', () => {
  assert.equal(allyMsgTo(room({ sender: 'p1', kind: 'go', commanders: new Set(['p1']) })), null);
  assert.equal(allyMsgTo(room({ sender: 'p1', kind: 'go', commanders: new Set(['p3']) })), 'p3');
});

test('the messages: three seconds apart, less the line\'s slack', () => {
  const at = 50000;
  assert.equal(allyMsgTo(room({ sender: 'p1', kind: 'go', lastAt: at, now: at + 1000 })), null);
  assert.equal(allyMsgTo(room({ sender: 'p1', kind: 'go', lastAt: at, now: at + ALLY_MSG_COOLDOWN_MS - ALLY_MSG_SLACK_MS - 1 })), null);
  assert.equal(allyMsgTo(room({ sender: 'p1', kind: 'go', lastAt: at, now: at + ALLY_MSG_COOLDOWN_MS - ALLY_MSG_SLACK_MS })), 'p3');
  assert.equal(allyMsgTo(room({ sender: 'p1', kind: 'go', lastAt: at, now: at + ALLY_MSG_COOLDOWN_MS })), 'p3');
});

test('the messages: the seats may come as arrays as well as sets', () => {
  assert.equal(allyMsgTo({ mode: '2v2', sender: 'p2', kind: 'back', humans: ['p2', 'p4'], bots: ['p1', 'p3'], commanders: [], hpOf: () => 1, now: 1 }), 'p4');
});
