import type { GameEvals, ParsedGame } from '../types/chess.ts'
import { resultFor } from '../engine/templateEngine.ts'

interface Props {
  games: ParsedGame[]
  evals: Map<string, GameEvals>
  selectedId: string
  onSelect: (id: string) => void
}

export function GameSelector({ games, evals, selectedId, onSelect }: Props) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm">
      <span className="shrink-0 text-stone-600 dark:text-stone-400">Game</span>
      <select
        value={selectedId}
        onChange={e => onSelect(e.target.value)}
        className="min-w-0 flex-1 truncate rounded-md border border-stone-300 bg-white px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-stone-700 dark:bg-stone-900"
      >
        {games.map((g, i) => {
          const opponent = g.userColor === 'white' ? g.blackPlayer : g.whitePlayer
          const date = new Date(g.date).toLocaleDateString()
          return (
            <option key={g.id} value={g.id}>
              {i + 1}. {i === 0 ? '(latest) ' : ''}vs {opponent} · {resultFor(g)} · {date}
              {evals.has(g.id) ? '' : ' · scanning…'}
            </option>
          )
        })}
      </select>
    </label>
  )
}
