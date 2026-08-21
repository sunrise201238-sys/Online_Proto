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
Playtest round 1 (owner, 2026-08-20) applied: z-fight ground flicker fixed
(diorama near plane 6 + base plate lowered/polygon-offset + anisotropy);
camera is now PLAYER-CENTRED (look target rides the focus unit, clamped to
`followBound` of the half-extents) instead of map-centred; off-frame units
render as direction-true diamonds (ray-from-screen-centre placement + a
direction triangle, like the old edge arrows); sniper units (unit.sniperCharge)
draw a scope reticle instead of the square (diamond + inner cross off-frame);
info cards slide vertically until they cover no marker square and no other
card; the diorama toggle is reachable on touch via the pause menu
("View: Diorama/Classic", offline only).

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

---

## Phase 2 — COMMAND MODE (IMPLEMENTED 2026-08-21)

The diorama becomes a STRATEGIC PLANNING mode. The direct-control diorama
variant is RETIRED: V / the pause-menu toggle switches classic chase <->
command mode. Offline only for now; the command layer is client-side bot
logic only — shared/src/sim/ai.js stays untouched until an online phase.

Status: implemented and headless-verified 2026-08-21. Code map: command
layer + free camera + gesture controller live in the DIORAMA section of
client/src/main.js (commandTargetOf / applyMoveOrder / dioramaCommandTick,
updateDioramaCamera + dioramaGroundPoint, onDioPointer* + onDioWheel);
animate()'s offline branch drives team A bots with the overrides; exiting
the mode clears every standing command and returns the blue unit to the
player (owner reminder honored). Move orders steer via a post-bot velocity
override (reflex layers checked via botState/botCoverPath/step/hit-stun),
so updateEnemy keeps aiming/firing — no bot refactor, shared ai.js
untouched. anchorMs runs on the wall clock. Debug hooks:
__diorama.debug.{order, clear, layerStackAt, groundPoint}.
Known notes: headless SwiftShader runs the sim in slow motion at big
viewports (dt-capped low fps — an automation artifact, not a game bug);
the Range map keeps direct control; pinch zoom and the long-press layer
switch are implemented but still need a hands-on touch test.

### Core loop
- Every unit is bot-driven (runBotAIForMech drives the player slot exactly
  like spectator mode). The player is a commander: observe, select, order.
- Solo play commands BOTH team-A units (blue + green).

### Commands

1. Force lock (target order)
   - Tap an own unit's square/card -> selection glow on its square + card.
   - Tap an enemy square/diamond/card -> that unit force-locks the enemy.
     The triangle crosshair renders in the COMMANDING unit's color
     (blue lock = blue triangles, green = green); two allies locking the
     same enemy stack both colors side by side.
   - Force lock persists until EITHER party dies -> the bot auto-switches
     to a remaining enemy and returns to its own target-finding logic
     until the next order.
   - While selected: tapping the same locked enemy again cancels that
     force lock (selection glow stays); tapping a different enemy re-locks
     directly (no cancel needed); tapping empty ground clears the selection.
   - Tapping enemy HUD with NO unit selected: no-op.

2. Move order (position command)
   - DRAG from an own unit's square (a movement threshold separates drag
     from the tap-select).
   - A deployment circle projects onto the terrain under the finger.
     Radius: ONE global fixed value, taken from the Engage orbit setting.
     LONG-PRESS during the drag cycles the vertical layer (bridge deck vs
     the ground beneath).
   - While dragging: a thin dashed path preview updates live (throttled
     A*); an unreachable destination turns the circle red and releasing
     issues nothing.
   - Release = order: the unit pathfinds to the circle CENTER, fighting
     along the way but never abandoning the destination. Defense /
     anti-glint / cover-reload reflexes still preempt; afterwards the
     route replans from the current position.
   - Arrival: Engage-style orbit ANCHORED ON THE CIRCLE (its centre, at
     the circle radius), facing the unit's lock target, for 5 s (tunable),
     then the normal behavior loop takes over.
   - A new drag replaces the standing order. DOUBLE-TAP on the own
     square = full reset: cancels the move order AND clears the force
     lock, returning the unit to full autonomy.

3. Status icons — gold, glowing, shown BOTH at the square/diamond's top
   corner AND inside the info card (replacing the NO SIGHT status line):
   - "!" while a position command is active (en route + 5 s anchor);
   - "eye" while autonomous.
   The "!" reflects position commands ONLY; force lock is expressed solely
   by the colored triangles. Blue and green both wear the icons; Trio
   respawns default to the eye.

### Removed / hidden in command mode
- All direct-control inputs: action buttons + joystick hidden (PAUSE and
  fullscreen stay). Fire/dodge/jump/sprint are bot decisions.
- NO SIGHT text and the entire dashed-line LOS treatment (squares, leader
  lines, card borders). The LOS plumbing stays in code but sits idle.
- The no-target fire dimming + toast, U-cycle, and the old
  tap-enemy-sets-player-lock semantics (superseded by the selection flow).

### Camera
- Free camera. Opening frame = whole-map overview. Dragging from empty
  ground pans (clamped to map bounds); pinch / wheel zooms by dollying
  along the fixed elevation axis — tilt unchanged, miniature look intact.
- Tilt-shift: the focus band pins to the screen centre (slightly widened),
  and every unit punches a LOCAL CLEAR POCKET in the blur (the composite
  shader receives up to 4 unit screen positions) so fighters never sit
  inside bokeh.

### Implementation notes (for the build phase)
- Command layer in the OFFLINE bot only (the main.js mirror);
  shared/src/sim/ai.js untouched — no dual-implementation burden.
- Move order = replace the bot's self-chosen Maze destination with the
  ordered point; overlay layers preempt exactly as today.
- Force lock = a target-pick override above pickBotTargetOf, cleared on
  either party's death.
- Player-slot death in SD: the remaining ally stays commandable; win/loss
  rules unchanged.

### Phase 2.1 refinements (owner, 2026-08-21)

- Commanded travel DASHES instead of walking: normal sprint/boost economy
  and momentum rules apply. The stamina CAP is untouched and nothing is
  granted; instead the journey keeps a RESERVE FLOOR of 50 boost that the
  dash may not spend — the unit sprints while boost > 50 and falls back
  to walking at the floor (the floor binds only commanded travel; combat
  reflexes keep their own funding rules). A raw command-speed multiplier
  was considered and REJECTED (bypasses the stamina economy).
- Map ROTATION: pivot = the current look target (screen centre); tilt
  unchanged. Touch: two-finger twist (same gesture set as pinch zoom —
  span change zooms, angle change rotates, simultaneously). Desktop:
  right-mouse drag, or Q/E keys.
- Mode separation: the select menu gains a Classic / Command mode chip
  (alongside Duel/Trio); the choice persists in localStorage across
  sessions; V / the pause menu still toggles mid-match. New players
  default to Classic.
- TAP-TAP ordering (coexists with drag orders): tap an own unit's card
  OR marker -> selection glow -> tap anywhere on the map = area order
  (HOLD the tap to cycle the vertical layer, same as the drag
  long-press) / tap an enemy card or marker = force lock -> the glow
  turns OFF after a command lands (one command per selection).
  Tapping the selected unit again = deselect without ordering.
  Unreachable destination: a small red "Area is not available" note +
  red ring fades at the tapped spot, and the selection glow STAYS so the
  player can re-tap directly.
- Status icons redefined: "!" = has an area order (travel + anchor);
  "eye" = force-locking an enemy (pairs with the colored triangles on
  that enemy); NO icon when a unit has no command; both icons render
  side by side when both commands are active. Double-tap on an own
  MARKER OR CARD clears all commands on that unit.
