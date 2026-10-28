# PRD 0007: Fewer errors without a pattern

- Status: built (2026-10-28), checked in the browser with Lichess user `fredbbs`
- Date: 2026-10-28
- Owner: Frederik
- Related: [PRD 0001](0001-chess-coach.md) R3 (depths), [PRD 0003](0003-more-tactical-tags.md) (tags, R11, known
  limit), [Experiment 0001](../experiment-prds/0001-errors-by-win-chance.md) (errors in decided positions)
- Decisions: [ADR 0008](../adrs/0008-deep-analysis-for-all-games.md) (deep analysis for all games)
- Touches: `src/App.tsx`, `src/types/chess.ts` (`TacticalTag`), `src/engine/heuristics.ts`,
  `src/engine/templateEngine.ts`, `src/engine/engine.test.ts`, `spec/docs/architecture.md`

## Problem

Frederik's own account `fredbbs` (Lichess) shows "Other errors: 10 of 47 blunders have no known pattern". An untagged
error does not count as a pattern, so the rules and the trainer miss it.

Two causes, from the measurement below:

1. Depth. Games 2 to 10 get only the quick scan (depth 10). In the last 10 games, 35 % of the errors stay untagged at
   depth 10, and 16 % at depth 14. The short depth-10 lines show less of the tactic, and some depth-10 "errors" are
   engine noise (king and queen against king).
2. Two patterns repeat that no tag covers. Over the last 50 games at depth 14, 60 of 224 errors (27 %) are untagged:
   - The engine reply wins one pawn: 16 errors in 12 games. PRD 0003 R11 tags this for the best line ("wins a pawn"),
     but not for the reply.
   - A king in the center gets a check: 12 errors in 10 games. Frederik's own king (15... Qa5, then Nc7+), or the
     opponent's king that he does not attack (8... cxd4 instead of Qh4+). 7 of the 12 are a queen check on the h-file:
     Qh5+ or Qh4+. PRD 0003 named this as a known limit: "A tag for missed king attacks waits until it repeats in
     Frederik's own games." It repeats.

## Goal

1. All 10 games get the deep analysis, so the counts and tags do not depend on which game the user selected.
2. Two new rules cover the patterns that repeat in Frederik's games.
3. 15 % or less of the errors in Frederik's last 50 games stay untagged. The forecast is 32 of 224 (14 %).

## Users

| User | Wants |
| --- | --- |
| Frederik | the same counts each time he opens his report, and a name for his king-in-the-center errors |
| Club players | the same |

## User stories

1. I analyze my last 10 games. The report of game 1 is ready first. The pattern pills fill from the quick scan. The
   header then shows "Deepening game 4/10". The counts change while it runs, and stop when it ends.
2. I open the report again the next day. All 10 games come from storage at depth 14. No engine runs.
3. I play 21... Nd2+ and leave my b7 pawn to the queen. The card says "Loses a pawn to Qxb7." with the tag "Hanging
   pieces".
4. I play 15... Qa5 with my king still on e8. The engine line ends with Nc7+. The card says "Leaves the king in the
   center. Nc7+ follows." with the tag "King in the center".
5. My opponent's king is still on e1 and his f-pawn has moved. I play 8... cxd4. The card says "Misses Qh4+ against
   the king in the center."
6. I have mate in 3 and play 64... Rg5, which stalemates. The card says "Stalemates the opponent. Best was Rb3+, mate
   in 3."

## Requirements

| # | Requirement |
| --- | --- |
| R1 | After the quick scan of games 2 to 10, `App` queues a depth-14 analysis of each game below depth 14, newest first, at a priority below the quick scan. The progress bar shows "Deepening game N/10". "Stop" stops it. Stored depth-14 results are reused, as now |
| R2 | New rule after rule 14 of the tag table: the played move takes nothing, and the reply line wins one pawn for the opponent (`lineGain()` = 1). Tag `HANGING_PIECE`, `material` 1. Text: "Loses a pawn to {first capture}." This is the mirror of PRD 0003 R11 |
| R3 | New tag `KING_IN_CENTER`, the last rule. Allowed: the mover still has a castling right, and the opponent gives check within its first 3 moves of the reply line. Missed: the opponent still has a castling right, and the mover gives check within his first 3 moves of the best line. `tagVia` is `reply` or `best` |
| R4 | Texts for R3: "Leaves the king in the center. {check} follows." and "Misses {check} against the king in the center." Label "King in the center". Two rules in `RULES`: "Castle before you open the center or take pawns with the queen." and "When the opponent's king is still in the center and his f-pawn has moved, look at Qh5+ or Qh4+ first." |
| R5 | When the played move stalemates, the summary says "Stalemates the opponent. Best was {best}." plus ", mate in N" when the mover had a mate. The tag does not change |
| R6 | FEN tests in `src/engine/engine.test.ts`: 21... Nd2+ (R2), 15... Qa5 and 8... cxd4 (R3), 64... Rg5 (R5), from the positions in the measurement. One test that a capture followed by a lost pawn (5... cxd5) is not R2 |
| R7 | Update the tag table, the engine pool section and the data flow in `architecture.md` |

## Out of scope

- Errors in decided positions. [Experiment 0001](../experiment-prds/0001-errors-by-win-chance.md) removes them. It is a
  separate decision. In the 50 games, 11 of the 60 untagged errors lose less than 12 points of win chance.
- A tag for endgame errors (4 or fewer pieces besides kings and pawns). After R2, R3 and Experiment 0001, 10 errors in
  6 of 50 games remain. In 10 games that is about one game, so it rarely reaches the badge (2 games). See the open
  questions.
- Forks later in the engine line than the first move. 8 of the 60 untagged errors have one, but R2 and R3 already tag
  6 of them.
- A tag for stalemate. Seen once in 50 games. R5 names it in the text only.

## Measurement (2026-10-28)

`fredbbs`, Lichess, in the preview browser, with the app's own engine pool and `tagBlunder()`. Frederik's browser
showed 10 of 47 with a mix of depths. Parallel workers do not give exactly the same results each run.

| Sample | Depth | Errors | Untagged | With R2 and R3 | Also with Experiment 0001 |
| --- | --- | --- | --- | --- | --- |
| Last 10 games | game 1 at 14, games 2–10 at 10 (the app now) | 49 | 17 (35 %) | | |
| Last 10 games | all at 14 | 44 | 7 (16 %) | 3 (7 %) | 2 |
| Last 50 games | all at 14 | 224 | 60 (27 %) | 32 (14 %) | 24 |

After the build (fresh run in the app, empty storage): all 10 games reach depth 14 after "Deepening game 10/10", and
4 of 41 errors stay untagged (10 %). `KING_IN_CENTER` shows in 2 of 10 games.

The tags of the 224 errors before the build: `HANGING_PIECE` 82, untagged 60, `MISSED_CAPTURE` 31, `ALLOWED_FORK` 13,
`MISSED_MATE` 11, `F2_F7_VULNERABILITY` 10, `PIN_EXPLOIT` 6, `ALLOWED_MATE` 6, `MISSED_FORK` 3, `DISCOVERED_ATTACK` 1,
`BACK_RANK_WEAKNESS` 1.

How the 60 untagged errors split:

| Group | Errors | Games | Examples |
| --- | --- | --- | --- |
| Reply wins one pawn (R2) | 16 | 12 | 11. Qf3 (Qg5 hits d2 and e5), 21... Nd2+ (Qxb7) |
| King in the center (R3) | 12 | 10 | 8... cxd4 (Qh4+), 5. h3 (Qh5+), 15... Qa5 (Nc7+) |
| Decided position (Experiment 0001) | 8 | | 14... g6 from −7.8 to −9.9 |
| Endgame, 4 or fewer pieces | 10 | 6 | 46... Kg6, 37. g4 (king and pawn endgame) |
| Other | 14 | 10 | 11... Qxb2 (queen takes a pawn, king on e8), pawn breaks, piece placement |

The "Other" group has no repeated board pattern that one rule can find.

At depth 10 in the last 10 games, 5 of the 17 untagged errors were in decided positions: 4 at −5.0 or lower (two of
them king and queen against king) and 1 at +4.9. 64... Rg5 (stalemate) had no tag either. At depth 14 it is
`MISSED_MATE`.

## Open questions

- R1 runs the engine for about 50 more seconds on a cold start (5 s per game in this run; 50 games took 170 s). Is
  that acceptable, or should the deep analysis start only when the user stays on the report?
- R3 uses "still has a castling right" as "king in the center". A king that moved and came back to e1 does not count.
  Is that strict enough?
- Endgame errors: a phase tag ("Errors in the endgame") is easy to add, but it names a phase, not a tactic. Add it
  later, when it shows in 2 of 10 games?
