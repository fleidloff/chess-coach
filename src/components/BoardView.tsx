import { useEffect, useMemo } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Pause, Play, Undo2 } from 'lucide-react'
import type { Branch, FeedbackNode, GameEvals, GameReport, ParsedGame, Score } from '../types/chess.ts'
import { playMove } from '../engine/heuristics.ts'
import { winChance } from '../engine/patternAggregator.ts'
import { formatScore, moveNotation, resultFor } from '../engine/templateEngine.ts'

export interface BoardState {
  /** Number of game moves played on the board. */
  ply: number
  node?: FeedbackNode
  branch?: { branch: Branch; index: number; playing: boolean }
}

interface Props {
  game?: ParsedGame
  report?: GameReport
  evals?: GameEvals
  state: BoardState
  onChange: (state: BoardState) => void
}

const LAST_MOVE = { backgroundColor: 'rgba(250, 204, 21, 0.35)' }
const HIGHLIGHT = { boxShadow: 'inset 0 0 0 4px rgba(234, 88, 12, 0.85)' }
const ARROW_LINE = 'rgba(37, 99, 235, 0.8)'
const START = new Chess().fen()

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function fensOf(start: string, moves: string[]): string[] {
  const chess = new Chess(start)
  const fens = [start]
  for (const m of moves) {
    try {
      chess.move(m)
    } catch {
      break
    }
    fens.push(chess.fen())
  }
  return fens
}

/** Vertical bar: White's win chance, with White's side at the bottom of the board. */
function EvalBar({ score, whiteAtBottom }: { score?: Score; whiteAtBottom: boolean }) {
  const white = score ? winChance(score) : 50
  const whiteLeads = white >= 50
  return (
    <div
      role="img"
      aria-label={score ? `Evaluation ${formatScore(score)}` : 'No evaluation for this position'}
      className={`relative flex w-5 shrink-0 overflow-hidden rounded-sm bg-stone-800 dark:bg-stone-700 ${whiteAtBottom ? 'flex-col-reverse' : 'flex-col'} ${score ? '' : 'opacity-40'}`}
    >
      <div
        className="bg-stone-100 transition-[height] duration-300 motion-reduce:transition-none dark:bg-stone-200"
        style={{ height: `${white}%` }}
      />
      {score && (
        <span
          aria-hidden
          className={`absolute inset-x-0 text-center text-[9px] leading-5 font-semibold ${whiteLeads === whiteAtBottom ? 'bottom-0' : 'top-0'} ${whiteLeads ? 'text-stone-900 dark:text-stone-900' : 'text-stone-100 dark:text-stone-100'}`}
        >
          {formatScore(score).replace('+', '')}
        </span>
      )}
    </div>
  )
}

const btn =
  'inline-flex items-center justify-center rounded-md border border-stone-300 p-2 hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:border-stone-700 dark:hover:bg-stone-800'

export function BoardView({ game, report, evals, state, onChange }: Props) {
  const moves = useMemo(() => game?.moves ?? [], [game])
  const fens = useMemo(() => fensOf(START, moves), [moves])
  const { ply, node, branch } = state
  const branchFens = useMemo(() => (branch && node ? fensOf(node.fen, branch.branch.moves) : []), [branch, node])
  const branchEnd = branchFens.length - 1
  const n = fens.length - 1

  const marks = useMemo(() => {
    const m = new Map<number, 'bad' | 'good'>()
    report?.topErrors.forEach(e => m.set(e.ply, 'bad'))
    report?.goodMoves.forEach(g => m.set(g.ply, 'good'))
    return m
  }, [report])

  const go = (to: number) => {
    if (branch) onChange({ ...state, branch: { ...branch, index: Math.max(0, Math.min(branchEnd, to)), playing: false } })
    else onChange({ ply: Math.max(0, Math.min(n, to)), node: node && to === node.ply ? node : undefined })
  }
  const index = branch ? branch.index : ply
  const end = branch ? branchEnd : n

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea')) return
      const to = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: end }[e.key]
      if (to === undefined) return
      e.preventDefault()
      go(to)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!branch?.playing) return
    if (branch.index >= branchEnd) {
      onChange({ ...state, branch: { ...branch, playing: false } })
      return
    }
    const t = setTimeout(() => onChange({ ...state, branch: { ...branch, index: branch.index + 1 } }), 900)
    return () => clearTimeout(t)
  })

  let fen: string
  let arrows: { startSquare: string; endSquare: string; color: string }[] = []
  const squareStyles: Record<string, React.CSSProperties> = {}
  let legend = ''
  let caption: string
  if (branch && node) {
    fen = branchFens[branch.index]
    const last = branch.index > 0 ? playMove(branchFens[branch.index - 1], branch.branch.moves[branch.index - 1]) : undefined
    if (last) arrows = [{ startSquare: last.move.from, endSquare: last.move.to, color: ARROW_LINE }]
    if (!last) arrows = node.arrows.map(a => ({ startSquare: a.from, endSquare: a.to, color: a.color }))
    const shown = branch.branch.moves.slice(0, branch.index)
    caption = `${branch.branch.label}: ${shown.length ? shown.join(' ') : 'start'} (${branch.index}/${branchEnd})`
  } else {
    fen = fens[ply]
    if (node && node.ply === ply) {
      arrows = node.arrows.map(a => ({ startSquare: a.from, endSquare: a.to, color: a.color }))
      node.highlightSquares.forEach(sq => (squareStyles[sq] = HIGHLIGHT))
      caption = `Before ${node.moveNotation}.`
      legend = 'Red: your move. Green: best move.'
    } else if (ply > 0) {
      const last = playMove(fens[ply - 1], moves[ply - 1])
      if (last) squareStyles[last.move.from] = squareStyles[last.move.to] = LAST_MOVE
      caption = `After ${moveNotation(ply - 1, moves[ply - 1])}`
    } else {
      caption = 'Start position'
    }
  }

  const orientation = game?.userColor ?? 'white'
  const player = (color: 'white' | 'black', className = '') => {
    if (!game) return null
    const name = color === 'white' ? game.whitePlayer : game.blackPlayer
    const rating = color === 'white' ? game.whiteRating : game.blackRating
    return (
      <div className={`flex items-center justify-between gap-2 text-sm ${className}`}>
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={`size-3 shrink-0 rounded-full border border-stone-400 ${color === 'white' ? 'bg-white' : 'bg-stone-900'}`}
          />
          <span className="truncate font-medium">{name}</span>
          {rating && <span className="text-stone-500 dark:text-stone-400">({rating})</span>}
          {color === game.userColor && <span className="text-xs text-stone-500 dark:text-stone-400">you</span>}
        </span>
      </div>
    )
  }

  return (
    <section
      aria-label="Board"
      className="mx-auto flex w-full max-w-[min(100%,calc(100dvh-15rem))] min-w-[260px] flex-col gap-2 max-md:contents max-md:*:px-4"
    >
      {game && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span>
            <strong>{resultFor(game)}</strong> <span className="text-stone-500 dark:text-stone-400">{game.result}</span>
            {game.opening && <span className="text-stone-500 dark:text-stone-400"> · {game.opening}</span>}
          </span>
          <a
            href={game.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sky-700 hover:underline dark:text-sky-400"
          >
            Open on {game.platform === 'lichess' ? 'Lichess' : 'Chess.com'} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      )}
      {player(orientation === 'white' ? 'black' : 'white')}
      {/* Sticky on phones. `max-md:contents` on this section and its wrapper in App lets it span the cards below. */}
      <div className="flex flex-col gap-2 max-md:sticky max-md:top-0 max-md:z-10 max-md:border-b max-md:border-stone-200 max-md:bg-stone-50 max-md:py-2 max-md:shadow-sm dark:max-md:border-stone-800 dark:max-md:bg-stone-950">
        <div className="mx-auto flex w-full gap-1.5 max-md:max-w-[min(100%,40svh)]">
          {game && <EvalBar score={branch ? undefined : evals?.positions[ply]?.score} whiteAtBottom={orientation === 'white'} />}
          <div className="min-w-0 flex-1">
            <Chessboard
              options={{
                id: 'coach-board',
                position: fen,
                boardOrientation: orientation,
                arrows,
                squareStyles,
                allowDragging: false,
                allowDrawingArrows: false,
                showAnimations: !reducedMotion(),
              }}
            />
          </div>
        </div>
        {player(orientation, 'max-md:hidden')}

        <p className="min-h-5 text-center text-sm text-stone-600 max-md:text-xs dark:text-stone-400" aria-live="polite">
          {caption}
          {legend && <span className="max-md:hidden"> {legend}</span>}
        </p>

        <div className="flex items-center justify-center gap-1.5" role="group" aria-label={branch ? 'Step through the line' : 'Step through the game'}>
          <button className={btn} onClick={() => go(0)} disabled={index === 0} aria-label="First position">
            <ChevronsLeft className="size-4" aria-hidden />
          </button>
          <button className={btn} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous move">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button className={btn} onClick={() => go(index + 1)} disabled={index === end} aria-label="Next move">
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <button className={btn} onClick={() => go(end)} disabled={index === end} aria-label="Last position">
            <ChevronsRight className="size-4" aria-hidden />
          </button>
          {branch && (
            <>
              <button
                className={btn}
                onClick={() =>
                  onChange({
                    ...state,
                    branch: { ...branch, index: branch.index >= branchEnd ? 0 : branch.index, playing: !branch.playing },
                  })
                }
                aria-label={branch.playing ? 'Pause' : 'Play the line'}
              >
                {branch.playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              </button>
              <button className={`${btn} gap-1 text-sm`} onClick={() => onChange({ ply: node!.ply, node })}>
                <Undo2 className="size-4" aria-hidden /> Back to game
              </button>
            </>
          )}
        </div>

        {node && !branch && node.ply === ply && node.branches.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {node.branches.map(b => (
              <button
                key={b.label}
                className={`${btn} gap-1.5 px-3 text-sm`}
                onClick={() => onChange({ ...state, branch: { branch: b, index: 0, playing: true } })}
              >
                <Play className="size-3.5" aria-hidden /> {b.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {moves.length > 0 && (
        <ol aria-label="Moves" className="flex max-h-40 flex-wrap gap-x-1 gap-y-0.5 overflow-y-auto text-sm md:max-h-none">
          {moves.map((m, i) => {
            const mark = marks.get(i)
            const current = !branch && ply === i + 1
            return (
              <li key={i}>
                <button
                  onClick={() => onChange({ ply: i + 1 })}
                  aria-current={current ? 'true' : undefined}
                  className={`rounded px-1 py-0.5 hover:bg-stone-200 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:hover:bg-stone-800 ${
                    current ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : ''
                  } ${mark === 'bad' ? 'font-semibold text-red-700 dark:text-red-400' : mark === 'good' ? 'font-semibold text-green-700 dark:text-green-400' : ''}`}
                >
                  {i % 2 === 0 && <span className="text-stone-500">{i / 2 + 1}. </span>}
                  {m}
                  {mark === 'bad' ? '??' : mark === 'good' ? '!' : ''}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
