# PRD 0002: Keep analyses between visits

- Status: built (2026-10-27), checked in the browser with Lichess user `thibault`
- Date: 2026-10-27
- Owner: Frederik
- Decisions: [ADR 0006](../adrs/0006-store-analyses-in-indexeddb.md), which supersedes [ADR 0005](../adrs/0005-no-stored-analysis.md)
- Touches: `src/App.tsx`, new `src/services/analysisStore.ts` and `src/services/storeRecords.ts`, `spec/docs/architecture.md`

## Problem

Each visit runs Stockfish on all 10 games again. A player who checks after every game waits for 9 games they saw
yesterday. A reload during a run loses everything.

## Goal

1. A run analyses only the games that are new, or that have less depth than needed.
2. When the app opens, it shows the last report at once, from storage. Then it checks the platform for new games.
3. The user can delete all stored data with one button.
4. Stored data stays readable after an update: it carries a schema version and the engine version.

## Users

| User | Wants |
| --- | --- |
| Frederik | to check after each game without waiting for the whole run |
| Club players | a fast second visit, and control over what the browser keeps |

## User stories

1. I analyze my last 10 games in the morning. In the evening I play 2 more games and press "Analyze last 10 games".
   The progress bar says "Analyzing 2 new games, 8 from storage" and is done in a few seconds.
2. I open the app the next day. My last report shows at once, with a note "Stored 2026-10-27 18:40. Checking for new
   games…".
3. I select game 6. Its deep analysis is in storage, so no deep run starts.
4. I press "Delete stored data" in the header. After a confirmation, the app forgets my games and analyses. The
   username field stays filled only if I keep it.
5. My browser blocks storage (private mode). The app works as today, without the note.

## Requirements

| # | Requirement |
| --- | --- |
| R1 | IndexedDB database `chess-coach-analysis`, version 1. Do not open, change or delete the old `chess-coach` database: it can hold puzzle progress from the first app |
| R2 | Store `games`: key `platform:username`, value `{ schema: 1, games: ParsedGame[], fetchedAt }` |
| R3 | Store `evals`: key `platform:gameId`, value `{ schema: 1, engine: 'stockfish-19-lite', depth, positions, savedAt }` |
| R4 | A stored evaluation counts only with the same `engine` and a `depth` at or above the needed depth |
| R5 | Keep the last 50 games per `platform:username`. Delete older evaluations when a run saves new ones |
| R6 | Every read validates the shape. A record that does not match is skipped and deleted, never shown |
| R7 | A failed write (quota, blocked storage) does not stop the analysis. Show one quiet note in the header |
| R8 | "Delete stored data" asks for confirmation and deletes the `chess-coach-analysis` database |
| R9 | The pure parts (key building, eviction, validation) have Node tests |

## Out of scope

- Export and import of stored data.
- Sync between devices.

## Decisions on the open questions

- Keep 50 games per user. One game is about 10 KB of evaluations.
- Show the stored report at once, then update it after the fetch. When the fetched list equals the stored list, the
  selected game and the board stay as they are.
- "Delete stored data" also deletes the saved username and platform. The username field keeps what is typed in it.
