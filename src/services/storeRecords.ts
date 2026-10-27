import type { GameEvals, ParsedGame, Platform, PositionEval, Score } from '../types/chess.ts'

export const SCHEMA = 1
export const ENGINE_ID = 'stockfish-19-lite'
export const KEEP_GAMES = 50

export interface StoredGames {
  schema: typeof SCHEMA
  /** `platform:username`, username in lower case. */
  key: string
  games: ParsedGame[]
  /** Epoch milliseconds. */
  fetchedAt: number
}

export interface StoredEvals {
  schema: typeof SCHEMA
  /** `platform:gameId`. */
  key: string
  /** `platform:username` of the last run that saved it. */
  owner: string
  /** Game date (ISO 8601): eviction keeps the newest games. */
  date: string
  engine: string
  depth: number
  positions: PositionEval[]
  savedAt: number
}

export const ownerKey = (platform: Platform, username: string) => `${platform}:${username.toLowerCase()}`
export const evalsKey = (platform: Platform, gameId: string) => `${platform}:${gameId}`

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null
const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every(s => typeof s === 'string')
const isScore = (x: unknown): x is Score =>
  isObject(x) && (x.cp === undefined || isNumber(x.cp)) && (x.mate === undefined || isNumber(x.mate)) && (x.cp !== undefined || x.mate !== undefined)

function isPosition(x: unknown): x is PositionEval {
  return isObject(x) && isScore(x.score) && isStrings(x.pv) && (x.second === undefined || isScore(x.second))
}

function isGame(x: unknown): x is ParsedGame {
  if (!isObject(x)) return false
  const text = ['id', 'url', 'pgn', 'whitePlayer', 'blackPlayer', 'date', 'result'].every(k => typeof x[k] === 'string')
  return (
    text &&
    (x.platform === 'lichess' || x.platform === 'chesscom') &&
    (x.userColor === 'white' || x.userColor === 'black') &&
    isStrings(x.moves) &&
    x.moves.length > 0
  )
}

export function isStoredGames(x: unknown): x is StoredGames {
  return isObject(x) && x.schema === SCHEMA && typeof x.key === 'string' && isNumber(x.fetchedAt) && Array.isArray(x.games) && x.games.every(isGame)
}

export function isStoredEvals(x: unknown): x is StoredEvals {
  return (
    isObject(x) &&
    x.schema === SCHEMA &&
    ['key', 'owner', 'date', 'engine'].every(k => typeof x[k] === 'string') &&
    isNumber(x.depth) &&
    isNumber(x.savedAt) &&
    Array.isArray(x.positions) &&
    x.positions.every(isPosition)
  )
}

export function toStoredEvals(platform: Platform, owner: string, game: ParsedGame, evals: GameEvals, now: number): StoredEvals {
  return {
    schema: SCHEMA,
    key: evalsKey(platform, game.id),
    owner,
    date: game.date,
    engine: ENGINE_ID,
    depth: evals.depth,
    positions: evals.positions,
    savedAt: now,
  }
}

/** The stored evaluation, when it comes from this engine and fits the game. */
export function usableEvals(record: StoredEvals | undefined, game: ParsedGame): GameEvals | undefined {
  if (!record || record.engine !== ENGINE_ID || record.positions.length !== game.moves.length + 1) return
  return { depth: record.depth, positions: record.positions }
}

/** Keys of the owner's evaluations beyond the newest `keep` games. */
export function evictable(records: Pick<StoredEvals, 'key' | 'owner' | 'date'>[], owner: string, keep = KEEP_GAMES): string[] {
  return records
    .filter(r => r.owner === owner)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(keep)
    .map(r => r.key)
}
