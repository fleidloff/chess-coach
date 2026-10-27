import { Chess } from 'chess.js'
import type { Score } from '../types/chess.ts'

/** Score of a finished position, or undefined when the game goes on. */
export function terminalScore(fen: string): Score | undefined {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) return { mate: chess.turn() === 'w' ? -1 : 1 }
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return { cp: 0 }
}

/** Parses one UCI "info" line into a White-relative score and line. */
export function parseInfo(line: string, whiteToMove: boolean): { index: number; score: Score; pv: string[] } | undefined {
  if (!line.startsWith('info') || !line.includes(' pv ') || / (lower|upper)bound/.test(line)) return
  const t = line.split(' ')
  const at = t.indexOf('score')
  const value = Number(t[at + 2]) * (whiteToMove ? 1 : -1)
  return {
    index: Number(t[t.indexOf('multipv') + 1] || 1) - 1,
    score: t[at + 1] === 'mate' ? { mate: value } : { cp: value },
    pv: t.slice(t.indexOf('pv') + 1),
  }
}
