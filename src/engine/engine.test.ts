import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import type { GameEvals, ParsedGame, PositionEval } from '../types/chess.ts'
import { tagBlunder } from './heuristics.ts'
import { OPENING_TRAPS } from './openingDb.ts'
import { aggregate, toCp } from './patternAggregator.ts'
import { parseInfo, terminalScore } from './uci.ts'
import { RULES } from './templateEngine.ts'

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
