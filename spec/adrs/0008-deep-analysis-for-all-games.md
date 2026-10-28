# 0008: Deep analysis for all 10 games, behind the quick scan

- Status: accepted
- Date: 2026-10-28
- Related: [PRD 0007](../prds/0007-fewer-untagged-errors.md), [PRD 0001](../prds/0001-chess-coach.md) R3,
  [ADR 0002](0002-stockfish-lite-worker-pool.md)

## Context

PRD 0001 R3 runs depth 14 for the latest game and depth 10 for the other nine. Only a selected game gets depth 14
later. So the pattern counts depend on which games the user opened. For `fredbbs`, 35 % of the errors stay untagged
at depth 10 and 16 % at depth 14. The depth-10 lines are short, and some depth-10 errors are engine noise. Stored
evaluations ([ADR 0006](0006-store-analyses-in-indexeddb.md)) keep a deep result for later visits.

## Decision

After the quick scan, `App` gives games 2 to 10 a depth-14 analysis with MultiPV 2, one game at a time, newest first,
at priority 2. A selected game still jumps the queue at priority 0. The quick scan stays, so the pattern pills fill
fast.

## Options considered

- **Quick scan, then deep in the background (chosen):** the first counts show as fast as now, and the final counts do
  not depend on the user's clicks.
- **Depth 14 for all games from the start:** no counts change after the first fill, but the pills wait about twice
  as long.
- **Keep depth 10 for games 2 to 10:** no extra engine time, but a third of the errors stay untagged and the counts
  depend on the selected games.

## Consequences

- A cold start runs the engine about 50 s longer (5 s per game on the test machine). "Stop" ends it.
- The pattern counts change once more while the deep analysis runs. The header shows "Deepening game N/10".
- Return visits load depth 14 for all games from storage. No new `ENGINE_ID`, no new `DB_VERSION`.
