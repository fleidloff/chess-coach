import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameRecord } from './lib/lichess.ts'
import { fetchGames, SPEEDS } from './lib/lichess.ts'
import type { Filter, GameAnalysis, PuzzleRecord, Tag } from './lib/analysis.ts'
import { annotateGame, buildReport } from './lib/analysis.ts'
import type { Job } from './lib/engine.ts'
import { analyseGame, checkUnique, startPool } from './lib/engine.ts'
import { deleteMany, exportAll, getAll, importAll, putMany } from './lib/db.ts'
import { Overview } from './components/Overview.tsx'
import { Mistakes } from './components/Mistakes.tsx'
import { Puzzles } from './components/Puzzles.tsx'
import { Games } from './components/Games.tsx'
import { SPEED_LABEL } from './components/format.ts'

type Tab = 'overview' | 'mistakes' | 'puzzles' | 'games' | 'data'
const TABS: [Tab, string][] = [
  ['overview', 'Übersicht'],
  ['mistakes', 'Fehler'],
  ['puzzles', 'Aufgaben'],
  ['games', 'Partien'],
  ['data', 'Daten'],
]
const DEPTHS = [
  [10, 'Schnell (Tiefe 10)'],
  [12, 'Normal (Tiefe 12)'],
  [15, 'Gründlich (Tiefe 15)'],
] as const

function stored(key: string): string | null {
  try {
    return localStorage.getItem(`chess-coach:${key}`)
  } catch {
    return null
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(`chess-coach:${key}`, value)
  } catch {
    // Private mode: settings are not remembered, the app still works.
  }
}

export default function App() {
  const [input, setInput] = useState(() => stored('username') ?? '')
  const [user, setUser] = useState(() => (stored('username') ?? '').toLowerCase())
  const [count, setCount] = useState(() => Number(stored('count')) || 50)
  const [speeds, setSpeeds] = useState<string[]>(() => JSON.parse(stored('speeds') ?? '["blitz","rapid","classical"]'))
  const [depth, setDepth] = useState(() => Number(stored('depth')) || 12)
  const [allGames, setAllGames] = useState<GameRecord[]>([])
  const [analyses, setAnalyses] = useState(new Map<string, GameAnalysis>())
  const [puzzles, setPuzzles] = useState(new Map<string, PuzzleRecord>())
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState<number>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [paused, setPaused] = useState(false)
  const [failed, setFailed] = useState(new Set<string>())
  const [filter, setFilter] = useState<Filter>({ result: 'all', speed: '' })
  const [tab, setTab] = useState<Tab>('overview')
  const [mistakeTag, setMistakeTag] = useState<Tag | ''>('')
  const [puzzleTag, setPuzzleTag] = useState<Tag | ''>('')
  const [openGame, setOpenGame] = useState<{ gameId: string; ply: number }>()
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    Promise.all([getAll('games'), getAll('analyses'), getAll('puzzles')])
      .then(([g, a, p]) => {
        setAllGames(g)
        setAnalyses(new Map(a.map(x => [x.id, x])))
        setPuzzles(new Map(p.map(x => [x.id, x])))
      })
      .catch(() => setError('Der lokale Speicher ist nicht verfügbar. Partien werden nach dem Neuladen nicht gespeichert.'))
      .finally(() => setReady(true))
  }, [])

  const games = useMemo(() => allGames.filter(g => g.user === user).sort((a, b) => b.createdAt - a.createdAt), [allGames, user])
  const gameMap = useMemo(() => new Map(games.map(g => [g.id, g])), [games])
  const report = useMemo(() => buildReport(games, analyses, filter), [games, analyses, filter])
  const filteredIds = useMemo(() => new Set(report.games.map(g => g.id)), [report])
  const userPuzzles = [...puzzles.values()].filter(p => p.solution && filteredIds.has(p.gameId))

  // The engine pool outlives renders, so it reads the latest state through this ref.
  const live = useRef({ games, analyses, puzzles, depth, failed })
  const claimed = useRef(new Set<string>())
  const pool = useRef<{ stop?: () => void }>({})

  const findWork = (): { id: string; job: Job } | undefined => {
    const { games, analyses, puzzles, depth, failed } = live.current
    const free = (id: string) => !claimed.current.has(id) && !failed.has(id)
    const game = games.find(g => !analyses.has(g.id) && free(g.id))
    if (game) {
      return {
        id: game.id,
        job: async engine => {
          const a = await analyseGame(engine, game, depth)
          await putMany('analyses', [a])
          setAnalyses(m => new Map(m).set(a.id, a))
        },
      }
    }
    for (const g of games) {
      const a = analyses.get(g.id)
      if (!a) continue
      for (const m of annotateGame(g, a)) {
        const id = `${g.id}-${m.ply}`
        if (m.loss < 10 || !m.best || puzzles.has(id) || !free(id)) continue
        return {
          id,
          job: async engine => {
            const solution = (await checkUnique(engine, m.fenBefore, Math.max(depth + 2, 14))) ?? null
            const p: PuzzleRecord = { id, gameId: g.id, ply: m.ply, fen: m.fenBefore, solution, tags: m.tags, attempts: 0, solved: 0 }
            await putMany('puzzles', [p])
            setPuzzles(map => new Map(map).set(id, p))
          },
        }
      }
    }
  }

  const pending = games.filter(g => !analyses.has(g.id) && !failed.has(g.id)).length
  const puzzlePending = useMemo(
    () =>
      games.reduce((n, g) => {
        const a = analyses.get(g.id)
        if (!a) return n
        return n + annotateGame(g, a).filter(m => m.loss >= 10 && m.best && !puzzles.has(`${g.id}-${m.ply}`) && !failed.has(`${g.id}-${m.ply}`)).length
      }, 0),
    [games, analyses, puzzles, failed],
  )

  useEffect(() => {
    live.current = { games, analyses, puzzles, depth, failed }
    const p = pool.current
    if (!ready || paused || p.stop || !findWork()) return
    claimed.current = new Set()
    p.stop = startPool(
      () => {
        const work = findWork()
        if (!work) return
        claimed.current.add(work.id)
        return engine =>
          work.job(engine).catch(e => {
            setFailed(f => new Set(f).add(work.id))
            throw e
          })
      },
      () => (p.stop = undefined),
    )
  }, [ready, paused, games, analyses, puzzles, depth, failed])

  useEffect(() => {
    const p = pool.current
    return () => {
      p.stop?.()
      p.stop = undefined
    }
  }, [])

  const pause = () => {
    pool.current.stop?.()
    pool.current.stop = undefined
    setPaused(true)
  }

  const load = async (older: boolean) => {
    const name = input.trim()
    if (!/^[\w-]{2,30}$/.test(name)) {
      setError('Gib einen gültigen Lichess-Benutzernamen ein.')
      return
    }
    const lower = name.toLowerCase()
    const own = allGames.filter(g => g.user === lower)
    const newest = Math.max(0, ...own.map(g => g.createdAt))
    const oldest = Math.min(...own.map(g => g.createdAt))
    setUser(lower)
    store('username', name)
    setError('')
    setNotice('')
    setLoading(0)
    abort.current = new AbortController()
    let batch: GameRecord[] = []
    let total = 0
    const flush = async () => {
      const b = batch
      batch = []
      await putMany('games', b).catch(() => undefined)
      setAllGames(gs => [...gs.filter(g => !b.some(x => x.id === g.id)), ...b])
    }
    try {
      await fetchGames(
        {
          username: name,
          max: count,
          speeds,
          since: !older && own.length ? newest + 1 : undefined,
          until: older && own.length ? oldest - 1 : undefined,
          signal: abort.current.signal,
        },
        game => {
          batch.push(game)
          setLoading(++total)
          if (batch.length >= 10) void flush()
        },
      )
      await flush()
      setNotice(total ? `${total} Partien geladen.` : 'Keine neuen Partien gefunden.')
    } catch (e) {
      await flush()
      if ((e as Error).name !== 'AbortError') setError((e as Error).message || 'Lichess ist nicht erreichbar. Prüfe deine Verbindung.')
    } finally {
      setLoading(undefined)
      abort.current = null
    }
  }

  const download = async () => {
    const data = await exportAll()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `chess-coach-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const upload = async (file: File) => {
    try {
      const n = await importAll(JSON.parse(await file.text()))
      const [g, a, p] = await Promise.all([getAll('games'), getAll('analyses'), getAll('puzzles')])
      setAllGames(g)
      setAnalyses(new Map(a.map(x => [x.id, x])))
      setPuzzles(new Map(p.map(x => [x.id, x])))
      setNotice(`${n} Partien importiert.`)
      setError('')
    } catch (e) {
      setError(e instanceof SyntaxError ? 'Die Datei ist kein gültiges JSON.' : (e as Error).message)
    }
  }

  const removeUserData = async () => {
    if (!confirm(`Alle Partien, Analysen und Aufgaben von ${user} löschen? Exportiere vorher deine Daten, wenn du sie behalten willst.`)) return
    pause()
    const ids = games.map(g => g.id)
    const puzzleIds = [...puzzles.values()].filter(p => gameMap.has(p.gameId)).map(p => p.id)
    await Promise.all([deleteMany('games', ids), deleteMany('analyses', ids), deleteMany('puzzles', puzzleIds)])
    setAllGames(gs => gs.filter(g => g.user !== user))
    setAnalyses(m => new Map([...m].filter(([id]) => !gameMap.has(id))))
    setPuzzles(m => new Map([...m].filter(([, p]) => !gameMap.has(p.gameId))))
    setNotice('Daten gelöscht.')
  }

  const resetPuzzles = async () => {
    if (!confirm('Fortschritt aller Aufgaben zurücksetzen?')) return
    const reset = [...puzzles.values()].map(p => ({ ...p, attempts: 0, solved: 0, lastResult: undefined }))
    await putMany('puzzles', reset)
    setPuzzles(new Map(reset.map(p => [p.id, p])))
  }

  const updatePuzzle = (p: PuzzleRecord) => {
    void putMany('puzzles', [p])
    setPuzzles(m => new Map(m).set(p.id, p))
  }

  const showGame = (gameId: string, ply: number) => {
    setOpenGame({ gameId, ply })
    setTab('games')
    scrollTo({ top: 0 })
  }

  const presentSpeeds = [...new Set(games.map(g => g.speed))]

  return (
    <>
      <header className="app-header">
        <h1>Chess Coach</h1>
        <form
          className="load-form"
          onSubmit={e => {
            e.preventDefault()
            void load(false)
          }}
        >
          <label>
            Lichess-Name
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Dein Lichess-Name" autoComplete="username" required />
          </label>
          <label>
            Anzahl
            <select value={count} onChange={e => (setCount(Number(e.target.value)), store('count', e.target.value))}>
              {[25, 50, 100, 200, 500].map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Tempo</legend>
            {SPEEDS.map(s => (
              <label key={s} className="check">
                <input
                  type="checkbox"
                  checked={speeds.includes(s)}
                  onChange={e => {
                    const next = e.target.checked ? [...speeds, s] : speeds.filter(x => x !== s)
                    setSpeeds(next)
                    store('speeds', JSON.stringify(next))
                  }}
                />
                {SPEED_LABEL[s]}
              </label>
            ))}
          </fieldset>
          <div className="row">
            {loading === undefined ? (
              <>
                <button type="submit">{games.length && input.trim().toLowerCase() === user ? 'Neue Partien laden' : 'Partien laden'}</button>
                {games.length > 0 && input.trim().toLowerCase() === user && (
                  <button type="button" className="ghost" onClick={() => void load(true)}>
                    Ältere Partien laden
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="ghost" onClick={() => abort.current?.abort()}>
                Abbrechen ({loading} geladen)
              </button>
            )}
          </div>
        </form>
      </header>

      <main>
        <div aria-live="polite">
          {error && <p className="alert error">{error}</p>}
          {notice && <p className="alert">{notice}</p>}
        </div>

        {!games.length ? (
          ready && (
            <section className="intro">
              <h2>So funktioniert es</h2>
              <ol>
                <li>Gib deinen Lichess-Namen ein und lade deine letzten Partien.</li>
                <li>Stockfish analysiert jede Partie direkt in deinem Browser. Partien mit Lichess-Analyse sind sofort fertig.</li>
                <li>Du siehst deine häufigsten Fehler, deine Stärken und einen konkreten Trainingsplan.</li>
                <li>Aus deinen Fehlern entstehen Aufgaben zum Üben.</li>
              </ol>
              <p className="muted">Alles bleibt in deinem Browser. Es gibt keinen Server und kein Konto.</p>
            </section>
          )
        ) : (
          <>
            <section className="status" aria-label="Analysestatus">
              <div>
                <progress max={games.length} value={games.length - pending} aria-label="Analysierte Partien" />
                <span>
                  {games.length - pending} von {games.length} Partien analysiert
                  {pending === 0 && puzzlePending > 0 && `, ${puzzlePending} Stellungen für Aufgaben in Prüfung`}
                  {failed.size > 0 && ` · ${failed.size} fehlgeschlagen`}
                </span>
              </div>
              {(pending > 0 || puzzlePending > 0) &&
                (paused ? (
                  <button onClick={() => setPaused(false)}>Analyse fortsetzen</button>
                ) : (
                  <button className="ghost" onClick={pause}>
                    Analyse pausieren
                  </button>
                ))}
            </section>

            <section className="filters" aria-label="Filter">
              <div role="radiogroup" aria-label="Partien" className="segmented">
                {(
                  [
                    ['all', 'Alle Partien'],
                    ['loss', 'Nur Niederlagen'],
                  ] as const
                ).map(([v, label]) => (
                  <label key={v}>
                    <input type="radio" name="result" checked={filter.result === v} onChange={() => setFilter({ ...filter, result: v })} />
                    {label}
                  </label>
                ))}
              </div>
              <label>
                Tempo{' '}
                <select value={filter.speed} onChange={e => setFilter({ ...filter, speed: e.target.value })}>
                  <option value="">Alle</option>
                  {presentSpeeds.map(s => (
                    <option key={s} value={s}>
                      {SPEED_LABEL[s] ?? s}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <nav className="tabs" role="tablist" aria-label="Bereiche">
              {TABS.map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                  {label}
                  {id === 'puzzles' && userPuzzles.length > 0 && ` (${userPuzzles.length})`}
                </button>
              ))}
            </nav>

            <div role="tabpanel">
              {tab === 'overview' && (
                <Overview
                  report={report}
                  onShowMistakes={t => (setMistakeTag(t ?? ''), setTab('mistakes'))}
                  onPractice={t => (setPuzzleTag(t ?? ''), setTab('puzzles'))}
                />
              )}
              {tab === 'mistakes' && <Mistakes mistakes={report.mistakes} games={gameMap} analyses={analyses} tag={mistakeTag} onTag={setMistakeTag} />}
              {tab === 'puzzles' && (
                <Puzzles
                  puzzles={userPuzzles}
                  pending={puzzlePending}
                  games={gameMap}
                  tag={puzzleTag}
                  onTag={setPuzzleTag}
                  onUpdate={updatePuzzle}
                  onOpenGame={showGame}
                />
              )}
              {tab === 'games' && <Games games={report.games} analyses={analyses} open={openGame} onOpen={setOpenGame} />}
            </div>
          </>
        )}

        {(tab === 'data' || !games.length) && ready && (
          <section className="stack data">
            <h2>Daten und Einstellungen</h2>
            <label>
              Analysetiefe für neue Partien{' '}
              <select value={depth} onChange={e => (setDepth(Number(e.target.value)), store('depth', e.target.value))}>
                {DEPTHS.map(([d, label]) => (
                  <option key={d} value={d}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">Gespeichert werden Partien, Analysen und dein Aufgaben-Fortschritt, nur in diesem Browser.</p>
            <div className="actions">
              <button onClick={() => void download()}>Daten exportieren</button>
              <label className="button ghost">
                Daten importieren
                <input
                  type="file"
                  accept="application/json,.json"
                  className="visually-hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) void upload(f)
                    e.target.value = ''
                  }}
                />
              </label>
              {games.length > 0 && (
                <>
                  <button className="ghost" onClick={() => void resetPuzzles()}>
                    Aufgaben-Fortschritt zurücksetzen
                  </button>
                  <button className="danger" onClick={() => void removeUserData()}>
                    Daten von {user} löschen
                  </button>
                </>
              )}
            </div>
          </section>
        )}
      </main>
      <footer className="muted small">
        Partien von <a href="https://lichess.org/api">Lichess</a>, Analyse mit Stockfish 19 (lite) im Browser.
      </footer>
    </>
  )
}
