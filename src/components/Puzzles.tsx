import { useMemo, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess, type Square } from 'chess.js'
import type { GameRecord } from '../lib/lichess.ts'
import type { PuzzleRecord, Tag } from '../lib/analysis.ts'
import { TAG_LABEL } from '../lib/analysis.ts'
import { ARROW_BEST, de, formatDate, fromGerman, reducedMotion, squaresOf } from './format.ts'

interface Props {
  puzzles: PuzzleRecord[]
  pending: number
  games: Map<string, GameRecord>
  tag: Tag | ''
  onTag: (tag: Tag | '') => void
  onUpdate: (puzzle: PuzzleRecord) => void
  onOpenGame: (gameId: string, ply: number) => void
}

const rank = (p: PuzzleRecord) => (p.lastResult === 'failed' ? 0 : p.attempts === 0 ? 1 : 2)

export function Puzzles({ puzzles, pending, games, tag, onTag, onUpdate, onOpenGame }: Props) {
  const shown = puzzles.filter(p => !tag || p.tags.includes(tag)).sort((a, b) => rank(a) - rank(b))
  const [currentId, setCurrentId] = useState<string>()
  const puzzle = shown.find(p => p.id === currentId) ?? shown[0]
  const solvedCount = puzzles.filter(p => p.lastResult === 'solved').length

  return (
    <div className="stack">
      <div className="toolbar">
        <label>
          Thema{' '}
          <select value={tag} onChange={e => onTag(e.target.value as Tag | '')}>
            <option value="">Alle Aufgaben</option>
            {(Object.keys(TAG_LABEL) as Tag[]).map(t => (
              <option key={t} value={t}>
                {TAG_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          {solvedCount} von {puzzles.length} gelöst
          {pending > 0 && ` · ${pending} Stellungen werden noch geprüft`}
        </span>
      </div>
      {puzzle ? (
        <Trainer
          key={puzzle.id}
          puzzle={puzzle}
          game={games.get(puzzle.gameId)}
          onUpdate={p => {
            setCurrentId(p.id)
            onUpdate(p)
          }}
          onNext={shown.length > 1 ? () => setCurrentId(shown[(shown.indexOf(puzzle) + 1) % shown.length].id) : undefined}
          onOpenGame={onOpenGame}
        />
      ) : (
        <p className="empty">
          {puzzles.length
            ? 'Keine Aufgaben zu diesem Thema.'
            : 'Noch keine Aufgaben. Sie entstehen aus deinen Fehlern, sobald die Analyse fertig ist. Nur Stellungen mit genau einem klar besten Zug werden zu Aufgaben.'}
        </p>
      )}
    </div>
  )
}

interface TrainerProps {
  puzzle: PuzzleRecord
  game?: GameRecord
  onUpdate: (puzzle: PuzzleRecord) => void
  onNext?: () => void
  onOpenGame: (gameId: string, ply: number) => void
}

function Trainer({ puzzle, game, onUpdate, onNext, onOpenGame }: TrainerProps) {
  const [status, setStatus] = useState<'solving' | 'solved' | 'revealed'>('solving')
  const [fen, setFen] = useState(puzzle.fen)
  const [recorded, setRecorded] = useState(false)
  const [message, setMessage] = useState('')
  const [hint, setHint] = useState(false)
  const [input, setInput] = useState('')
  const [selected, setSelected] = useState<string>()
  const solution = puzzle.solution!
  const side = puzzle.fen.split(' ')[1] === 'w' ? 'white' : 'black'
  const solutionSquares = squaresOf(puzzle.fen, solution[0])

  const record = (solved: boolean) => {
    if (recorded) return
    setRecorded(true)
    onUpdate({ ...puzzle, attempts: puzzle.attempts + 1, solved: puzzle.solved + (solved ? 1 : 0), lastResult: solved ? 'solved' : 'failed' })
  }

  const tryMove = (move: string | { from: string; to: string; promotion?: string }): boolean => {
    if (status !== 'solving') return false
    const chess = new Chess(puzzle.fen)
    let san: string
    try {
      san = chess.move(move).san
    } catch {
      setMessage('Dieser Zug ist in der Stellung nicht möglich.')
      return false
    }
    if (san === solution[0] || chess.isCheckmate()) {
      record(true)
      setStatus('solved')
      setFen(chess.fen())
      setMessage(`Richtig: ${de(san)}!`)
      return true
    }
    record(false)
    setMessage(`${de(san)} ist nicht der beste Zug. Versuch es noch einmal.`)
    return false
  }

  const onDrop = (from: string, to: string) => {
    setSelected(undefined)
    const candidates = new Chess(puzzle.fen).moves({ verbose: true }).filter(m => m.from === from && m.to === to)
    if (!candidates.length) return false
    const promotion = candidates.length > 1 ? (candidates.find(m => m.san === solution[0])?.promotion ?? 'q') : undefined
    return tryMove({ from, to, promotion })
  }

  const targets = useMemo(
    () => (selected ? new Chess(puzzle.fen).moves({ square: selected as Square, verbose: true }) : []),
    [puzzle.fen, selected],
  )

  const onSquareClick = (square: string, pieceType?: string) => {
    if (status !== 'solving') return
    if (selected && targets.some(m => m.to === square)) {
      onDrop(selected, square)
      return
    }
    setSelected(pieceType?.[0] === side[0] && square !== selected ? square : undefined)
  }

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (hint && solutionSquares) squareStyles[solutionSquares.startSquare] = { boxShadow: 'inset 0 0 0 4px var(--accent)' }
  if (selected) squareStyles[selected] = { ...squareStyles[selected], background: 'rgba(255, 210, 0, 0.5)' }
  for (const m of targets) {
    squareStyles[m.to] = {
      background: m.captured
        ? 'radial-gradient(circle closest-side, transparent 78%, rgba(0, 0, 0, 0.3) 80%)'
        : 'radial-gradient(circle closest-side, rgba(0, 0, 0, 0.3) 32%, transparent 34%)',
    }
  }

  return (
    <div className="split">
      <div className="board">
        <Chessboard
          options={{
            id: 'puzzle',
            position: fen,
            boardOrientation: side,
            arrows: status === 'revealed' && solutionSquares ? [{ ...solutionSquares, color: ARROW_BEST }] : [],
            allowDrawingArrows: false,
            showAnimations: !reducedMotion(),
            squareStyles,
            canDragPiece: ({ piece }) => status === 'solving' && piece.pieceType[0] === side[0],
            onPieceDrag: ({ square }) => setSelected(square ?? undefined),
            onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? onDrop(sourceSquare, targetSquare) : false),
            onSquareClick: ({ square, piece }) => onSquareClick(square, piece?.pieceType),
          }}
        />
      </div>
      <div className="stack">
        <h2>Finde den besten Zug für {side === 'white' ? 'Weiß' : 'Schwarz'}</h2>
        {game && (
          <p className="muted">
            Aus deiner Partie gegen {game.opponent} vom {formatDate(game.createdAt)}.
            {puzzle.tags.length > 0 && ` Thema: ${puzzle.tags.map(t => TAG_LABEL[t]).join(', ')}.`}
          </p>
        )}
        <form
          className="row"
          onSubmit={e => {
            e.preventDefault()
            if (input.trim()) tryMove(fromGerman(input))
          }}
        >
          <label htmlFor="puzzle-move">Zug eingeben</label>
          <input
            id="puzzle-move"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="z. B. Sf3"
            autoComplete="off"
            disabled={status !== 'solving'}
          />
          <button type="submit" disabled={status !== 'solving'}>
            Prüfen
          </button>
        </form>
        <p role="status" className={status === 'solved' ? 'good-text' : ''}>
          {message}
        </p>
        {status !== 'solving' && (
          <p>
            Lösung: <strong>{de(solution.join(' '))}</strong>
            {game && <span className="muted"> · In der Partie hast du {de(game.moves[puzzle.ply])} gespielt.</span>}
          </p>
        )}
        <p className="actions">
          {status === 'solving' && (
            <>
              <button className="ghost" onClick={() => setHint(true)} disabled={hint}>
                Tipp
              </button>
              <button
                className="ghost"
                onClick={() => {
                  record(false)
                  setStatus('revealed')
                }}
              >
                Lösung zeigen
              </button>
            </>
          )}
          {onNext && <button onClick={onNext}>Nächste Aufgabe</button>}
          {game && (
            <button className="link" onClick={() => onOpenGame(game.id, puzzle.ply)}>
              In der Partie ansehen
            </button>
          )}
        </p>
        {hint && status === 'solving' && <p className="muted">Die markierte Figur macht den besten Zug.</p>}
      </div>
    </div>
  )
}
