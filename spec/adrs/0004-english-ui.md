# 0004: English UI and analysis text

- Status: proposed
- Date: 2026-10-27
- Related: [PRD 0001](../prds/0001-chess-coach.md)

## Context

The first Chess Coach had a German UI with German piece letters (S, L, T, D). PRD 0001 is in English, and its text
templates ("Hangs piece or moves into lower-value defender") are English. Lichess and Chess.com show SAN with English
letters.

## Decision

All UI and analysis text is English, in short ASD-STE100 sentences. Moves use English SAN. All analysis text lives in
`templateEngine.ts`.

## Options considered

- **English (chosen):** matches the spec, the platforms' SAN and the templates.
- **German:** matches the old app, but the spec would need a translation of every template.
- **Both, with a switch:** a translation layer for one user; not asked for.

## Consequences

- One place to change when a translation comes: `templateEngine.ts` for analysis text, the components for labels.
