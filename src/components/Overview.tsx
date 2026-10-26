import type { Report, Tag, Weakness } from '../lib/analysis.ts'
import { PHASE_LABEL, TAG_LABEL } from '../lib/analysis.ts'
import { formatPct } from './format.ts'

interface Props {
  report: Report
  onShowMistakes: (tag?: Tag) => void
  onPractice: (tag?: Tag) => void
}

const isTag = (id: Weakness['id']): id is Tag => id in TAG_LABEL

export function Overview({ report, onShowMistakes, onPractice }: Props) {
  const { record, accuracy, counts } = report
  if (!report.games.length) return <p className="empty">Keine Partien passen zu diesem Filter.</p>
  return (
    <div className="stack">
      <section className="stats" aria-label="Kennzahlen">
        <Stat label="Partien" value={String(report.games.length)} note={`${report.analysed} analysiert`} />
        <Stat label="Bilanz" value={`${record.win} / ${record.draw} / ${record.loss}`} note="Siege / Remis / Niederlagen" />
        <Stat label="Genauigkeit" value={formatPct(accuracy.overall)} note="Lichess-Formel" />
        {(['opening', 'middlegame', 'endgame'] as const).map(p => (
          <Stat key={p} label={PHASE_LABEL[p]} value={formatPct(accuracy[p])} note="Genauigkeit" />
        ))}
        <Stat label="Grobe Fehler" value={String(counts.blunder)} note={`${counts.mistake} Fehler, ${counts.inaccuracy} Ungenauigkeiten`} />
      </section>

      {!report.analysed && <p className="empty">Die Analyse läuft. Die Auswertung erscheint, sobald die ersten Partien fertig sind.</p>}

      {report.analysed > 0 && (
        <>
          <section>
            <h2>Das machst du gut</h2>
            {report.strengths.length ? (
              <ul className="cards">
                {report.strengths.map(s => (
                  <li key={s.title} className="card good">
                    <h3>{s.title}</h3>
                    <p>{s.detail}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Analysiere mehr Partien, damit sich deine Stärken zeigen.</p>
            )}
          </section>

          <section>
            <h2>Deine größten Baustellen</h2>
            {report.weaknesses.length ? (
              <ol className="cards">
                {report.weaknesses.slice(0, 5).map(w => (
                  <li key={w.id} className="card bad">
                    <h3>{w.title}</h3>
                    <p>{w.detail}</p>
                    {isTag(w.id) && (
                      <button className="link" onClick={() => onShowMistakes(w.id as Tag)}>
                        Beispiele auf dem Brett ansehen
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Keine wiederkehrenden Fehler gefunden. Stark!</p>
            )}
          </section>

          {report.plans.length > 0 && (
            <section>
              <h2>Dein Trainingsplan</h2>
              <ol className="cards">
                {report.plans.map(p => (
                  <li key={p.title} className="card plan">
                    <h3>{p.title}</h3>
                    <p className="muted">{p.why}</p>
                    <ol>
                      {p.steps.map(s => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                    <p className="actions">
                      <button onClick={() => onPractice(p.puzzleTag)}>Aufgaben aus deinen Partien</button>
                      {p.links.map(l => (
                        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                          {l.label}
                        </a>
                      ))}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      {report.openings.length > 0 && (
        <section>
          <h2>Eröffnungen</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Eröffnung</th>
                  <th scope="col">Farbe</th>
                  <th scope="col">Partien</th>
                  <th scope="col">Punkte</th>
                </tr>
              </thead>
              <tbody>
                {report.openings.slice(0, 10).map(o => (
                  <tr key={`${o.name}-${o.color}`}>
                    <td>{o.name}</td>
                    <td>{o.color === 'white' ? 'Weiß' : 'Schwarz'}</td>
                    <td>{o.games}</td>
                    <td>{formatPct(o.score * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="muted small">{note}</div>
    </div>
  )
}
