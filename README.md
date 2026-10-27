# Chess Coach

Finds the mistakes you repeat. Chess Coach loads your last 10 games from Lichess or Chess.com and runs Stockfish in your
browser. It shows:

- the patterns that come back across the 10 games, for example "Hanging pieces: 4/10 games",
- the top errors of your latest game, with the best move and the engine line on the board,
- the good moves of that game,
- one or two rules for your next games.

No account, no server. Your games go from Lichess or Chess.com straight to your browser. The browser keeps the
analyses, so the next visit shows your last report at once and analyses only new games. "Delete stored data" in the
header removes everything.

## Use

1. Enter your username and pick Lichess or Chess.com.
2. Press "Analyze last 10 games". The latest game comes first; the pattern counts grow while the others run.
3. Click an error or a good move. The board shows the position, your move (red) and the best move (green).
4. Press "Best line" or "Your move and the reply" to play the engine line. Use ← and → to step.
5. Pick another game in the "Game" list. A deeper analysis of that game starts.

## Development

```bash
npm install
npm run dev
```

`npm run check` runs lint, type check, build and tests. See [CLAUDE.md](CLAUDE.md) and [spec/](spec/) for the
architecture, the rules and the decisions.

## Deployment

`npm run build` writes `dist/` with relative paths. It runs on any static host, also under a sub-path. A push to
`main` deploys to GitHub Pages. The engine needs no special HTTP headers.
