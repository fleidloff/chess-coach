import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import type { GameEvals, ParsedGame, PositionEval } from '../types/chess.ts'
import { tagBlunder } from './heuristics.ts'
import { OPENING_TRAPS } from './openingDb.ts'
import { aggregate, toCp, winChance } from './patternAggregator.ts'
import { parseInfo, terminalScore } from './uci.ts'
import { formatScore, RULES } from './templateEngine.ts'
import { judge, trainingPositions } from './trainer.ts'

test('every opening trap is legal, and its refutation too', () => {
  for (const trap of OPENING_TRAPS) {
    const chess = new Chess()
    for (const m of [...trap.moves, trap.refutation]) assert.doesNotThrow(() => chess.move(m), `${trap.name}: ${m}`)
  }
})

test('reads UCI info lines from White’s point of view', () => {
  assert.deepEqual(parseInfo('info depth 10 multipv 1 score cp 35 nodes 9 pv e7e5 g1f3', false), {
    index: 0,
    score: { cp: -35 },
    pv: ['e7e5', 'g1f3'],
  })
  assert.equal(parseInfo('info depth 10 multipv 2 score mate 3 pv d1h5', true)?.score.mate, 3)
  assert.equal(parseInfo('info depth 10 score cp 20 lowerbound pv e2e4', true), undefined)
  assert.deepEqual(terminalScore('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'), { mate: -1 })
  assert.equal(toCp({ mate: -4 }), -1000)
  assert.equal(toCp({ cp: 2500 }), 1000)
})

test('the eval bar shows White’s win chance and the score', () => {
  assert.equal(winChance({ cp: 0 }), 50)
  assert.equal(Math.round(winChance({ cp: 300 })), 75)
  assert.equal(Math.round(winChance({ cp: -300 })), 25)
  assert.equal(winChance({ mate: 3 }), 100)
  assert.equal(winChance({ mate: -1 }), 0)
  assert.equal(formatScore({ cp: 1250 }), '+12.5')
  assert.equal(formatScore({ cp: -40 }), '−0.4')
  assert.equal(formatScore({ mate: -2 }), '−M2')
})

const tag = (fenBefore: string, san: string, bestMoveUci?: string, replyUci?: string) =>
  tagBlunder({ moves: [san], ply: 0, fenBefore, bestMoveUci, replyUci })

test('tags the pattern behind a blunder', () => {
  assert.deepEqual(tag('4k3/8/8/4p3/8/8/8/2B1K3 w - - 0 1', 'Bf4', 'c1d2', 'e5f4'), { tag: 'HANGING_PIECE', squares: ['f4'] })
  assert.equal(tag('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'Kd2', 'b5c7')?.tag, 'MISSED_FORK')
  assert.deepEqual(tag('4k3/3n4/8/8/8/8/8/4KB2 w - - 0 1', 'Kd2', 'f1b5'), { tag: 'PIN_EXPLOIT', squares: ['b5', 'd7'] })
  assert.equal(tag('r5k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'Rd7', 'd1d8', 'a8a1')?.tag, 'BACK_RANK_WEAKNESS')
  assert.equal(
    tag('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3', 'Nd4', 'g8f6', 'f3f7')?.tag,
    'F2_F7_VULNERABILITY',
  )
  const englund = ['d4', 'e5', 'dxe5', 'Nc6', 'Nf3', 'Qe7', 'Bf4', 'Qb4+', 'c3']
  assert.equal(tagBlunder({ moves: englund, ply: 8, fenBefore: '' })?.tag, 'OPENING_TRAP')
  assert.equal(tag('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1', 'Bd2', 'c1e3'), undefined)
})

const scholar = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']
const game = (userColor: 'white' | 'black'): ParsedGame => ({
  id: userColor,
  platform: 'lichess',
  url: '',
  pgn: '',
  moves: scholar,
  whitePlayer: 'w',
  blackPlayer: 'b',
  userColor,
  date: '2026-10-27T00:00:00.000Z',
  result: '1-0',
})
const p = (cp: number | undefined, pv: string[], mate?: number): PositionEval => ({ score: { cp, mate }, pv })
const evals: GameEvals = {
  depth: 14,
  positions: [
    p(30, ['e2e4']),
    p(30, ['e7e5']),
    p(30, ['g1f3']),
    p(30, ['g8f6']),
    p(30, ['d1h5']),
    p(0, ['g7g6', 'h5f3']),
    p(undefined, ['h5f7'], 1),
    p(undefined, [], 1),
  ],
}

test('builds the report for the losing side', () => {
  const result = aggregate([game('black')], new Map([['black', evals]]))
  assert.equal(result.tagFrequencies.OPENING_TRAP, 1)
  const report = result.reports.get('black')!
  assert.equal(report.topErrors.length, 1)
  const [error] = report.topErrors
  assert.equal(error.moveNotation, '3... Nf6??')
  assert.equal(error.tag, 'OPENING_TRAP')
  assert.equal(error.batchFrequency, 1)
  assert.match(error.summary, /Scholar's Mate. Correct was g6/)
  assert.deepEqual(error.branches[1].moves, ['Nf6', 'Qxf7#'])
  assert.deepEqual(report.actionableDrills, RULES.OPENING_TRAP)
  assert.equal(report.goodMoves.length, 0)
})

test('builds the report for the winning side', () => {
  const report = aggregate([game('white')], new Map([['white', evals]])).reports.get('white')!
  assert.equal(report.topErrors.length, 0)
  assert.deepEqual(
    report.goodMoves.map(g => [g.moveNotation, g.kind]),
    [['4. Qxf7#', 'CLEAN_CONVERSION']],
  )
  assert.deepEqual(report.actionableDrills, [])
})

test('tags the patterns of PRD 0003', () => {
  const backRankMate = tagBlunder({ moves: ['h3'], ply: 0, fenBefore: '6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1', bestMoveUci: 'd1d8', mateBefore: 1 })
  assert.deepEqual(backRankMate, { tag: 'MISSED_MATE', squares: ['d8'], via: 'best' })
  const smothered = tagBlunder({ moves: ['a3'], ply: 0, fenBefore: '6k1/8/8/8/6n1/8/P5PP/6RK w - - 0 1', replyUci: 'g4f2', mateAfter: -1 })
  assert.equal(smothered?.tag, 'ALLOWED_MATE')
  assert.deepEqual(tag('4k3/8/8/8/1n6/8/3K4/R7 w - - 0 1', 'Ke3', undefined, 'b4c2'), {
    tag: 'ALLOWED_FORK',
    squares: ['c2', 'e3', 'a1'],
    via: 'reply',
  })
  assert.deepEqual(tag('b3k3/8/8/3n4/8/8/P7/K6Q w - - 0 1', 'a3', undefined, 'd5f4'), {
    tag: 'DISCOVERED_ATTACK',
    squares: ['d5', 'h1'],
    via: 'reply',
  })
  assert.deepEqual(tag('7k/8/8/3n4/8/8/P7/3R2K1 w - - 0 1', 'a3', 'd1d5'), { tag: 'MISSED_CAPTURE', squares: ['d5'], via: 'best' })
})

test('a lost mate is an error even in a won position', () => {
  const won = { ...game('white'), id: 'mate', moves: ['e4'] }
  const result = aggregate([won], new Map([['mate', { depth: 14, positions: [p(undefined, ['d2d4'], 2), p(600, ['e7e5'])] }]]))
  const [error] = result.reports.get('mate')!.topErrors
  assert.equal(error.tag, 'MISSED_MATE')
  assert.equal(error.summary, 'Misses mate: d4 mates in 2.')
  assert.deepEqual([result.errorCount, result.untaggedCount], [1, 0])
})

test('counts material along the engine line, so x-ray defenders do not hide a loss', () => {
  // From a real game: ...b6 opens the long diagonal, and Qxa8 Qxa8 Bxa8 wins the exchange.
  const fenBefore = 'r2q1rk1/pp1n1ppp/8/3Q4/8/5B1P/PP3PP1/2R2RK1 b - - 0 17'
  const result = tagBlunder({ moves: ['b6'], ply: 0, fenBefore, replyUci: 'd5a8', replyLine: ['d5a8', 'd8a8', 'f3a8', 'd7f6'] })
  assert.deepEqual(result, { tag: 'HANGING_PIECE', squares: ['a8'], via: 'reply', material: 5 })
})

test('a pawn that the best line wins counts as a missed capture', () => {
  // From a real game: 7... g6 misses the Nxe4 trick.
  const fenBefore = 'r1bqkb1r/p3pppp/2pp1n2/8/2B1P3/8/PPP2PPP/RNBQ1RK1 b kq - 1 7'
  const result = tagBlunder({
    moves: ['g6'],
    ply: 0,
    fenBefore,
    bestMoveUci: 'f6e4',
    bestLine: ['f6e4', 'c4e2', 'e4f6', 'c2c4', 'e7e5'],
    replyUci: 'e4e5',
    replyLine: ['e4e5', 'f6e4', 'e5d6', 'e4d6', 'd1d4'],
  })
  assert.deepEqual(result, { tag: 'MISSED_CAPTURE', squares: ['e4'], via: 'best', material: 1 })
})

test('picks training positions and judges a move against the best move', () => {
  const black = game('black')
  const { errorsByGame } = aggregate([black], new Map([['black', evals]]))
  const positions = trainingPositions([black], errorsByGame, 'OPENING_TRAP')
  assert.deepEqual(
    positions.map(p => [p.ply, p.playedNotation, p.bestMoveSan, p.userColor]),
    [[5, '3... Nf6??', 'g6', 'black']],
  )
  assert.deepEqual(trainingPositions([black], errorsByGame, 'MISSED_FORK'), [])
  assert.deepEqual(judge('black', { cp: -40 }, { cp: -60 }), { correct: true, cp: 60, loss: 0 })
  assert.deepEqual(judge('black', { cp: -40 }, { cp: -10 }), { correct: true, cp: 10, loss: 30 })
  assert.deepEqual(judge('white', { cp: 200 }, { mate: -2 }), { correct: false, cp: -1000, loss: 1200 })
})

test('picks the worst errors and the best good moves, then lists them in game order', () => {
  // White drops 200, 180, 320 and 160 cp on plies 0, 2, 4 and 6; Black answers each drop with the best move.
  const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4']
  const cps = [0, -200, -200, -380, -380, -700, -700, -860, -860, -860, -860]
  const positions = cps.map((cp, i) => p(cp, [i % 2 ? 'a7a6' : 'd2d4']))
  const result = aggregate(
    [
      { ...game('white'), id: 'w', moves },
      { ...game('black'), id: 'b', moves },
    ],
    new Map([
      ['w', { depth: 14, positions }],
      ['b', { depth: 14, positions }],
    ]),
  )
  assert.deepEqual(result.reports.get('w')!.topErrors.map(e => e.ply), [0, 2, 4])
  assert.deepEqual(result.reports.get('b')!.goodMoves.map(g => g.ply), [1, 3, 5])
})
