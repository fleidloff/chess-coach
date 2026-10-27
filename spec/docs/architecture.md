# Chess Coach architecture

Chess Coach is a static single-page app. It loads a player's last 10 games from Lichess or Chess.com, evaluates every
position with Stockfish in Web Workers, and turns the evaluations into a report with rules in TypeScript. There is no
server and no LLM. The product spec is [PRD 0001](../prds/0001-chess-coach.md).

## Modules

| File | Job |
| --- | --- |
| `src/types/chess.ts` | Shared types: `ParsedGame`, `Score`, `GameEvals`, `MoveEval`, `FeedbackNode`, `GameReport` |
| `src/services/lichessApi.ts` | `GET /api/games/user/{name}` (NDJSON). Keeps standard, finished games. `userColor` from `players.*.user.id` |
| `src/services/chessComApi.ts` | `GET /pub/player/{name}/games/archives`, then the monthly archives from newest to oldest until it has 10 games |
| `src/services/analysisStore.ts` | IndexedDB access: load and save game lists and evaluations, evict old games, delete everything |
| `src/services/storeRecords.ts` | Stored record shapes, keys, validation, reuse and eviction rules (pure, tested in Node) |
| `src/engine/stockfishWorker.ts` | `EnginePool`: up to 4 Stockfish workers and a priority queue of positions. `analyseGame()` |
| `src/engine/uci.ts` | Parses UCI `info` lines to White-relative scores. Scores finished positions without the engine |
| `src/engine/heuristics.ts` | Board rules on `chess.js`: hanging piece, fork targets, pins, back rank, f2/f7. `tagBlunder()` |
| `src/engine/openingDb.ts` | Table of opening traps, matched on the full move order |
| `src/engine/templateEngine.ts` | All analysis text: tag labels, summaries, rules, number formats |
| `src/engine/patternAggregator.ts` | `MoveEval`s per game, tag counts across games, `GameReport` per game |
| `src/components/*` | `UsernameInput`, `GameSelector`, `BoardView`, `FeedbackPanel` |
| `src/App.tsx` | State and orchestration |

## Data flow

```
UsernameInput ─► loadGames() + loadEvals() ─► stored report at once
              └─► fetch*Games() ─► ParsedGame[10] ─► saveGames(), evictOld()
                                     │  loadEvals(): stored evaluations with enough depth are reused
                    EnginePool ◄─────┘ analyseGame() for the rest: one job per position
                         │              game 1: depth 14, MultiPV 2, priority 0
                         │              games 2–10: depth 10, MultiPV 1, priority 1
                         ▼
               Map<gameId, GameEvals>  (React state, grows as games finish; each result goes to saveEvals())
                         │
                aggregate() in useMemo
                         │  evaluateMoves() ─► MoveEval[] (+ tagBlunder)
                         │  tag counts ─► tagFrequencies
                         │  buildReport() ─► GameReport per game
                         ▼
              FeedbackPanel ─► click ─► BoardState ─► BoardView
```

When the user selects a game that only had the quick scan, `App` queues a deep analysis of it with priority 0. The
deep result replaces the quick one; a result never replaces a deeper one.

## Engine pool

- Stockfish 19 lite, single-threaded WASM, from the `stockfish` npm package ([ADR 0002](../adrs/0002-stockfish-lite-worker-pool.md)).
  `npm run engine` copies it to `public/engine/` before `dev` and `build`. It needs no COOP/COEP headers, so GitHub
  Pages can host it.
- Pool size: `hardwareConcurrency - 1`, between 1 and 4 workers. Workers start on first use.
- The unit of work is one position, not one game. So the deep game uses all workers, and the report of the latest game
  is ready first.
- `stop()` terminates all workers and rejects queued and running jobs. A new analysis always starts a new pool.
- A finished position (mate, stalemate, insufficient material) never goes to the engine.

## Scores

- The engine reports the score from the side to move. `parseInfo()` turns it to White's point of view. Lines with
  `lowerbound`/`upperbound` are skipped.
- `toCp()` clamps to ±1000 centipawns and maps every mate to ±1000 ([ADR 0003](../adrs/0003-centipawn-loss-and-blunder-rule.md)).
- `MoveEval` holds `cpBefore`, `cpAfter` from the mover's point of view, and `cpl = max(0, cpBefore − cpAfter)`.
- A blunder: `cpl ≥ 150`, `cpAfter < 500` (the mover is not still clearly winning), and the move is not the engine's
  best move.
- A missed mate: the mover had a forced mate in 3 or less, plays another move, and has no forced mate after it. It is
  an error even when the mover is still winning ([ADR 0007](../adrs/0007-missed-mates-are-errors.md)). `MoveEval`
  keeps `mateBefore`/`mateAfter` from the mover's point of view for this.
- An error is a blunder or a missed mate. Top errors list blunders first (by cpl), then missed mates.

## Tags

`tagBlunder()` tests the rules in this order. The first match wins; one tag per error. A missed mate that is not
also a blunder gets `MISSED_MATE` at once. `tagVia` notes which engine move shows the pattern: the best move the user
missed, or the reply the user allowed.

| Order | Tag | Rule |
| --- | --- | --- |
| 1 | `OPENING_TRAP` | The game's moves up to this ply equal a trap in `openingDb.ts` |
| 2 | `BACK_RANK_WEAKNESS` | The engine's reply is a rook or queen check on the mover's back rank, and the king is boxed in by own pieces |
| 3 | `F2_F7_VULNERABILITY` | The king is still on e1/e8, and the move leaves or lands on f2/f7, or the reply lands there, or f2/f7 now has more attackers than defenders |
| 4 | `HANGING_PIECE` | The moved piece is hanging (more attackers than defenders, or a cheaper attacker), or the reply or the next game move takes a hanging piece worth 3+ |
| 5 | `MISSED_FORK` | The engine's best move attacks two targets: the king, a piece worth more, or an undefended piece worth 3+ |
| 6 | `PIN_EXPLOIT` | The engine's best move pins a piece to the king or to a piece worth more. A pawn counts only when pinned to the king |
| 7 | `MISSED_MATE` | The mover had a mate in 3 or less and has none after the move |
| 8 | `ALLOWED_MATE` | The opponent has a forced mate after the move and had none before |
| 9 | `ALLOWED_FORK` | The engine's reply forks two targets of the mover (same target rule as `MISSED_FORK`) |
| 10 | `DISCOVERED_ATTACK` | The reply (allowed) or the best move (missed) leaves a line, and a slider behind it now attacks the king or a piece worth more than the slider |
| 11 | `MISSED_CAPTURE` | The best move takes a hanging piece worth 3+, and the played move takes nothing |
| 12 | `HANGING_PIECE` | The reply line wins 2+ points of material for the opponent (`lineGain()`) |
| 13 | `MISSED_CAPTURE` | The best line wins 2+ points of material for the mover, and the played move takes nothing |
| 14 | `MISSED_CAPTURE` | The best line wins a pawn for the mover, and the played move takes nothing. The error itself guarantees the swing of 150 cp; the text says "wins a pawn" |

`lineGain()` plays up to 8 plies of an engine line and counts the material at the last quiet move, so a capture whose
recapture is still to come does not count. Rules 12 to 14 catch what the static checks miss: defenders behind
another piece (x-ray), and wins that start with a quiet move.

An error that matches no rule stays untagged and reads "Tactical error. Best was …". The pattern section shows how
many errors are untagged ("Other errors: 7 of 22 blunders have no known pattern."). In the measurement
([PRD 0003](../prds/0003-more-tactical-tags.md)), 9 of 39 errors stayed untagged (23 %); they change material by less than
a pawn.

Opening traps match the whole move order, without the "ply ≤ 10" limit of the spec: the Englund trap 6. Bc3 is ply 11.

`tagFrequencies[tag]` counts the games (not the moves) with that tag. A badge "Pattern: seen X/10 games" shows from 2.

## Good moves

For each user move with `cpl ≤ 30`, the first match:

1. Checkmate: `CLEAN_CONVERSION`, score 1000.
2. The opponent's previous move was a blunder: `TACTICAL_STRIKE` ("punishes"), score = that blunder's cpl.
3. Only move (deep analysis only: best minus second-best ≥ 150) while not better than +0.5: `DEFENSIVE_SAVE`.
4. Only move while better: `TACTICAL_STRIKE`.
5. A capture that keeps ≥ +3.0 in a game the user won: `CLEAN_CONVERSION`, score 50, at most one.

The three with the highest score are shown.

## Rules for the next games

`topTag()` picks the tag with the highest game count; a tag that is in the shown game wins a tie. The report shows the
two rules for that tag from `RULES`. With errors but no tag: one generic blunder-check rule. No errors: no rules.

## UI

- Header: username, platform, analyze/stop, progress bar ("Analyzing game 4/10"), game selector.
- Left panel, `BoardView`: players, board in the user's orientation, step controls, the move list with `??`/`!`
  marks. Keyboard: ←, →, Home, End (not while focus is in a form field).
- Right panel, `FeedbackPanel`: good moves, top errors, rules, then the pattern pills of all games. Good moves come
  first, so the report opens with what went right.
- `BoardState` lives in `App`: `{ ply, node?, branch? }`. A click on a feedback card sets `ply` to the move and shows
  the node's arrows (red: played, green: best) and highlight squares. A branch button plays an engine line from that
  position, one move per 900 ms; the step buttons then move inside the branch until "Back to game".
- Below `md` the page scrolls as one column. From `md` on, the page is one screen high and each panel scrolls.

## Storage

[ADR 0006](../adrs/0006-store-analyses-in-indexeddb.md), [PRD 0002](../prds/0002-analysis-cache.md).

- `localStorage` key `chess-coach:v1`: `{ username, platform }` of the last run.
- IndexedDB `chess-coach-analysis`, version 1:

| Store | Key | Value |
| --- | --- | --- |
| `games` | `platform:username` (lower case) | `{ schema: 1, key, games: ParsedGame[], fetchedAt }` |
| `evals` | `platform:gameId` | `{ schema: 1, key, owner, date, engine, depth, positions, savedAt }` |

- On start, when the saved user has a stored game list, `App` shows it with its stored evaluations, then fetches.
- A stored evaluation is reused when `engine` equals `ENGINE_ID` and its depth is enough: depth 14 for the shown game,
  10 for the others. A deeper result always replaces a shallower one.
- Every read validates the shape; a record that fails is deleted. Evaluations of one user beyond the newest 50 games
  are deleted after each fetch.
- Storage errors never stop the analysis. The header shows one note. "Delete stored data" deletes the database and the
  `localStorage` key.
- The old database `chess-coach` of the first app is never opened.

## Deployment

`npm run build` writes `dist/` with relative paths (`base: './'`). `.github/workflows/pages.yml` runs `npm run check`
and deploys `dist/` to GitHub Pages on every push to `main`.
