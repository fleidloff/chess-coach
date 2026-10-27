import type { Color, MoveEval, ParsedGame, Platform, Score, TacticalTag } from '../types/chess.ts'
import { toCp } from './patternAggregator.ts'
import { moveNotation } from './templateEngine.ts'

export const TRAIN_MAX = 10
export const TRAIN_DEPTH = 12
/** A move counts as correct when it loses at most this much against the best move. */
export const TRAIN_TOLERANCE = 30

export interface TrainingPosition {
  platform: Platform
  gameId: string
  ply: number
  /** Position before the user's error, user to move. */
  fen: string
  userColor: Color
  playedNotation: string
  bestMoveSan: string
  bestLine: string[]
  opponent: string
  date: string
}

/** The user's errors with this tag, newest game first, in move order within a game. */
export function trainingPositions(games: ParsedGame[], errorsByGame: Map<string, MoveEval[]>, tag: TacticalTag): TrainingPosition[] {
  return games
    .flatMap(g =>
      (errorsByGame.get(g.id) ?? [])
        .filter(m => m.tag === tag && m.bestMoveSan)
        .sort((a, b) => a.ply - b.ply)
        .map(m => ({
          platform: g.platform,
          gameId: g.id,
          ply: m.ply,
          fen: m.fenBefore,
          userColor: g.userColor,
          playedNotation: moveNotation(m.ply, m.san, '??'),
          bestMoveSan: m.bestMoveSan!,
          bestLine: m.bestLine,
          opponent: g.userColor === 'white' ? g.blackPlayer : g.whitePlayer,
          date: g.date,
        })),
    )
    .slice(0, TRAIN_MAX)
}

/** Compares the positions after the user's move and after the best move, both searched at the same depth. */
export function judge(color: Color, afterBest: Score, afterMove: Score): { correct: boolean; cp: number; loss: number } {
  const sign = color === 'white' ? 1 : -1
  const cp = sign * toCp(afterMove)
  const loss = Math.max(0, sign * toCp(afterBest) - cp)
  return { correct: loss <= TRAIN_TOLERANCE, cp, loss }
}
