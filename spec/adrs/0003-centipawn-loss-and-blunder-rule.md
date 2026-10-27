# 0003: Centipawn loss with a ±1000 clamp, and a blunder rule that ignores won positions

- Status: proposed
- Date: 2026-10-27
- Related: [PRD 0001](../prds/0001-chess-coach.md), [architecture](../docs/architecture.md#scores)

## Context

PRD 0001 defines a blunder as a centipawn loss (CPL) of 150 or more, and asks for correct handling of mate scores. Raw
centipawns have two problems. A mate score has no centipawn value. And a drop from +15.0 to +8.0 is a CPL of 700, but
the game is still won: the report would fill with moves that do not matter.

## Decision

`toCp()` clamps every score to ±1000 and maps a mate to ±1000. A move is a blunder when its CPL is 150 or more, the
mover's score after the move is below +5.0, and the move is not the engine's best move. Each blunder gets at most one
tag; the rules run from the most specific to the least specific.

## Options considered

- **Clamped CPL plus a "still winning" exception (chosen):** keeps the spec's 150 cp rule and its numbers, and drops
  the noise in won positions.
- **Raw CPL:** fills the report with harmless moves in won games; a mate has no value.
- **Win-chance loss (the Lichess formula, used by the old app):** handles both problems, but the spec and its text
  ("−3.2") speak in centipawns.

## Consequences

- A blunder in a lost position (−4.0 to −10.0) still counts. It shows a habit, even when the game was lost before.
- Missed mates in a won position are not errors. A later tag for missed mates needs its own rule.
- The ±1000 clamp shows as "+M"/"−M" in the UI.
