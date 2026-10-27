import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ParsedGame } from '../types/chess.ts'
import { evictable, isStoredEvals, isStoredGames, ownerKey, toStoredEvals, usableEvals } from './storeRecords.ts'

const game: ParsedGame = {
  id: 'g1',
  platform: 'lichess',
  url: 'https://lichess.org/g1/white',
  pgn: '',
  moves: ['e4', 'e5'],
  whitePlayer: 'Fred',
  blackPlayer: 'Opp',
  userColor: 'white',
  date: '2026-10-27T10:00:00.000Z',
  result: '1-0',
}
const evals = { depth: 14, positions: [{ score: { cp: 20 }, pv: ['e2e4'] }, { score: { cp: 30 }, pv: ['e7e5'] }, { score: { mate: 3 }, pv: [], second: { cp: 10 } }] }

test('stores and validates an evaluation', () => {
  const owner = ownerKey('lichess', 'Fred')
  assert.equal(owner, 'lichess:fred')
  const record = toStoredEvals('lichess', owner, game, evals, 1)
  assert.equal(record.key, 'lichess:g1')
  assert.ok(isStoredEvals(JSON.parse(JSON.stringify(record))))
  assert.deepEqual(usableEvals(record, game), evals)
  assert.equal(usableEvals({ ...record, engine: 'stockfish-18' }, game), undefined)
  assert.equal(usableEvals(record, { ...game, moves: ['e4'] }), undefined)
  assert.equal(isStoredEvals({ ...record, schema: 2 }), false)
  assert.equal(isStoredEvals({ ...record, positions: [{ score: {}, pv: [] }] }), false)
  assert.equal(isStoredEvals({ ...record, depth: '14' }), false)
})

test('validates a stored game list', () => {
  const stored = { schema: 1, key: 'lichess:fred', games: [game], fetchedAt: 1 }
  assert.ok(isStoredGames(stored))
  assert.equal(isStoredGames({ ...stored, games: [{ ...game, moves: [] }] }), false)
  assert.equal(isStoredGames({ ...stored, games: [{ ...game, userColor: 'red' }] }), false)
  assert.equal(isStoredGames(null), false)
})

test('evicts the owner’s oldest games only', () => {
  const records = [
    { key: 'a', owner: 'lichess:fred', date: '2026-10-01' },
    { key: 'b', owner: 'lichess:fred', date: '2026-10-03' },
    { key: 'c', owner: 'lichess:fred', date: '2026-10-02' },
    { key: 'd', owner: 'lichess:opp', date: '2020-01-01' },
  ]
  assert.deepEqual(evictable(records, 'lichess:fred', 2), ['a'])
  assert.deepEqual(evictable(records, 'lichess:fred', 5), [])
})
