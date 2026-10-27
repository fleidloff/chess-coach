# PRD 0005: Good moves and top errors in game order

- Status: planned
- Date: 2026-10-27
- Owner: Frederik
- Related: [PRD 0001](0001-chess-coach.md) goal 4
- Touches: `src/engine/patternAggregator.ts` (`buildReport`, `goodMoves`), `src/engine/engine.test.ts`,
  `spec/docs/architecture.md`

## Problem

The report sorts the top errors by severity: blunders first, then by centipawn loss. It sorts the good moves by score.
So the list can show "24. Qd2??" above "11. Rae1??". The user reads the game from move 1. A list out of move order
makes them jump back and forth on the board. A tactical strike that punishes an opponent blunder can also appear
before the moment that led to it.

## Goal

1. In the "Good moves" list and in the "Top errors" list, the card for the earliest move comes first.
2. The cards in each list are the same as before. Only their order changes.

## Users

| User | Wants |
| --- | --- |
| Frederik | to step through the key moments of a game from start to end |
| Club players | the same |

## User stories

1. My latest game has errors on moves 24, 11 and 31. The "Top errors" list shows 11, 24, 31.
2. My good moves are on moves 18 and 9. The "Good moves" list shows 9, 18.
3. My game has 5 errors. The list still shows the 3 worst ones, in move order.

## Requirements

| # | Requirement |
| --- | --- |
| R1 | Selection stays as it is: at most 3 top errors (blunders first, then highest CPL), at most 3 good moves (highest score) |
| R2 | After the selection, each list is sorted by `ply`, ascending |
| R3 | The order comes from `buildReport` in `src/engine/`. `FeedbackPanel` renders the lists as it gets them |
| R4 | A test in `src/engine/engine.test.ts` fails when a list is out of ply order or when the selection changes |

## Out of scope

- One merged timeline of good moves and errors. The two lists stay separate.
- A user setting to switch between game order and severity order.
- The order of the pattern pills and of the rules.
