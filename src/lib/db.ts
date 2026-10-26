import type { GameRecord } from './lichess.ts'
import type { GameAnalysis, PuzzleRecord } from './analysis.ts'

const DB_NAME = 'chess-coach'
const DB_VERSION = 1
export const EXPORT_FORMAT = 'chess-coach-export'
export const EXPORT_VERSION = 1

interface Stores {
  games: GameRecord
  analyses: GameAnalysis
  puzzles: PuzzleRecord
}
type StoreName = keyof Stores

let dbPromise: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of ['games', 'analyses', 'puzzles']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
}

export async function getAll<S extends StoreName>(store: S): Promise<Stores[S][]> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putMany<S extends StoreName>(store: S, values: Stores[S][]): Promise<void> {
  if (!values.length) return
  const tx = (await open()).transaction(store, 'readwrite')
  for (const v of values) tx.objectStore(store).put(v)
  return done(tx)
}

export async function deleteMany(store: StoreName, ids: string[]): Promise<void> {
  const tx = (await open()).transaction(store, 'readwrite')
  for (const id of ids) tx.objectStore(store).delete(id)
  return done(tx)
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT
  version: number
  exportedAt: string
  games: GameRecord[]
  analyses: GameAnalysis[]
  puzzles: PuzzleRecord[]
}

export async function exportAll(): Promise<ExportFile> {
  const [games, analyses, puzzles] = await Promise.all([getAll('games'), getAll('analyses'), getAll('puzzles')])
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), games, analyses, puzzles }
}

const hasId = (v: unknown): boolean => typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string'

/** Validates an export file and writes it. Existing records with the same id are replaced. */
export async function importAll(data: unknown): Promise<number> {
  const file = data as Partial<ExportFile>
  if (file?.format !== EXPORT_FORMAT) throw new Error('Diese Datei ist kein Chess-Coach-Export.')
  if (typeof file.version !== 'number' || file.version > EXPORT_VERSION) {
    throw new Error('Dieser Export stammt aus einer neueren Version von Chess Coach. Aktualisiere zuerst die App.')
  }
  const games = Array.isArray(file.games) ? file.games.filter(g => hasId(g) && Array.isArray(g.moves) && typeof g.user === 'string') : []
  const analyses = Array.isArray(file.analyses) ? file.analyses.filter(a => hasId(a) && Array.isArray(a.evals)) : []
  const puzzles = Array.isArray(file.puzzles) ? file.puzzles.filter(p => hasId(p) && typeof p.fen === 'string') : []
  await putMany('games', games)
  await putMany('analyses', analyses)
  await putMany('puzzles', puzzles)
  return games.length
}
