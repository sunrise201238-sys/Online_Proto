# DIORAMA_PLAN.md — Diorama View (design record)

Status: POC phase 1 IMPLEMENTED 2026-08-20 (client-only, offline, behind a
hidden toggle — V key in a match, or `window.__diorama.toggle()`; framing and
grade tunables live-editable via `window.__diorama.view` / `.maps`). The code
sits in client/src/main.js in the "DIORAMA VIEW (POC)" section (state block
near the early globals, functions near the map builders) plus small gated
hooks at: updateCamera (rig branch), updatePlayer (no-target fire guard),
startMatch (no auto-lock in diorama), updateLocksAndReticle /
updateMechAnimations / the two arrow updaters (legacy overlays parked),
buildArenaForMap (dressing), animate (tilt-shift render + annotation update).
Everything gates on dioramaActive(); the classic chase view is unchanged
when off, and online mode is untouched.
Read this before continuing any diorama work — it records the owner's
decisions from the design sessions. Branch policy: ALL edits go directly to
`Demo_0.7.5_Test-Fields`; do not touch any other branch.

## 1. Concept

Make the map read as a diorama / miniature that the player observes while
playing — the "time-lapse photography" look of tilt-shift miniature footage:
high oblique vantage, shallow depth of field, the fight a small fast thing
inside a calm grand scene. Rationale: FPS/TPS never lets the player actually
look at the landscape during play; this mode makes the landscape a
first-class part of the experience.

Vibe references provided by the owner (2026-08-20): three tilt-shift stills —
a city intersection, layered elevated rail/highways, a dense low-rise town.
Common traits to reproduce:

- ~40–55° high oblique camera angle;
- strong top/bottom defocus bands (tilt-shift DoF is the signature — all three
  references depend on it);
- warm daylight, saturated, toy-like color;
- PARTIAL framing: a photographic crop whose edges melt into blur — not
  necessarily the whole map in frame at once. Framing amount is a POC tuning
  knob; the references argue for a crop over a full-board view.

Explicitly rejected: accelerated ambient time (no fast day/night cycle, no
speeding sky). The time-lapse feel comes from the look and the observational
camera, not from clock tricks.

## 2. Locked gameplay/UX decisions

### Camera
- Mostly fixed diorama vantage; moves only slightly — mild horizontal
  rotation and/or shift following the player's own unit movement (soft
  parallax). Heavily damped, small caps (a few degrees / a few units).

### Movement
- Screen-relative input: stick/WASD "up" = screen up, re-derived from the
  live camera (which only rotates mildly). No longer target/chase-relative.
- Architecturally free: both input paths already derive world vectors from
  the camera every frame, and the wire format is world-space — server and
  protocol untouched.

### Targeting (replaces auto/cycle lock as the primary path)
- Tap/click directly on an enemy to select the lock target.
- The enemy's HUD square IS the tap hit-area (bigger than the tiny sprite) —
  this is the tap-accuracy solution; no extra snapping needed.
- Overlapping squares: repeated taps on the cluster cycle through the
  candidates; cycling mode ends automatically once squares no longer overlap.
- Selected target dies → auto-switch to the nearest enemy.
- Match start: NO auto-selection. The player's first deliberate act is
  picking a target (intentional asymmetry with the death auto-switch;
  doubles as onboarding for the tap mechanic).
- Keyboard/mouse: click = tap. Keep the U-cycle key as a fallback during the
  POC and observe whether anyone uses it.

### Firing
- Fire button stays fully manual; auto-aim toward the selected target stays.
- No target selected → fire button renders half-transparent; pressing it
  (touch or J) pops a brief centered toast ("please select a target") that
  quickly fades.
- Firing at a LOS-blocked target IS allowed — bullets honestly die on the
  geometry, physics unchanged; the indicator only informs.

### HUD annotation system ("museum label" style)
- Thin-line square brackets around units; a thin leader line extends to the
  nearest screen edge, where a small info card lives.
- Leader/label layout continuously re-accommodates the composition (avoid
  units, avoid each other, prefer the nearest edge, smooth transitions) — a
  small label-layout solver. Visual priority: own unit + locked target get
  the full annotation (square + leader + card); other units get minimal
  squares until tapped.
- A set of mini triangle crosshair marks indicates who the player is
  currently aiming at — visually distinct from the selection square.
- LOS state: an enemy that cannot currently be hit (unit-to-unit bullet line
  blocked by geometry) renders as a half-transparent/ghosted marker. Reuse
  the sim's existing shot-path test (the same rule bots use to gate fire) so
  what the player sees always matches what the sim would do.

## 3. POC scope (phase 1)

- Offline only, vs bots. Online comes after the concept proves out (protocol
  needs zero change; do not touch `server/`).
- Maps: Plain Field (simplest) and Streets (bridge + height variety).
- Entry: hidden toggle key inside the existing offline mode — no menu work.
  The classic chase view must remain fully intact behind the toggle.
- Visuals for the POC:
  - perspective camera first, seeded from the mapPhoto parameters
    (fov 45, ~40° elevation, dist ~220) and tuned from there;
  - cheap tilt-shift pass: screen-Y gradient blur (two-pass gaussian with a
    focus band around the action) — no full DoF needed;
  - a daylight-ish grading preset for diorama mode (Streets' night ambience
    fights the reference vibe);
  - crop/replace the global ground plane + grid to map bounds — currently the
    single biggest spoiler of the miniature look.
- Later / out of POC scope: tracer/trail color changes (owner: later);
  orthographic-vs-perspective final call; multi-layer landscape ambitions
  (hills, multi-floor buildings — will need roof/floor fade à la wall-fade, a
  thin vertical drop-line + ground ring for height readability, and geometry
  instancing/merging for volume); online mode; the PvP information-balance
  question (diorama view grants near-perfect information).

## 4. Implementation map (from the 2026-08-20 code assessment)

All client-side, in `client/src/main.js` unless noted. Line numbers are from
the 2026-08-20 read of `Demo_0.7.5_Test-Fields` — expect drift, re-grep first.

- Camera: created at :994-996 (PerspectiveCamera 58°, far 300 — far plane must
  be raised for the diorama). The ONLY per-frame writer is `updateCamera`
  :6715-6779 (it also performs spectate sprite swaps and reticle reparenting —
  preserve those side effects when branching the rig). Dev aerial view
  `mapPhoto` :10235-10265 holds validated diorama framing parameters
  (fov 45, dist 220, height 0.85*dist, fog nulled).
- Per-map fog/ambience: `applyMapAmbience` :10088-10164.
- Movement input basis: offline `updatePlayer` :4100-4105, online
  `buildOnlineInputFrame` :7297-7305 (both camera-derived; screen-relative
  comes free — verify feel).
- Overlay sizing is tuned to the ~14-unit chase distance and needs a diorama
  sizing rule: tags/bars :1525-1621 (`UNIT_TAG_REF_DIST`=14 :1643), reticle
  clamp :6254-6260, glint :2832-2846, DOM edge arrows :6363-6564 (mostly moot
  when the whole fight is in frame).
- Global 280x280 ground + GridHelper :1011-1055 extend past every map's
  bounds — crop/replace per map. Per-map bounds live in `MAP_BOUNDARY`
  (`shared/src/sim/arena.js:28-38`); red edge stripes come from
  `addBoundaryIndicator` :10036.
- LOS test to reuse for the ghost indicator: the sim's shot-path gate
  (`shared/src/sim/ai.js` `hasShotPath` :280 /
  `physics.projectileHitsSurface`) — running it render-side per visible enemy
  per frame is cheap at 2–4 units.
- Wall fade :9844-9926: proximity mode is dead from a high camera; occlude
  mode can later be repurposed for roofs/floors. Units are THREE.Sprite
  billboards :1272-1380 — fine at ~40–50° tilt; do not go steeper without new
  art.
- Targeting state today: `state.playerCurrentTarget` + `cyclePlayerTarget`
  :929; shots derive owner→target at :2606-2620. Tap-select should pick
  against the HUD squares (screen-space), not raycast the tiny sprites.
- No post-processing pipeline exists (no EffectComposer anywhere) — the
  tilt-shift pass is net-new; keep it toggleable for performance.

## 5. Working agreements (owner-set)

- Edit ONLY branch `Demo_0.7.5_Test-Fields`.
- Do not run heavy/long simulations (anything approaching ~10 minutes or a
  large compute volume in a single run) without asking the owner first.
- The stable game (online/offline/bot behavior/current player experience)
  must not regress: diorama work is additive behind a toggle until proven.
