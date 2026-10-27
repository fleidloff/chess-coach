import { Chess } from 'chess.js'
import type {
  BatchAnalysisResult,
  FeedbackNode,
  GameEvals,
  GameReport,
  MoveEval,
  ParsedGame,
  Score,
  TacticalTag,
} from '../types/chess.ts'
import { lostMate, moveFeatures, playMove, tagBlunder, type TagResult, uciToSan } from './heuristics.ts'
import {
  conversionSummary,
  generateErrorSummary,
  GENERIC_RULE,
  moveNotation,
  RULES,
  saveSummary,
  strikeSummary,
  TAG_LABEL,
} from './templateEngine.ts'

export const QUICK_DEPTH = 10
export const DEEP_DEPTH = 14
export const BLUNDER_CPL = 150
const MAX_ITEMS = 3
const ARROW_PLAYED = 'rgba(220, 38, 38, 0.85)'
const ARROW_BEST = 'rgba(22, 163, 74, 0.85)'

/** Centipawns from White's point of view, clamped to ±1000. A forced mate counts as ±1000. */
export function toCp(s: Score): number {
  if (s.mate !== undefined) return s.mate > 0 ? 1000 : -1000
  return Math.max(-1000, Math.min(1000, s.cp ?? 0))
}

/** A move that loses 150 cp or more, unless the mover is still clearly winning after it. */
export const isBlunder = (m: MoveEval) => m.cpl >= BLUNDER_CPL && m.cpAfter < 500 && m.bestMoveSan !== m.san

/** A lost mate in 3 or less is an error even when the mover is still winning (PRD 0003). */
export const isMissedMate = (m: MoveEval) => m.bestMoveSan !== m.san && lostMate(m.mateBefore, m.mateAfter)

export const isError = (m: MoveEval) => isBlunder(m) || isMissedMate(m)

export function evaluateMoves(game: ParsedGame, evals: GameEvals): MoveEval[] {
  const chess = new Chess()
  const out: MoveEval[] = []
  game.moves.forEach((san, ply) => {
    const before = evals.positions[ply]
    const after = evals.positions[ply + 1]
    const fenBefore = chess.fen()
    chess.move(san)
    const fenAfter = chess.fen()
    if (!before || !after) return
    const color = ply % 2 ? 'black' : 'white'
    const sign = color === 'white' ? 1 : -1
    const cpBefore = sign * toCp(before.score)
    const cpAfter = sign * toCp(after.score)
    const bestLine = uciToSan(fenBefore, before.pv)
    const move: MoveEval = {
      ply,
      san,
      color,
      fenBefore,
      fenAfter,
      cpBefore,
      cpAfter,
      cpl: Math.max(0, cpBefore - cpAfter),
      bestMoveUci: before.pv[0],
      bestMoveSan: bestLine[0],
      bestLine,
      reply: uciToSan(fenAfter, after.pv),
      cpSecond: before.second && sign * toCp(before.second),
      mateBefore: before.score.mate === undefined ? undefined : sign * before.score.mate,
      mateAfter: after.score.mate === undefined ? undefined : sign * after.score.mate,
    }
    if (color === game.userColor && isError(move)) {
      const bestTo = move.bestMoveUci?.slice(2, 4)
      const tagged: (Omit<TagResult, 'squares'> & { squares: string[] }) | undefined = isBlunder(move)
        ? tagBlunder({
            moves: game.moves,
            ply,
            fenBefore,
            bestMoveUci: before.pv[0],
            replyUci: after.pv[0],
            bestLine: before.pv,
            replyLine: after.pv,
            mateBefore: move.mateBefore,
            mateAfter: move.mateAfter,
          })
        : { tag: 'MISSED_MATE' as const, squares: bestTo ? [bestTo] : [], via: 'best' as const }
      move.tag = tagged?.tag
      move.tagSquares = tagged?.squares
      move.tagVia = tagged?.via
      move.tagMaterial = tagged?.material
    }
    out.push(move)
  })
  return out
}

function arrow(fen: string, move: string | undefined, color: string) {
  const r = move ? playMove(fen, move) : undefined
  return r ? [{ from: r.move.from, to: r.move.to, color }] : []
}

function errorNode(m: MoveEval, moves: string[], freq: Record<TacticalTag, number>): FeedbackNode {
  return {
    ply: m.ply,
    moveNotation: moveNotation(m.ply, m.san, '??'),
    summary: generateErrorSummary(m, moves),
    fen: m.fenBefore,
    cpl: m.cpl,
    tag: m.tag,
    batchFrequency: m.tag && freq[m.tag],
    arrows: [...arrow(m.fenBefore, m.san, ARROW_PLAYED), ...arrow(m.fenBefore, m.bestMoveUci, ARROW_BEST)],
    highlightSquares: m.tagSquares ?? [],
    branches: [
      ...(m.bestLine.length ? [{ label: 'Best line', moves: m.bestLine }] : []),
      { label: 'Your move and the reply', moves: [m.san, ...m.reply] },
    ],
  }
}

function goodMoves(game: ParsedGame, moves: MoveEval[]): FeedbackNode[] {
  const won = game.result === (game.userColor === 'white' ? '1-0' : '0-1')
  const picked: { node: FeedbackNode; score: number }[] = []
  let conversions = 0
  for (const m of moves) {
    if (m.color !== game.userColor || m.cpl > 30) continue
    const f = moveFeatures(m.fenBefore, m.san)
    const prev = moves[m.ply - 1]
    const node = (kind: FeedbackNode['kind'], summary: string): FeedbackNode => ({
      ply: m.ply,
      moveNotation: moveNotation(m.ply, m.san, kind === 'CLEAN_CONVERSION' ? '' : '!'),
      summary,
      fen: m.fenBefore,
      cpl: m.cpl,
      kind,
      arrows: arrow(m.fenBefore, m.san, ARROW_BEST),
      highlightSquares: [],
      branches: m.reply.length ? [{ label: 'Continuation', moves: [m.san, ...m.reply] }] : [],
    })
    const onlyMove = m.cpSecond !== undefined && m.bestMoveSan === m.san && m.cpBefore - m.cpSecond >= BLUNDER_CPL
    if (f.mate) {
      picked.push({ node: node('CLEAN_CONVERSION', conversionSummary(f, m)), score: 1000 })
    } else if (prev && isBlunder(prev)) {
      picked.push({ node: node('TACTICAL_STRIKE', strikeSummary(f, m, moveNotation(prev.ply, prev.san))), score: prev.cpl })
    } else if (onlyMove && m.cpBefore <= 50) {
      picked.push({ node: node('DEFENSIVE_SAVE', saveSummary(m)), score: m.cpBefore - m.cpSecond! })
    } else if (onlyMove) {
      picked.push({ node: node('TACTICAL_STRIKE', strikeSummary(f, m)), score: m.cpBefore - m.cpSecond! })
    } else if (won && f.capture && m.cpBefore >= 300 && m.cpl <= 20 && conversions === 0) {
      conversions++
      picked.push({ node: node('CLEAN_CONVERSION', conversionSummary(f, m)), score: 50 })
    }
  }
  return picked
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ITEMS)
    .map(p => p.node)
    .sort((a, b) => a.ply - b.ply)
}

/** The most frequent tag across all games. A tag in the shown game wins a tie. */
export function topTag(freq: Record<TacticalTag, number>, inGame: Set<TacticalTag>): TacticalTag | undefined {
  const tags = (Object.keys(freq) as TacticalTag[]).filter(t => freq[t] > 0)
  return tags.sort((a, b) => freq[b] - freq[a] || Number(inGame.has(b)) - Number(inGame.has(a)))[0]
}

export function buildReport(game: ParsedGame, evals: GameEvals, moves: MoveEval[], freq: Record<TacticalTag, number>): GameReport {
  const errors = moves.filter(m => m.color === game.userColor && isError(m))
  const top = topTag(freq, new Set(errors.flatMap(m => (m.tag ? [m.tag] : []))))
  return {
    gameId: game.id,
    userColor: game.userColor,
    opponentName: game.userColor === 'white' ? game.blackPlayer : game.whitePlayer,
    result: game.result,
    depth: evals.depth,
    topErrors: errors
      .sort((a, b) => Number(isBlunder(b)) - Number(isBlunder(a)) || b.cpl - a.cpl)
      .slice(0, MAX_ITEMS)
      .sort((a, b) => a.ply - b.ply)
      .map(m => errorNode(m, game.moves, freq)),
    goodMoves: goodMoves(game, moves),
    actionableDrills: top ? RULES[top] : errors.length ? [GENERIC_RULE] : [],
    focusTag: top,
  }
}

export const emptyFrequencies = (): Record<TacticalTag, number> =>
  Object.fromEntries(Object.keys(TAG_LABEL).map(t => [t, 0])) as Record<TacticalTag, number>

/** Counts in how many games each tag appears and builds a report for every analysed game. */
export function aggregate(games: ParsedGame[], evals: Map<string, GameEvals>): BatchAnalysisResult {
  const analysed = games.flatMap(g => {
    const e = evals.get(g.id)
    return e ? [{ game: g, evals: e, moves: evaluateMoves(g, e) }] : []
  })
  const tagFrequencies = emptyFrequencies()
  for (const { moves } of analysed) {
    for (const tag of new Set(moves.flatMap(m => (m.tag ? [m.tag] : [])))) tagFrequencies[tag]++
  }
  const errorsByGame = new Map(analysed.map(a => [a.game.id, a.moves.filter(m => m.color === a.game.userColor && isError(m))]))
  const errors = [...errorsByGame.values()].flat()
  return {
    errorsByGame,
    tagFrequencies,
    errorCount: errors.length,
    untaggedCount: errors.filter(m => !m.tag).length,
    analysedGames: analysed.length,
    reports: new Map(analysed.map(a => [a.game.id, buildReport(a.game, a.evals, a.moves, tagFrequencies)])),
  }
}
