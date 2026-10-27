# 0001: Rebuild the app on the focused spec, keep the engine and API code

- Status: proposed
- Date: 2026-10-27
- Related: [PRD 0001](../prds/0001-chess-coach.md)

## Context

The first Chess Coach (commits up to `ac2bf49`) was a broad Lichess tool: up to hundreds of games, IndexedDB storage,
JSON export and import, a weakness overview, training plans with Lichess links, puzzles from the user's own mistakes,
and a German UI. Frederik found it "not really focused" on his need. PRD 0001 asks for less: the last 10 games,
recurring patterns, and a short report on one game. It also adds Chess.com, Tailwind and a fixed file structure.

Parts of the old code work and fit the new spec: the Stockfish worker wrapper, the Lichess game parser, and the
hanging-piece and fork checks.

## Decision

We replace the app with the structure of PRD 0001. We keep and adapt the worker wrapper (now `EnginePool`), the
Lichess parser and the fork and hanging-piece checks. We delete the rest: IndexedDB, export and import, overview,
mistakes list, training plans, puzzles, and the Lichess server-analysis shortcut.

## Options considered

- **Rebuild, reuse the proven parts (chosen):** the code matches the spec's layout, and the parts that were checked
  against real games stay.
- **Extend the old app:** keeps features Frederik does not want in view, and its layout differs from the spec.
- **Everything from scratch:** rewrites working engine and parser code for no gain.

## Consequences

- The old features are in git history (`ac2bf49`) if one comes back. Puzzles are an idea in
  [experiment PRD 0003](../experiment-prds/0003-puzzles-from-own-blunders.md).
- Data that old users stored in IndexedDB (`chess-coach` database) is not read anymore. It stays in their browser.
- Lichess games with server analysis now also go through the local engine. This costs time, but every game gets the
  same depth and the same best-move data.
