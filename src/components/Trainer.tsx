import { useEffect, useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess, type Move, type Square } from 'chess.js'
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Eye, Loader2, MoveRight, Pause, Play, RotateCcw, Undo2, XCircle } from 'lucide-react'
import type { TacticalTag } from '../types/chess.ts'
import { EnginePool } from '../engine/stockfishWorker.ts'
import { playMove } from '../engine/heuristics.ts'
import { judge, TRAIN_DEPTH, type TrainingPosition } from '../engine/trainer.ts'
import { formatCp, TAG_LABEL } from '../engine/templateEngine.ts'
import { loadAttempts, saveAttempt } from '../services/analysisStore.ts'
import { attemptKey, type StoredAttempt } from '../services/storeRecords.ts'

interface Props {
  tag: TacticalTag
  positions: TrainingPosition[]
  onExit: () => void
}

const ARROW_BEST = 'rgba(22, 163, 74, 0.85)'
const ARROW_LINE = 'rgba(37, 99, 235, 0.8)'
const SELECTED = { backgroundColor: 'rgba(250, 204, 21, 0.5)' }
const LAST_MOVE = { backgroundColor: 'rgba(155, 199, 0, 0.41)' }
const CURSOR = { boxShadow: 'inset 0 0 0 4px rgba(14, 165, 233, 0.9)' }
const TARGET = { backgroundImage: 'radial-gradient(circle closest-side, rgba(0, 0, 0, 0.3) 32%, transparent 34%)' }
const CAPTURE = { backgroundImage: 'radial-gradient(circle closest-side, transparent 78%, rgba(0, 0, 0, 0.3) 80%)' }

const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:border-stone-700 dark:hover:bg-stone-800'
const primary =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-stone-950'

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const keyOf = (p: TrainingPosition) => attemptKey(p.platform, p.gameId, p.ply)
const OPPONENT_DELAY = 600
const PIECE_NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

export function Trainer({ tag, positions, onExit }: Props) {
  const [index, setIndex] = useState(0)
  const [round, setRound] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  // `attempts` is what storage held when this round started; `latest` also counts this round, for the next save.
  const [attempts, setAttempts] = useState(new Map<string, StoredAttempt>())
  const latest = useRef(new Map<string, StoredAttempt>())
  const pool = useRef<EnginePool>(undefined)

  useEffect(() => {
    loadAttempts(positions.map(keyOf))
      .then(loaded => {
        latest.current = new Map(loaded)
        setAttempts(loaded)
      })
      .catch(() => undefined)
  }, [positions])

  useEffect(
    () => () => {
      pool.current?.stop()
      pool.current = undefined
    },
    [],
  )

  const record = (p: TrainingPosition, solved: boolean) => {
    setResults(r => Object.assign([...r], { [index]: solved }))
    const key = keyOf(p)
    saveAttempt(key, latest.current.get(key), solved)
      .then(saved => latest.current.set(key, saved))
      .catch(() => undefined)
  }

  if (index >= positions.length) {
    const solved = results.filter(Boolean).length
    return (
      <>
        <div className="p-4" />
        <aside aria-label="Training result" className="flex flex-col gap-4 border-t border-stone-200 p-4 md:border-t-0 md:border-l dark:border-stone-800">
          <h2 className="text-base font-semibold">Training: {TAG_LABEL[tag]}</h2>
          <p role="status" className="text-lg">
            Solved {solved} of {positions.length} on the first try.
          </p>
          <ol className="flex flex-col gap-1 text-sm">
            {positions.map((p, i) => (
              <li key={keyOf(p)} className="flex items-center gap-2">
                {results[i] ? (
                  <CheckCircle2 className="size-4 text-green-700 dark:text-green-400" aria-label="Solved" />
                ) : (
                  <XCircle className="size-4 text-red-700 dark:text-red-400" aria-label="Not solved" />
                )}
                {p.playedNotation} vs {p.opponent} · best {p.bestMoveSan}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button
              className={primary}
              onClick={() => {
                setAttempts(new Map(latest.current))
                setResults([])
                setIndex(0)
                setRound(round + 1)
              }}
            >
              <RotateCcw className="size-4" aria-hidden /> Train again
            </button>
            <button className={btn} onClick={onExit}>
              <Undo2 className="size-4" aria-hidden /> Back to the report
            </button>
          </div>
        </aside>
      </>
    )
  }

  const position = positions[index]
  return (
    <Exercise
      key={`${round}:${index}`}
      tag={tag}
      position={position}
      number={index + 1}
      total={positions.length}
      before={attempts.get(keyOf(position))}
      evaluate={fen => (pool.current ??= new EnginePool()).analyse(fen, TRAIN_DEPTH, 1, 0)}
      onFirstResult={solved => record(position, solved)}
      onNext={() => setIndex(index + 1)}
      onExit={onExit}
    />
  )
}

type Phase = 'opponent' | 'solving' | 'checking' | 'correct' | 'wrong' | 'revealed'

interface ExerciseProps {
  tag: TacticalTag
  position: TrainingPosition
  number: number
  total: number
  before?: StoredAttempt
  evaluate: (fen: string) => Promise<{ score: { cp?: number; mate?: number } }>
  onFirstResult: (solved: boolean) => void
  onNext: () => void
  onExit: () => void
}

function Exercise({ tag, position, number, total, before, evaluate, onFirstResult, onNext, onExit }: ExerciseProps) {
  const [phase, setPhase] = useState<Phase>(position.lastMove ? 'opponent' : 'solving')
  const [fen, setFen] = useState(position.lastMove && !reducedMotion() ? position.lastMove.fenBefore : position.fen)
  const [myMove, setMyMove] = useState<Move>()
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Square>()
  const [cursor, setCursor] = useState<Square>(position.userColor === 'white' ? 'e2' : 'e7')
  const [cursorNote, setCursorNote] = useState('')
  const [focused, setFocused] = useState(false)
  const [line, setLine] = useState<{ index: number; playing: boolean }>()
  const recorded = useRef(false)
  const side = position.userColor[0]

  const lineFens = useMemo(() => {
    const chess = new Chess(position.fen)
    const fens = [position.fen]
    for (const m of position.bestLine) {
      try {
        chess.move(m)
      } catch {
        break
      }
      fens.push(chess.fen())
    }
    return fens
  }, [position])

  useEffect(() => {
    if (phase !== 'opponent') return
    // With reduced motion the board already shows the move; the state change still lets the live region announce it.
    const t = setTimeout(
      () => {
        setFen(position.fen)
        setPhase('solving')
      },
      reducedMotion() ? 0 : OPPONENT_DELAY,
    )
    return () => clearTimeout(t)
  }, [phase, position.fen])

  useEffect(() => {
    if (!line?.playing) return
    const t = setTimeout(() => setLine({ index: line.index + 1, playing: line.index + 2 < lineFens.length }), 900)
    return () => clearTimeout(t)
  }, [line, lineFens.length])

  const firstResult = (solved: boolean) => {
    if (recorded.current) return
    recorded.current = true
    onFirstResult(solved)
  }

  const targets = useMemo(
    () => (selected && phase === 'solving' ? new Chess(position.fen).moves({ square: selected, verbose: true }) : []),
    [position.fen, selected, phase],
  )

  function tryMove(from: string, to: string): boolean {
    setSelected(undefined)
    if (phase !== 'solving') return false
    const candidates = new Chess(position.fen).moves({ verbose: true }).filter(m => m.from === from && m.to === to)
    if (!candidates.length) return false
    const best = playMove(position.fen, position.bestMoveSan)
    const promotion = candidates.length > 1 ? (best?.move.to === to ? best.move.promotion : 'q') : undefined
    const mine = playMove(position.fen, `${from}${to}${promotion ?? ''}`)
    if (!mine || !best) return false
    setFen(mine.chess.fen())
    setMyMove(mine.move)
    setPhase('checking')
    setMessage(`Checking ${mine.move.san}…`)
    const same = mine.move.san === best.move.san
    const bestEval = evaluate(best.chess.fen())
    Promise.all([bestEval, same ? bestEval : evaluate(mine.chess.fen())]).then(
      ([b, m]) => {
        const verdict = judge(position.userColor, b.score, m.score)
        firstResult(verdict.correct)
        if (verdict.correct) {
          setPhase('correct')
          setMessage(
            `Correct. ${mine.move.san} keeps ${formatCp(verdict.cp)}.${same ? '' : ` The engine's move was ${position.bestMoveSan}.`}`,
          )
        } else {
          setPhase('wrong')
          setMessage(`Not quite. Your move gives ${formatCp(verdict.cp)}. The best move keeps ${formatCp(verdict.cp + verdict.loss)}.`)
        }
      },
      (e: Error) => {
        setPhase('solving')
        setFen(position.fen)
        setMessage(e.message === 'Analysis stopped.' ? '' : e.message)
      },
    )
    return true
  }

  function clickSquare(square: Square) {
    if (phase !== 'solving') return
    if (selected && targets.some(m => m.to === square)) {
      tryMove(selected, square)
      return
    }
    const piece = new Chess(position.fen).get(square)
    setSelected(piece?.color === side && square !== selected ? square : undefined)
  }

  function onKey(e: React.KeyboardEvent) {
    const flip = position.userColor === 'black' ? -1 : 1
    const step = { ArrowUp: [0, flip], ArrowDown: [0, -flip], ArrowLeft: [-flip, 0], ArrowRight: [flip, 0] }[e.key]
    if (step) {
      e.preventDefault()
      setFocused(true)
      const file = Math.max(0, Math.min(7, cursor.charCodeAt(0) - 97 + step[0]))
      const rank = Math.max(1, Math.min(8, Number(cursor[1]) + step[1]))
      const next = `${'abcdefgh'[file]}${rank}` as Square
      const piece = new Chess(fen).get(next)
      setCursor(next)
      setCursorNote(`${next}${piece ? `, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAME[piece.type]}` : ''}`)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      clickSquare(cursor)
    } else if (e.key === 'Escape') {
      setSelected(undefined)
    }
  }

  const showSolution = () => {
    firstResult(false)
    setFen(position.fen)
    setPhase('revealed')
    setMessage(`The best move is ${position.bestMoveSan}.`)
  }

  let shownFen = fen
  let arrows: { startSquare: string; endSquare: string; color: string }[] = []
  let moved: { from: string; to: string } | undefined =
    phase === 'checking' || phase === 'correct' || phase === 'wrong' ? myMove : phase === 'opponent' ? undefined : position.lastMove
  if (line) {
    shownFen = lineFens[line.index]
    const last = line.index > 0 ? playMove(lineFens[line.index - 1], position.bestLine[line.index - 1]) : undefined
    if (last) arrows = [{ startSquare: last.move.from, endSquare: last.move.to, color: ARROW_LINE }]
    moved = last?.move ?? position.lastMove
  } else if (phase === 'revealed') {
    const best = playMove(position.fen, position.bestMoveSan)
    if (best) arrows = [{ startSquare: best.move.from, endSquare: best.move.to, color: ARROW_BEST }]
  }

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (moved) squareStyles[moved.from] = squareStyles[moved.to] = LAST_MOVE
  for (const m of targets) squareStyles[m.to] = { ...squareStyles[m.to], ...(m.captured ? CAPTURE : TARGET) }
  if (selected) squareStyles[selected] = { ...squareStyles[selected], ...SELECTED }
  if (phase === 'solving' && focused) squareStyles[cursor] = { ...squareStyles[cursor], ...CURSOR }
  const done = phase === 'correct' || phase === 'revealed'

  return (
    <>
      <div className="p-4 md:overflow-y-auto">
        <section aria-label="Training board" className="mx-auto flex w-full max-w-[min(100%,calc(100dvh-12rem))] min-w-[260px] flex-col gap-2">
          <div
            tabIndex={0}
            role="application"
            aria-label={`Board, ${position.userColor} to move. Arrow keys move the cursor. Enter picks a piece and drops it. Escape cancels.`}
            aria-describedby="trainer-cursor"
            onKeyDown={onKey}
            onFocus={e => setFocused(e.currentTarget.matches(':focus-visible'))}
            onBlur={() => setFocused(false)}
            className="rounded focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
          >
            <Chessboard
              options={{
                id: 'trainer-board',
                position: shownFen,
                boardOrientation: position.userColor,
                arrows,
                squareStyles,
                allowDrawingArrows: false,
                showAnimations: !reducedMotion(),
                canDragPiece: ({ piece }) => phase === 'solving' && piece.pieceType[0] === side,
                onPieceDrag: ({ square }) => setSelected((square as Square | null) ?? undefined),
                onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? tryMove(sourceSquare, targetSquare) : false),
                onSquareClick: ({ square }) => clickSquare(square as Square),
              }}
            />
          </div>
          <p id="trainer-cursor" className="sr-only" aria-live="polite">
            {cursorNote}
          </p>
          {line && (
            <div className="flex items-center justify-center gap-1.5" role="group" aria-label="Step through the best line">
              <button className={btn} onClick={() => setLine({ index: Math.max(0, line.index - 1), playing: false })} disabled={line.index === 0} aria-label="Previous move">
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button
                className={btn}
                onClick={() => setLine({ index: line.index >= lineFens.length - 1 ? 0 : line.index, playing: !line.playing })}
                aria-label={line.playing ? 'Pause' : 'Play the line'}
              >
                {line.playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              </button>
              <button
                className={btn}
                onClick={() => setLine({ index: Math.min(lineFens.length - 1, line.index + 1), playing: false })}
                disabled={line.index === lineFens.length - 1}
                aria-label="Next move"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
              <span className="text-sm text-stone-600 dark:text-stone-400">
                {position.bestLine.slice(0, line.index).join(' ') || 'Start'} ({line.index}/{lineFens.length - 1})
              </span>
            </div>
          )}
        </section>
      </div>

      <aside aria-label="Training" className="flex flex-col gap-4 border-t border-stone-200 p-4 md:overflow-y-auto md:border-t-0 md:border-l dark:border-stone-800">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Training: {TAG_LABEL[tag]}</h2>
          <button className={btn} onClick={onExit}>
            <Undo2 className="size-4" aria-hidden /> Back to the report
          </button>
        </div>
        <div>
          <p className="text-lg font-medium" aria-live="polite" aria-atomic="true">
            {position.lastMove && phase !== 'opponent' && (
              <span className="flex items-center gap-1.5 text-base font-normal">
                <MoveRight className="size-4 shrink-0 text-lime-700 dark:text-lime-400" aria-hidden />
                {position.userColor === 'white' ? 'Black' : 'White'} played {position.lastMove.notation}.
              </span>
            )}{' '}
            Find the best move for {position.userColor}. {number}/{total}
          </p>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            From your game vs {position.opponent}, {new Date(position.date).toLocaleDateString()}.
            {before && ` Before: ${before.tries} ${before.tries === 1 ? 'try' : 'tries'}, ${before.solved} solved.`}
          </p>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Drag a piece, tap a piece and then a square, or use the arrow keys and Enter.</p>
        </div>

        <p role="status" aria-live="polite" className="flex min-h-6 items-start gap-2 text-sm">
          {phase === 'checking' && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />}
          {phase === 'correct' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400" aria-hidden />}
          {phase === 'wrong' && <XCircle className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-400" aria-hidden />}
          {phase === 'revealed' && <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <span>{message}</span>
        </p>
        {done && <p className="text-sm text-stone-600 dark:text-stone-400">In the game you played {position.playedNotation}</p>}

        <div className="flex flex-wrap gap-2">
          {phase === 'wrong' && (
            <button
              className={btn}
              onClick={() => {
                setFen(position.fen)
                setPhase('solving')
                setMessage('')
              }}
            >
              <RotateCcw className="size-4" aria-hidden /> Try again
            </button>
          )}
          {(phase === 'solving' || phase === 'wrong') && (
            <button className={btn} onClick={showSolution}>
              <Eye className="size-4" aria-hidden /> Show solution
            </button>
          )}
          {done && position.bestLine.length > 0 && (
            <button className={btn} onClick={() => setLine({ index: 0, playing: true })}>
              <Play className="size-4" aria-hidden /> Show line
            </button>
          )}
          {(done || phase === 'wrong') && (
            <button className={primary} onClick={onNext}>
              {number === total ? 'Finish' : 'Next'} <ArrowRight className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
