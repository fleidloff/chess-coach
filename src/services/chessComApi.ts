import { Chess, DEFAULT_POSITION } from 'chess.js'
import type { ParsedGame } from '../types/chess.ts'

interface ApiPlayer {
  username: string
  rating?: number
  result: string
}

export interface ChessComGame {
  url: string
  uuid?: string
  pgn?: string
  end_time: number
  rules: string
  initial_setup?: string
  white: ApiPlayer
  black: ApiPlayer
}

const MAX_ARCHIVES = 6

function openingFromPgn(pgn: string): string | undefined {
  const slug = /\[ECOUrl "[^"]*\/openings\/([^"]+)"\]/.exec(pgn)?.[1]
  return slug?.split(/\.\.\.|-\d+\./)[0].replaceAll('-', ' ')
}

export function parseChessComGame(raw: ChessComGame, username: string): ParsedGame | undefined {
  if (raw.rules !== 'chess' || !raw.pgn) return
  if (raw.initial_setup && raw.initial_setup !== DEFAULT_POSITION) return
  const user = username.toLowerCase()
  const userColor =
    raw.white.username.toLowerCase() === user ? 'white' : raw.black.username.toLowerCase() === user ? 'black' : undefined
  if (!userColor) return
  const chess = new Chess()
  try {
    chess.loadPgn(raw.pgn)
  } catch {
    return
  }
  const moves = chess.history()
  if (!moves.length) return
  return {
    id: raw.uuid ?? raw.url.split('/').pop()!,
    platform: 'chesscom',
    url: raw.url,
    pgn: raw.pgn,
    moves,
    whitePlayer: raw.white.username,
    blackPlayer: raw.black.username,
    whiteRating: raw.white.rating,
    blackRating: raw.black.rating,
    userColor,
    date: new Date(raw.end_time * 1000).toISOString(),
    result: raw.white.result === 'win' ? '1-0' : raw.black.result === 'win' ? '0-1' : '1/2-1/2',
    opening: openingFromPgn(raw.pgn),
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error('Cannot reach Chess.com. Check your internet connection.')
  }
  if (res.status === 404) throw new Error('NOT_FOUND')
  if (res.status === 429) throw new Error('Chess.com rate limit reached. Wait one minute, then try again.')
  if (!res.ok) throw new Error(`Chess.com answered with HTTP ${res.status}.`)
  return (await res.json()) as T
}

/** The user's latest standard games, newest first. Reads monthly archives backwards until it has `count` games. */
export async function fetchChessComGames(username: string, count: number, signal?: AbortSignal): Promise<ParsedGame[]> {
  const name = encodeURIComponent(username.toLowerCase())
  let archives: string[]
  try {
    archives = (await getJson<{ archives: string[] }>(`https://api.chess.com/pub/player/${name}/games/archives`, signal))
      .archives
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') throw new Error(`Chess.com has no user "${username}".`)
    throw e
  }
  const games: ParsedGame[] = []
  for (const url of archives.slice(-MAX_ARCHIVES).reverse()) {
    const month = await getJson<{ games: ChessComGame[] }>(url, signal)
    for (const raw of month.games.toReversed()) {
      const game = parseChessComGame(raw, username)
      if (game) games.push(game)
      if (games.length === count) return games
    }
  }
  return games
}
