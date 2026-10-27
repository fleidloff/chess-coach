import type { GameEvals, ParsedGame, Platform } from '../types/chess.ts'
import {
  evalsKey,
  evictable,
  isStoredAttempt,
  isStoredEvals,
  isStoredGames,
  nextAttempt,
  SCHEMA,
  type StoredAttempt,
  type StoredEvals,
  type StoredGames,
  toStoredEvals,
  usableEvals,
} from './storeRecords.ts'

// Not "chess-coach": that database belongs to the first app and can hold its puzzle progress.
const DB_NAME = 'chess-coach-analysis'
// Version 2 adds the attempts store (PRD 0004).
const DB_VERSION = 2
const GAMES = 'games'
const EVALS = 'evals'
const ATTEMPTS = 'attempts'

let connection: Promise<IDBDatabase> | undefined

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('Storage request failed.'))
  })
}

function open(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION)
    r.onupgradeneeded = () => {
      for (const name of [GAMES, EVALS, ATTEMPTS]) {
        if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name, { keyPath: 'key' })
      }
    }
    r.onsuccess = () => {
      const db = r.result
      db.onversionchange = () => {
        db.close()
        connection = undefined
      }
      resolve(db)
    }
    r.onerror = () => reject(r.error ?? new Error('Storage is not available.'))
  }).catch(e => {
    connection = undefined
    throw e
  })
  return connection
}

async function store(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await open()).transaction(name, mode).objectStore(name)
}

export async function loadGames(owner: string): Promise<StoredGames | undefined> {
  const record: unknown = await request((await store(GAMES, 'readonly')).get(owner))
  if (isStoredGames(record)) return record
  if (record !== undefined) await request((await store(GAMES, 'readwrite')).delete(owner))
}

export async function saveGames(owner: string, games: ParsedGame[]): Promise<void> {
  const record: StoredGames = { schema: SCHEMA, key: owner, games, fetchedAt: Date.now() }
  await request((await store(GAMES, 'readwrite')).put(record))
}

/** Usable stored evaluations of these games, by game id. Deletes records that fail validation. */
export async function loadEvals(platform: Platform, games: ParsedGame[]): Promise<Map<string, GameEvals>> {
  const s = await store(EVALS, 'readonly')
  const records: unknown[] = await Promise.all(games.map(g => request(s.get(evalsKey(platform, g.id)))))
  const found = new Map<string, GameEvals>()
  const broken: string[] = []
  games.forEach((g, i) => {
    const record = records[i]
    if (record === undefined) return
    if (!isStoredEvals(record)) return broken.push(evalsKey(platform, g.id))
    const usable = usableEvals(record, g)
    if (usable) found.set(g.id, usable)
  })
  if (broken.length) {
    const w = await store(EVALS, 'readwrite')
    await Promise.all(broken.map(k => request(w.delete(k))))
  }
  return found
}

export async function saveEvals(platform: Platform, owner: string, game: ParsedGame, evals: GameEvals): Promise<void> {
  await request((await store(EVALS, 'readwrite')).put(toStoredEvals(platform, owner, game, evals, Date.now())))
}

/** Deletes the owner's evaluations beyond the newest 50 games. Reads every record once per run. */
export async function evictOld(owner: string): Promise<void> {
  const all: unknown[] = await request((await store(EVALS, 'readonly')).getAll())
  const keys = evictable(all.filter((r): r is StoredEvals => isStoredEvals(r)), owner)
  if (!keys.length) return
  const w = await store(EVALS, 'readwrite')
  await Promise.all(keys.map(k => request(w.delete(k))))
}

/** Stored training attempts by key. Skips records that fail validation. */
export async function loadAttempts(keys: string[]): Promise<Map<string, StoredAttempt>> {
  const s = await store(ATTEMPTS, 'readonly')
  const records: unknown[] = await Promise.all(keys.map(k => request(s.get(k))))
  return new Map(records.filter(isStoredAttempt).map(r => [r.key, r]))
}

export async function saveAttempt(key: string, prev: StoredAttempt | undefined, solved: boolean): Promise<StoredAttempt> {
  const record = nextAttempt(key, prev, solved, Date.now())
  await request((await store(ATTEMPTS, 'readwrite')).put(record))
  return record
}

export async function deleteAll(): Promise<void> {
  const db = await connection?.catch(() => undefined)
  db?.close()
  connection = undefined
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error ?? new Error('Could not delete the stored data.'))
    r.onblocked = () => reject(new Error('Close the other Chess Coach tabs, then try again.'))
  })
}
