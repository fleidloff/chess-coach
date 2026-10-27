# PRD 0003: Tags for the blunders that stay untagged

- Status: built (2026-10-27), checked in the browser with Lichess user `thibault` and Chess.com user `erik`
- Date: 2026-10-27
- Owner: Frederik
- Related: [PRD 0001](0001-chess-coach.md) R5, [ADR 0003](../adrs/0003-centipawn-loss-and-blunder-rule.md) (blunder rule)
- Decisions: [ADR 0007](../adrs/0007-missed-mates-are-errors.md) (missed mates count in won positions)
- Touches: `src/types/chess.ts` (`TacticalTag`), `src/engine/heuristics.ts`, `src/engine/templateEngine.ts`,
  `src/engine/patternAggregator.ts`, `src/components/FeedbackPanel.tsx`, `src/engine/engine.test.ts`,
  `spec/docs/architecture.md`

## Problem

The six tags of PRD 0001 cover only part of the blunders. The rest read "Tactical error. Best was …". In the first test
with `thibault`, the top error of the latest game had no tag. An untagged blunder never counts as a pattern, so the
pattern bar and the rules miss it. A missed mate in a won position is not even a blunder under ADR 0003.

## Goal

1. The user sees how many blunders have no known pattern.
2. Five new tags cover the most frequent missing patterns.
3. Less than 30 % of the blunders in Frederik's last 10 games stay untagged.

## Users

| User | Wants |
| --- | --- |
| Frederik | a name for every repeated mistake, so the rules address it |
| Club players | the same |

## User stories

1. The pattern bar ends with "Other errors: 3 blunders without a known pattern". The count goes down as tags are
   added.
2. I play Qd2?? and my opponent forks king and rook with Nf3+. The card says "Allows the fork Nf3+." with the tag
   "Allowed forks".
3. I had mate in 2 and played a slow winning move. A card "Misses mate: Qh7+ mates in 2." shows, although I was still
   winning.
4. I move my king into a mate in 3. The card says "Walks into a forced mate. Best was Kg1." with the tag "Allowed mates".
5. My opponent moves a bishop and his rook behind it attacks my queen. The card says "Misses the discovered attack
   Bxh7+." or, when it hits me, "Allows the discovered attack Bxh7+."
6. The best move takes a piece for free and I played something else. The card says "Misses the free capture Nxe5."

## Requirements

| # | Requirement |
| --- | --- |
| R1 | `FeedbackPanel` shows the number of untagged blunders across the analysed games, below the pattern pills |
| R2 | `ALLOWED_FORK`: the engine's reply forks two targets of the mover (`forkTargets()` on the reply) |
| R3 | `MISSED_MATE`: the mover had a mate in 3 or less before the move, and has no mate after it. Counts even when the mover is still winning, as an exception to ADR 0003 |
| R4 | `ALLOWED_MATE`: the opponent has a forced mate after the move, and had none before |
| R5 | `DISCOVERED_ATTACK`: the best move or the reply moves a piece off a line, and a slider of the same side behind it now attacks the king or a piece worth more than the moved piece |
| R6 | `MISSED_CAPTURE`: the best move takes a hanging piece worth 3 or more, and the played move takes nothing |
| R7 | The new rules run after the existing six, in the order R3, R4, R2, R5, R6. Mates go first among them because they decide the game |
| R8 | Each new tag has a label in `TAG_LABEL`, a summary in `generateErrorSummary()`, two rules in `RULES` and a FEN test |
| R9 | Update the tag table in `architecture.md` |
| R10 | Added in the build: when no rule matches, count the material along the engine lines (`lineGain()`). A reply line that wins 2+ points is `HANGING_PIECE`; a best line that wins 2+ points is `MISSED_CAPTURE` |
| R11 | Added after the first measurement (Frederik, 2026-10-27): a best line that wins 1 point (a pawn) is `MISSED_CAPTURE` too. The error itself guarantees the 150 cp swing. Text: "Misses Nxe4, which wins a pawn." |

## Out of scope

- Positional tags (bad bishop, weak squares). They need a different kind of rule than a single tactic.
- Time-trouble tags. Both platforms can send clock data, but this PRD is only about board patterns.

## Decisions on the open questions

- `MISSED_MATE` counts in the top errors when the game was won anyway, sorted after the blunders.
- The 30 % target stays. See the measurement below.

## Measurement (2026-10-27)

| Sample | Errors | Untagged with R2–R6 | Untagged with R10 | Untagged with R11 |
| --- | --- | --- | --- | --- |
| `thibault`, Lichess, 10 games | 17 | 9 (53 %) | 6 (35 %) | 3 (18 %) |
| `erik`, Chess.com, 10 games | 22 | not measured | 7 (32 %) | 6 (27 %) |
| Both | 39 | | 13 (33 %) | 9 (23 %) |

Goal 3 (under 30 %) is met. The 9 untagged errors are moves where the engine lines change material by less than one
pawn, mostly in positions where the mover stays better (for example 15. Qe2 from +4.4 to +2.5).

Known limit: R11 also tags 12. Qf3 (best Qxg6+) as "wins a pawn". That is true, but the real point of Qxg6+ is the
attack on the king. A tag for missed king attacks waits until it repeats in Frederik's own games.
