import type { GameRecord } from '../lib/lichess.ts'
import type { GameAnalysis } from '../lib/analysis.ts'
import { annotateGame, moveAccuracy } from '../lib/analysis.ts'
import { GameViewer } from './GameViewer.tsx'
import { formatDate, formatPct, RESULT_LABEL, SPEED_LABEL } from './format.ts'

interface Props {
  games: GameRecord[]
  analyses: Map<string, GameAnalysis>
  open?: { gameId: string; ply: number }
  onOpen: (open?: { gameId: string; ply: number }) => void
}

export function Games({ games, analyses, open, onOpen }: Props) {
  const openGame = open && games.find(g => g.id === open.gameId)
  if (!games.length) return <p className="empty">Keine Partien passen zu diesem Filter.</p>
  return (
    <div className="stack">
      {openGame && open && <GameViewer key={`${open.gameId}-${open.ply}`} game={openGame} analysis={analyses.get(openGame.id)} ply={open.ply} showMoments onClose={() => onOpen()} />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Datum</th>
              <th scope="col">Gegner</th>
              <th scope="col">Ergebnis</th>
              <th scope="col">Tempo</th>
              <th scope="col">Eröffnung</th>
              <th scope="col">Genauigkeit</th>
              <th scope="col">?? / ?</th>
            </tr>
          </thead>
          <tbody>
            {games.map(g => {
              const a = analyses.get(g.id)
              const ms = a ? annotateGame(g, a) : []
              return (
                <tr key={g.id} aria-selected={open?.gameId === g.id}>
                  <td>
                    <button className="link" onClick={() => onOpen({ gameId: g.id, ply: 0 })}>
                      {formatDate(g.createdAt)}
                    </button>
                  </td>
                  <td>
                    {g.color === 'white' ? '○' : '●'} {g.opponent}
                    {g.opponentRating ? ` (${g.opponentRating})` : ''}
                  </td>
                  <td className={`result-${g.result}`}>{RESULT_LABEL[g.result]}</td>
                  <td>{SPEED_LABEL[g.speed] ?? g.speed}</td>
                  <td>{g.opening?.name.split(':')[0] ?? '–'}</td>
                  <td>{a ? formatPct(ms.reduce((s, m) => s + moveAccuracy(m.loss), 0) / Math.max(1, ms.length)) : 'ausstehend'}</td>
                  <td>{a ? `${ms.filter(m => m.severity === 'blunder').length} / ${ms.filter(m => m.severity === 'mistake').length}` : '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
