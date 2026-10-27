# Experiment PRD 0001: Keep analyses between visits

- Status: idea
- Date: 2026-10-27
- Changes: [ADR 0005](../adrs/0005-no-stored-analysis.md)

## Problem

Each visit runs Stockfish on all 10 games again. A player who checks after every game waits for 9 games they saw
yesterday.

## Idea

Store `GameEvals` per game id and depth in IndexedDB, under a versioned schema. On a new run, analyse only the games
that are not in the store, or that have a lower depth than needed. Add "Clear stored data" to the header.

## Open questions

- How many games to keep? (Suggestion: the last 50 per user and platform.)
- Does an engine update invalidate the store? (Suggestion: store the engine version and the depth with each entry.)
