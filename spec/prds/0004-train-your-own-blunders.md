# PRD 0004: Train the top pattern on your own positions

- Status: planned
- Date: 2026-10-27
- Owner: Frederik
- Related: [PRD 0001](0001-chess-coach.md) (rules), [PRD 0002](0002-analysis-cache.md) (storage), the puzzle mode of the
  first app (commit `ac2bf49`, `src/components/Puzzles.tsx`, with tap-to-move)
- Touches: `src/App.tsx`, `src/components/BoardView.tsx`, a new `src/components/Trainer.tsx`,
  `src/engine/patternAggregator.ts`, `spec/docs/architecture.md`

## Problem

The rules tell the player what to do. They do not train it. The positions where the player went wrong are the best
training material for that player, and the app has them already.

## Goal

1. From the rules section, the user starts training on the top pattern.
2. The trainer shows the user's own positions before each blunder with that tag, from all analysed games.
3. The user finds a move on the board. The app says if it holds, and shows the engine line.
4. At the end, the user sees how many positions they solved.

## Users

| User | Wants |
| --- | --- |
| Frederik | to practice exactly the mistake he repeats, on his own games |
| Club players | the same, without a separate puzzle site |

## User stories

1. Below "Rules for your next games" I see "Train this pattern (5 positions)". I press it.
2. The board shows the position before my 11. Rae1??, from my side, with "Find the best move. 1/5". No arrows.
3. I drag the bishop to h6, or tap the bishop and then h6. The app says "Correct. Bxh6 keeps +1.8." and offers
   "Show line" and "Next".
4. In the next position I play a weak move. The app says "Not quite. Your move gives −2.1." I can try again, or press
   "Show solution" to see the best move as a green arrow and play the line.
5. After the last position: "Solved 3 of 5 on the first try." with "Train again" and "Back to the report".
6. I use the keyboard only. I can pick a piece and a target square with the arrow keys and Enter, and I hear the
   result from the screen reader.

## Requirements

| # | Requirement |
| --- | --- |
| R1 | The trainer uses the blunders with the top tag from all analysed games, newest game first, at most 10 positions |
| R2 | A user move is correct when its loss is at most 30 cp against the best move. The engine pool evaluates the position after the user's move at depth 12, with priority 0 |
| R3 | Drag and drop, and tap-to-move with target markers, as in the first app's puzzles |
| R4 | Keyboard: select a square with the arrow keys, pick and drop with Enter, cancel with Escape |
| R5 | Results go to an `aria-live` region. Wrong and correct use text and an icon, not only color |
| R6 | "Show solution" draws the best move as a green arrow and offers the best line as a branch, as in `BoardView` |
| R7 | Without storage, the score lives for this session only. With PRD 0002 built, store attempts per position |
| R8 | The pure parts (picking positions, judging a move from two scores) have Node tests |

## Out of scope

- Positions from other players or a puzzle database.
- Spaced repetition over days (needs PRD 0002 and its own PRD).

## Open questions

- Accept any move within 30 cp of the best move, or only the best move? (Suggestion: within 30 cp. Two good moves
  should both count.)
- Train only the top tag, or let the user pick any tag from the pattern pills? (Suggestion: top tag first; a click on a
  pill can start training for that tag later.)
