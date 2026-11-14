// sfx_data.js — WHAT PLAYS AND HOW LOUD (since b1105hk). Written by the listening site's own tool from its mixer (its fold 5), not
// by hand: every level is the one the user set by ear there. The tool is kept with the site, outside this repository; a level
// changed here holds only until the table is next written, so a lasting change is made on the site.
// A sound: its file under public/ without the extension, the extension it has on the release lines (the PT site serves every
// one as .wasm), and the level it plays at, of the game's volume. Several sounds may be one file at different levels.
export const SFX_VOLUME = 0.7;
export const SFX_SOUNDS = {
  shot_unit1: {"file": "sfx/m4_shot", "ext": ".mp3", "level": 0.28664},
  shot_unit9: {"file": "sfx/famas_shot_e", "ext": ".mp3", "level": 0.31528},
  shot_unit14: {"file": "sfx/hk_shot", "ext": ".mp3", "level": 0.15288},
  shot_unit22: {"file": "sfx/ak_shot_a", "ext": ".mp3", "level": 0.35508},
  shot_unit4: {"file": "sfx/smg3_e50m", "ext": ".mp3", "level": 0.31756},
  shot_unit13: {"file": "sfx/ppsh_shot", "ext": ".mp3", "level": 0.1808},
  shot_unit15: {"file": "sfx/mpx_shot", "ext": ".mp3", "level": 0.22536},
  shot_unit17: {"file": "sfx/ump_shot_a", "ext": ".mp3", "level": 0.86884},
  shot_unit2: {"file": "sfx/shotgun_shot_e50l", "ext": ".mp3", "level": 0.271746},
  shot_unit11: {"file": "sfx/shotgun_shot_e50l", "ext": ".mp3", "level": 0.271746},
  shot_unit18: {"file": "sfx/shotgun_shot_e50l", "ext": ".mp3", "level": 0.271746},
  shot_unit12: {"file": "sfx/rifle3C_e30l", "ext": ".mp3", "level": 0.245016},
  shot_unit5: {"file": "sfx/rifle3C_e100m", "ext": ".mp3", "level": 0.253968},
  shot_unit21: {"file": "sfx/rifle3C_e60l", "ext": ".mp3", "level": 0.245016},
  shot_unit10: {"file": "sfx/m14_shot", "ext": ".mp3", "level": 0.20236},
  shot_unit7: {"file": "sfx/laser_shot", "ext": ".mp3", "level": 0.23432},
  shot_unit20: {"file": "sfx/kar98_shot_e50l", "ext": ".mp3", "level": 0.4316},
  bolt_unit20: {"file": "sfx/kar98_bolt", "ext": ".mp3", "level": 0.8},
  shot_unit3: {"file": "sfx/scout_shot", "ext": ".mp3", "level": 0.31746},
  kei_charge: {"file": "sfx/kei_charge_a", "ext": ".mp3", "level": 0.16},
  kei_quick: {"file": "sfx/laser_shot", "ext": ".mp3", "level": 0.23432},
  kei_full: {"file": "sfx/kei_full", "ext": ".mp3", "level": 0.23508},
  shot_unit19: {"file": "sfx/awp_shot", "ext": ".mp3", "level": 0.2},
  bolt_unit19: {"file": "sfx/awp_bolt", "ext": ".mp3", "level": 0.4},
  reload_kei: {"file": "sfx/kei_recharge_c", "ext": ".mp3", "level": 0.4},
  reload_mg: {"file": "sfx/mg_reload", "ext": ".mp3", "level": 0.5},
  reload_sniper: {"file": "sfx/awp_reload", "ext": ".mp3", "level": 0.5},
  reload_mag: {"file": "sfx/mag_reload", "ext": ".mp3", "level": 0.5},
  shell: {"file": "sfx/shotgun_shell", "ext": ".mp3", "level": 0.5},
  scope: {"file": "sfx/scope_in", "ext": ".mp3", "level": 0.5},
  step_1: {"file": "sfx/walk_1", "ext": ".mp3", "level": 0.182},
  step_2: {"file": "sfx/walk_2", "ext": ".mp3", "level": 0.182},
  step_3: {"file": "sfx/walk_3", "ext": ".mp3", "level": 0.182},
  step_4: {"file": "sfx/walk_4", "ext": ".mp3", "level": 0.182},
  step_5: {"file": "sfx/walk_5", "ext": ".mp3", "level": 0.182},
  run_1: {"file": "sfx/walk_1", "ext": ".mp3", "level": 0.182},
  run_2: {"file": "sfx/walk_2", "ext": ".mp3", "level": 0.182},
  run_3: {"file": "sfx/walk_3", "ext": ".mp3", "level": 0.182},
  run_4: {"file": "sfx/walk_4", "ext": ".mp3", "level": 0.182},
  run_5: {"file": "sfx/walk_5", "ext": ".mp3", "level": 0.182},
  dodge: {"file": "sfx/axe_swing", "ext": ".wav", "level": 0.234},
  jump: {"file": "sfx/cs_jump", "ext": ".mp3", "level": 0.195},
  land: {"file": "sfx/cs_land", "ext": ".mp3", "level": 0.26},
  hit: {"file": "sfx/hitmarker", "ext": ".wav", "level": 0.132},
  hurt: {"file": "sfx/hurt_punch", "ext": ".wav", "level": 0.24},
  kill: {"file": "sfx/kill_2", "ext": ".mp3", "level": 0.4875},
  intro_team: {"file": "sfx/kill_2", "ext": ".mp3", "level": 0.4875},
  intro_start: {"file": "sfx/kill_1", "ext": ".mp3", "level": 0.4875},
  ui: {"file": "sfx/ui_main", "ext": ".wav", "level": 0.5},
  ui_small: {"file": "sfx/fx_ui_a", "ext": ".wav", "level": 0.5},
  ui_pause: {"file": "sfx/fx_ui_c", "ext": ".mp3", "level": 0.5},
};
// a unit's sounds (main.js THE UNIT'S SOUNDS): shot; bolt, boltDelayMs after a shot that leaves rounds, boltCut = stopped by the
// unit's next shot; reload, at each of reloadAtMs after a reload's start; shell = the round going in, on every ammo gain;
// charge / quick / full = a beam unit's charge, the shot of a cancelled charge, the full beam; scope = at a charge's start, for
// the player whose unit it is
export const SFX_UNITS = {
  unit1: {"shot": "shot_unit1", "reload": "reload_mag", "reloadAtMs": [500]},
  unit9: {"shot": "shot_unit9", "reload": "reload_mag", "reloadAtMs": [500]},
  unit14: {"shot": "shot_unit14", "reload": "reload_mag", "reloadAtMs": [500]},
  unit22: {"shot": "shot_unit22", "reload": "reload_mag", "reloadAtMs": [500]},
  unit4: {"shot": "shot_unit4", "reload": "reload_mag", "reloadAtMs": [500]},
  unit13: {"shot": "shot_unit13", "reload": "reload_mag", "reloadAtMs": [500]},
  unit15: {"shot": "shot_unit15", "reload": "reload_mag", "reloadAtMs": [500]},
  unit17: {"shot": "shot_unit17", "reload": "reload_mag", "reloadAtMs": [500]},
  unit2: {"shot": "shot_unit2", "shell": "shell"},
  unit11: {"shot": "shot_unit11", "shell": "shell"},
  unit18: {"shot": "shot_unit18", "reload": "reload_mag", "reloadAtMs": [500]},
  unit12: {"shot": "shot_unit12", "reload": "reload_mg", "reloadAtMs": [0, 1667, 3333]},
  unit5: {"shot": "shot_unit5", "reload": "reload_mg", "reloadAtMs": [0, 1667, 3333]},
  unit21: {"shot": "shot_unit21", "reload": "reload_mg", "reloadAtMs": [0, 1667, 3333]},
  unit10: {"shot": "shot_unit10", "reload": "reload_mag", "reloadAtMs": [500]},
  unit7: {"shot": "shot_unit7", "shell": "shell"},
  unit20: {"shot": "shot_unit20", "bolt": "bolt_unit20", "boltDelayMs": 500, "boltCut": true, "reload": "reload_mag", "reloadAtMs": [500]},
  unit3: {"shot": "shot_unit3", "scope": "scope", "reload": "reload_sniper", "reloadAtMs": [500]},
  unit6: {"charge": "kei_charge", "quick": "kei_quick", "full": "kei_full", "reload": "reload_kei", "reloadAtMs": [0]},
  unit19: {"shot": "shot_unit19", "bolt": "bolt_unit19", "boltDelayMs": 500, "boltCut": false, "scope": "scope", "reload": "reload_sniper", "reloadAtMs": [500]},
};
export const SFX_SHELL_LEAD_MS = 361;   // the round's sound is started this long before the gain: its click falls on it
// the music: a track's file, the place it belongs to, its level (the tracks brought to one loudness, times where music stands)
export const BGM_TRACKS = {
  menu_1: {"file": "bgm/menu_1", "ext": ".mp3", "place": "menu", "level": 0.1875},
  menu_2: {"file": "bgm/menu_2", "ext": ".mp3", "place": "menu", "level": 0.2415},
  menu_3: {"file": "bgm/menu_3", "ext": ".mp3", "place": "menu", "level": 0.1633},
  char_1: {"file": "bgm/char_1", "ext": ".mp3", "place": "char", "level": 0.1541},
  char_2: {"file": "bgm/char_2", "ext": ".mp3", "place": "char", "level": 0.179},
  char_3: {"file": "bgm/char_3", "ext": ".mp3", "place": "char", "level": 0.1104},
  combat_1: {"file": "bgm/combat_1", "ext": ".mp3", "place": "combat", "level": 0.1541},
  combat_2: {"file": "bgm/combat_2", "ext": ".mp3", "place": "combat", "level": 0.171},
  combat_3: {"file": "bgm/combat_3", "ext": ".mp3", "place": "combat", "level": 0.1559},
  game_end: {"file": "bgm/game_end", "ext": ".mp3", "place": "end", "level": 0.1312},
};
export const BGM_SOFT = [["menu", "char"], ["end", "menu"]];   // the pairs of places between which the change is a cross-fade; any other change is a cut
export const BGM_FADE_MS = 1500;
