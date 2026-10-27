# PRD 0001: Chess Coach, pattern-aware and client-side

- Status: built (2026-10-27), checked in the browser with Lichess user `thibault` and Chess.com user `erik`
- Date: 2026-10-27
- Owner: Frederik
- Decisions: [ADR 0001](../adrs/0001-rebuild-on-the-focused-spec.md) to [ADR 0005](../adrs/0005-no-stored-analysis.md)
- Touches: all of `src/`

## Problem

Engine analysis on Lichess and Chess.com looks at one game at a time. It marks every inaccuracy. A club player sees
twenty marks and does not see the one mistake they make every week. The first Chess Coach showed too much: an overview
of hundreds of games, plans, puzzles.

## Goal

1. Load the last 10 games from Lichess or Chess.com. No account, no backend, no LLM.
2. Run Stockfish and `chess.js` in the browser.
3. Count the recurring blunder patterns (`TacticalTag`) across the 10 games.
4. For the latest (or the selected) game, show:
   - at most 3 good moves: tactical strikes, defensive saves, clean conversions,
   - at most 3 top errors, each with a badge when its pattern repeats in the 10 games,
   - 1 to 2 rules for the most frequent pattern.
5. An interactive board that follows the analysis: a click on a card shows the position, arrows, highlighted squares,
   and plays the engine line.

## Users

| User | Wants |
| --- | --- |
| Frederik | the one or two habits that cost him games, with the positions to look at |
| Club players | the same, for their Lichess or Chess.com account |

## User stories

1. I enter my Lichess name and press "Analyze last 10 games". A progress bar shows "Analyzing game 4/10".
2. The report of my latest game appears first. The pattern pills fill while the other games run.
3. I see "11. Rae1?? Tactical error. Best was Bxh6." I click it: the board shows the position before the move, a red
   arrow for my move and a green arrow for the best move.
4. I press "Best line": the board plays the engine line. I press "Your move and the reply": the board plays my move
   and the punishment. "Back to game" returns.
5. An error card says "Pattern: seen 3/10 games". The rules at the bottom tell me what to do about it.
6. I pick game 6 in the game selector. Its quick report shows at once; a deep analysis runs and replaces it.
7. I switch to Chess.com, enter my name, and get the same report.
8. A wrong name shows "Lichess has no user "x"." No network shows "Cannot reach Lichess."

## Requirements

| # | Requirement |
| --- | --- |
| R1 | Lichess: `GET /api/games/user/{name}` as NDJSON, standard games only, `userColor` from `players.*.user.id` (case-insensitive) |
| R2 | Chess.com: `GET /pub/player/{name}/games/archives`, newest archive first, until 10 standard games |
| R3 | Stockfish in Web Workers. Latest game: depth 14, MultiPV 2. Other games: depth 10 |
| R4 | Scores from White's point of view; CPL from the mover's point of view; mate scores handled ([ADR 0003](../adrs/0003-centipawn-loss-and-blunder-rule.md)) |
| R5 | Tags for blunders (CPL ≥ 150): `HANGING_PIECE`, `F2_F7_VULNERABILITY`, `MISSED_FORK`, `PIN_EXPLOIT`, `BACK_RANK_WEAKNESS`, `OPENING_TRAP` |
| R6 | Tag frequency = number of games with that tag. Badge from 2 games |
| R7 | Text from templates only, from the heuristic's findings |
| R8 | Layout: header with input, progress and game switch; board left; analysis right. One screen high on desktop, one column on phones |
| R9 | Board: player names and ratings, result, red/green arrows, step controls `|< < > >|`, move list |
| R10 | Keyboard, screen reader, dark mode, reduced motion |

## Out of scope

- More than 10 games, filters by time control, accounts, storage of analyses ([ADR 0005](../adrs/0005-no-stored-analysis.md)).
- Puzzles and training plans (the old app, [ADR 0001](../adrs/0001-rebuild-on-the-focused-spec.md)).

## Deviations from the original prompt

- Engine: `stockfish` npm package in `public/engine/`, not `public/stockfish.js`, and a pool of workers
  ([ADR 0002](../adrs/0002-stockfish-lite-worker-pool.md)).
- Opening traps match the full move order without the "ply ≤ 10" limit.
- Summaries leave out the move ("Misses the fork Nc7+."), because the card shows the move in a badge.
- `ParsedGame` also holds `moves`, `url`, ratings and the opening. `FeedbackNode` also holds `kind` and `branches`.
- New file `src/engine/uci.ts`: the UCI parser, so Node tests do not load the Worker code.
