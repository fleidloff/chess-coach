# 0005: Keep games and evaluations in memory only

- Status: proposed
- Date: 2026-10-27
- Related: [PRD 0001](../prds/0001-chess-coach.md), [experiment PRD 0001](../experiment-prds/0001-analysis-cache.md)

## Context

PRD 0001 does not ask for storage. A full run (10 games) took about 20 seconds on a laptop in the first test. The old app stored
games and analyses in IndexedDB, with a versioned export, which was a large part of its code.

## Decision

Games and evaluations live in React state and are gone on reload. `localStorage` keeps only the username and the
platform, under the versioned key `chess-coach:v1`.

## Options considered

- **Memory only (chosen):** no schema to version, no migration, no stale data; the user always sees the latest games.
- **IndexedDB cache:** a reload is instant, but it adds a store, a schema version and cache rules.

## Consequences

- Each visit runs the engine again.
- A cache can come later without a change to the analysis code: `Map<gameId, GameEvals>` is the unit to store.
