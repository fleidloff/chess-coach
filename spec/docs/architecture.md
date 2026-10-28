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
| `src/engine/trainer.ts` | Picks the training positions for a tag and judges a move against the best move (pure, tested in Node) |
| `src/components/*` | `UsernameInput`, `GameSelector`, `BoardView`, `FeedbackPanel`, `Trainer` |
| `src/App.tsx` | State and orchestration |

## Data flow

```
UsernameInput ─► loadGames() + loadEvals() ─► stored report at once
              └─► fetch*Games() ─► ParsedGame[10] ─► saveGames(), evictOld()
                                     │  loadEvals(): stored evaluations with enough depth are reused
                    EnginePool ◄─────┘ analyseGame() for the rest: one job per position
                         │              game 1: depth 14, MultiPV 2, priority 0
                         │              games 2–10: depth 10, MultiPV 1, priority 1
                         │              then games 2–10 one by one: depth 14, MultiPV 2, priority 2
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

After the quick scan, `deepenRest()` gives games 2 to 10 the deep analysis, one game at a time, newest first, at
priority 2 ([PRD 0007](../prds/0007-fewer-untagged-errors.md), [ADR 0008](../adrs/0008-deep-analysis-for-all-games.md)).
The header shows "Deepening game N/10". When the user selects a game that has no deep analysis yet, `App` queues it
with priority 0. `Session.deep` holds the games with a deep analysis stored, running or queued, so no game runs twice.
The deep result replaces the quick one; a result never replaces a deeper one.

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
- An error is a blunder or a missed mate. Top errors pick the three worst: blunders first (by cpl), then missed mates.
  The list shows them in game order ([PRD 0005](../prds/0005-cards-in-game-order.md)).

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
| 15 | `HANGING_PIECE` | The reply line wins a pawn for the opponent, and the played move takes nothing. The text says "Loses a pawn to Qxb7." |
| 16 | `KING_IN_CENTER` | Allowed: the opponent checks the mover's king within its first 3 moves of the reply line, while that king can still castle. Missed: the same for the mover's best line and the opponent's king |

`lineGain()` plays up to 8 plies of an engine line and counts the material at the last quiet move, so a capture whose
recapture is still to come does not count. Rules 12 to 15 catch what the static checks miss: defenders behind
another piece (x-ray), and wins that start with a quiet move.

An error that matches no rule stays untagged and reads "Tactical error. Best was …". The pattern section shows how
many errors are untagged ("Other errors: 7 of 22 blunders have no known pattern."). In the measurement
([PRD 0007](../prds/0007-fewer-untagged-errors.md)) of 50 `fredbbs` games at depth 14, 32 of 224 errors stay
untagged (14 %): endgames, decided positions, pawn breaks, piece placement.

A move that stalemates reads "Stalemates the opponent. Best was …", whatever its tag.

Opening traps match the whole move order, without the "ply ≤ 10" limit of the spec: the Englund trap 6. Bc3 is ply 11.

`tagFrequencies[tag]` counts the games (not the moves) with that tag. A badge "Pattern: seen X/10 games" shows from 2.

## Good moves

For each user move with `cpl ≤ 30`, the first match:

1. Checkmate: `CLEAN_CONVERSION`, score 1000.
2. The opponent's previous move was a blunder: `TACTICAL_STRIKE` ("punishes"), score = that blunder's cpl.
3. Only move (deep analysis only: best minus second-best ≥ 150) while not better than +0.5: `DEFENSIVE_SAVE`.
4. Only move while better: `TACTICAL_STRIKE`.
5. A capture that keeps ≥ +3.0 in a game the user won: `CLEAN_CONVERSION`, score 50, at most one.

The three with the highest score are shown, in game order ([PRD 0005](../prds/0005-cards-in-game-order.md)).

## Rules for the next games

`topTag()` picks the tag with the highest game count; a tag that is in the shown game wins a tie. The report shows the
two rules for that tag from `RULES`. With errors but no tag: one generic blunder-check rule. No errors: no rules.

## Trainer

[PRD 0004](../prds/0004-train-your-own-blunders.md). Below the rules, "Train this pattern (N positions)" opens the
trainer for the report's `focusTag` (the tag the rules address). Each pattern pill is a button too: it opens the
trainer for its own tag. `App` builds the position list for every tag that appears.

- Positions: the user's errors with that tag from all analysed games (`errorsByGame`), newest game first, in move
  order, at most 10. Each shows the position before the error, from the user's side, without arrows.
- The opponent's move ([PRD 0006](../prds/0006-show-the-opponent-move.md)): `trainingPositions()` replays the game to
  find the move before the error (`lastMove`). The board opens one move earlier and plays it after 600 ms (at once
  with reduced motion); input waits until then. The panel says "Black played 23... Qxd4." The from-square and the
  to-square of the last move on the board are lime green: the opponent's move, then the user's move, then the last
  move of "Show line". "Try again" and "Show solution" show the opponent's move again, with no replay. An error on
  ply 0 has no opponent's move.
- Input: drag and drop; tap a piece, then a target (dots mark the legal squares); or the keyboard: the board is one
  focus stop (`role="application"`), arrow keys move a cursor, Enter picks and drops, Escape cancels. A screen reader
  hears the cursor square and the piece on it. The cursor shows only after keyboard focus, not after a mouse click.
- Judging: the trainer's own `EnginePool` searches the position after the user's move and after the best move, both at
  depth 12, and `judge()` compares them. A loss of 30 cp or less is correct, so a second good move also counts. The
  pool starts on the first move and stops when the trainer closes.
- After a wrong move: "Try again" or "Show solution" (green arrow). After a correct move or the solution: "Show line"
  plays the best line, then "Next". The first result per position counts; a solution before any move counts as not
  solved.
- The summary: "Solved X of N on the first try." with "Train again" and "Back to the report".
- Each first result is stored per position (`attempts` store). The trainer shows "Before: 3 tries, 1 solved" from what
  storage held when the round started.
- Selecting another game, a new analysis or "Delete stored data" closes the trainer.

## UI

- Header: username, platform, analyze/stop, progress bar ("Analyzing game 4/10"), game selector.
- Left panel, `BoardView`: players, board in the user's orientation, step controls, the move list with `??`/`!`
  marks. Keyboard: ←, →, Home, End (not while focus is in a form field).
- The eval bar left of the board shows White's win chance (`winChance()`, Lichess formula) and the score
  (`formatScore()`) of the shown game position. It is faded while a branch plays or before the game is analysed: those
  positions have no evaluation. The trainer has no eval bar.
- Right panel, `FeedbackPanel`: good moves, top errors, rules, then the pattern pills of all games. Good moves come
  first, so the report opens with what went right.
- `BoardState` lives in `App`: `{ ply, node?, branch? }`. A click on a feedback card sets `ply` to the move and shows
  the node's arrows (red: played, green: best) and highlight squares. A branch button plays an engine line from that
  position, one move per 900 ms; the step buttons then move inside the branch until "Back to game".
- Below `md` the page scrolls as one column. The board, its caption, the step buttons and the line buttons stay pinned
  at the top (`sticky`), so a tap on a card shows its position without scrolling up. To keep room for the cards, the
  pinned board is at most 40 % of the screen height, the user's own player line and the arrow legend are hidden, and
  the move list scrolls with the page. `max-md:contents` on `BoardView`'s section and on its wrapper in `App` makes the
  pinned part a child of `main`, so it stays pinned over the whole card list.
- From `md` on, the page is one screen high and each panel scrolls.

## Storage

[ADR 0006](../adrs/0006-store-analyses-in-indexeddb.md), [PRD 0002](../prds/0002-analysis-cache.md).

- `localStorage` key `chess-coach:v1`: `{ username, platform }` of the last run.
- IndexedDB `chess-coach-analysis`, version 2 (version 2 added `attempts`):

| Store | Key | Value |
| --- | --- | --- |
| `games` | `platform:username` (lower case) | `{ schema: 1, key, games: ParsedGame[], fetchedAt }` |
| `evals` | `platform:gameId` | `{ schema: 1, key, owner, date, engine, depth, positions, savedAt }` |
| `attempts` | `platform:gameId:ply` | `{ schema: 1, key, tries, solved, lastResult, lastAt }` |

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
