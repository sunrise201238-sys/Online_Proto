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
     the circle radius), facing the unit's lock target, for 20 s
     (tunable; owner raised 5 s -> 20 s, 2026-08-21), then the normal
     behavior loop takes over.
   - A new drag replaces the standing order. DOUBLE-TAP on the own
     square = full reset: cancels the move order AND clears the force
     lock, returning the unit to full autonomy.

3. Status icons — gold, glowing, shown BOTH at the square/diamond's top
   corner AND inside the info card (replacing the NO SIGHT status line):
   - "!" while a position command is active (en route + the 20 s anchor);
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
  **2.1b amendment (owner, 2026-08-21):** dash segments are LATCHED — a
  dash may only START once boost reaches the ARM threshold; the segment
  runs down to the 50 floor, then the unit walks until the gauge climbs
  back to the threshold. Rationale: the plain floor rule produced
  continuous one-tick boosts the moment regen peeked over the reserve,
  which read as stutter. Everything else unchanged.
  **2.1i tune (owner, 2026-08-21):** ARM threshold lowered from full cap
  (250) to 125 (`DIO_TRAVEL_DASH_ARM`, min'd with the unit cap) — dash
  segments come roughly twice as often, still stutter-free.
- Map ROTATION: pivot = the current look target (screen centre); tilt
  unchanged. Touch: two-finger twist (same gesture set as pinch zoom —
  span change zooms, angle change rotates, simultaneously). Desktop:
  right-mouse drag, or Q/E keys.
- Mode separation: the select menu gains a Classic / Command mode chip
  (alongside Duel/Trio); V / the pause menu still toggles mid-match.
  **2.1h amendment (owner, 2026-08-21):** the choice is SESSION-ONLY,
  exactly like Duel/1v1 — every site open starts Classic. The original
  localStorage persistence is removed and the old `gvg-view-mode` key is
  actively deleted at boot so no leftover storage remains on devices
  that saved it during the short-lived persistence window.
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

**Status: IMPLEMENTED (2026-08-21).** Code map on top of the phase-2 layer:

- Dash travel: `applyMoveOrder` travel branch — sprints (`sprintSpeed` +
  `inheritMomentum ×1.5` + `applyMomentum`, the bot's own dash math) in
  LATCHED segments (`cmdMove.dashArmed`, 2.1b): the latch arms only when
  boost sits at the unit's cap, releases at
  `DIO_TRAVEL_BOOST_FLOOR (50)` or on `emptyRecoverUntil`, and the unit
  walks until the gauge is FULL again before the next segment. Drain
  runs on the normal meter via a separate `cmdBoostClock` tick
  accumulator, clamped AT the floor, skipped when the bot's own action
  already dashed that frame (no double billing). Anchor orbit still
  walks.
- Rotation: `cam2.rot` yaw offset added to the map view's base yaw; pivot
  is the look target `(tx, tz)` = screen centre. Q/E keys
  (`keyState.rotL/rotR`, ±0.028 rad/frame), right-mouse drag
  (`kind:'rotate'` gesture, 0.006 rad/px, layer `contextmenu` suppressed),
  and two-finger twist (incremental angle delta folded into the pinch
  handler, wrap-safe; zoom + rotate work simultaneously). Sign convention:
  the scene follows the fingers / drag.
- Mode separation: `.view-mode-chip` (Classic/Command) in the select menu
  wired to `toggleDiorama`; the choice persists as
  `localStorage['gvg-view-mode']` (written in `toggleDiorama`, read at
  boot); V and the pause-menu button still toggle mid-match; fresh
  profiles default Classic.
- Tap-tap ordering: pointerdown on empty ground WITH a selection arms a
  `tapMode` preview (circle + path visible immediately); moving past the
  slop cancels it into a pan; releasing in place issues the order and
  drops the glow (one-shot — enemy-tap force locks do the same);
  releasing on an unreachable spot calls `dioramaDenyAt` (red ring +
  "Area is not available", edge-clamped, self-removing) and KEEPS the
  glow. Slow re-tap of the selected unit deselects; fast double-tap
  (marker or card) wipes both commands. Hold-still layer cycling moved to
  `dioramaGestureFrame()` (per-frame, from updateDioramaHud) because
  pointermove stops firing on a truly still finger.
- Deny actually fires now: `computeOrderPath` rejects targets beyond the
  arena bounds and routes whose endpoint lands > 6u (or > 2u in floor)
  from the tap — the shared pathfinder clamps + snaps any goal onto the
  grid (right for bots, wrong for orders; unchecked it could also strand
  a unit shoving a wall toward an unreachable raw target).
- Icons: `iconState` ∈ `'order' | 'lock' | 'both' | null` on both the
  marker (`dioCmdIconMarkup`) and the card (`dioCmdIconCardMarkup`,
  inline-block so the pair sits side by side); no command = no icon.
- **2.1g floor tones (owner, 2026-08-21):** the diorama's warm default
  grade made the pale Lobby/Airport floors read YELLOW — those two maps
  now keep their classic `applyMapAmbience` light colors inside
  `applyDioramaDressing` (background/fog/camera handling unchanged), so
  the command-mode floor tone matches classic. Separately (UNIVERSAL —
  classic and command alike): the Airport plateau deck wears its own
  slate-grey tile (`plateauTile` 0xc2ccd8) instead of sharing the
  ground's near-white `tileMat`, so the two height levels read apart at
  a glance.
- **2.1f airborne de-clutter (owner, 2026-08-21):** on Factory, Lobby,
  Station, Airport and Flashpoint the tall/long airborne dressing is
  HIDDEN while command mode stands and returns in classic — both
  directions, mid-match toggles included. Mechanism: the meshes carry
  `userData.cmdHide = true` at creation; `applyDioramaDressing` sets
  `visible = false` on tagged arenaDecor entries, `removeDioramaDressing`
  restores them; map rebuilds while active re-apply automatically.
  Visual only — none of it is collidable, gameplay identical. Hidden
  sets: Factory pipes/trusses/shop lights (30, incl. the four
  VERTICALLY-standing pipes — a pre-existing missing-rotation bug, left
  as-is in classic); Lobby ceiling panels/beams/blue strips (34);
  Station pipes/trusses/lamp banks/central clock (58); Airport signage
  gantries+panels/arch crossbars/hanging check-in signs (15);
  Flashpoint ducts/copper pipes/strip lights (14). Unmentioned maps
  untouched (owner instruction). Menu defaults confirmed: Duel / 1v1 /
  Classic for fresh profiles.
- **2.1e layer picking (owner, 2026-08-21):** the vertical layer stack
  lists only STANDABLE floors — `dioramaLayerStandable` checks the nav
  grid (3x3 cell ring, floor within 2u) so platform undersides and slope
  voids no longer clutter the stack as a bogus first pick (the Scrapyard
  complaint: players had to hold-cycle past an unavailable ground
  layer). Safety net on top: when the default pick still can't pathfind,
  the preview AUTO-ADVANCES to the first (lowest) reachable layer —
  unless the player hold-cycled a layer BY HAND (`drag.userLayer`),
  which is respected and shows the red ring/deny as before. Bridges
  keep [ground, deck] with ground default; hold-to-cycle unchanged.
- **2.1d dual-lock crosshair (owner, 2026-08-21):** when BOTH commanders
  force-lock the same enemy, the corners no longer split — the FIRST
  locker keeps the full X (corner) triangle layout and the one who
  joined later wears the full + (edge-midpoint) layout, each in its own
  color (`DIO_TRI_X` / `DIO_TRI_PLUS`, order via `cmdLockAt`; ties count
  the player as first). A single lock still reads as the X.
- **2.1c HUD tweaks (owner, 2026-08-21):** every info card carries a
  STAMINA gauge (thin amber `.dio-boost` bar under the HP bar, fed from
  `state.boost / boostCap`) — both teams for now, the enemy readout may
  be hidden later. Cards are FIXED corner docks: the viewer's team
  stacks bottom-up in the BOTTOM-LEFT corner, enemies in the
  BOTTOM-RIGHT, stable slot order, dead units compact the column; the
  old edge-chasing layout (team-side hysteresis, screen-order sorting,
  marker dodging) is deleted and the leader line alone ties card to
  unit. Card grows 56→68px (compact 44→52) for the gauge.
- Headless verification (SwiftShader, 640×360): chip + persistence,
  Q/E / right-drag / twist rotation, dash speed ≈ 29 vs walk 16 with the
  floor clamping at exactly 50, tap-tap order one-shot, deny + glow-stay,
  lock one-shot, both-icons state, double-tap-card wipe, slow re-tap
  deselect — all green (scratchpad smoke/p21.js, p21deny.js).

## Phase 3 — ONLINE command mode (assessment done, owner decisions)

Full audit: five parallel line-level reads of shared/sim (ai, tick,
movement, state, navgrid, arena), server/src/index.js and the client
online layer (2026-08-21, assessment only — no code). Headline: the
online bot already carries every offline reflex equivalent, the shared
sim has the pathfinder/boost/momentum/timer primitives the command layer
needs, so the port is "attach an override layer", not "rewrite the
brain". The REAL first-priority work is the info-hiding pipeline: today
one unfiltered snapshot (entire fighter objects — boost, ammo, cooldowns,
targetId, bot intent fields) broadcasts to the whole room; per-team
snapshot filtering must land BEFORE any cmd field touches the fighter.
Suggested phases: 0) snapshot filter, 1) shared command layer, 2) lobby
layer (commandSlots separate from botSlots, per-player viewMode),
3) client wiring, 4) balance playtests. Rough size ~5-8 rounds.

### Owner decisions (2026-08-21)

1. Bot-fill teammate commandable online? **NO** — online command drives
   the player's OWN unit only (DIO_OWN_SLOTS online = player).
2. Human teammate sees your orders? **YES, both modes** (owner
   2026-08-21). A COMMAND teammate gets the full annotation (destination
   ring, path icons, lock triangles — the diorama layer already renders
   ally command state per slot, near-zero new work). A CLASSIC teammate
   gets BOTH shares, rendered in-world for the chase view: (a) the
   DESTINATION as a 3D ring standing on the ground at the ordered spot
   (world-space version of the diorama circle — the classic view already
   hosts world indicators like the boundary stripe), and (b) the command
   player's colored TRIANGLE lock indicator on the pinned enemy. No path
   line/icons for classic viewers. Data rides the team-scoped snapshot
   either way — the difference is purely a per-mode render rule.
3. Opponent's chosen mode (classic|command) hidden? **YES** — viewMode
   must be scoped team-only in lobby:config and never inferable from the
   match protocol (behavior will still hint it; accepted).
4. 1v1 command player disconnect: **instant forfeit (current rule)** —
   no reconnect/grace layer in v1.
5. Spectators: **classic view** — classic camera/HUD, no command
   overlays; filtered like a classic viewer of the followed team.
6. Trio × command in the first online cut: **YES** — respawn bookkeeping
   required (command state keyed by slot, cleared on respawnFighterNext,
   never held as fighter/mech references).
7. Boost-inference fields (overheat, sprint-lock, thruster tells):
   **NOT hidden** — only the boost VALUE itself is redacted to enemies.

### Phase 3 — FINAL PRE-IMPLEMENTATION SPEC (2026-08-21)

Frozen inputs: the 7 owner decisions above + the 2.1i tune (dash arm 125)
— ALL offline command tunables port to the server at their current values
(floor 50, arm 125, anchor 20000ms, radius 12, endpoint 6u, standable-
floor checks). These constants MOVE to shared/src/sim/constants.js in
phase 1 so client preview and server authority read one source.

Hiding scope, made precise (implementation rule):
- HIDDEN from opponents: boost VALUE, cmdMove (destination/path/phase/
  latch) and every cmd-layer field; bot intent fields (botXxx) stripped
  for everyone as hygiene. viewMode scoped team-only in lobby:config.
- targetId stays in snapshots as today (CORRECTED 2026-08-21 — there is
  NO victim-side "locked" warning in the game; redLock is the ATTACKER's
  own homing state, and the only public targeting tell is the sniper
  laser sight, which is deliberately visible to both sides). A force
  lock is therefore indistinguishable from ordinary targeting on the
  wire and in the opponent's UI — no new leak. The lock TRIANGLE UI
  renders for the commander's TEAM only. Overheat/sprint tells stay
  (decision 7).

Implementation-level calls (mine, overridable):
- Command state lives OFF the fighter: matchState.commands[slot]
  (the _navPaths precedent); snapshot filter is allowlist-based, built
  per-TEAM (2 variants + spectator=team-A/classic variant), emitted
  per-socket. Redacted enemy boost is sent as null; client mirror
  guards with ?? so bars/logic never see NaN.
- Order transport: dedicated messages order:move {x,z,floorY},
  order:lock {slotId}, order:clear — server re-validates with
  navGridFor + findPathOnGrid + 6u/floor checks, answers order:ack /
  order:deny; ≤2 orders/sec per player, latest wins; navgrid warmed at
  match start.
- Command-driven human slots: new lobby.commandSlots set (NEVER reuse
  botSlots — glint anti-cheat + input routing depend on it); server runs
  pickBotTargetId(+cmdLock guard) + tickBot + command driver for them.
- Client: command player skips prediction (interpolate own unit like
  remotes); V/pause mode toggles disabled online (queue-room choice is
  final); command timers read the server clock (hudNow), never
  performance.now(); Trio respawn clears that slot's command state
  server-side (offline parity: respawns start autonomous).
- Classic-teammate share rendering: world-space ground ring at the
  ordered destination + commander-colored corner triangles on the pinned
  enemy, drawn in the chase view; no path line/icons.

Round plan (small rounds, one push each):
- R1: snapshot filter + per-socket emit + client mirror guards
  (fixes today's boost/cooldown/intent broadcast leak on its own).
- R2: shared command layer (constants move, commands side-table, lock
  guard, move driver w/ reflex yield + clock pinning, dash latch,
  anchor orbit, server validation).
- R3: lobby/protocol (commandSlots, viewMode in config + swap/promote/
  rematch paths, order messages + ack/deny + rate limit).
- R4: client wiring (queue chip + staleness sig, diorama unlock online,
  order sending/echo, classic-teammate ring + triangles, Trio hooks).
- R5: end-to-end verification (local server + two headless clients),
  balance notes for playtest.

### Phase 3 R1 — IMPLEMENTED (2026-08-21)

Per-team snapshot filtering is live:
- `buildSnapshotFor(state, viewerTeam)` (shared/src/sim/state.js): enemy
  fighters ship as redacted copies — `boost: null` (null, not undefined:
  the client prediction replay runs sim math over these and null coerces
  to 0 while undefined breeds NaN) and every `botXxx` intent field
  stripped by prefix. Own-team fighters pass by reference, complete.
  Inference tells (overheat/refill/empty timers, action) stay visible
  (decision 7); targetId stays (corrected spec — no victim-side lock UI
  exists).
- Server (`emitSnapshotsFor`): two team variants built once per tick,
  emitted per socket; spectators get team A's view (client renders
  spectators from p1's perspective). Replaced all three room-broadcast
  sites. This alone closes the day-one leak of enemy boost / cooldowns /
  bot intent to opponents.
- Client: `mirrorFighterToMech` coalesces redacted boost (`?? 0`).
Verified: protocol tests (human-vs-bot and human-vs-human — own boost
numeric, enemy boost null, botXxx stripped while hp/pos/inference fields
survive, own fighter keeps full sim state for prediction) and a browser
e2e (real built client as p2 vs a socket puppet host: renders, HUD
works, enemy visible, zero console errors, no NaN anywhere).

### Phase 3 R2 — IMPLEMENTED (2026-08-21)

Shared command layer (`shared/src/sim/command.js`):
- Command constants moved to shared/src/sim/constants.js (CMD_* — floor
  50, arm 125, anchor 20000, radius 12, snap tolerance 6, arrive 4); the
  client's offline layer now aliases them (one source everywhere).
- `matchState.commands[slot]` side-table (never on the fighter — no
  snapshot leak by construction; verified). setMoveOrder validates with
  navGridFor + findPathOnGrid + endpoint-6u + floor-2u exactly like the
  offline computeOrderPath; setForceLock rejects teammates/dead;
  commandTargetIdOf overrides the bot pick and dissolves on death;
  tickCommandDriver re-steers post-tickBot (reflex yield set: defense,
  cover seek/hold, step, hitstun, charge/beam locks, glint schedule,
  committed air-steer), dashes in latched segments via the bot's own
  recipe (sprint base + inheritMomentum ×1.5; tickBoost bills the drain
  through action='dash'; PREDICTIVE floor check so the 50 reserve is
  never spent), walks otherwise, and orbits the CMD_RADIUS ring for
  CMD_ANCHOR_MS on arrival.
- KEY FIX found in testing: tickBot inherits a sprint impulse toward its
  own target every tick; with the driver running before tickMatch's
  applyMomentum, that stale momentum dragged the orbit ~4 u/s off the
  ring (offline erased it implicitly by overwriting vel post-momentum).
  The walk/orbit branches now zero momentumVX/VZ; the dash branch's
  inheritMomentum overwrites it anyway. Orbit error after fix: 0.0.
- Server loop wired (inert until R3): drives botSlots ∪ commandSlots
  through pickBotTargetId(+lock override) → tickBot → tickCommandDriver,
  passes the union as tickMatch botIds; Trio respawns clearCommands.
- Verified: 19 sim-level assertions green (validation, lock semantics,
  latched dash with floor min 50.9, arrival → anchor → 20 s expiry,
  ring-hug 0.0 error, re-arm at exactly 125, clears); R1 protocol tests
  and the offline latch tests re-run green on the new build.

### Phase 3 R3 — IMPLEMENTED (2026-08-21)

Lobby/protocol layer:
- `lobby.config[slot].viewMode` ('classic'|'command', default classic),
  set via match:configure — the existing `state==='active'` gate makes
  the pick match-locked with an 'ended' re-pick window (frozen spec).
  The field rides every config move path: slot swap copy, host-promotion
  move, disconnect resets. lobby:config is now emitted PER SOCKET with
  team-scoped viewMode (owner decision 3: opponents and spectators never
  see the pick; teammates do).
- `startMatchFor` populates `lobby.commandSlots` (occupied humans who
  picked command); input:frame ignores them (their unit is bot-driven);
  a disconnecting commander's orders are cleared and (2v2) the unit
  continues as a plain bot; 1v1 keeps instant forfeit (decision 4).
- Order protocol: `order:move {x,z,floorY}`, `order:lock {target}`
  (toggle semantics), `order:clear` — commandSlots-only, server
  re-validates via the shared layer, per-slot 500 ms rate limit
  (`order:result` replies ok/reason to the sender only).
- Snapshot `commands` block: each team's variant carries ITS commanders'
  standing orders (destination/path/phase/anchorUntil + lockTargetId)
  for teammate rendering (decision 2); enemies and spectators get {}.
- Verified: 21 socket-level assertions green (secrecy both directions +
  teammate visibility + spectator, order accept/deny/rate/toggle, input
  rejection, unit travels under orders with zero input frames, spectator
  boost view = team A). Classic-online browser e2e re-run green.

### Phase 3 R4 — IMPLEMENTED (2026-08-21)

Client wiring — command mode is playable ONLINE:
- Queue room: per-player Classic|Command chip (sendConfigure viewMode);
  teammates' picks render as a gold [CMD] tag (team-scoped server-side,
  so it cannot leak); the staleness signature already covers config.
- dioramaActive() is online-aware: state.online.commandMode (frozen from
  the queue pick at match setup) gates the whole diorama stack — camera,
  tilt-shift render fork, annotation layer, gestures — while classic
  players and spectators keep the chase view untouched.
- ensureOnlineMatchSetup: commanders get diorama dressing + the local
  navgrid (client-side preview/deny prediction); prediction is skipped
  entirely for them (own unit interpolates like remotes, no input frames
  sent — server acks stay -1), hudNow falls back to snapshot serverTime.
- Orders ride the protocol: tap-tap/drag flows call sendOrderMove /
  sendOrderLock / sendOrderClear; the selection glow waits for the
  server ack (ok = one-shot drop; unreachable = red deny note at the tap
  and the glow stays; rate = silent keep). syncOnlineCommands mirrors
  the team echo onto mech.cmdMove/cmdLock so every existing icon / ring
  / triangle renders unmodified. Online only YOUR unit is commandable
  (decision 1): ally taps neither select nor drag.
- Classic-teammate share (decision 2): updateOnlineCommandShare draws a
  world-space ground ring (radius CMD_RADIUS, ally green) at the
  commander teammate's ordered destination and a billboarded corner-
  triangle sprite on their pinned enemy; disposed on teardown.
- Verified end-to-end vs the live server: browser commander (chip →
  commandSlots, overview camera, joystick hidden, zero input acks, lock
  one-shot + triangles, tap-tap order → ack → 'both' icons + ring,
  dash-travel closes 154→113 in 2.2s, double-tap clear wipes both) and
  browser classic teammate (chase view intact, [CMD] tag, ring at the
  exact ordered point, lock sprite on the pinned enemy). Classic-vs-
  classic online and the offline latch re-ran green. One test-design
  finding worth keeping: an idle opponent DIES to a command unit (the
  bot fights) — matches end by ko, which is the game working, not a bug.

### Phase 3 R5 — VERIFIED, MIGRATION COMPLETE (2026-08-21)

Final gate: command-vs-command secrecy proven end-to-end with a real
browser opponent (queue-room viewMode HIDDEN, snapshot commands {}, no
mech mirror, no icons/ring on the enemy marker, enemy boost redacted) —
plus one polish from it: ONLINE enemy cards hide the stamina bar
entirely instead of rendering a forever-empty track (offline unchanged).
Full regression gate re-run green: R1 filter protocol, R3 lobby/order
protocol (20 asserts), R2 shared-layer sim (19 asserts), offline latch.

Command mode is now PLAYABLE ONLINE per the frozen spec. Remaining for
owner playtests (not code): mixed-mode balance meta, Trio-respawn
command clearing in a live Trio match (code path is a reviewed
one-liner), real-device touch feel for online order gestures.

## Phase 3.1 — PATHFINDER-GUIDED TRAVEL + ROUTE JUMPS (owner, 2026-08-22)

Field report: units under a move order sometimes got STUCK mid-map. Root
causes (code-confirmed, both sims): the travel follower ran a path FROZEN
at order time — no replan after reflex displacement (the "replans from the
current position" line of the phase-2 design was never implemented), no
stall detection, no timeout — and it could not execute JUMP-LINKS (it only
writes horizontal velocity), so any route through one ground at the ledge.
The bot's own perch reflex occasionally rescued it by coincidence, hence
"sometimes".

Owner decisions (assessment rounds, 2026-08-22):
- REJECTED: no-progress/stall detection. The cure is conceptual, not
  symptomatic — travel is ALWAYS guided by the pathfinder.
- Route refresh: replan from the current position at REFLEX EXIT and on a
  periodic cadence (CMD_REPLAN_MS = 1500, grounded only). A failed refresh
  keeps the old path and retries next period — no cancel, no timeout.
- Travel LEARNS TO JUMP, pathfinder untouched: the Maze follower's
  jump-link trigger ported into the travel driver (upcoming waypoint
  > 1.7 above the current floor, within 7 u, grounded -> vault toward it).
- Jump funding tiers: Defense survival hop 60, Travel route jump 60
  (MANDATED_JUMP_MIN_BOOST — jumps somebody ordered), Maze/Pursue
  discretionary jumps UNTOUCHED at the 250 reserve. 60 sits inside the
  dash latch's 50<->125 gauge cycle so route jumps are always reachable
  mid-travel (250 never is — the exact reason the old rescue rarely
  fired); cost stays the raw 48.
- Jump bank: while a route jump lies ahead on the remaining path, the
  dash floor rises 50 -> 70 (CMD_TRAVEL_JUMP_BANK) so a dash segment can
  never deliver the unit to the ledge unfunded.
- Airborne: TRAVEL KEEPS THE STICK during its own jumps (and ledge
  walk-offs) — steers the arc toward the waypoint at walk speed until
  landing, momentum untouched, no dash billed. Without this the generic
  air rules drift the hop toward the bot's combat target and it falls
  short. Reflex-initiated jumps keep their own air handling.

Implementation (mirrored: shared/src/sim/command.js tickCommandDriver +
computeCommandPath; offline applyMoveOrder + cmdTryStartJump in
client/src/main.js; the Defense gate in shared ai.js botTryJumpSurvival +
offline botStartJump's survival branch): cmdMove gains replanAt/reflexHeld;
the reflex yield sets reflexHeld so the first free frame replans; replans
re-validate with the full order strictness (endpoint 6 u / floor 2 u) so a
refresh can never accept a route the original order would have rejected.
Constants in shared/src/sim/constants.js (CMD_REPLAN_MS,
MANDATED_JUMP_MIN_BOOST, CMD_TRAVEL_JUMP_BANK).

## Phase 3.2 — ANCHOR: WALL FLIP + LEASH RETURN (owner, 2026-08-22)

Field report (screenshot): units anchored next to Airport's rim glass kept
running into the pane — the anchor orbit is tangent + ring spring with NO
wall awareness, so a ring straddling a fence grinds on it every lap; and
after a Defense displacement the spring shoves the unit straight at
whatever wall lies between (the anchor leg had no pathfinding at all).
Center-based order targeting stays as-is (owner call — no
"bigger portion" side-picking for now).

- WALL FLIP: Engage's wedge reverse ported to the anchor orbit — two
  consecutive driver ticks commanding the orbit while the body moves
  < 0.07 u flips orbitSign (driver-local displacement test; the Engage
  original reads the avoidance field, which the driver doesn't compute).
  The unit turns around at each wall contact and patrols the REACHABLE
  arc of the ring. Cornered (both directions blocked) it jitters in place
  until the window expires — acceptable, no worse than before.
- LEASH RETURN: anchored units displaced beyond CMD_ANCHOR_LEASH (20)
  from the order point RETURN VIA TRAVEL — phase flips back to 'travel'
  with a fresh computeCommandPath/computeOrderPath route, so the trip
  home gets everything travel has (replan cadence, route jumps, dash
  latch). Attempts pace on CMD_REPLAN_MS, fire immediately at reflex
  exit, and a failed path keeps orbiting and retries. anchorUntil is
  PRESERVED across the excursion — arrival resumes the REMAINING window
  (the 20 s is wall-clock total; an expired window clears the order on
  re-arrival). A reflex that ends still inside the leash just resumes
  the orbit, resetting the wall tracker so stationary reflex frames
  don't read as a wall press.

## Phase 3.3 — COMMANDABLE BOT TEAMMATE + ABSOLUTE SLOT HUD (owner, 2026-08-22)

REVERSES phase-3 decision 1 for bot-filled slots: an online commander now
drives their BOT teammate too (human teammates stay un-commandable). The
R2 architecture pre-paid this: commands are slot-generic and the server
loop already ran tickCommandDriver for every bot slot — the change is a
gate, not a layer.

Owner decisions:
- Commandable set FREEZES at match start (lobby.startBotSlots): a
  mid-match disconnect turns the human's unit into a bot but it is NOT
  adopted. 2v2 structure guarantees single command authority (a bot
  teammate implies one human on the team).
- Rate limit is PER TARGET UNIT (was per player): back-to-back orders to
  the two units never eat each other.
- The bot teammate's lock triangles wear ITS unit color.

Wire: order:move/lock/clear gain an optional `slot` (default: sender's
own); server re-authorizes (same team + startBotSlots). The snapshot
commands echo now walks every ACTIVE team slot (commands only exist where
set, so it stays exact); the driven loop clears commands for ANY dead
driven unit. Client: onl.allyCommandable frozen at match setup from the
first snapshot's botSlots; gesture guards route through
onlineCommandable(); every sender carries the target's server id.

ABSOLUTE SLOT HUD (owner, same round — narrowing of "self is always
blue" feedback): ONLINE identity is the server-slot color everywhere the
owner scoped —
- Classic corner bars re-anchor by SLOT: left column team A (p1 top /
  p3 bottom), right column team B (p2 top / p4 bottom), fills tinted the
  slot palette (SLOT_HUD_COLORS: p1 #62d7ff / p2 #ff7ad5 / p3 #86f7c2 /
  p4 #ff9d5a), IDENTICAL for every viewer (spectators included). Trio
  weapon rows follow their bars. The viewer's own bar wears a thin white
  rim (.self-bar — position no longer says "this one is you").
- The command diorama layer colors every per-slot element (marker, card
  border/HP fill, leader line, selection glow, destination ring, lock
  triangles) with dioSlotColor(): online = slot color, offline = the
  role palette (offline figures are role-colored, so offline already
  matched and stays untouched).
- The classic-teammate share ring + lock sprite follow the commander
  unit's slot color (was hard-coded ally green).
- Out of scope by owner call: overhead tag ink (white=team/orange=enemy)
  stays viewer-relative; offline untouched everywhere.

## Phase 3.4 — MARKER TRIM: PSG1 RANGE-TIER TICKS RETIRED (owner, 2026-08-26)

Owner call: the sniper damage-tier crosshair add-ons that rode a
force-locked marker (midpoint cross ticks at 15–50, inner closing bars
at 50+ — ported from the classic reticle when either side of the lock
pair was a PSG1) are removed. The force-lock triangles (X / + layouts in
the commanding unit's color) are now the marker's ONLY lock dressing.
Pure client visual: the tierMid/tierFar paths and their draw block in
updateDioramaHud are deleted; one code path serves offline and online.
The classic-view reticle tiers (updateLocksAndReticle textures) are
untouched. Verified: build + browser smoke (offline Duel 1v1 PSG1,
command mode — no tier paths in the marker groups, triangles still draw
on force lock, no page errors).
