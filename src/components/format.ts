import { Chess } from 'chess.js'
import type { Result } from '../lib/lichess.ts'

export const RESULT_LABEL: Record<Result, string> = { win: 'Sieg', loss: 'Niederlage', draw: 'Remis' }

export const SPEED_LABEL: Record<string, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Schnellschach',
  classical: 'Klassisch',
  correspondence: 'Fernschach',
}

export const formatDate = (ms: number) => new Date(ms).toLocaleDateString('de-DE')

export const formatPct = (x: number | undefined) => (x === undefined ? '–' : `${Math.round(x)} %`)

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

const TO_GERMAN: Record<string, string> = { N: 'S', B: 'L', R: 'T', Q: 'D' }
const FROM_GERMAN: Record<string, string> = { S: 'N', L: 'B', T: 'R', D: 'Q' }

/** SAN with German piece letters (S, L, T, D). */
export const de = (san: string) => san.replace(/[NBRQ]/g, c => TO_GERMAN[c])

/** Accepts German or English piece letters and returns English SAN. */
export const fromGerman = (input: string) => input.trim().replace(/[SLTD]/g, c => FROM_GERMAN[c])

export const ARROW_PLAYED = 'rgba(220, 60, 60, 0.85)'
export const ARROW_NEUTRAL = 'rgba(80, 120, 200, 0.7)'
export const ARROW_BEST = 'rgba(40, 160, 80, 0.85)'

export function squaresOf(fen: string, san: string): { startSquare: string; endSquare: string } | undefined {
  try {
    const m = new Chess(fen).move(san)
    return { startSquare: m.from, endSquare: m.to }
  } catch {
    return undefined
  }
}
