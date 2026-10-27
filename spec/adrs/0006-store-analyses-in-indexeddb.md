# 0006: Store games and evaluations in IndexedDB

- Status: proposed
- Date: 2026-10-27
- Related: [PRD 0002](../prds/0002-analysis-cache.md). Supersedes [ADR 0005](0005-no-stored-analysis.md).

## Context

ADR 0005 kept everything in memory. Each visit ran Stockfish on all 10 games again, and a reload lost the report.
PRD 0002 asks for a fast second visit. The first app's IndexedDB database `chess-coach` can still hold its puzzle
progress in users' browsers. A browser can block storage (private mode) or run out of quota.

## Decision

We store in a new IndexedDB database, `chess-coach-analysis` (version 1), with two object stores. `games` keeps the
last fetched game list per `platform:username`. `evals` keeps the evaluations per `platform:gameId`, with schema,
engine id, depth and game date. A run uses a stored evaluation when the engine id matches and the depth is enough. We
keep the newest 50 games per user. `analysisStore.ts` does all IndexedDB access; the pure record logic sits in
`storeRecords.ts` and has Node tests.

Later: [PRD 0004](../prds/0004-train-your-own-blunders.md) adds a third store, `attempts`, in database version 2. The
upgrade creates only the stores that are missing.

## Options considered

- **IndexedDB, own database, validated records (chosen):** room for 50 games per user; a schema field makes later
  changes safe; the old database stays untouched.
- **localStorage:** synchronous, about 5 MB, strings only; 50 games are close to the limit.
- **Reuse the `chess-coach` database with a version bump:** the upgrade would have to delete or migrate the first
  app's puzzle progress.

## Consequences

- A second visit shows the last report at once and runs the engine only for new games.
- Every record carries `schema: 1`. A later schema needs a reader for version 1 or a rule to drop it, and a test.
- An engine update must change `ENGINE_ID` in `storeRecords.ts`, so old evaluations are not reused.
- A blocked or full storage does not stop the analysis; the header shows one quiet note.
- "Delete stored data" deletes the database and the saved username.
