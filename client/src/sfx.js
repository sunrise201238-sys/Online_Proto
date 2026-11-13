// sfx.js — THE GAME'S SOUNDS AND ITS MUSIC (b1105hk, user 2026-11-13: "use the OG one, make this Hiyori's gunshot sound" — the
// first sounds the game had; then a long series of recordings, each cut to the sound asked for and set to a level by ear on the
// listening site; then, the site's numbers all standing: "Implement in PT and 9.7").
//
// WHAT PLAYS AND HOW LOUD is not written here: sfx_data.js is, by the listening site's own tool, from the levels the site plays
// — a sound's file and level, each unit's sounds, the music's tracks. A lasting change of a level is made on the site.
//
// A SOUND is a file under public/sfx (several sounds may be one file, at different levels). The files are asked for as the page
// boots; they are decoded once the page's audio is open; a play starts at the moment the recording's own sound starts (the
// silence a file carries before it is passed over, so a shot is heard at the trigger), and every play is a voice of its own: a
// shot's tail rings on under the next shot. A play gives back its voice, which can be stopped (a bolt cut by the next shot, a
// charge let go early, a reload's later passes when the unit falls).
//
// A browser opens a page's audio only inside the user's own touch, click or key, so the audio is opened by the first of those
// (sfxBoot's listeners) and asked to run again by any later one that finds it stopped (a phone call, the page put away). Until
// it runs, and while a file is not in hand, a play is dropped: a shot heard late is worse than a shot not heard. The page put
// away (a hidden tab, a locked phone) holds the audio; it runs on when the page is back.
//
// THE MUSIC (user 2026-11-13: "I'm going to add some background music. The background music will be able to turn off via mute
// button inside "Guide" and "Pause"."): a track is a file under public/bgm, some two minutes of stereo. The game says which
// PLACE the player is in (bgmPlace: the main menu, the character menu, the battle, the ending camera); entering a place draws
// one of its tracks ("randomly play one of these 3") and changes to it, and the track loops while the player stays ("Loop the
// same one") — from its first sound to its last, the silence an MP3 carries at its two ends left out of the round, a few
// milliseconds faded each side of the turn. Between the places of a soft pair (BGM_SOFT: the two menus; the ending camera and
// the main menu — "more soft, instead of interrupting", "the end game bgm and the main menu bgm need the soft switch too") the
// old track fades out as the new fades in, equal power; any other change is a cut ("The other BGMs stays interrupting"). A
// track is fetched when it is first wanted and decoded then — some 50 MB decoded, so no more than two are held: the one
// playing and the one coming. The tracks a place may lead to are drawn ahead and their files fetched, so a change is prompt.
// The BGM button turns the music alone off and on; the choice is kept in the browser.
import { SFX_VOLUME, SFX_SOUNDS, BGM_TRACKS, BGM_SOFT, BGM_FADE_MS } from './sfx_data.js';
export { SFX_VOLUME };

const SFX_MAX_VOICES = 48;       // more at once than this: the oldest that has started is faded out in 30 ms
const SFX_MAX_PER_FILE = 8;      // ...and of one file (a gun firing fast, each shot's tail a second or two long): its oldest
const SFX_ONSET_LEVEL = 0.02;    // the recording's sound starts at its first sample louder than this (of 1)...
const SFX_LEAD_IN_S = 0.003;     // ...and a play starts this long before it
const SFX_RETRY_MS = 5000;       // a file that did not come, or did not decode, is tried again no sooner than this
const SFX_STOP_FADE_S = 0.03;    // a voice stopped: down to nothing over this long
// THE LIMITER: every voice and the music add up before the output, and four guns at once can pass what it carries (1), where it
// would be clipped flat. A compressor as a ceiling stands before the output: nothing under -3 dB of full scale is touched, what
// passes it is held under it; the gain after it takes back the lift such a compressor adds of its own.
const SFX_LIMIT = { threshold: -3, knee: 0, ratio: 20, attack: 0.002, release: 0.2 };
const BGM_KEY = 'archivevs.bgm';        // the BGM button's choice in the browser: '0' off, anything else on
const BGM_EDGE_LEVEL = 0.001;           // a track's round: from its first sample over this to its last
const BGM_TURN_IN_S = 0.003, BGM_TURN_OUT_S = 0.008;   // the fades each side of the turn
const BGM_OFF_FADE_S = 0.25;            // the BGM button: the music down over this long
// from a place, the places the player may go to next: one track of each is drawn ahead and its file fetched
const BGM_AHEAD = { menu: ['char', 'combat'], char: ['menu'], combat: ['end'], end: ['menu'] };

let base = './', forceExt = null;
let ctx = null, master = null, sfxBus = null, musicBus = null;
const files = {};                // file -> { ext, bytes, fetched, buffer, offset, busy, retryAt }
const voices = [];               // { src, gain, key, file, at }, oldest first
const stats = { played: 0, dropped: 0, stolen: 0 };
const log = [];                  // (a probe's: the last plays, { key, at: the page clock, delay })

// One step on towards a file being playable: its bytes fetched, then (the audio open) decoded and its start found. Called at
// boot, when the audio opens, and by every play that found the file not ready.
function want(file) {
  const s = files[file];
  if (!s || s.buffer || s.busy || performance.now() < s.retryAt) return;
  const again = () => { s.busy = false; s.fetched = false; s.retryAt = performance.now() + SFX_RETRY_MS; };
  if (!s.bytes) {
    s.busy = true;
    fetch(`${base}${file}${forceExt ?? s.ext}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => { s.bytes = ab; s.fetched = true; s.busy = false; want(file); }, again);
    return;
  }
  if (!ctx) return;
  s.busy = true;
  const ab = s.bytes; s.bytes = null;   // (the decoder takes the bytes with it; a failed try fetches them again, from the browser's cache)
  const done = (buf) => { s.buffer = buf; s.offset = onsetOf(buf); s.busy = false; };
  try { const p = ctx.decodeAudioData(ab, done, again); if (p && p.catch) p.catch(() => {}); } catch (e) { again(); }
}

function onsetOf(buf) {
  let first = buf.length;
  for (let c = 0; c < buf.numberOfChannels; c += 1) {
    const d = buf.getChannelData(c);
    let i = 0;
    while (i < first && Math.abs(d[i]) <= SFX_ONSET_LEVEL) i += 1;
    first = i;
  }
  return first >= buf.length ? 0 : Math.max(0, first / buf.sampleRate - SFX_LEAD_IN_S);
}

// The page's audio opened, or asked to run again: only ever called from inside a touch, click or key of the user's own.
function sfxOpen() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = SFX_VOLUME;
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.connect(master);
      let out = master;
      try {
        const lim = ctx.createDynamicsCompressor();
        for (const k in SFX_LIMIT) lim[k].value = SFX_LIMIT[k];
        // (the lift a compressor of these settings adds: what it makes of full scale, to the power 0.6 — the Web Audio rule)
        const full = 10 ** ((SFX_LIMIT.threshold + (0 - SFX_LIMIT.threshold) / SFX_LIMIT.ratio) / 20);
        const back = ctx.createGain(); back.gain.value = full ** 0.6;
        master.connect(lim); lim.connect(back); out = back;
      } catch (e) { out = master; }
      out.connect(ctx.destination);
      // (an older iPhone opens its audio only for a sound started inside the touch itself: one silent sample)
      const hush = ctx.createBufferSource(); hush.buffer = ctx.createBuffer(1, 1, 22050); hush.connect(ctx.destination); hush.start(0);
      for (const file in files) want(file);
      ctx.onstatechange = () => { if (ctx.state === 'running') bgmSync(); };
    }
    if (ctx.state !== 'running' && !document.hidden) { const p = ctx.resume(); if (p && p.then) p.then(bgmSync, () => {}); }
    else bgmSync();
  } catch (e) { /* a page without audio: the game plays on, silent */ }
}

// Once, as the page boots: `baseUrl` the page's own folder (import.meta.env.BASE_URL); `fileExt` one extension for every file
// (the PT site serves them all as .wasm), or nothing for each file's own.
export function sfxBoot(baseUrl, fileExt = null) {
  if (typeof window === 'undefined') return;
  base = baseUrl ?? base; forceExt = fileExt || null;
  for (const key in SFX_SOUNDS) { const f = SFX_SOUNDS[key]; if (!files[f.file]) files[f.file] = { ext: f.ext, bytes: null, fetched: false, buffer: null, offset: 0, busy: false, retryAt: 0 }; }
  for (const file in files) want(file);
  try { bgm.on = window.localStorage.getItem(BGM_KEY) !== '0'; } catch (e) { bgm.on = true; }
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, sfxOpen, { capture: true, passive: true });
  // the page put away: the audio held (the music would play on in a tab nobody sees); back: it runs on
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    try { if (document.hidden) { if (ctx.state === 'running') ctx.suspend(); } else if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.then) p.then(bgmSync, () => {}); } } catch (e) { /* as it was */ }
  });
}

function fadeOut(v, fadeS = SFX_STOP_FADE_S) {
  try {
    const t = Math.max(ctx.currentTime, v.at);
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + fadeS);
    v.src.stop(t + fadeS + 0.01);
  } catch (e) { /* already ended */ }
}
function drop(v) { const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); }

// Play a sound `delayS` seconds from now (0: now), at its own level. Gives back the voice (to stop it with sfxStop), or null
// when nothing was started.
export function sfxPlay(key, delayS = 0) {
  const f = SFX_SOUNDS[key], s = f ? files[f.file] : null;
  if (!s) return null;
  if (!ctx || ctx.state !== 'running' || !s.buffer) { want(f.file); stats.dropped += 1; return null; }
  try {
    const now = ctx.currentTime;
    // room: of this file its oldest voice, of them all the oldest that has started (one still waiting for its moment — a
    // reload's later pass, a bolt — is the last to go)
    const same = voices.filter((v) => v.file === f.file);
    if (same.length >= SFX_MAX_PER_FILE) { const v = same[0]; drop(v); fadeOut(v); stats.stolen += 1; }
    while (voices.length >= SFX_MAX_VOICES) { const v = voices.find((x) => x.at <= now) ?? voices[0]; drop(v); fadeOut(v); stats.stolen += 1; }
    const src = ctx.createBufferSource(); src.buffer = s.buffer;
    const gain = ctx.createGain(); gain.gain.value = f.level;
    src.connect(gain); gain.connect(sfxBus);
    const v = { src, gain, key, file: f.file, at: delayS > 0 ? now + delayS : now };
    src.onended = () => { drop(v); try { gain.disconnect(); } catch (e) { /* gone */ } };
    src.start(delayS > 0 ? v.at : 0, s.offset);
    voices.push(v);
    stats.played += 1;
    log.push({ key, at: Math.round(performance.now()), delay: delayS }); if (log.length > 400) log.shift();
    return v;
  } catch (e) { stats.dropped += 1; return null; }
}

// Stop a voice sfxPlay gave back: one already sounding fades out over `fadeS`; one still waiting for its moment never sounds.
export function sfxStop(v, fadeS = SFX_STOP_FADE_S) {
  if (!v || !ctx) return;
  if (voices.indexOf(v) < 0) return;
  drop(v);
  if (v.at > ctx.currentTime) { try { v.src.onended = null; v.src.stop(0); v.gain.disconnect(); } catch (e) { /* gone */ } return; }
  fadeOut(v, fadeS);
}

// (a probe's hook, as main.js's __intro: what is open, what is in hand, what has played)
export function sfxState() {
  const out = { audio: ctx ? ctx.state : null, volume: SFX_VOLUME, voices: voices.length, sounding: voices.map((v) => v.key), ...stats, log: log.slice(), sounds: {}, files: Object.keys(files).length };
  for (const key in SFX_SOUNDS) { const f = SFX_SOUNDS[key], s = files[f.file]; out.sounds[key] = { file: f.file, fetched: !!s?.fetched, ready: !!s?.buffer, level: f.level, startS: s?.buffer ? +s.offset.toFixed(4) : null, seconds: s?.buffer ? +s.buffer.duration.toFixed(3) : null }; }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------
// THE MUSIC
// ---------------------------------------------------------------------------------------------------------------------------
const bgm = {
  on: true,
  place: null,        // the place the game last named
  wantId: null,       // the track that place is to hear (drawn at the entry)
  cur: null,          // the playing track: { id, src, fade, gain, a, z }
  outs: [],           // tracks fading out under a soft change
  ahead: {},          // place -> a track drawn ahead for it
  bytes: {},          // id -> the file's bytes, or the promise of them (fetched ahead)
  held: {},           // id -> the promise of { b, a, z }: the decoded track and its round
  ask: 0,
  log: [],            // (a probe's: the last changes, { id, soft, at })
};
const PLACES = {};
for (const id in BGM_TRACKS) (PLACES[BGM_TRACKS[id].place] ??= []).push(id);

function bgmDraw(place) {
  const ahead = bgm.ahead[place]; if (ahead) { delete bgm.ahead[place]; return ahead; }
  const ids = PLACES[place]; return ids?.length ? ids[Math.floor(Math.random() * ids.length)] : null;
}
function bgmFetch(id) {
  if (!bgm.bytes[id]) {
    const t = BGM_TRACKS[id];
    bgm.bytes[id] = fetch(`${base}${t.file}${forceExt ?? t.ext}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))));
    bgm.bytes[id].catch(() => { delete bgm.bytes[id]; });
  }
  return bgm.bytes[id];
}
// a decoded track's round: its first and its last sound, the two short fades written into the track itself
function bgmEdges(b) {
  const n = b.length, sr = b.sampleRate; let first = n, last = 0;
  for (let c = 0; c < b.numberOfChannels; c += 1) {
    const d = b.getChannelData(c);
    let i = 0; while (i < first && Math.abs(d[i]) <= BGM_EDGE_LEVEL) i += 1; first = i;
    let j = n - 1; while (j > last && Math.abs(d[j]) <= BGM_EDGE_LEVEL) j -= 1; last = Math.max(last, j);
  }
  if (first >= last) return { a: 0, z: b.duration };
  const a = Math.max(0, first - Math.round(0.002 * sr)), z = Math.min(n, last + Math.round(0.002 * sr));
  const fi = Math.round(BGM_TURN_IN_S * sr), fo = Math.round(BGM_TURN_OUT_S * sr);
  for (let c = 0; c < b.numberOfChannels; c += 1) { const d = b.getChannelData(c); for (let i = 0; i < fi; i += 1) d[a + i] *= i / fi; for (let i = 0; i < fo; i += 1) d[z - 1 - i] *= i / fo; }
  return { a: a / sr, z: z / sr };
}
// the decoded track (the audio must be open). Holds it, and lets go every other but the one playing.
function bgmTrack(id) {
  if (!bgm.held[id]) {
    for (const k in bgm.held) if (k !== bgm.cur?.id) delete bgm.held[k];
    bgm.held[id] = bgmFetch(id).then((bytes) => { delete bgm.bytes[id]; return new Promise((ok, no) => ctx.decodeAudioData(bytes, ok, no)); }).then((b) => ({ b, ...bgmEdges(b) }));
    bgm.held[id].catch(() => { delete bgm.held[id]; });
  }
  return bgm.held[id];
}
const bgmCurve = (up, from = 1) => { const n = 33, c = new Float32Array(n); for (let i = 0; i < n; i += 1) { const x = i / (n - 1); c[i] = up ? Math.sin(x * Math.PI / 2) : from * Math.cos(x * Math.PI / 2); } return c; };
function bgmKill(m) {
  try { m.src.stop(); } catch (e) { /* not started, or over */ }
  try { m.fade.disconnect(); m.gain.disconnect(); } catch (e) { /* gone */ }
  const i = bgm.outs.indexOf(m); if (i >= 0) bgm.outs.splice(i, 1);
  clearTimeout(m.timer);
}
// a track sent out over `dur` seconds, from where its fade stands (one still coming in can be sent out)
function bgmOut(m, dur) {
  if (!(dur > 0.01)) { bgmKill(m); return; }
  const p = m.fade.gain, now = ctx.currentTime, cur = p.value;
  try { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else p.cancelScheduledValues(now); } catch (e) { /* none */ }
  try { p.setValueAtTime(cur, now); p.setValueCurveAtTime(bgmCurve(false, cur), now, dur); }
  catch (e) { try { p.cancelScheduledValues(now); p.setValueAtTime(cur, now); p.linearRampToValueAtTime(0, now + dur); } catch (e2) { p.value = 0; } }
  bgm.outs.push(m);
  m.timer = setTimeout(() => bgmKill(m), dur * 1000 + 80);
}
function bgmBegin(id, t, fadeIn) {
  const src = ctx.createBufferSource(); src.buffer = t.b; src.loop = true; src.loopStart = t.a; src.loopEnd = t.z;
  const fade = ctx.createGain(), gain = ctx.createGain(); gain.gain.value = BGM_TRACKS[id].level;
  const now = ctx.currentTime;
  if (fadeIn > 0.01) { fade.gain.setValueAtTime(0, now); fade.gain.setValueCurveAtTime(bgmCurve(true), now, fadeIn); }
  src.connect(fade); fade.connect(gain); gain.connect(musicBus);
  src.start(now, t.a);
  return { id, src, fade, gain, a: t.a, z: t.z, t0: now, timer: 0 };
}
const bgmSoft = (x, y) => { const px = BGM_TRACKS[x]?.place, py = BGM_TRACKS[y]?.place; return px !== py && BGM_SOFT.some((p) => p.includes(px) && p.includes(py)); };
// what should be heard is made to be heard: called when the place changes, the audio opens, the button is pressed, a track is
// ready. The playing track goes on until the wanted one is ready; then the change, soft or at once.
function bgmSync() {
  if (!ctx || ctx.state !== 'running') return;
  const id = bgm.on ? bgm.wantId : null;
  if (!id) { if (bgm.cur) { const m = bgm.cur; bgm.cur = null; bgmOut(m, BGM_OFF_FADE_S); } return; }
  if (bgm.cur?.id === id) return;
  const ask = ++bgm.ask;
  bgmTrack(id).then((t) => {
    if (ask !== bgm.ask || !bgm.on || bgm.wantId !== id || bgm.cur?.id === id || ctx.state !== 'running') return;
    const old = bgm.cur, soft = !!old && bgmSoft(old.id, id), dur = soft ? BGM_FADE_MS / 1000 : 0;
    bgm.cur = null;
    if (old) bgmOut(old, dur);
    bgm.cur = bgmBegin(id, t, dur);
    bgm.log.push({ id, soft, at: Math.round(performance.now()) }); if (bgm.log.length > 32) bgm.log.shift();
    for (const k in bgm.held) if (k !== id) delete bgm.held[k];   // (the one before is its own source's now, until it has faded)
    bgmAhead(BGM_TRACKS[id].place);
  }, () => {});
}
// the tracks the player may hear next, drawn now and their files asked for
function bgmAhead(place) {
  for (const p of BGM_AHEAD[place] ?? []) { if (!bgm.ahead[p]) bgm.ahead[p] = bgmDraw(p); if (bgm.ahead[p] && bgm.on) bgmFetch(bgm.ahead[p]).catch(() => {}); }
}

// The place the player is in now: 'menu', 'char', 'combat', 'end' (null: no music). Entering a place draws its track; the
// same place named again changes nothing.
export function bgmPlace(place) {
  if (place === bgm.place) return;
  bgm.place = place;
  bgm.wantId = place ? bgmDraw(place) : null;
  bgmSync();
}
// A place the player is about to enter (the battle, under the loading screen): its track drawn and decoded ahead, so the change
// is on the moment. No more than the one playing and this one are held.
export function bgmWarm(place) {
  if (!bgm.on || !PLACES[place]) return;
  if (!bgm.ahead[place]) bgm.ahead[place] = bgmDraw(place);
  const id = bgm.ahead[place];
  if (!id) return;
  if (ctx && ctx.state === 'running') bgmTrack(id).catch(() => {}); else bgmFetch(id).catch(() => {});
}
// The BGM button: the music alone, off or on; kept in the browser.
export function bgmSetOn(on) {
  bgm.on = !!on;
  try { window.localStorage.setItem(BGM_KEY, bgm.on ? '1' : '0'); } catch (e) { /* not kept */ }
  if (bgm.on && bgm.place && !bgm.wantId) bgm.wantId = bgmDraw(bgm.place);
  bgmSync();
  return bgm.on;
}
export function bgmIsOn() { return bgm.on; }
// (a probe's hook)
export function bgmState() {
  const m = bgm.cur;
  return { on: bgm.on, place: bgm.place, want: bgm.wantId, playing: m ? m.id : null, level: m ? m.gain.gain.value : null, fade: m ? m.fade.gain.value : null,
    loop: m ? [+m.a.toFixed(3), +m.z.toFixed(3)] : null, seconds: m ? +m.src.buffer.duration.toFixed(3) : null,
    outs: bgm.outs.map((o) => ({ id: o.id, fade: o.fade.gain.value })), held: Object.keys(bgm.held), ahead: { ...bgm.ahead }, fetched: Object.keys(bgm.bytes), log: bgm.log.slice() };
}
