# Chess Coach

Analysiert deine Lichess-Partien komplett im Browser: häufigste Fehler, Stärken, Trainingsplan und Aufgaben aus deinen eigenen Fehlern. Kein Backend, kein Konto.

- Partien kommen von der Lichess-API (`/api/games/user/{name}`, NDJSON-Stream).
- Partien mit Lichess-Analyse nutzen deren Bewertungen. Alle anderen analysiert Stockfish 19 lite (WASM, single-threaded) in mehreren Web Workern.
- Daten liegen in IndexedDB. Export und Import als JSON (versioniert).

## Entwicklung

```bash
npm install
npm run dev
```

`npm run check` führt Lint, Typprüfung, Build und Tests aus.

## Deployment

`npm run build` erzeugt `dist/` mit relativen Pfaden. Der Ordner läuft auf Vercel und auf GitHub Pages (auch unter einem Unterpfad). Die Engine braucht keine besonderen HTTP-Header.
