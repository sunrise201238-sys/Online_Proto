# Damage on the open field over 30 s (2026-11-19)

`field30.mjs` measures what one unit deals to a target that cannot die, on the shared sim: the shooter strafing at her walk
speed, the target on a ±35° arc round her — standing, walking or sprinting — for 30 s, reloads included. Made to check the
players' feedback on every unit against numbers (the user, 2026-11-19: "Below are player feedbacks and reviews of in-game
performance/capability of each unit. Review them.").

```sh
node shared/tools/field-dps/field30.mjs <line checkout> out.json [runs]      # runs: 30
```

It empties Plain Field's obstacles in memory first, so nothing stands between the two. Per unit it plays, at the unit's own
lock range, the three targets twice — the trigger simply held (`held_still`, `held_walk`, `held_sprint`) and on the bots' fire
gate (`gate_…`, `botMayFire`) — and at 40, a close fight, a walking target with the trigger held (`close_walk`). Each is
`{ dps, t100, shots }`: damage a second over the 30 s, the seconds to the first 100 damage (the middle run), the rounds fired.

`field30.json` is the line at `95a7b99` (build b1105ju), 30 runs.

Read with care:

- Kei's numbers do not compare: a held trigger fires only her full-charge sweep, the weaker of her two shots.
- The gate holds a bot's fire on distance and bloom, not on what the target does. For sixteen of the twenty units it changes
  the damage by less than a tenth; for Minori, Hina, Fubuki and Aris it changes it much (Fubuki on a standing target: 3.9 a
  second with the trigger held, 15.7 on the gate).
- The seconds to 100 damage say more than the damage a second about a duel. Saori, Subaru and Atsuko, trigger held:

| unit | standing | walking | sprinting |
| --- | --- | --- | --- |
| Saori (110) | 2.6 s | 4.6 s | 13.7 s |
| Subaru (110) | 4.6 s | 5.0 s | 11.1 s |
| Atsuko (100) | 3.7 s | 4.3 s | 10.8 s |

  Saori and Subaru share damage, rate of fire, magazine and lock range; they differ in bloom alone (0.002 a round against
  0.005, and how fast it recovers). The tighter cone is the fastest on a standing target and the slowest on a sprinting one.
