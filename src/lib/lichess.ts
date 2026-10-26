export type Color = 'white' | 'black'
export type Result = 'win' | 'loss' | 'draw'

/** Engine evaluation from White's point of view. */
export interface Eval {
  cp?: number
  mate?: number
}

export interface LichessMoveEval extends Eval {
  variation?: string
  judgment?: string
}

export interface GameRecord {
  id: string
  user: string
  createdAt: number
  speed: string
  rated: boolean
  color: Color
  result: Result
  status: string
  myRating?: number
  opponent: string
  opponentRating?: number
  opening?: { eco: string; name: string }
  moves: string[]
  /** Remaining clock in centiseconds after each ply. */
  clocks?: number[]
  clockInitial?: number
  division?: { middle?: number; end?: number }
  lichessEvals?: LichessMoveEval[]
}

export const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'] as const

export interface FetchOptions {
  username: string
  max: number
  speeds: string[]
  since?: number
  until?: number
  signal?: AbortSignal
}

const SKIPPED_STATUS = new Set(['created', 'started', 'aborted', 'noStart', 'unknownFinish'])

interface ApiPlayer {
  user?: { id: string; name: string }
  rating?: number
  aiLevel?: number
}

export interface ApiGame {
  id: string
  rated: boolean
  variant: string
  speed: string
  createdAt: number
  status: string
  winner?: Color
  initialFen?: string
  players: { white: ApiPlayer; black: ApiPlayer }
  opening?: { eco: string; name: string }
  moves?: string
  clocks?: number[]
  clock?: { initial: number }
  division?: { middle?: number; end?: number }
  analysis?: { eval?: number; mate?: number; variation?: string; judgment?: { name: string } }[]
}

export function parseGame(raw: ApiGame, username: string): GameRecord | undefined {
  const user = username.toLowerCase()
  if (raw.variant !== 'standard' || raw.initialFen || SKIPPED_STATUS.has(raw.status) || !raw.moves) return
  const color: Color | undefined =
    raw.players.white.user?.id === user ? 'white' : raw.players.black.user?.id === user ? 'black' : undefined
  if (!color) return
  const me = raw.players[color]
  const them = raw.players[color === 'white' ? 'black' : 'white']
  return {
    id: raw.id,
    user,
    createdAt: raw.createdAt,
    speed: raw.speed,
    rated: raw.rated,
    color,
    result: !raw.winner ? 'draw' : raw.winner === color ? 'win' : 'loss',
    status: raw.status,
    myRating: me.rating,
    opponent: them.user?.name ?? (them.aiLevel ? `Stockfish Stufe ${them.aiLevel}` : 'Anonym'),
    opponentRating: them.rating,
    opening: raw.opening && { eco: raw.opening.eco, name: raw.opening.name },
    moves: raw.moves.split(' '),
    clocks: raw.clocks,
    clockInitial: raw.clock?.initial,
    division: raw.division,
    lichessEvals: raw.analysis?.map(a => ({
      cp: a.eval,
      mate: a.mate,
      variation: a.variation,
      judgment: a.judgment?.name,
    })),
  }
}

/** Streams the user's games, newest first, and calls onGame for each one. */
export async function fetchGames(opts: FetchOptions, onGame: (game: GameRecord) => void): Promise<void> {
  const params = new URLSearchParams({
    max: String(opts.max),
    moves: 'true',
    clocks: 'true',
    evals: 'true',
    opening: 'true',
    division: 'true',
    finished: 'true',
  })
  if (opts.speeds.length) params.set('perfType', opts.speeds.join(','))
  if (opts.since) params.set('since', String(opts.since))
  if (opts.until) params.set('until', String(opts.until))

  const res = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(opts.username)}?${params}`,
    { headers: { Accept: 'application/x-ndjson' }, signal: opts.signal },
  )
  if (res.status === 404) throw new Error(`Lichess kennt keinen Benutzer „${opts.username}“.`)
  if (res.status === 429) throw new Error('Lichess-Limit erreicht. Warte eine Minute und versuche es dann erneut.')
  if (!res.ok || !res.body) throw new Error(`Lichess antwortet mit HTTP ${res.status}.`)

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const game = parseGame(JSON.parse(line) as ApiGame, opts.username)
      if (game) onGame(game)
    }
  }
  if (buffer.trim()) {
    const game = parseGame(JSON.parse(buffer) as ApiGame, opts.username)
    if (game) onGame(game)
  }
}

export function lichessGameUrl(game: GameRecord, ply = 0): string {
  return `https://lichess.org/${game.id}/${game.color}#${ply}`
}

export function lichessAnalysisUrl(fen: string): string {
  return `https://lichess.org/analysis/standard/${fen.replaceAll(' ', '_')}`
}
