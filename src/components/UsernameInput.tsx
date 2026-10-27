import { useState } from 'react'
import { Search, Square } from 'lucide-react'
import type { Platform } from '../types/chess.ts'

interface Props {
  initialUsername: string
  initialPlatform: Platform
  running: boolean
  onAnalyze: (username: string, platform: Platform) => void
  onStop: () => void
}

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'lichess', label: 'Lichess' },
  { id: 'chesscom', label: 'Chess.com' },
]

export function UsernameInput({ initialUsername, initialPlatform, running, onAnalyze, onStop }: Props) {
  const [username, setUsername] = useState(initialUsername)
  const [platform, setPlatform] = useState(initialPlatform)
  const name = username.trim()

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={e => {
        e.preventDefault()
        if (name) onAnalyze(name, platform)
      }}
    >
      <label className="sr-only" htmlFor="username">
        Username
      </label>
      <input
        id="username"
        value={username}
        onChange={e => setUsername(e.target.value)}
        placeholder="Username"
        autoComplete="off"
        spellCheck={false}
        required
        pattern="[A-Za-z0-9_\-]{2,30}"
        title="2 to 30 letters, digits, - or _"
        className="w-40 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:flex-none dark:border-stone-700 dark:bg-stone-900"
      />
      <fieldset className="flex rounded-md border border-stone-300 p-0.5 dark:border-stone-700">
        <legend className="sr-only">Platform</legend>
        {PLATFORMS.map(p => (
          <label
            key={p.id}
            className="cursor-pointer rounded px-2.5 py-1 text-sm has-checked:bg-stone-900 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-sky-500 dark:has-checked:bg-stone-100 dark:has-checked:text-stone-900"
          >
            <input
              type="radio"
              name="platform"
              value={p.id}
              checked={platform === p.id}
              onChange={() => setPlatform(p.id)}
              className="sr-only"
            />
            {p.label}
          </label>
        ))}
      </fieldset>
      {running ? (
        <button
          type="button"
          onClick={onStop}
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:border-stone-700 dark:hover:bg-stone-800"
        >
          <Square className="size-4" aria-hidden /> Stop
        </button>
      ) : (
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-stone-950"
        >
          <Search className="size-4" aria-hidden /> Analyze last 10 games
        </button>
      )}
    </form>
  )
}
