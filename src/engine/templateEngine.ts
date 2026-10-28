import { Chess } from 'chess.js'
import type { GoodMoveKind, MoveEval, ParsedGame, Score, TacticalTag } from '../types/chess.ts'
import type { MoveFeatures } from './heuristics.ts'
import { findTrap } from './openingDb.ts'

export const TAG_LABEL: Record<TacticalTag, string> = {
  HANGING_PIECE: 'Hanging pieces',
  F2_F7_VULNERABILITY: 'f2/f7 weakness',
  MISSED_FORK: 'Missed forks',
  PIN_EXPLOIT: 'Missed pins',
  BACK_RANK_WEAKNESS: 'Back-rank weakness',
  OPENING_TRAP: 'Opening traps',
  MISSED_MATE: 'Missed mates',
  ALLOWED_MATE: 'Allowed mates',
  ALLOWED_FORK: 'Allowed forks',
  DISCOVERED_ATTACK: 'Discovered attacks',
  MISSED_CAPTURE: 'Missed captures',
  KING_IN_CENTER: 'King in the center',
}

export const KIND_LABEL: Record<GoodMoveKind, string> = {
  TACTICAL_STRIKE: 'Tactical strike',
  DEFENSIVE_SAVE: 'Defensive save',
  CLEAN_CONVERSION: 'Clean conversion',
}

const pawns = (cp: number) => `${cp > 0 ? '+' : cp < 0 ? '−' : ''}${Math.abs(cp / 100).toFixed(1)}`

/** Centipawns as pawns with a sign. ±1000 is the clamp for a forced mate. */
export function formatCp(cp: number): string {
  if (Math.abs(cp) >= 1000) return cp > 0 ? '+M' : '−M'
  return pawns(cp)
}

/** Engine score from White's point of view: "+1.3", "−0.4", "+M3". */
export function formatScore(s: Score): string {
  return s.mate === undefined ? pawns(s.cp ?? 0) : `${s.mate > 0 ? '+' : '−'}M${Math.abs(s.mate)}`
}

/** "5. c3" for White, "4... Qb4+" for Black. */
export function moveNotation(ply: number, san: string, suffix = ''): string {
  return `${Math.floor(ply / 2) + 1}.${ply % 2 ? '..' : ''} ${san}${suffix}`
}

/** The first SAN move of the side that starts the line that matches. */
const firstOwn = (line: string[], match: (san: string) => boolean) => line.find((san, i) => i % 2 === 0 && match(san))

export function generateErrorSummary(move: MoveEval, moves: string[]): string {
  const best = move.bestMoveSan ?? '?'
  if (new Chess(move.fenAfter).isStalemate()) {
    return `Stalemates the opponent. Best was ${best}${move.mateBefore && move.mateBefore > 0 ? `, mate in ${move.mateBefore}` : ''}.`
  }
  switch (move.tag) {
    case 'HANGING_PIECE': {
      if (move.tagMaterial !== 1) return `Leaves a piece where the opponent wins it. Best was ${best}.`
      const capture = firstOwn(move.reply, san => san.includes(`x${move.tagSquares?.[0]}`))
      return capture ? `Loses a pawn to ${capture}.` : `Loses a pawn. Best was ${best}.`
    }
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
    case 'MISSED_MATE':
      return `Misses mate: ${best} mates in ${move.mateBefore}.`
    case 'ALLOWED_MATE':
      return `Walks into a forced mate. Best was ${best}.`
    case 'ALLOWED_FORK':
      return `Allows the fork ${move.reply[0]}.`
    case 'DISCOVERED_ATTACK':
      return move.tagVia === 'reply' ? `Allows the discovered attack ${move.reply[0]}.` : `Misses the discovered attack ${best}.`
    case 'MISSED_CAPTURE':
      if (move.tagMaterial === 1) return `Misses ${best}, which wins a pawn.`
      return best.includes('x') ? `Misses the free capture ${best}.` : `Misses ${best}, which wins material.`
    case 'KING_IN_CENTER': {
      const reply = move.tagVia === 'reply'
      const check = firstOwn(reply ? move.reply : move.bestLine, san => /[+#]/.test(san))
      return reply ? `Leaves the king in the center. ${check ?? move.reply[0]} follows.` : `Misses ${check ?? best} against the king in the center.`
    }
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
  MISSED_MATE: [
    'When you are winning, look at every check first. A forced mate ends the game at once.',
    'Before a slow winning move, count the checks and captures near the enemy king.',
  ],
  ALLOWED_MATE: [
    'Before each move, ask: which checks does my opponent get after it?',
    'When enemy pieces aim at your king, bring one more defender before you attack.',
  ],
  ALLOWED_FORK: [
    'Before each move, look at the squares an enemy knight or queen reaches next move.',
    'Do not leave two pieces loose. A loose piece is a fork target.',
  ],
  DISCOVERED_ATTACK: [
    'When an enemy bishop, rook or queen stands behind its own piece, ask what that piece reveals when it moves.',
    'Look for your own hidden lines: move a piece off the line of your rook or bishop with a threat.',
  ],
  MISSED_CAPTURE: [
    'After each move of your opponent, ask: did a piece of theirs become loose? Take free material.',
    'Count attackers and defenders of every enemy piece you attack.',
  ],
  KING_IN_CENTER: [
    'Castle before you open the center or take pawns with the queen.',
    'When the enemy king is still in the center and its f-pawn has moved, look at Qh5+ or Qh4+ first.',
  ],
}

export const GENERIC_RULE =
  'Before every move, do a blunder check: which checks, captures and threats does my opponent get after this move?'

export function resultFor(game: ParsedGame): 'Win' | 'Loss' | 'Draw' {
  if (game.result === '1/2-1/2') return 'Draw'
  return game.result === (game.userColor === 'white' ? '1-0' : '0-1') ? 'Win' : 'Loss'
}
