# 0002: Stockfish 19 lite single-threaded, in a pool of workers with one job per position

- Status: proposed
- Date: 2026-10-27
- Related: [PRD 0001](../prds/0001-chess-coach.md), [architecture](../docs/architecture.md#engine-pool)

## Context

PRD 0001 names `public/stockfish.js` in one Web Worker. The app runs on GitHub Pages, which cannot send the COOP/COEP
headers that a multi-threaded WASM build needs. 10 games are about 800 positions. Frederik wants the report of the
latest game first; the other 9 games only feed the pattern counts.

## Decision

We use `stockfish-19-lite-single` (WASM, NNUE lite, single-threaded) from the `stockfish` npm package. `npm run
engine` copies it to `public/engine/` before `dev` and `build`. `EnginePool` starts up to 4 workers
(`hardwareConcurrency − 1`). The unit of work is one position. Jobs of the shown game have priority 0 and run first.

## Options considered

- **Lite single-threaded build, pool, job per position (chosen):** works on any static host; all cores help the deep
  analysis of the latest game.
- **One worker, job per game (the spec as written):** simple, but the latest game at depth 14 takes several times
  longer.
- **Multi-threaded build:** faster per position, but needs COOP/COEP headers that GitHub Pages does not send.
- **Full NNUE build:** stronger, but a much larger download for no visible gain at depth 10–14.

## Consequences

- The engine version comes from `package.json`; an update is `npm update stockfish`.
- `public/engine/` is generated and git-ignored.
- Each worker loads its own WASM and network (about 7 MB in memory each).
