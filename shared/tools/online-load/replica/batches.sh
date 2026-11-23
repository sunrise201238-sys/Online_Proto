#!/bin/bash
# The measured matches of 2026-11-23, as they were run (SRV=<measuring copy> ./batches.sh > batches.txt; about fifty minutes, one match at a time).
# GOD=1: nobody falls, so the match runs on for the whole time. `replica_table.py batches.txt` makes the table.
R="$(cd "$(dirname "$0")" && pwd)/run_one.sh"
# 0. the first match, with the make-up of one snapshot printed (DUMP=1 asks drive.mjs for it)
DUMP=1 $R n3_first neon 2v2 1 62 GOD=1
# 1. Neon, 2v2, one player and three bots: as the server is, and each knob
$R n3_base neon 2v2 1 62 GOD=1
$R n3_snap2 neon 2v2 1 62 GOD=1 SNAP_EVERY=2
$R n3_snap3 neon 2v2 1 62 GOD=1 SNAP_EVERY=3
$R n3_bot2 neon 2v2 1 62 GOD=1 BOT_EVERY=2
$R n3_bot3 neon 2v2 1 62 GOD=1 BOT_EVERY=3
$R n3_search1 neon 2v2 1 62 GOD=1 SEARCH_MS=1
$R n3_bot2snap2 neon 2v2 1 62 GOD=1 BOT_EVERY=2 SNAP_EVERY=2
$R n3_all neon 2v2 1 62 GOD=1 BOT_EVERY=3 SNAP_EVERY=3 SEARCH_MS=1
$R n_1v1_2p neon 1v1 2 62 GOD=1
$R n_2v2_2p2b neon 2v2 2 62 GOD=1
$R airport3 airport 2v2 1 62 GOD=1
$R town3 town 2v2 1 62 GOD=1
# 2. the snapshot's three shortcuts, on Airport (its bots are cheap, so the snapshot's part shows)
$R a_base airport 2v2 1 52 GOD=1
$R a_one airport 2v2 1 52 GOD=1 SNAP_ONE=1
$R a_str airport 2v2 1 52 GOD=1 SNAP_STR=1
$R a_one_str airport 2v2 1 52 GOD=1 SNAP_ONE=1 SNAP_STR=1
$R a_one_str_slim airport 2v2 1 52 GOD=1 SNAP_ONE=1 SNAP_STR=1 SNAP_SLIM=1
$R a_slim_every2 airport 2v2 1 52 GOD=1 SNAP_ONE=1 SNAP_STR=1 SNAP_SLIM=1 SNAP_EVERY=2
$R a_all airport 2v2 1 52 GOD=1 SNAP_ONE=1 SNAP_STR=1 SNAP_SLIM=1 SNAP_EVERY=2 BOT_EVERY=2
$R n_all_1 neon 2v2 1 52 GOD=1 SNAP_ONE=1 SNAP_STR=1 SNAP_SLIM=1 SNAP_EVERY=2 BOT_EVERY=2
$R n_all_2 neon 2v2 1 52 GOD=1 SNAP_ONE=1 SNAP_STR=1 SNAP_SLIM=1 SNAP_EVERY=2 BOT_EVERY=2
$R n_base_2 neon 2v2 1 52 GOD=1
$R n_base_3 neon 2v2 1 52 GOD=1
$R n_all3_1 neon 2v2 1 52 GOD=1 SNAP_ONE=1 SNAP_STR=1 SNAP_SLIM=1 SNAP_EVERY=3 BOT_EVERY=3
# 3. every big map and every kind of match
for m in compound district spacecraft hospital warehouse dust factory; do $R A_$m $m 2v2 1 45 GOD=1; done
SD=1 $R B_sd_neon neon 2v2 1 45 GOD=1
SD=1 $R B_sd_compound compound 2v2 1 45 GOD=1
$R C_4p_neon neon 2v2 4 45 GOD=1
$R C_4p_compound compound 2v2 4 45 GOD=1
$R C_4p_neon_snap2 neon 2v2 4 45 GOD=1 SNAP_EVERY=2
$R C_4p_neon_snap3 neon 2v2 4 45 GOD=1 SNAP_EVERY=3
$R D_2p_neon_snap2 neon 1v1 2 45 GOD=1 SNAP_EVERY=2
$R D_2p_compound compound 1v1 2 45 GOD=1
$R E_bot_neon neon 1v1 1 45 GOD=1
$R E_bot_compound compound 1v1 1 45 GOD=1
$R F_neon neon 2v2 1 45 GOD=1 BOT_EVERY=3 SNAP_EVERY=2
$R F_compound compound 2v2 1 45 GOD=1 BOT_EVERY=3 SNAP_EVERY=2
$R F_town town 2v2 1 45 GOD=1 BOT_EVERY=3 SNAP_EVERY=2
# 4. Sudden Death
SD=1 $R S_neon_real neon 2v2 1 45
SD=1 $R S_neon_god2 neon 2v2 1 45 GOD=1
SD=1 $R S_town town 2v2 1 45 GOD=1
SD=1 $R S_airport airport 2v2 1 45 GOD=1
SD=1 $R S_district district 2v2 1 45 GOD=1
SD=1 $R S_neon_1v1 neon 1v1 1 45 GOD=1
SD=1 $R S_neon_bot3 neon 2v2 1 45 GOD=1 BOT_EVERY=3
SD=1 $R S_neon_2p2b neon 2v2 2 45 GOD=1
