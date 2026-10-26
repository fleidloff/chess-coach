import { useMemo, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import type { GameRecord } from '../lib/lichess.ts'
import { lichessAnalysisUrl, lichessGameUrl } from '../lib/lichess.ts'
import type { GameAnalysis } from '../lib/analysis.ts'
import { annotateGame, PHASE_LABEL, SEVERITY_LABEL, SEVERITY_SYMBOL, TAG_LABEL, winPercent } from '../lib/analysis.ts'
import { ARROW_BEST, ARROW_NEUTRAL, ARROW_PLAYED, de, formatDate, RESULT_LABEL, reducedMotion, squaresOf } from './format.ts'

interface Props {
  game: GameRecord
  analysis?: GameAnalysis
  ply: number
  onClose?: () => void
}

export function GameViewer({ game, analysis, ply: startPly, onClose }: Props) {
  const [ply, setPly] = useState(startPly)

  const fens = useMemo(() => {
    const chess = new Chess()
    return [chess.fen(), ...game.moves.map(san => (chess.move(san), chess.fen()))]
  }, [game])
  const insights = useMemo(() => new Map((analysis ? annotateGame(game, analysis) : []).map(m => [m.ply, m])), [game, analysis])

  const n = game.moves.length
  const fen = fens[ply]
  const san = game.moves[ply]
  const insight = insights.get(ply)
  const best = analysis?.lines[ply]?.[0]
  const played = san ? squaresOf(fen, san) : undefined
  const bestSq = best && best !== san ? squaresOf(fen, best) : undefined
  const arrows = [
    ...(played ? [{ ...played, color: insight?.severity && insight.loss >= 10 ? ARROW_PLAYED : ARROW_NEUTRAL }] : []),
    ...(bestSq ? [{ ...bestSq, color: ARROW_BEST }] : []),
  ]
  const userWin = (i: number) => {
    const e = analysis?.evals[i]
    if (!e) return undefined
    return game.color === 'white' ? winPercent(e) : 100 - winPercent(e)
  }
  const moveLabel = (i: number) => `${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'} ${de(game.moves[i])}`

  const onKey = (e: React.KeyboardEvent) => {
    const to = { ArrowLeft: ply - 1, ArrowRight: ply + 1, Home: 0, End: n }[e.key]
    if (to === undefined) return
    e.preventDefault()
    setPly(Math.max(0, Math.min(n, to)))
  }

  return (
    <section className="viewer" aria-label="Partie-Ansicht" tabIndex={0} onKeyDown={onKey}>
      <header className="viewer-head">
        <div>
          <strong>{game.color === 'white' ? 'Weiß' : 'Schwarz'} gegen {game.opponent}</strong>
          {game.opponentRating ? ` (${game.opponentRating})` : ''} · {formatDate(game.createdAt)} · {RESULT_LABEL[game.result]}
          {game.opening && <div className="muted">{game.opening.name}</div>}
        </div>
        {onClose && (
          <button className="ghost" onClick={onClose} aria-label="Ansicht schließen">
            ✕
          </button>
        )}
      </header>

      <div className="board">
        <Chessboard
          options={{
            id: `viewer-${game.id}`,
            position: fen,
            boardOrientation: game.color,
            arrows,
            allowDragging: false,
            allowDrawingArrows: false,
            showAnimations: !reducedMotion(),
          }}
        />
      </div>

      <div className="nav" role="group" aria-label="Züge durchgehen">
        <button onClick={() => setPly(0)} disabled={ply === 0} aria-label="Zum Anfang">⏮</button>
        <button onClick={() => setPly(ply - 1)} disabled={ply === 0} aria-label="Zug zurück">◀</button>
        <span className="muted" aria-live="polite">
          {ply === 0 ? 'Startstellung' : `Nach ${moveLabel(ply - 1)}`}
        </span>
        <button onClick={() => setPly(ply + 1)} disabled={ply === n} aria-label="Nächster Zug">▶</button>
        <button onClick={() => setPly(n)} disabled={ply === n} aria-label="Zum Ende">⏭</button>
      </div>

      {analysis && <EvalGraph values={fens.map((_, i) => userWin(i))} ply={ply} onPick={setPly} />}

      <div className="move-info" aria-live="polite">
        {san && (
          <p>
            Nächster Zug: <strong>{moveLabel(ply)}</strong>
            {insight?.severity && (
              <span className={`sev sev-${insight.severity}`}>
                {' '}
                {SEVERITY_SYMBOL[insight.severity]} {SEVERITY_LABEL[insight.severity]}
              </span>
            )}
          </p>
        )}
        {insight && (
          <p className="muted">
            Deine Gewinnchance: {Math.round(insight.winBefore)} % → {Math.round(insight.winAfter)} % · {PHASE_LABEL[insight.phase]}
            {insight.secondsLeft !== undefined && ` · ${Math.round(insight.secondsLeft)} s auf der Uhr`}
          </p>
        )}
        {best && best !== san && (
          <p>
            <span className="legend best" aria-hidden /> Besser war <strong>{de(best)}</strong>
            {analysis?.lines[ply] && analysis.lines[ply]!.length > 1 && <span className="muted"> ({de(analysis.lines[ply]!.join(' '))})</span>}
          </p>
        )}
        {insight && insight.tags.length > 0 && (
          <p className="chips">
            {insight.tags.map(t => (
              <span key={t} className="chip">
                {TAG_LABEL[t]}
              </span>
            ))}
          </p>
        )}
        {!analysis && <p className="muted">Diese Partie ist noch nicht analysiert.</p>}
        <p>
          <a href={lichessGameUrl(game, ply)} target="_blank" rel="noreferrer">
            Auf Lichess öffnen
          </a>
          {' · '}
          <a href={lichessAnalysisUrl(fen)} target="_blank" rel="noreferrer">
            Stellung analysieren
          </a>
        </p>
      </div>

      <ol className="moves" aria-label="Zugliste">
        {game.moves.map((m, i) => {
          const sev = insights.get(i)?.severity
          return (
            <li key={i} className={i % 2 ? 'black' : 'white'}>
              <button className={`move ${sev ? `sev-${sev}` : ''}`} aria-current={ply === i ? 'true' : undefined} onClick={() => setPly(i)}>
                {i % 2 ? '' : `${i / 2 + 1}. `}
                {de(m)}
                {sev ? SEVERITY_SYMBOL[sev] : ''}
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function EvalGraph({ values, ply, onPick }: { values: (number | undefined)[]; ply: number; onPick: (ply: number) => void }) {
  const w = 300
  const h = 60
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * w
  const y = (v: number) => h - (v / 100) * h
  const points = values.map((v, i) => (v === undefined ? '' : `${x(i)},${y(v)}`)).filter(Boolean).join(' ')
  return (
    <svg
      className="eval-graph"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Verlauf deiner Gewinnchance. Klicke, um zu einem Zug zu springen."
      onClick={e => {
        const r = e.currentTarget.getBoundingClientRect()
        onPick(Math.round(((e.clientX - r.left) / r.width) * (values.length - 1)))
      }}
    >
      <line x1="0" x2={w} y1={h / 2} y2={h / 2} className="mid" />
      <polygon points={`0,${h} ${points} ${w},${h}`} className="area" />
      <polyline points={points} className="line" />
      <line x1={x(ply)} x2={x(ply)} y1="0" y2={h} className="cursor" />
    </svg>
  )
}
