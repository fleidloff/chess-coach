import { useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import type { GameRecord } from '../lib/lichess.ts'
import { lichessAnalysisUrl, lichessGameUrl } from '../lib/lichess.ts'
import type { GameAnalysis, KeyMoment, Tag } from '../lib/analysis.ts'
import { annotateGame, keyMoments, PHASE_LABEL, SEVERITY_LABEL, SEVERITY_SYMBOL, TAG_LABEL, winPercent } from '../lib/analysis.ts'
import { ARROW_BEST, ARROW_NEUTRAL, ARROW_PLAYED, de, formatDate, RESULT_LABEL, reducedMotion, squaresOf } from './format.ts'

interface Props {
  game: GameRecord
  analysis?: GameAnalysis
  ply: number
  showMoments?: boolean
  onClose?: () => void
}

export function GameViewer({ game, analysis, ply: startPly, showMoments, onClose }: Props) {
  const [ply, setPly] = useState(startPly)
  const boardRef = useRef<HTMLDivElement>(null)

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
  const moments = useMemo(() => (showMoments && analysis ? keyMoments(game, analysis) : []), [showMoments, game, analysis])
  const jumpTo = (target: number) => {
    setPly(target)
    boardRef.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }

  const onKey = (e: React.KeyboardEvent) => {
    const to = { ArrowLeft: ply - 1, ArrowRight: ply + 1, Home: 0, End: n }[e.key]
    if (to === undefined) return
    e.preventDefault()
    setPly(Math.max(0, Math.min(n, to)))
  }

  return (
    <section className={`viewer ${showMoments ? 'wide' : ''}`} aria-label="Partie-Ansicht" tabIndex={0} onKeyDown={onKey}>
      <header className="viewer-head">
        <div>
          <strong>
            {game.color === 'white' ? 'Weiß' : 'Schwarz'} gegen {game.opponent}
          </strong>
          {game.opponentRating ? ` (${game.opponentRating})` : ''} · {formatDate(game.createdAt)} · {RESULT_LABEL[game.result]}
          {game.opening && <div className="muted">{game.opening.name}</div>}
        </div>
        {onClose && (
          <button className="ghost" onClick={onClose} aria-label="Ansicht schließen">
            ✕
          </button>
        )}
      </header>

      <div className="viewer-main">
        <div className="board" ref={boardRef}>
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
          <button onClick={() => setPly(0)} disabled={ply === 0} aria-label="Zum Anfang">
            ⏮
          </button>
          <button onClick={() => setPly(ply - 1)} disabled={ply === 0} aria-label="Zug zurück">
            ◀
          </button>
          <span className="muted" aria-live="polite">
            {ply === 0 ? 'Startstellung' : `Nach ${moveLabel(ply - 1)}`}
          </span>
          <button onClick={() => setPly(ply + 1)} disabled={ply === n} aria-label="Nächster Zug">
            ▶
          </button>
          <button onClick={() => setPly(n)} disabled={ply === n} aria-label="Zum Ende">
            ⏭
          </button>
        </div>

        {analysis && <EvalGraph values={fens.map((_, i) => userWin(i))} ply={ply} onPick={setPly} />}
      </div>

      <div className="viewer-side">
        {showMoments && (
          <section aria-labelledby={`moments-${game.id}`}>
            <h3 id={`moments-${game.id}`}>Schlüsselmomente</h3>
            {analysis ? (
              <ol className="moments">
                {moments.map(m => (
                  <li key={`${m.kind}-${m.ply}`}>
                    <button
                      className={`moment ${m.good === undefined ? '' : m.good ? 'good' : 'bad'}`}
                      aria-current={ply === m.ply ? 'true' : undefined}
                      onClick={() => jumpTo(m.ply)}
                    >
                      <span className="moment-icon" aria-hidden>
                        {m.good === undefined ? '•' : m.good ? '✓' : '✗'}
                      </span>
                      <span className="visually-hidden">{m.good === undefined ? '' : m.good ? 'Gut: ' : 'Schwach: '}</span>
                      <span>{narrate(m, game, moveLabel)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Die Schlüsselmomente erscheinen, sobald die Partie analysiert ist.</p>
            )}
          </section>
        )}

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
              {analysis?.lines[ply] && analysis.lines[ply]!.length > 1 && (
                <span className="muted"> ({de(analysis.lines[ply]!.join(' '))})</span>
              )}
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
                <button
                  className={`move ${sev ? `sev-${sev}` : ''}`}
                  aria-current={ply === i ? 'true' : undefined}
                  onClick={() => setPly(i)}
                >
                  {i % 2 ? '' : `${i / 2 + 1}. `}
                  {de(m)}
                  {sev ? SEVERITY_SYMBOL[sev] : ''}
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

const REASON: Record<Tag, string> = {
  allowedMate: 'Danach hatte dein Gegner ein erzwungenes Matt.',
  missedMate: 'Du hattest hier ein Matt.',
  hangingPiece: 'Damit blieb eine Figur ungedeckt stehen.',
  missedPunish: 'Dein Gegner hatte gerade einen Fehler gemacht, und du hast ihn nicht bestraft.',
  missedMaterial: 'Du hättest Material gewinnen können.',
  missedFork: 'Eine Gabel lag in der Luft.',
  timeTrouble: 'Du warst in Zeitnot.',
}

const pct = (x: number) => `${Math.round(x)} %`

function narrate(m: KeyMoment, game: GameRecord, moveLabel: (ply: number) => string): string {
  const swing = `Gewinnchance ${pct(m.winFrom)} → ${pct(m.winTo)}.`
  const moves = Math.ceil(m.ply / 2)
  switch (m.kind) {
    case 'mistake': {
      const i = m.insight!
      return [
        `${moveLabel(m.ply)}${SEVERITY_SYMBOL[i.severity!]} ${SEVERITY_LABEL[i.severity!]}.`,
        ...i.tags.map(t => REASON[t]),
        i.best ? `Besser war ${de(i.best)}.` : '',
        swing,
      ]
        .filter(Boolean)
        .join(' ')
    }
    case 'punish':
      return [
        `Nach ${moveLabel(m.ply - 1)} deines Gegners findest du mit ${moveLabel(m.ply)} die richtige Antwort.`,
        m.winTo >= 85 ? 'Damit stehst du klar auf Gewinn.' : '',
        swing,
      ]
        .filter(Boolean)
        .join(' ')
    case 'openingGood':
      return `Gut aus der Eröffnung gekommen: Nach ${moves} Zügen liegt deine Gewinnchance bei ${pct(m.winTo)}.`
    case 'openingBad':
      return `Die Eröffnung lief nicht gut: Nach ${moves} Zügen liegt deine Gewinnchance nur bei ${pct(m.winTo)}.`
    case 'end': {
      const last = game.moves.length ? moveLabel(game.moves.length - 1) : ''
      const better = m.winTo >= 60 ? ` Dabei standest du besser (${pct(m.winTo)}).` : ''
      if (game.status === 'mate') return game.result === 'win' ? `Matt! Du gewinnst mit ${last}.` : `Du wirst mit ${last} mattgesetzt.`
      if (game.status === 'stalemate') return 'Patt. Die Partie endet remis.'
      if (game.status === 'outoftime') {
        return game.result === 'win' ? 'Deinem Gegner läuft die Zeit ab. Sieg!' : `Deine Zeit läuft ab.${better}`
      }
      if (game.status === 'resign') return game.result === 'win' ? 'Dein Gegner gibt auf. Sieg!' : `Du gibst auf.${better}`
      return `Die Partie endet: ${RESULT_LABEL[game.result]}.`
    }
  }
}

function EvalGraph({ values, ply, onPick }: { values: (number | undefined)[]; ply: number; onPick: (ply: number) => void }) {
  const w = 300
  const h = 60
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * w
  const y = (v: number) => h - (v / 100) * h
  const points = values
    .map((v, i) => (v === undefined ? '' : `${x(i)},${y(v)}`))
    .filter(Boolean)
    .join(' ')
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
