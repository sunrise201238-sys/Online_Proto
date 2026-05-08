# Implementation plan — gvg-online

Tracks the five-phase rollout of online versus. Update this file as phases land so future sessions can re-orient quickly.

---

## Phase 0 — Boot & connect ✅ DONE

**Goal:** server starts, client opens a socket, hello round-trips. No gameplay over the wire yet.

**Status:** complete. Both services deployed on Render free tier, p1/p2/spectator slot assignment verified across multiple browsers, 40 Hz snapshot stream alive.

- [x] New monorepo at `gvg-online/`
- [x] `package.json` workspaces include `client`, `server`, `shared`
- [x] `.gitignore`, `README.md`, `PLAN.md`, `render.yaml`
- [x] `socket.io-client` added to `client/package.json`
- [x] `client/src/online/connection.js` wraps the socket + event log
- [x] Debug **Online (Debug Connect)** button on unit-select menu opens a status panel
- [x] Server emits `match:hello` on connect alongside `player:assigned`
- [x] Server slot assignment finds the first free slot (p1/p2/spectator), not by count
- [x] Snapshot events stored as counter + Hz, not in main event log (avoids eviction)
- [x] Deployed to Render: `gvg-server` (Node, Oregon) + `gvg-client` (Static, Global)
- [x] Two-browser test confirms p1/p2 assignment

---

## Phase 1 — Extract simulation ✅ DONE (Option C, scope-reduced)

**Goal:** the gameplay logic needed for the **online** game lives in `shared/sim/` as pure JS with no Three.js or cannon-es dependency. Headless tests pass.

**Status:** complete. Shared sim is built, tested, and ready for the server to consume in Phase 2.

### Scope decisions made during this phase

- **Offline game is NOT being migrated.** `client/src/main.js` is untouched; it continues to run the offline 1v1-vs-bot game using its own embedded simulation. The shared sim is a parallel implementation that the server (and eventually the online client) uses.
- **Online v1 ships with Plain Field only.** Other maps (Streets, Factory, Square, Lobby) are not ported. Their obstacle/surface data can be added to `shared/src/sim/arena.js` later — see "Future map ports" below.
- **No melee.** The offline game has melee state fields but no actual melee logic currently wired up. Online doesn't ship melee in v1.

### What landed

```
shared/src/sim/
├── constants.js     UNIT_DATA, MAP_DATA, all tunables (boost, step, jump, homing, hits)
├── math.js          clamp, lerp, wrapAngle, vec3 POJOs, applyYawPitch, closestPointOnSegment
├── state.js         createFighter, createProjectile, createMatchState, buildSnapshot
├── arena.js         Plain Field obstacles + spawns (other maps stubbed for future)
├── physics.js       segmentHitsObstacle, unitOverlapsObstacle, resolveUnitObstacleCollisions, surface lookups
├── movement.js      tickBoost, applyMomentum, applyRepulsion, integrateFighter (replaces cannon-es)
├── projectiles.js   spawnProjectiles, tickProjectiles (homing, sweep, hit detection, events)
├── actions.js       tickAmmo, attemptFire, tickSniperCharge, tryStartStep/Jump, startDash
├── ai.js            tickBot (port of updateEnemy)
├── tick.js          applyInput, updateLocks, tickMatch (the orchestrator)
└── index.js         public re-exports

shared/test/sim.test.js   Headless correctness tests (createMatchState, tick stability,
                          MG burst rate, sniper charge cycle, step homing-cut, boost regen)
```

### Public API the server will use in Phase 2

```js
import {
  createMatchState,
  buildSnapshot,
  tickMatch,
  emptyInput,
  TICK_RATE_MS,
  TICK_DT
} from '@gvg/shared/sim';

const match = createMatchState({ p1UnitKey: 'unit1', p2UnitKey: 'unit2', startTime: Date.now() });

// Each tick:
//   inputs comes from socket.io 'input:action' messages, defaulting to emptyInput()
//   for any player who hasn't sent input this tick.
tickMatch(match, { p1, p2 }, Date.now(), TICK_DT);
const snap = buildSnapshot(match);
io.emit('match:snapshot', snap);
```

### Cannon-es replacement

The offline build uses cannon-es as a `body.position` + gravity integrator. The shared sim replaces this with explicit Euler integration in `integrateFighter` (movement.js). Same -80.19 m/s² gravity, same y-floor clamp behavior. No cannon dependency on the server.

### Future map ports (when we want them online)

For each map (Streets, Factory, Square, Lobby), add a `build<MapKey>()` function in `arena.js` that returns `{ mapKey, obstacles, surfaces, spawns }`. The data is already in the offline `client/src/main.js` `build<Map>Arena()` functions — extract the `arenaObstacles.push(...)` and `addPlatform/addRamp` calls and convert them to plain-data entries. About 1–2 hours per map.

### Feel-regression checklist (deferred to Phase 2)

The checklist drafted earlier is preserved at the end of this file. It will be exercised at the end of **Phase 2**, when the online client first runs against the shared sim. That's where any divergence between offline and shared-sim feel becomes visible.

---

The existing `shared/src/gameLogic.js` is an orphan from an earlier prototype (Beam Rifle / Scatter Shot system, height-based movement). It will be replaced. Don't reference it during extraction.

### Inventory of `client/src/main.js`

Classified by what each function depends on. SIM = pure gameplay logic, RENDER = THREE.js scene work, INPUT = touch/keyboard/DOM, MIXED = entangled.

**Pure SIM (no THREE / cannon needed):**
- `wrapAngle(angle)` — pure math
- `segmentHitsObstacle(p0, p1, o)` — slab method, AABB intersection
- `unitOverlapsObstacle(x, y, z, radius)` — point-in-AABB collision
- `surfaceHeightAtXZ(x, z)`, `groundHeightAt(x, z, currentSurfaceY)` — read-only over `arenaSurfaces`
- `getProjectileDamage(projectile)` — dummy-mode check
- `PhaserLikeBetween(min, max)` — random helper
- `tickAmmo(mech, now)` — operates on `mech.unit` and `mech.state` only

**Mixed but mostly SIM (couples to cannon body or THREE.Vector3):**
- `attemptFire(owner, target, now)` — sniper charge gating + spawnProjectiles
- `tickSniperCharge(mech, now)` — charge timer; resets cannon velocity
- `spawnProjectiles(owner, target)` — creates THREE.Mesh inside projectile object
- `updateProjectileSystem(dt)` — homing, hit detection, surface check, AABB sweep. Heavy.
- `applyMomentum(mech)`, `inheritMomentum(mech)` — read/write cannon body velocity
- `applyRepulsion(now)` — soft-collision push between players
- `triggerEnemyEvasion(now)`, `clearIncomingHoming(mech, now)`, `triggerDashDefense(now)` — bot reaction
- `updateBoost(mech, now, action)` — boost gauge + mech.thrusters/plumeLight (render coupling)
- `updatePlayer(now)` — input → cannon velocity, step/jump/dash, fire timing
- `updateEnemy(now)` — bot AI; identical scope to updatePlayer
- `updateTransforms(dt)` — jump physics (SIM) + root.position from body.position (RENDER) + trail (RENDER)
- `resolveUnitObstacleCollisions(mech, prevPos)` — push-out logic; reads/writes cannon body
- `getMeleeHitboxCenter(mech, forward)` — uses THREE.Vector3
- `updateLocksAndReticle()` — sets `state.player.state.redLock` (SIM) + reticle render (RENDER)

**Pure RENDER (stays client-side):**
- `createMech(color, unitData)` — factory, needs split into "create sim state" + "create render rig"
- `makeReticleSprite()`, `createGlintForMech`, `removeGlintFromMech`, `updateGlintScale`
- `setupHUD()` — also wires touch input (MIXED)
- `updateCamera()`, `updateHud()`, `updateVfx(dt)`
- `spawnHitEffect(position, color)`, `spawnMeleeHitboxVisual(mech, color, scaleBoost)`
- `applyMapAmbience(mapKey)`, `clearArenaDecor()`
- `addBlockingBox/addPlatform/addRamp` — split: keep mesh creation client-side, push obstacle/surface entries via shared helpers
- `buildStreetsArena/buildFactoryArena/buildSquareArena/buildLobbyArena` — render-heavy, but populate `arenaObstacles`/`arenaSurfaces` (sim data)
- `buildArenaForMap(mapKey)` — dispatcher
- `createArenaWalls()` — creates 4 cannon walls; can become 4 obstacle entries

**INPUT (client-only):**
- `setupRootTouchAction()`, `syncKeyboardMovement()`, all `pointer*` / `keydown` / `keyup` handlers, `gesture*` handlers
- The `input` and `keyState` module-level objects

**Lifecycle / UI (client-only):**
- `showSelectMenu`, `showEndMenu`, `showPauseMenu`, `clearMenus`
- `cleanupMatch`, `startMatch`, `animate`

**Top-level data:**
- `UNIT_DATA`, `MAP_DATA`, all gameplay constants (`BOOST_CAP`, `MAX_HP`, `STEP_DISTANCE`, etc.) — pure data, ready to move to `shared/`
- `state` object — currently mixes SIM (player, enemy, projectiles, vfx) and RENDER (hud, reticle, speedLines)
- `arenaObstacles` (157 push sites across builders), `arenaSurfaces` — sim data

### Sub-task breakdown (superseded — Option C delivered all of this in one pass)

The original plan was 11 chunks with feel tests between each. Option C reframed Phase 1: build the shared sim alongside the offline game without migrating the offline code. All the work below landed under that approach. Kept here for reference.

- [x] Constants & pure helpers — `shared/src/sim/constants.js`, `math.js`
- [x] Pure collision math — `shared/src/sim/physics.js`
- [x] Sim state shape — `shared/src/sim/state.js`
- [x] Ammo, sniper charge, projectile spawn — `shared/src/sim/actions.js`
- [x] Projectile tick — `shared/src/sim/projectiles.js`
- [x] Movement, boost, step, jump — `shared/src/sim/movement.js`, integrated in `tick.js`
- [x] Collision resolution & repulsion — `physics.js` + `movement.js`
- [x] Bot AI — `shared/src/sim/ai.js`
- [x] Per-tick orchestrator — `shared/src/sim/tick.js` (`tickMatch`)
- [x] Map data extraction — `shared/src/sim/arena.js` (Plain Field only; other maps deferred)
- [x] Headless test harness — `shared/test/sim.test.js`

### Feel-regression checklist (deferred to Phase 2)

After every chunk, the user runs through this list in offline mode (Plain Field is fine for most tests). Each item should feel identical to the pre-Phase-1 baseline.

**Movement:**
- [ ] Joystick/WASD response is tight, no input lag
- [ ] Releasing input stops the unit (no extended slide)
- [ ] Walk → sprint speed change is noticeable when boost held
- [ ] Sprint can be locked by double-tapping boost button
- [ ] Cannot dash with empty boost gauge; gets brief slow-walk penalty
- [ ] Boost regenerates only while grounded

**Step (dodge):**
- [ ] Step distance is a quick teleport-y motion (~9 units)
- [ ] Step cooldown is ~1 second
- [ ] Step costs ~1/3 of full boost
- [ ] Step cuts incoming homing for ~0.25s
- [ ] Step queues residual momentum that resumes after step ends

**Jump:**
- [ ] Jump apex is ~5–6 units high
- [ ] Jump round-trip ~0.7–0.8 seconds
- [ ] Cannot rejump for ~1.5 seconds
- [ ] Jumping while dashing carries forward momentum
- [ ] Cannot fire sniper while airborne

**MG (Unit 1 / Machine Gun):**
- [ ] 30-round mag visible in ammo counter
- [ ] Continuous fire while shoot held
- [ ] ~7 shots/sec rate
- [ ] Manual reload at empty (~2 sec, reload ring fills)
- [ ] Sustained fire damages enemy at expected rate

**Shotgun (Unit 2):**
- [ ] 7-round mag
- [ ] One trigger pull → 8 pellets in spread
- [ ] Auto-reload ticks (one round at a time, partial ring progress visible)
- [ ] In red lock, center pellet curves toward target

**Sniper (Unit 3):**
- [ ] 5-round mag
- [ ] 0.5s charge before each shot (glint sprite visible during)
- [ ] Cannot move while charging
- [ ] After firing, fire-button ring fills exactly 360° at the 1-second mark
- [ ] Manual reload at empty (~2.5 sec)
- [ ] One shot deals ~25% of full HP
- [ ] Cannot fire while airborne

**Lock & reticle:**
- [ ] Reticle is GREEN when out of range, RED when in range
- [ ] Reticle scales up with camera distance for readability
- [ ] Reticle pulses on red↔green transition
- [ ] Each unit has a different lock range (MG 56, Shotgun 43, Sniper 120)

**Homing:**
- [ ] Red lock makes single-shot weapons curve toward target
- [ ] Homing angle softens close to target (~20 unit range)
- [ ] Homing dies once projectile is within ~2.6 units of target
- [ ] Step cuts homing on already-fired projectiles

**Hit reactions:**
- [ ] Damage matches expected (MG 4, Shotgun 4×8, Sniper 35)
- [ ] Hit briefly stuns (~200ms) and freezes velocity
- [ ] "Vulnerability move" (walking without sprint) takes ~+35% damage
- [ ] Ring effect spawns at hit location

**Repulsion:**
- [ ] Two units within ~3 units push apart
- [ ] No infinite jitter or sticking when both standing still

**Maps:**
- [ ] Plain Field, Streets, Factory, Square, Lobby all load
- [ ] Each map has its expected obstacles (fountain at Square, conveyor at Factory, slope at Streets, mezzanine at Lobby)
- [ ] Spawn positions are correct for each map
- [ ] Map ambience (fog, sky, lights) matches

---

## Phase 2 — Naive networking

**Goal:** two browsers fight each other across the internet. No prediction yet — local player feels laggy, but it's playable for testing.

**Status:** not started.

- Client sends inputs `{ tick, type, payload }` over socket
- Server drains inputs each tick, runs `tickMatch`, broadcasts snapshot
- Client renders directly from snapshots (no local sim during online matches)
- Online mode selectable from menu; offline bot mode unchanged

---

## Phase 3 — Prediction & interpolation

**Goal:** game feels responsive. Local player runs the sim immediately on input; remote player is rendered from a 100ms-buffered interpolation.

**Status:** not started.

- Local prediction with input ring buffer + reconciliation on snapshot arrival
- Remote player interpolated between last two snapshots at `serverTime - 100ms`
- Server-authoritative damage; client shows hit VFX optimistically
- Visual smoothing on small reconciliation pops

---

## Phase 4 — Robustness & lifecycle

**Goal:** can be played by strangers, not just the dev.

**Status:** not started.

- Disconnect / reconnect with 30s grace window
- Lobby → matchmaking → countdown → match → end → return to lobby state machine
- Character/map select syncs across both clients
- Ping display in HUD
- Server tick-duration logging (p50 / p95)
- Input rate limiting

---

## Phase 5 — Optional polish

- Delta-encoded snapshots
- Replay system (recordings of input + snapshot streams)
- Spectator mode (read-only socket)
- Multi-match scaling (one Render instance hosts many matches)

---

## Working notes

- **Authority model:** server-authoritative with prediction + reconciliation. Decided over peer-relay for cheat resistance and because the stub already assumed it.
- **Determinism:** not required. Server and client run the same code but float drift is fine; reconciliation snaps divergence.
- **Render free tier:** acceptable for prototype. Spins down after 15min idle; first connect takes 30–60s. Single region; non-US players see 150–250ms RTT.
- **Tick rate:** 25ms (40Hz) per `TICK_RATE_MS` in shared. Drop to 30Hz only if free tier struggles.
- **Game feel is the load-bearing risk.** Phase 1 will subtly break things during extraction. Mitigation: don't refactor for cleanliness during the move; preserve constants exactly; playtest every chunk.

---

## Session re-orientation checklist

When picking up after a break:

1. Read this file
2. Check the latest commit on `main` for in-progress work
3. Open the relevant phase section above; pick the first unchecked item
4. If something seems wrong with extracted gameplay feel, check the feel-regression items in Phase 1
