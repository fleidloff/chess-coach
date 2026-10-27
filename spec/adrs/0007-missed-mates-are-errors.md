# 0007: A missed mate in 3 or less is an error, also in a won position

- Status: proposed
- Date: 2026-10-27
- Related: [PRD 0003](../prds/0003-more-tactical-tags.md) R3. Changes the blunder rule of
  [ADR 0003](0003-centipawn-loss-and-blunder-rule.md) for this one case.

## Context

ADR 0003 ignores every move after which the mover still has +5.0 or more. That removes noise, but it also hides a
missed mate in 2: the mover is still winning, so the move never counts. A missed short mate is a clear habit to fix
("look at checks first"). The clamp of ±1000 makes a mate and +10.0 look the same, so the centipawn loss cannot see it.

## Decision

`MoveEval` keeps the raw mate distance from the mover's point of view (`mateBefore`, `mateAfter`). A move is an error
when it is a blunder (ADR 0003) or a missed mate: the mover had a mate in 3 or less, played another move, and has no
forced mate after it. A missed mate that is not also a blunder gets the tag `MISSED_MATE` without the other rules. Top
errors list the blunders first, then the missed mates.

## Options considered

- **Separate missed-mate rule on raw mate scores (chosen):** finds short mates, leaves the 150 cp rule as it is.
- **Lower the "still winning" limit:** brings back the noise ADR 0003 removed.
- **Win-chance loss:** would also see it, but changes all numbers in the UI.

## Consequences

- A won game can show an error card: "Misses mate: Qh7+ mates in 2."
- A mate in 4 or more that turns into a slower mate, or into a large advantage, is still not an error.
- Engine depth matters: at depth 10 the engine can miss a mate in 3 that depth 14 finds.
