# Experiment 0001: Errors by lost win chance

- Status: idea, not planned. The measurement shows no errors in lost positions; the gain is small
- Date: 2026-10-27
- Owner: Frederik
- Related: [PRD 0001](../prds/0001-chess-coach.md) R4, [ADR 0003](../adrs/0003-centipawn-loss-and-blunder-rule.md) (blunder rule),
  [ADR 0007](../adrs/0007-missed-mates-are-errors.md) (missed mates)
- Decisions: a new ADR that replaces the blunder rule of ADR 0003
- Touches: `src/engine/patternAggregator.ts` (`isBlunder`), `src/engine/engine.test.ts`, `spec/docs/architecture.md`

## Problem

A blunder is a centipawn loss (CPL) of 150 or more ([ADR 0003](../adrs/0003-centipawn-loss-and-blunder-rule.md)). The
same 150 cp do not have the same value in all positions. From 0.0 to −1.5 the game turns. From +4.4 to +2.5 the mover
still wins. From −6.0 to −9.0 the mover still loses.

The rule has only one fixed exception: the mover is still at +5.0 or more after the move. So moves in decided
positions fill the top errors, the pattern counts and the trainer. Most of them have no tag, because the engine lines
change little material. PRD 0003 found this too: "15. Qe2 from +4.4 to +2.5" stayed untagged.

## Goal

1. An error is a move that changes the expected result of the game, not only the score.
2. One rule covers both decided sides: clearly winning and clearly losing.
3. Errors near 0.0 stay errors, as now.
4. Fewer untagged errors, because the dropped ones are mostly untagged.

## Users

| User | Wants |
| --- | --- |
| Frederik | top errors and patterns from the moves that cost points, not from moves in decided games |
| Club players | the same |

## User stories

1. I am at +6.2 and play a move that keeps +4.5. The report does not show it as an error.
2. I am at −6.0 and play a move to −9.0. The report does not show it as an error.
3. I am at 0.0 and play a move to −1.5. The report shows it as an error, as now.
4. I am at −4.0 and drop a rook to −10.0. The report shows it as an error. I still had chances to fight.
5. I had a mate in 2 and play a slow winning move. The report still shows "Misses mate" ([ADR 0007](../adrs/0007-missed-mates-are-errors.md)).
6. My opponent loses 1.5 pawns from a +5.0 position, and I take the material. The good moves do not show this as
   "punishes".

## Requirements

| # | Requirement |
| --- | --- |
| R1 | Win chance of a score: `50 + 50 × (2 / (1 + e^(−0.00368208 × cp)) − 1)`, from `toCp()`, in percent. This is the Lichess formula |
| R2 | A blunder: the win chance of the mover drops by 12 points or more, and the move is not the engine's best move. This replaces "CPL ≥ 150 and score after < +5.0" |
| R3 | A missed mate stays an error, as in ADR 0007. R2 does not apply to it |
| R4 | `isBlunder()` is the only place of the rule. The good moves ("punishes" an opponent blunder) use it too, so they follow R2 |
| R5 | The cards keep the centipawn text ("−3.2"). Only the selection changes |
| R6 | Stored evaluations stay valid: the rule runs on read. No new `ENGINE_ID`, no new `DB_VERSION` |
| R7 | FEN or score tests in `src/engine/engine.test.ts` for stories 1 to 4: the test fails when the rule changes |
| R8 | A new ADR replaces the blunder rule of ADR 0003. Update the "Scores" section of `architecture.md` |

## Measurement (2026-10-27)

Both test users, last 10 games, depth 14 for the latest game and depth 10 for the others, as in the app. "Kept" is the
number of errors under R2 with the given threshold in win-chance points.

| Sample | Errors now | Untagged now | In lost positions (≤ −5.0) | Kept at 10 | Kept at 12 | Kept at 13.5 | Kept at 20 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `thibault`, Lichess | 20 | 4 | 0 | 18 | 16 | 13 | 7 |
| `erik`, Chess.com | 23 | 10 | 0 | 21 | 20 | 16 | 7 |
| Both | 43 | 14 (33 %) | 0 | 39 | 36 | 29 | 14 |

- No error in this sample is in a lost position. The noise is on the winning side: all errors that 12 points drop,
  except one, start at +4.4 or higher.
- At 12 points, 7 errors drop. 4 of them are untagged. Untagged errors go from 33 % to 28 % (10 of 36).
- One dropped error is a real mistake: thibault, 16. Qxf4 from −1.6 to −3.2 (`PIN_EXPLOIT`, 11.5 points).
- 13.5 points equals 150 cp at 0.0. It also drops errors near 0.0, for example −0.6 to −2.1 with `MISSED_FORK`
  (12.9 points). So it is too strict.
- 20 points is the Lichess "mistake" level. It keeps only a third of the errors. Too strict for a coach that looks for
  habits.

## Out of scope

- The words "inaccuracy" and "mistake". The app knows one kind of error.
- An accuracy score per game.
- A setting for the threshold.
- The only-move rule of the good moves (best minus second-best ≥ 150 cp). It stays in centipawns.

## Open questions

- Threshold: 12 points (recommended) or 10? 10 keeps 16. Qxf4, but also keeps +4.4 to +2.5 and +4.9 to +3.0.
- ADR 0003 says a blunder in a lost position "shows a habit". R2 drops it. Is that the right trade? The sample has no
  such case, so the count does not change now.
