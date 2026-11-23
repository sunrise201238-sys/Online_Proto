# Reports (2026-08-10, 2026-08-21 and 2026-11-23)

The online load assessment of 2026-11-23 is at the end of this page. Before it: three pages written for the user as assessments, saved on 2026-11-20 from the claude.ai artifacts they stood on. They are
records of what was found at the time, on the branches they name. The game has changed a great deal since: read them as
history, not as the state of the line.

| file | what it is | made | it stood at |
| --- | --- | --- | --- |
| `duel_bot_win_rates_en.html` | **Gun VS Gun — 1v1 Duel bot win rates**, "Which weapon wins a 1v1 Duel when both sides are bots": a headless run on the shared sim of `Demo_0.7.2_Opus`, every pairing of the twelve pickable units on all nine maps, both spawn orders, fought to a KO with no round timer. 28,080 matches. The ladder with its 95 % intervals, the weapon classes, the matchup matrix, the maps, what moves the result, and what the run cannot tell | 2026-08-10 | `https://claude.ai/artifact/JH7VDT4Sg1BfCob1xzPViF` |
| `duel_bot_win_rates_zh.html` | **Gun VS Gun — 1v1 Duel BOT 勝率**, 雙方都是 BOT 時，1v1 Duel 誰會贏: the same page in Traditional Chinese | 2026-08-10 | `https://claude.ai/artifact/BFiS2oWiKzJVtx9M6uEwur` |
| `command_mode_online_assessment.html` | **指揮模式上線評估**: the audit, on `Demo_0.7.5_Test-Fields`, of moving the offline command mode to play on the authoritative server. The method and the facts it rests on (with file and line), the work broken down, the risk register, the decisions left to the user, and the proposed order of work. In Traditional Chinese | 2026-08-21 | `https://claude.ai/artifact/1c63SXm8zEy5LTvJMCECbC` |

The win rate pages say it themselves, and it is the first thing to know about them: the ladder measures what the bot could do
with each weapon, not how strong the weapon is.

Each file is the page as the artifact served it and opens from the file in any browser. Its first line and its last are
claude.ai's own wrapper (a head with a base style, and the closing tags); the page as it was written is what stands between.
The command mode page loads its fonts from Google Fonts by address; the two win rate pages load nothing from outside.

To put one back on an artifact, publish the file as it is.

## Online load (2026-11-23)

The user (2026-11-23): "store these measuring results you gathered from online cost down assessment along with these
suggestions somewhere in 9.0 branch, so we can gather these data easily in the future."

How heavy each map and each kind of match is for the game server, where the time goes, what each shortcut would save and
cost, and whether a paid plan of the host answers it. Made on `Proto_0.9.9_BA_Finalizing` at `33a1512` (b1105kl); nothing
of the game was changed for it. **The decision is on hold** (the user, the same day: "Need time to think. Hold this up."),
so nothing in it has been built.

| file | what it is |
| --- | --- |
| `online_load_2026-11-23.md` | **the record**: what was asked, the short of it, what was recommended, how it was measured and its limits, every table (the production servers' own lines; the sim alone on all nineteen maps; the server itself in fifty-four matches; what a player is sent), each shortcut with what a real change would have to keep, the host's plans, and what was corrected along the way |
| `online_load_2026-11-23_answers_zh.md` | **the four answers as the user read them**, in Traditional Chinese, each under its question, with the later corrections at the top |
| `online_load_data/` | **the result files** (38 files, 0.3 MB), with a README that names each |

The tools that made them, and the steps to measure a later build the same way, are in `shared/tools/online-load/`.
