import { useState } from 'react'
import type { GameRecord } from '../lib/lichess.ts'
import type { GameAnalysis, MoveInsight, Tag } from '../lib/analysis.ts'
import { SEVERITY_LABEL, SEVERITY_SYMBOL, TAG_LABEL } from '../lib/analysis.ts'
import { GameViewer } from './GameViewer.tsx'
import { de, formatDate } from './format.ts'

interface Props {
  mistakes: MoveInsight[]
  games: Map<string, GameRecord>
  analyses: Map<string, GameAnalysis>
  tag: Tag | ''
  onTag: (tag: Tag | '') => void
}

export function Mistakes({ mistakes, games, analyses, tag, onTag }: Props) {
  const [onlyBlunders, setOnlyBlunders] = useState(false)
  const [selected, setSelected] = useState<MoveInsight>()
  const shown = mistakes.filter(m => (!tag || m.tags.includes(tag)) && (!onlyBlunders || m.severity === 'blunder')).slice(0, 100)
  const current = selected && shown.includes(selected) ? selected : shown[0]
  const game = current && games.get(current.gameId)

  return (
    <div className="split">
      <div>
        <div className="toolbar">
          <label>
            Thema{' '}
            <select value={tag} onChange={e => onTag(e.target.value as Tag | '')}>
              <option value="">Alle Fehler</option>
              {(Object.keys(TAG_LABEL) as Tag[]).map(t => (
                <option key={t} value={t}>
                  {TAG_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={onlyBlunders} onChange={e => setOnlyBlunders(e.target.checked)} /> Nur grobe Fehler
          </label>
        </div>
        {shown.length ? (
          <ul className="list" aria-label="Fehler, größter zuerst">
            {shown.map(m => {
              const g = games.get(m.gameId)!
              return (
                <li key={`${m.gameId}-${m.ply}`}>
                  <button className="item" aria-current={m === current ? 'true' : undefined} onClick={() => setSelected(m)}>
                    <span className={`sev sev-${m.severity}`}>
                      {Math.floor(m.ply / 2) + 1}
                      {m.ply % 2 ? '…' : '.'} {de(m.san)}
                      {SEVERITY_SYMBOL[m.severity!]}
                    </span>
                    <span className="muted small">
                      {' '}
                      {SEVERITY_LABEL[m.severity!]} · −{Math.round(m.loss)} % · gegen {g.opponent} · {formatDate(g.createdAt)}
                    </span>
                    {m.tags.length > 0 && <span className="small block">{m.tags.map(t => TAG_LABEL[t]).join(' · ')}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="empty">Keine Fehler für diese Auswahl gefunden.</p>
        )}
      </div>
      {game && current && <GameViewer key={`${current.gameId}-${current.ply}`} game={game} analysis={analyses.get(game.id)} ply={current.ply} />}
    </div>
  )
}
