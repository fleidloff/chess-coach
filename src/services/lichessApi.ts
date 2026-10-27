import type { ParsedGame } from '../types/chess.ts'

interface ApiPlayer {
  user?: { id: string; name: string }
  rating?: number
  aiLevel?: number
}

export interface LichessGame {
  id: string
  variant: string
  createdAt: number
  status: string
  winner?: 'white' | 'black'
  initialFen?: string
  players: { white: ApiPlayer; black: ApiPlayer }
  opening?: { name: string }
  moves?: string
  pgn?: string
}

const SKIPPED_STATUS = new Set(['created', 'started', 'aborted', 'noStart', 'unknownFinish'])

const playerName = (p: ApiPlayer) => p.user?.name ?? (p.aiLevel ? `Stockfish level ${p.aiLevel}` : 'Anonymous')

export function parseLichessGame(raw: LichessGame, username: string): ParsedGame | undefined {
  if (raw.variant !== 'standard' || raw.initialFen || SKIPPED_STATUS.has(raw.status) || !raw.moves) return
  const user = username.toLowerCase()
  const { white, black } = raw.players
  const userColor = white.user?.id === user ? 'white' : black.user?.id === user ? 'black' : undefined
  if (!userColor) return
  return {
    id: raw.id,
    platform: 'lichess',
    url: `https://lichess.org/${raw.id}/${userColor}`,
    pgn: raw.pgn ?? '',
    moves: raw.moves.split(' '),
    whitePlayer: playerName(white),
    blackPlayer: playerName(black),
    whiteRating: white.rating,
    blackRating: black.rating,
    userColor,
    date: new Date(raw.createdAt).toISOString(),
    result: raw.winner === 'white' ? '1-0' : raw.winner === 'black' ? '0-1' : '1/2-1/2',
    opening: raw.opening?.name,
  }
}

/** The user's latest standard games, newest first. */
export async function fetchLichessGames(username: string, count: number, signal?: AbortSignal): Promise<ParsedGame[]> {
  const params = new URLSearchParams({
    // Some of the latest games can be aborted or variants; ask for more and keep `count`.
    max: String(count + 10),
    perfType: 'ultraBullet,bullet,blitz,rapid,classical,correspondence',
    finished: 'true',
    moves: 'true',
    opening: 'true',
    pgnInJson: 'true',
    clocks: 'false',
    evals: 'false',
  })
  let res: Response
  try {
    res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`, {
      headers: { Accept: 'application/x-ndjson' },
      signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error('Cannot reach Lichess. Check your internet connection.')
  }
  if (res.status === 404) throw new Error(`Lichess has no user "${username}".`)
  if (res.status === 429) throw new Error('Lichess rate limit reached. Wait one minute, then try again.')
  if (!res.ok) throw new Error(`Lichess answered with HTTP ${res.status}.`)

  const games: ParsedGame[] = []
  for (const line of (await res.text()).split('\n')) {
    if (!line.trim()) continue
    const game = parseLichessGame(JSON.parse(line) as LichessGame, username)
    if (game) games.push(game)
  }
  return games.slice(0, count)
}
