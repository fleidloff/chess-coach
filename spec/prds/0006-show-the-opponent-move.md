# PRD 0006: Show the opponent's last move in the trainer

- Status: built (2026-10-28)
- Date: 2026-10-27
- Owner: Frederik
- Related: [PRD 0004](0004-train-your-own-blunders.md) (the trainer), the puzzle board on Lichess
- Touches: `src/engine/trainer.ts` (`TrainingPosition`, `trainingPositions`), `src/components/Trainer.tsx`,
  `src/engine/engine.test.ts`, `spec/docs/architecture.md`

## Problem

The trainer shows the position before the user's error, with the user to move. The user does not see what the opponent
just played. In a real game, the opponent's last move is the first thing a player looks at: it often makes the threat
or leaves the piece that the tactic uses. Without it, the user must find the change on a static board.

Lichess puzzles solve this. The board opens one move earlier, plays the opponent's move, and keeps its two squares
highlighted.

## Goal

1. Each training position opens on the position before the opponent's last move.
2. After a short pause the board plays the opponent's move.
3. The from-square and the to-square of the last move on the board stay highlighted.
4. The side panel names the move, so the user does not need to see the board to know it.

## Users

| User | Wants |
| --- | --- |
| Frederik | to see the position as he saw it in the game, with the opponent's move that started it |
| Club players | the same feel as Lichess puzzles |

## User stories

1. I start training. The board shows the position before my opponent's 23... Qxd4. After a short pause the queen
   moves to d4. The squares d8 and d4 stay highlighted.
2. The panel says "Black played 23... Qxd4. Find the best move for white. 1/5". The screen reader reads the same
   text.
3. I play my move. The highlight moves to my from-square and to-square.
4. I press "Try again". The board returns to the position after 23... Qxd4, with d8 and d4 highlighted. It does not
   play the opponent's move again.
5. My error was on move 1 as White. There is no opponent move. The board opens at once on the start position, with no
   highlight and with the old text "Find the best move for white. 1/5".
6. I use reduced motion. The board shows the position after the opponent's move at once, with the highlight.

## Requirements

| # | Requirement |
| --- | --- |
| R1 | `TrainingPosition` gets an optional `lastMove`: the opponent's move before the error, as SAN, from-square, to-square, its notation ("23... Qxd4"), and the FEN before it. `trainingPositions` gets it by a replay of `ParsedGame.moves` up to `ply - 1`. No new stored data |
| R2 | When `lastMove` exists, the trainer board opens on `lastMove.fenBefore` and plays the move after 600 ms with the board's animation. With `prefers-reduced-motion`, it shows the position after the move at once |
| R3 | The user cannot pick, drag or tap a piece until the opponent's move is on the board |
| R4 | The from-square and the to-square of the last move on the board get a highlight. It does not hide the selected square, the target markers or the keyboard cursor |
| R5 | After the user's move, the highlight shows the user's move. "Try again" and "Show solution" show the opponent's move again, with no replay |
| R6 | The "Show line" player highlights the last move of the line in the same way, next to the blue arrow |
| R7 | The panel text names the move: "Black played 23... Qxd4." Text and icon, not only the highlight. The text is in the `aria-live` region |
| R8 | Node tests for `lastMove`: an error at ply 0 has none; an error by Black has White's move before it; an error by White has Black's move before it |

## Out of scope

- The report board (`BoardView`). A click on an error card shows the position before the user's move with arrows. A
  last-move highlight there is a separate change.
- A button to replay the opponent's move.
- A move list in the trainer. It would show the answer ([PRD 0004](0004-train-your-own-blunders.md), notes).

## Decisions

- Highlight color: the Lichess yellow-green (`rgba(155, 199, 0, 0.41)`). It differs from the yellow selected square.
- Pause before the opponent's move: 600 ms.
- `BoardView` keeps no last-move highlight. That stays a separate change.
