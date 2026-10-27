import { useMemo, useRef, useState } from 'react'
import { Crown } from 'lucide-react'
import type { GameEvals, ParsedGame, Platform } from './types/chess.ts'
import { analyseGame, EnginePool } from './engine/stockfishWorker.ts'
import { aggregate, DEEP_DEPTH, QUICK_DEPTH } from './engine/patternAggregator.ts'
import { fetchLichessGames } from './services/lichessApi.ts'
import { fetchChessComGames } from './services/chessComApi.ts'
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

export default function App() {
  const [settings] = useState(loadSettings)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string>()
  const [games, setGames] = useState<ParsedGame[]>([])
  const [evals, setEvals] = useState(new Map<string, GameEvals>())
  const [selectedId, setSelectedId] = useState<string>()
  const [deepIds, setDeepIds] = useState(new Set<string>())
  const [board, setBoard] = useState<BoardState>({ ply: 0 })
  const pool = useRef<EnginePool>(undefined)
  const abort = useRef<AbortController>(undefined)

  const batch = useMemo(() => aggregate(games, evals), [games, evals])
  const game = games.find(g => g.id === selectedId)
  const report = selectedId ? batch.reports.get(selectedId) : undefined
  const deepening = Boolean(selectedId && deepIds.has(selectedId) && (evals.get(selectedId)?.depth ?? 0) < DEEP_DEPTH)

  function run(p: EnginePool, g: ParsedGame, deep: boolean) {
    analyseGame(p, g, deep ? DEEP_DEPTH : QUICK_DEPTH, deep ? 2 : 1, deep ? 0 : 1).then(
      result =>
        setEvals(prev => {
          if ((prev.get(g.id)?.depth ?? 0) >= result.depth) return prev
          return new Map(prev).set(g.id, result)
        }),
      (e: Error) => {
        if (pool.current === p && e.message !== 'Analysis stopped.') setError(e.message)
      },
    )
  }

  function stop() {
    abort.current?.abort()
    pool.current?.stop()
    pool.current = undefined
    setStatus(s => (s === 'idle' ? s : 'done'))
  }

  async function analyze(username: string, platform: Platform) {
    stop()
    saveSettings(username, platform)
    const controller = new AbortController()
    abort.current = controller
    setError(undefined)
    setGames([])
    setEvals(new Map())
    setDeepIds(new Set())
    setSelectedId(undefined)
    setBoard({ ply: 0 })
    setStatus('fetching')
    let fetched: ParsedGame[]
    try {
      fetched = await (platform === 'lichess' ? fetchLichessGames : fetchChessComGames)(username, GAME_COUNT, controller.signal)
    } catch (e) {
      if (controller.signal.aborted) return
      setError((e as Error).message)
      setStatus('idle')
      return
    }
    if (!fetched.length) {
      setError(`No finished standard games found for "${username}".`)
      setStatus('idle')
      return
    }
    const p = new EnginePool()
    pool.current = p
    setGames(fetched)
    setSelectedId(fetched[0].id)
    setDeepIds(new Set([fetched[0].id]))
    setBoard({ ply: fetched[0].moves.length })
    setStatus('analysing')
    fetched.forEach((g, i) => run(p, g, i === 0))
  }

  function select(id: string) {
    const g = games.find(x => x.id === id)!
    setSelectedId(id)
    setBoard({ ply: g.moves.length })
    if (pool.current && !deepIds.has(id)) {
      setDeepIds(new Set(deepIds).add(id))
      run(pool.current, g, true)
    }
  }

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
        </div>
        {status === 'fetching' && <p className="text-sm text-stone-600 dark:text-stone-400">Loading games…</p>}
        {status === 'analysing' && scanned < games.length && (
          <div className="flex items-center gap-3 text-sm">
            <span className="shrink-0 text-stone-600 dark:text-stone-400">
              Analyzing game {Math.min(scanned + 1, games.length)}/{games.length}…
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
              <p>No account, no server. Your games stay on your device.</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
