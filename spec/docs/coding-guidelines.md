# Chess Coach coding guidelines

These rules come from the code and the checks. The general guidelines in `~/.claude/coding-guidelines.md` also apply.
Where they conflict, the project rule wins.

## Stack

| Part | Choice |
| --- | --- |
| Build | Vite, TypeScript (strict, `erasableSyntaxOnly`) |
| UI | React 19, Tailwind CSS 4 (Vite plugin, no config file), `lucide-react` icons |
| Chess | `chess.js` for rules and SAN, `react-chessboard` 5 for the board |
| Engine | `stockfish` 19 lite, single-threaded WASM ([ADR 0002](../adrs/0002-stockfish-lite-worker-pool.md)) |
| Lint | oxlint (`.oxlintrc.json`) |
| Tests | `node:test`, run on the `.ts` files directly through Node's type stripping |

Ask Frederik before you add a dependency.

## Layers

```
types/chess.ts  <-  services/*  <-  App.tsx  ->  components/*
                <-  engine/*    <-
```

- `types/chess.ts` holds every type that crosses a module border. Keep local types local.
- `services/` fetch and normalize. They know nothing about the engine or the UI.
- `engine/` is pure TypeScript: no DOM, no React, no `fetch`. The one exception is `stockfishWorker.ts`, the only
  file that creates a `Worker` or reads `import.meta.env`. Do not import it from a test.
- `services/analysisStore.ts` is the only file that touches IndexedDB. Its pure logic lives in `storeRecords.ts`.
  Do not import `analysisStore.ts` from a test.
- `components/` render props. They do not fetch and do not start the engine.
- `App.tsx` owns the state: settings, games, evaluations, the selected game, the board state.

## TypeScript

- Node runs the tests with type stripping. So: no `enum`, no `namespace`, no constructor parameter properties.
  `tsc` checks this through `erasableSyntaxOnly`.
- Import with the `.ts` / `.tsx` extension. Use `import type` for types only.
- Prefer union string types (`TacticalTag`) and `Record<Union, T>` tables over classes and switch chains.
- No `any`. Data from the network gets an interface for the fields we read, and a parser that returns `undefined`
  for a game we cannot use.

## Scores and moves

- `Score` (`cp` or `mate`) is from White's point of view, as the engine gives it after `parseInfo()`.
- `toCp()` is the only conversion to centipawns. It clamps to ±1000 and maps a mate to ±1000.
- `MoveEval.cpBefore`, `cpAfter`, `cpl` and `cpSecond` are from the mover's point of view.
- `ply` is the 0-based index into `ParsedGame.moves`. `BoardState.ply` is the number of moves on the board, so the
  position before move `ply` is `fens[ply]`.
- Games always start from the standard position. The services drop all other games.

## Analysis text

- All text that explains a move comes from `templateEngine.ts`: tag labels, error and good-move summaries, rules.
- English, ASD-STE100 style: short sentences, one fact per sentence, active voice, no jargon a club player does not
  know.
- Say only what the heuristic proved. "Misses the fork Nc7+" needs `forkTargets()` to find two targets.

## UI

- Tailwind utility classes only. `index.css` holds the import and the body colors, nothing else.
- Every color class has a `dark:` partner. Dark mode follows the system.
- Animations: `motion-reduce:` variants, and `showAnimations` off on the board when the user asks for reduced motion.
- Every control is a real `button`, `input` or `select`, reachable by keyboard, with a visible
  `focus-visible:ring`. Icon-only buttons get an `aria-label`. Icons get `aria-hidden`.
- Status text that changes uses `aria-live="polite"`. Errors use `role="alert"`.
- The layout works from 320 px width. Below `md` the page scrolls; from `md` on, the two panels scroll on their own.

## Errors and data

- Services throw an `Error` with a message for the user ("Lichess has no user "x"."). `App` shows it.
- An aborted fetch is not an error. Check `signal.aborted` before you show anything.
- `localStorage` holds only the username and the platform, under a versioned key. Read in `try/catch`, validate the
  shape, fall back to defaults. The app must work when storage is blocked.
- Every IndexedDB record has `schema`. A new schema needs a reader or a drop rule for the old one, and a test.
  Validate every record on read; never show one that fails.
- Change `ENGINE_ID` in `storeRecords.ts` when the engine changes, so old evaluations are not reused.
- A failed storage call never stops the analysis. Catch it and show the quiet note.

## Code style

- No semicolons, single quotes, 2 spaces, trailing commas, lines up to about 130 characters.
- Small pure functions. Name them for what they return (`forkTargets`, `pinnedSquare`).
- Comments only for what the code cannot say: a limit, a reason, a quirk. A one-line `/** */` on an exported type
  field is fine when the unit or the point of view is not obvious.

## Tests

- Tests sit next to the code: `src/engine/engine.test.ts`, `src/services/services.test.ts`.
- Each tag has a FEN test that shows it fires. A change to a rule's order needs a test for the case that moved.
- Each opening trap must be legal; the test plays every trap and its refutation.
- `npm run check` must pass before every push. The GitHub Pages workflow runs it too.
