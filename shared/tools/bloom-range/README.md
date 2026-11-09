# Bloom Range (2026-09-22)

`bloom_range.html` — a page to tune a weapon's spread bloom and see what it does at range, made when the bloom numbers were set
(owner 2026-09-21, the lock bracket's gain 2026-09-22). One file, nothing to install: open it in a browser. Published at the time
as https://claude.ai/artifact/7EYbhS35tTqL25pQh3xgnw (private to its owner).

What it models, as the game does: fire on the game's 16 ms tick (a weapon's interval rounds up to whole ticks), the spread angle SA =
base + bloom, each round adding its per-shot increment up to the cap, the bloom recovering at its rate per second once the delay
after the last round has passed, and rounds landing in a cone of that angle against the standing hit capsule, 3.2 wide and 6.4
tall. Hold the button (or Space) to fire; it shows SA now, the lock bracket's size, the sure-hit distance (3.2 ÷ SA: inside it every
round lands), the live hit rate at the target distance, and plots of the cone and the bloom over time.

Controls, each a slider with an exact number box: distance, RPM, base angle, increment per shot, cap, recovery per second, recovery
delay, magazine and reload (with the magazine switch), the bot's suppress count and gate width (bot mode fires only inside the
gate line: 8.84 is the automatics' 33%-hit line, `BOT_GATE_WIDTH_AUTO`; 3.2 the sure-hit line the rifles use), and the lock
bracket's ceiling, full point and gain. A weapon list loads its numbers; Reset stats clears the hit count.

The weapon list holds the numbers of 2026-09-21 (M4 700 RPM 0.02 / 0.002 / 0.06 / 0.035 per s / 200 ms, FAMAS, EVO3, P90, RPK,
NEGEV, M14, SVD). Units changed since then — check `shared/src/sim/constants.js` (or the client's unit table) on the line and type
the current values into the boxes.
