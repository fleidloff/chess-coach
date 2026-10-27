import { useEffect, useMemo, useRef, useState } from 'react'
import { Crown, Trash2 } from 'lucide-react'
import type { GameEvals, ParsedGame, Platform } from './types/chess.ts'
import { analyseGame, EnginePool } from './engine/stockfishWorker.ts'
import { aggregate, DEEP_DEPTH, QUICK_DEPTH } from './engine/patternAggregator.ts'
import { fetchLichessGames } from './services/lichessApi.ts'
import { fetchChessComGames } from './services/chessComApi.ts'
import { deleteAll, evictOld, loadEvals, loadGames, saveEvals, saveGames } from './services/analysisStore.ts'
import { ownerKey } from './services/storeRecords.ts'
import { type BoardState, BoardView } from './components/BoardView.tsx'
import { FeedbackPanel } from './components/FeedbackPanel.tsx'
import { GameSelector } from './components/GameSelector.tsx'
import { UsernameInput } from './components/UsernameInput.tsx'

const GAME_COUNT = 10
const STORAGE_KEY = 'chess-coach:v1'

function loadSettings(): { username: string; platform: Platform } {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { username?: unknown; platform?: unknown }
    return {
      username: typeof s.username === 'string' ? s.username : '',
      platform: s.platform === 'chesscom' ? 'chesscom' : 'lichess',
    }
  } catch {
    return { username: '', platform: 'lichess' }
  }
}

function saveSettings(username: string, platform: Platform) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, platform }))
  } catch {
    // Storage is blocked (private mode): the app works without it.
  }
}

type Status = 'idle' | 'fetching' | 'analysing' | 'done'

interface Session {
  pool: EnginePool
  platform: Platform
  owner: string
}

const STORAGE_FAILED = 'This browser does not keep the analysis. It runs again on the next visit.'

const sameGames = (a: ParsedGame[], b: ParsedGame[]) => a.length === b.length && a.every((g, i) => g.id === b[i].id)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function App() {
  const [settings] = useState(loadSettings)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string>()
  const [games, setGames] = useState<ParsedGame[]>([])
  const [evals, setEvals] = useState(new Map<string, GameEvals>())
  const [selectedId, setSelectedId] = useState<string>()
  const [deepIds, setDeepIds] = useState(new Set<string>())
  const [board, setBoard] = useState<BoardState>({ ply: 0 })
  const [storedAt, setStoredAt] = useState<number>()
  const [fromStorage, setFromStorage] = useState(0)
  const [notice, setNotice] = useState<string>()
  const session = useRef<Session>(undefined)
  const abort = useRef<AbortController>(undefined)

  const batch = useMemo(() => aggregate(games, evals), [games, evals])
  const game = games.find(g => g.id === selectedId)
  const report = selectedId ? batch.reports.get(selectedId) : undefined
  const deepening = Boolean(selectedId && deepIds.has(selectedId) && (evals.get(selectedId)?.depth ?? 0) < DEEP_DEPTH)

  function run(current: Session, g: ParsedGame, deep: boolean) {
    analyseGame(current.pool, g, deep ? DEEP_DEPTH : QUICK_DEPTH, deep ? 2 : 1, deep ? 0 : 1).then(
      result => {
        setEvals(prev => {
          if ((prev.get(g.id)?.depth ?? 0) >= result.depth) return prev
          return new Map(prev).set(g.id, result)
        })
        saveEvals(current.platform, current.owner, g, result).catch(() => setNotice(STORAGE_FAILED))
      },
      (e: Error) => {
        if (session.current === current && e.message !== 'Analysis stopped.') setError(e.message)
      },
    )
  }

  function stop() {
    abort.current?.abort()
    session.current?.pool.stop()
    session.current = undefined
    setStatus(s => (s === 'idle' ? s : 'done'))
  }

  function show(list: ParsedGame[], cached: Map<string, GameEvals>) {
    setGames(list)
    setEvals(cached)
    setDeepIds(new Set())
    setSelectedId(list[0]?.id)
    setBoard({ ply: list[0]?.moves.length ?? 0 })
  }

  /** Shows the stored report at once, then fetches the latest games and analyses what storage does not have. */
  async function analyze(username: string, platform: Platform) {
    stop()
    const controller = new AbortController()
    abort.current = controller
    const owner = ownerKey(platform, username)
    const stored = await loadGames(owner).catch(() => undefined)
    if (controller.signal.aborted) return
    saveSettings(username, platform)
    setError(undefined)
    setFromStorage(0)
    show([], new Map())
    if (stored) {
      const cached = await loadEvals(platform, stored.games).catch(() => new Map<string, GameEvals>())
      if (controller.signal.aborted) return
      show(stored.games, cached)
    }
    setStoredAt(stored?.fetchedAt)
    setStatus('fetching')

    let fetched: ParsedGame[]
    try {
      fetched = await (platform === 'lichess' ? fetchLichessGames : fetchChessComGames)(username, GAME_COUNT, controller.signal)
    } catch (e) {
      if (controller.signal.aborted) return
      setError((e as Error).message)
      setStatus(stored ? 'done' : 'idle')
      return
    }
    if (!fetched.length) {
      setError(`No finished standard games found for "${username}".`)
      setStatus(stored ? 'done' : 'idle')
      return
    }
    const cached = await loadEvals(platform, fetched).catch(() => new Map<string, GameEvals>())
    if (controller.signal.aborted) return
    const current: Session = { pool: new EnginePool(), platform, owner }
    session.current = current
    if (stored && sameGames(stored.games, fetched)) setGames(fetched)
    else show(fetched, cached)
    setStoredAt(undefined)
    setFromStorage(fetched.filter(g => cached.has(g.id)).length)
    setDeepIds(new Set([fetched[0].id]))
    setStatus('analysing')
    saveGames(owner, fetched)
      .then(() => evictOld(owner))
      .catch(() => setNotice(STORAGE_FAILED))
    fetched.forEach((g, i) => {
      if ((cached.get(g.id)?.depth ?? 0) < (i === 0 ? DEEP_DEPTH : QUICK_DEPTH)) run(current, g, i === 0)
    })
  }

  function select(id: string) {
    const g = games.find(x => x.id === id)!
    setSelectedId(id)
    setBoard({ ply: g.moves.length })
    if (session.current && !deepIds.has(id) && (evals.get(id)?.depth ?? 0) < DEEP_DEPTH) {
      setDeepIds(new Set(deepIds).add(id))
      run(session.current, g, true)
    }
  }

  async function deleteStoredData() {
    if (!confirm('Delete all stored games, analyses and your username from this browser?')) return
    stop()
    show([], new Map())
    setStatus('idle')
    setStoredAt(undefined)
    setError(undefined)
    try {
      localStorage.removeItem(STORAGE_KEY)
      await deleteAll()
      setNotice('Stored data deleted.')
    } catch (e) {
      setNotice((e as Error).message)
    }
  }

  useEffect(() => {
    const { username, platform } = settings
    if (!username) return
    loadGames(ownerKey(platform, username))
      .then(stored => stored && analyze(username, platform))
      .catch(() => undefined)
  }, [settings])

  const scanned = batch.analysedGames
  const running = status === 'fetching' || (status === 'analysing' && (scanned < games.length || deepening))

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:overflow-hidden">
      <header className="flex flex-col gap-2 border-b border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Crown className="size-5 text-amber-500" aria-hidden /> Chess Coach
          </h1>
          <UsernameInput
            initialUsername={settings.username}
            initialPlatform={settings.platform}
            running={running}
            onAnalyze={(u, p) => void analyze(u, p)}
            onStop={stop}
          />
          {games.length > 0 && selectedId && (
            <div className="min-w-0 flex-1 basis-64">
              <GameSelector games={games} evals={evals} selectedId={selectedId} onSelect={select} />
            </div>
          )}
          <button
            onClick={() => void deleteStoredData()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          >
            <Trash2 className="size-4" aria-hidden /> Delete stored data
          </button>
        </div>
        {(status === 'fetching' || storedAt) && (
          <p className="text-sm text-stone-600 dark:text-stone-400" aria-live="polite">
            {storedAt && `Stored ${new Date(storedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. `}
            {status === 'fetching' && (storedAt ? 'Checking for new games…' : 'Loading games…')}
          </p>
        )}
        {status === 'analysing' && scanned < games.length && (
          <div className="flex items-center gap-3 text-sm">
            <span className="shrink-0 text-stone-600 dark:text-stone-400">
              {fromStorage
                ? `Analyzing ${plural(games.length - fromStorage, 'new game')}, ${fromStorage} from storage…`
                : `Analyzing game ${Math.min(scanned + 1, games.length)}/${games.length}…`}
            </span>
            <div
              role="progressbar"
              aria-label="Games analyzed"
              aria-valuemin={0}
              aria-valuemax={games.length}
              aria-valuenow={scanned}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
            >
              <div className="h-full bg-sky-500 transition-[width] motion-reduce:transition-none" style={{ width: `${(scanned / games.length) * 100}%` }} />
            </div>
          </div>
        )}
        {notice && (
          <p className="flex items-center justify-between gap-2 text-xs text-stone-500 dark:text-stone-400" aria-live="polite">
            {notice}
            <button onClick={() => setNotice(undefined)} className="underline hover:text-stone-800 dark:hover:text-stone-200">
              Dismiss
            </button>
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
      </header>

      <main className="flex flex-1 flex-col md:grid md:min-h-0 md:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
        <div className="p-4 md:overflow-y-auto">
          <BoardView game={game} report={report} state={board} onChange={setBoard} />
        </div>
        <aside
          aria-label="Analysis"
          className="border-t border-stone-200 p-4 md:overflow-y-auto md:border-t-0 md:border-l dark:border-stone-800"
        >
          {games.length ? (
            <FeedbackPanel
              report={report}
              tagFrequencies={batch.tagFrequencies}
              analysedGames={scanned}
              totalGames={games.length}
              deepening={deepening}
              selected={board.node}
              onSelect={node => setBoard({ ply: node.ply, node })}
            />
          ) : (
            <div className="flex flex-col gap-3 text-sm text-stone-600 dark:text-stone-400">
              <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Find your recurring mistakes</h2>
              <p>Enter your Lichess or Chess.com username. The coach loads your last 10 games and runs Stockfish in this browser tab.</p>
              <p>It shows the biggest errors and the best moves of your latest game, and the patterns that repeat across all 10 games.</p>
              <p>No account, no server. Your games and analyses stay in this browser. A return visit shows them at once.</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
