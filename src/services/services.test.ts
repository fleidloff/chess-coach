import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseChessComGame } from './chessComApi.ts'
import { parseLichessGame } from './lichessApi.ts'

test('reads a Lichess game and finds the user’s color', () => {
  const raw = {
    id: 'abc',
    variant: 'standard',
    createdAt: 0,
    status: 'mate',
    winner: 'white' as const,
    players: { white: { user: { id: 'fred', name: 'Fred' }, rating: 1500 }, black: { aiLevel: 3 } },
    opening: { name: 'Italian Game' },
    moves: 'e4 e5 Bc4',
  }
  const game = parseLichessGame(raw, 'FRED')!
  assert.equal(game.userColor, 'white')
  assert.equal(game.blackPlayer, 'Stockfish level 3')
  assert.deepEqual(game.moves, ['e4', 'e5', 'Bc4'])
  assert.equal(game.result, '1-0')
  assert.equal(parseLichessGame({ ...raw, variant: 'chess960' }, 'fred'), undefined)
  assert.equal(parseLichessGame(raw, 'someone'), undefined)
})

test('reads a Chess.com game from its PGN', () => {
  const pgn = [
    '[Event "Live Chess"]',
    '[Result "0-1"]',
    '[ECOUrl "https://www.chess.com/openings/Pirc-Defense-Classical-Variation...5.Bc4-O-O"]',
    '',
    '1. e4 {[%clk 0:04:59.9]} 1... e5 {[%clk 0:04:58]} 2. Qh5 Nc6 0-1',
  ].join('\n')
  const raw = {
    url: 'https://www.chess.com/game/live/123',
    pgn,
    end_time: 1_700_000_000,
    rules: 'chess',
    white: { username: 'Opp', rating: 1400, result: 'resigned' },
    black: { username: 'Fred', rating: 1450, result: 'win' },
  }
  const game = parseChessComGame(raw, 'fred')!
  assert.equal(game.id, '123')
  assert.equal(game.userColor, 'black')
  assert.deepEqual(game.moves, ['e4', 'e5', 'Qh5', 'Nc6'])
  assert.equal(game.result, '0-1')
  assert.equal(game.opening, 'Pirc Defense Classical Variation')
  assert.equal(parseChessComGame({ ...raw, rules: 'bughouse' }, 'fred'), undefined)
})
