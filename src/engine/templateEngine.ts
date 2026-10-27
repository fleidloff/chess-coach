import type { GoodMoveKind, MoveEval, ParsedGame, TacticalTag } from '../types/chess.ts'
import type { MoveFeatures } from './heuristics.ts'
import { findTrap } from './openingDb.ts'

export const TAG_LABEL: Record<TacticalTag, string> = {
  HANGING_PIECE: 'Hanging pieces',
  F2_F7_VULNERABILITY: 'f2/f7 weakness',
  MISSED_FORK: 'Missed forks',
  PIN_EXPLOIT: 'Missed pins',
  BACK_RANK_WEAKNESS: 'Back-rank weakness',
  OPENING_TRAP: 'Opening traps',
}

export const KIND_LABEL: Record<GoodMoveKind, string> = {
  TACTICAL_STRIKE: 'Tactical strike',
  DEFENSIVE_SAVE: 'Defensive save',
  CLEAN_CONVERSION: 'Clean conversion',
}

/** Centipawns as pawns with a sign. ±1000 is the clamp for a forced mate. */
export function formatCp(cp: number): string {
  if (Math.abs(cp) >= 1000) return cp > 0 ? '+M' : '−M'
  return `${cp > 0 ? '+' : cp < 0 ? '−' : ''}${Math.abs(cp / 100).toFixed(1)}`
}

/** "5. c3" for White, "4... Qb4+" for Black. */
export function moveNotation(ply: number, san: string, suffix = ''): string {
  return `${Math.floor(ply / 2) + 1}.${ply % 2 ? '..' : ''} ${san}${suffix}`
}

export function generateErrorSummary(move: MoveEval, moves: string[]): string {
  const best = move.bestMoveSan ?? '?'
  switch (move.tag) {
    case 'HANGING_PIECE':
      return `Leaves a piece where the opponent wins it. Best was ${best}.`
    case 'F2_F7_VULNERABILITY':
      return `Weakens ${move.color === 'white' ? 'f2' : 'f7'} while the king is still in the center. Best was ${best}.`
    case 'OPENING_TRAP':
      return `Falls into the ${findTrap(moves, move.ply)?.name ?? 'opening trap'}. Correct was ${best}.`
    case 'MISSED_FORK':
      return `Misses the fork ${best}.`
    case 'PIN_EXPLOIT':
      return `Misses the pin ${best}.`
    case 'BACK_RANK_WEAKNESS':
      return `Leaves the back rank open to a check. Best was ${best}.`
    default:
      return `Tactical error. Best was ${best}.`
  }
}

function featureText(f: MoveFeatures): string {
  if (f.fork) return 'Forks two targets'
  if (f.pin) return 'Pins a piece'
  if (f.capture && f.check) return 'Captures with check'
  if (f.capture) return 'Wins material'
  if (f.check) return 'Strikes with check'
  return 'Finds the best move'
}

export function strikeSummary(f: MoveFeatures, move: MoveEval, punished?: string): string {
  const what = featureText(f)
  return punished
    ? `${what} after ${punished}. Your eval goes to ${formatCp(move.cpAfter)}.`
    : `${what}. The only move that keeps ${formatCp(move.cpAfter)}.`
}

export function saveSummary(move: MoveEval): string {
  return `The only move that holds. The next best move gives ${formatCp(move.cpSecond ?? 0)}.`
}

export function conversionSummary(f: MoveFeatures, move: MoveEval): string {
  if (f.mate) return 'Checkmate. Clean finish.'
  return `Simplifies while ahead and keeps ${formatCp(move.cpAfter)}.`
}

export const RULES: Record<TacticalTag, [string, string]> = {
  HANGING_PIECE: [
    'Before you let go of a piece, count: is its new square attacked more often than it is defended?',
    'After each move of your opponent, ask: which of my pieces does this move attack?',
  ],
  F2_F7_VULNERABILITY: [
    'Castle before move 10. Until then, keep the king knight on f3/f6 to guard f2/f7.',
    'Do not move the f-pawn or the king before you castle.',
  ],
  MISSED_FORK: [
    'Before each quiet move, list all your checks, captures and threats.',
    'Look for one square from which a knight or queen hits two loose pieces.',
  ],
  PIN_EXPLOIT: [
    'When the enemy king or queen stands on an open line, look for a bishop or rook move that pins the piece in front.',
    'Attack a pinned piece again with a pawn. It cannot run away.',
  ],
  BACK_RANK_WEAKNESS: [
    'When the queens or rooks come off, make an escape square for your king (h3/h6) at the next quiet moment.',
    'Before a rook leaves the back rank, check which enemy piece can give check there.',
  ],
  OPENING_TRAP: [
    'Study the trap from the error card: play the first moves on the board until you know the refutation.',
    'In the opening, when the opponent offers material too easily, look for the trap before you take.',
  ],
}

export const GENERIC_RULE =
  'Before every move, do a blunder check: which checks, captures and threats does my opponent get after this move?'

export function resultFor(game: ParsedGame): 'Win' | 'Loss' | 'Draw' {
  if (game.result === '1/2-1/2') return 'Draw'
  return game.result === (game.userColor === 'white' ? '1-0' : '0-1') ? 'Win' : 'Loss'
}
