# Chess Coach

A single-page React app that loads a player's last 10 games from Lichess or Chess.com, runs Stockfish in the browser and
shows the recurring blunder patterns. For the latest (or the selected) game it shows the top errors, the good moves and
one or two rules for the next games. No backend, no LLM, no account.

This is Frederik's own project. The product spec is [PRD 0001](spec/prds/0001-chess-coach.md).

## Read first

- [spec/docs/architecture.md](spec/docs/architecture.md): modules, the analysis pipeline, scores, tags, the UI.
- [spec/docs/coding-guidelines.md](spec/docs/coding-guidelines.md): project rules. They override general habits.
- [spec/prds/](spec/prds/): what the app does, one PRD per feature.
- [spec/adrs/](spec/adrs/): the decisions so far. "proposed" ones wait for Frederik's review.
- [spec/experiment-prds/](spec/experiment-prds/): ideas for later, not built.

## Layout

- `src/types/chess.ts`: all shared types.
- `src/services/`: `lichessApi.ts`, `chessComApi.ts`. Fetch and normalize games to `ParsedGame`.
- `src/engine/`: `stockfishWorker.ts` (the only file that touches `Worker`), `uci.ts`, `heuristics.ts`,
  `openingDb.ts`, `templateEngine.ts` (all user-facing analysis text), `patternAggregator.ts`.
- `src/components/`: `UsernameInput`, `GameSelector`, `BoardView`, `FeedbackPanel`.
- `src/App.tsx`: state and orchestration.
- `public/engine/`: Stockfish files, copied from `node_modules/stockfish` by `npm run engine`. Git-ignored.
- `spec/`: `docs/`, `prds/`, `adrs/`, `experiment-prds/`.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173, copies the engine first
npm run check      # lint, type check, build, tests: run before every push
npm test           # unit tests only (node:test, ~1 s)
```

The preview server for Claude is `chess-coach` in `.claude/launch.json`. Public test users: `thibault` (Lichess),
`erik` (Chess.com).

## Hard rules

- No backend and no third-party service besides the Lichess and Chess.com public APIs.
- `src/engine/` and `src/services/` stay free of DOM and React, except `stockfishWorker.ts`. Node runs their tests.
- `Score` is always from White's point of view. `MoveEval` centipawns are always from the mover's point of view.
  Convert only through `toCp()`.
- All analysis text comes from `templateEngine.ts`. UI text is English, in short ASD-STE100 sentences.
- Every color class has a `dark:` partner. Every animation respects `prefers-reduced-motion`.
- A new tag, trap or heuristic gets a FEN test in `src/engine/engine.test.ts`.
- `localStorage` keys carry a version (`chess-coach:v1`). Read them in `try/catch` and validate the shape.
- Commits: short imperative sentence ("Add pin detection"). Branch from `main`. `main` deploys to GitHub Pages.
- When Frederik is away and a decision is unclear: take it and write an ADR with status "proposed".

## Spec workflow

- `spec/prds/`: product requirement documents, one per feature. Copy the structure of PRD 0001.
- `spec/experiment-prds/`: ideas not built yet, numbered on their own. Move one to `prds/` when work starts.
- `spec/adrs/`: architecture decision records. Copy `spec/adrs/0000-template.md` to the next free number.
- `spec/docs/`: living docs. Update them when the architecture or a rule changes.
