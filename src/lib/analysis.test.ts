import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import type { GameRecord } from './lichess.ts'
import { parseGame } from './lichess.ts'
import type { GameAnalysis } from './analysis.ts'
import { annotateGame, buildReport, hangingSquares, isFork, keyMoments, severityOf, winPercent } from './analysis.ts'

test('win chance follows the Lichess curve', () => {
  assert.equal(Math.round(winPercent({ cp: 0 })), 50)
  assert.equal(Math.round(winPercent({ cp: 300 })), 75)
  assert.equal(Math.round(winPercent({ cp: -300 }) + winPercent({ cp: 300 })), 100)
  assert.ok(winPercent({ mate: 2 }) > 97)
  assert.equal(severityOf(16), 'blunder')
  assert.equal(severityOf(4), undefined)
})

test('detects a knight fork and a hanging piece', () => {
  assert.equal(isFork('r3k3/8/8/8/8/8/8/1N2K3 w - - 0 1', 'Nc3'), false)
  assert.equal(isFork('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'Nc7+'), true)
  assert.deepEqual(hangingSquares(new Chess('4k3/8/8/3r4/8/8/3N4/7K b - - 0 1'), 'w'), ['d2'])
  assert.deepEqual(hangingSquares(new Chess('4k3/8/8/3r4/8/8/3N4/3R3K b - - 0 1'), 'w'), [])
})

const scholarsMate: GameRecord = {
  id: 'test1',
  user: 'me',
  createdAt: 0,
  speed: 'blitz',
  rated: true,
  color: 'black',
  result: 'loss',
  status: 'mate',
  opponent: 'opp',
  moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'],
}
const analysis: GameAnalysis = {
  id: 'test1',
  source: 'local',
  depth: 10,
  evals: [{ cp: 20 }, { cp: 30 }, { cp: 25 }, { cp: 30 }, { cp: 30 }, { cp: 0 }, { mate: 1 }, { mate: 1 }],
  lines: [undefined, undefined, undefined, undefined, undefined, ['g6'], ['Qxf7#'], undefined],
}

test('tags the move that allows mate and builds a plan', () => {
  const blunder = annotateGame(scholarsMate, analysis).find(m => m.san === 'Nf6')!
  assert.equal(blunder.severity, 'blunder')
  assert.equal(blunder.best, 'g6')
  assert.ok(blunder.tags.includes('allowedMate'))

  const report = buildReport([scholarsMate], new Map([[analysis.id, analysis]]), { result: 'loss', speed: '' })
  assert.equal(report.mistakes.length, 1)
  assert.equal(report.weaknesses[0].id, 'allowedMate')
  assert.equal(report.plans[0].title, 'Königssicherheit verbessern')
})

test('reads a Lichess game from the user\'s side', () => {
  const game = parseGame(
    {
      id: 'abc',
      rated: true,
      variant: 'standard',
      speed: 'blitz',
      createdAt: 1,
      status: 'resign',
      winner: 'white',
      players: { white: { user: { id: 'opp', name: 'Opp' }, rating: 1500 }, black: { user: { id: 'me', name: 'Me' }, rating: 1400 } },
      moves: 'e4 e5',
      analysis: [{ eval: 30 }, { mate: -3, variation: 'Nf3', judgment: { name: 'Blunder' } }],
    },
    'Me',
  )!
  assert.equal(game.color, 'black')
  assert.equal(game.result, 'loss')
  assert.deepEqual(game.lichessEvals?.map(e => e.cp ?? e.mate), [30, -3])
})

test('key moments mix good and bad in game order', () => {
  const asBlack = keyMoments(scholarsMate, analysis)
  assert.deepEqual(asBlack.map(m => [m.kind, m.ply, m.good]), [['mistake', 5, false], ['end', 7, false]])
  const asWhite = keyMoments({ ...scholarsMate, color: 'white', result: 'win' }, analysis)
  assert.deepEqual(asWhite.map(m => [m.kind, m.ply, m.good]), [['punish', 6, true], ['end', 7, true]])
})
