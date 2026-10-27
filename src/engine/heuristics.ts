import { Chess, type Color as ChessColor, type Move, type PieceSymbol, type Square } from 'chess.js'
import type { TacticalTag } from '../types/chess.ts'
import { findTrap } from './openingDb.ts'

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/

/** Plays a SAN or UCI move. Returns undefined for an illegal move. */
export function playMove(fen: string, move: string): { chess: Chess; move: Move } | undefined {
  const chess = new Chess(fen)
  try {
    const m = UCI.test(move) ? chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }) : chess.move(move)
    return { chess, move: m }
  } catch {
    return undefined
  }
}

export function uciToSan(fen: string, uci: string[], max = 8): string[] {
  const chess = new Chess(fen)
  const san: string[] = []
  for (const m of uci.slice(0, max)) {
    try {
      san.push(chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }).san)
    } catch {
      break
    }
  }
  return san
}

const enemyOf = (c: ChessColor): ChessColor => (c === 'w' ? 'b' : 'w')

/** The opponent wins the piece on `square`: more attackers than defenders, or an attacker worth less. */
export function isHanging(chess: Chess, square: Square): boolean {
  const piece = chess.get(square)
  if (!piece || piece.type === 'k') return false
  const attackers = chess.attackers(square, enemyOf(piece.color))
  if (!attackers.length) return false
  const defenders = chess.attackers(square, piece.color)
  return attackers.length > defenders.length || attackers.some(sq => VALUE[chess.get(sq)!.type] < VALUE[piece.type])
}

/** Squares of the pieces the moved piece forks: the king, pieces worth more, or undefended pieces worth 3 or more. */
export function forkTargets(chess: Chess, move: Move): Square[] {
  const enemy = enemyOf(move.color)
  const targets = chess
    .board()
    .flat()
    .filter(p => p && p.color === enemy && chess.attackers(p.square, move.color).includes(move.to))
    .filter(p => p!.type === 'k' || VALUE[p!.type] > VALUE[move.piece] || (VALUE[p!.type] >= 3 && !chess.attackers(p!.square, enemy).length))
    .map(p => p!.square)
  return targets.length >= 2 ? targets : []
}

const RAYS: Partial<Record<PieceSymbol, [number, number][]>> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
}

const squareAt = (file: number, rank: number) =>
  file >= 0 && file < 8 && rank >= 0 && rank < 8 ? (`${'abcdefgh'[file]}${rank + 1}` as Square) : undefined

function kingBehind(chess: Chess, file: number, rank: number, df: number, dr: number, color: ChessColor): boolean {
  for (;;) {
    file += df
    rank += dr
    const sq = squareAt(file, rank)
    if (!sq) return false
    const p = chess.get(sq)
    if (p) return p.type === 'k' && p.color === color
  }
}

/** The square of the piece the moved slider pins against the king or a piece worth more. */
export function pinnedSquare(chess: Chess, move: Move): Square | undefined {
  const enemy = enemyOf(move.color)
  for (const [df, dr] of RAYS[move.piece] ?? []) {
    let file = move.to.charCodeAt(0) - 97
    let rank = Number(move.to[1]) - 1
    let front: Square | undefined
    for (;;) {
      file += df
      rank += dr
      const sq = squareAt(file, rank)
      if (!sq) break
      const p = chess.get(sq)
      if (!p) continue
      if (p.color !== enemy) break
      if (!front) {
        if (p.type === 'k') break
        // A pawn pinned to anything but the king rarely decides a game.
        if (p.type === 'p' && !kingBehind(chess, file, rank, df, dr, enemy)) break
        front = sq
        continue
      }
      if (p.type === 'k' || VALUE[p.type] > VALUE[chess.get(front)!.type]) return front
      break
    }
  }
}

function kingSquare(chess: Chess, color: ChessColor): Square {
  return chess.findPiece({ type: 'k', color })[0]
}

/** King on its back rank, and every square in front of it holds an own piece. */
function boxedIn(chess: Chess, color: ChessColor): boolean {
  const king = kingSquare(chess, color)
  const back = color === 'w' ? 0 : 7
  if (Number(king[1]) - 1 !== back) return false
  const file = king.charCodeAt(0) - 97
  const front = back + (color === 'w' ? 1 : -1)
  return [file - 1, file, file + 1]
    .map(f => squareAt(f, front))
    .filter(sq => sq !== undefined)
    .every(sq => chess.get(sq)?.color === color)
}

const pressure = (chess: Chess, sq: Square, color: ChessColor) =>
  chess.attackers(sq, enemyOf(color)).length - chess.attackers(sq, color).length

export interface BlunderContext {
  /** All SAN moves of the game. */
  moves: string[]
  ply: number
  fenBefore: string
  /** Engine best move from fenBefore, UCI. */
  bestMoveUci?: string
  /** Engine best reply after the blunder, UCI. */
  replyUci?: string
}

export interface TagResult {
  tag: TacticalTag
  squares: Square[]
}

/** Names the pattern behind a blunder. The first rule that matches wins, from the most to the least specific. */
export function tagBlunder(ctx: BlunderContext): TagResult | undefined {
  if (findTrap(ctx.moves, ctx.ply)) return { tag: 'OPENING_TRAP', squares: [] }
  const played = playMove(ctx.fenBefore, ctx.moves[ctx.ply])
  if (!played) return
  const { chess: after, move } = played
  const me = move.color
  const fenAfter = after.fen()
  const reply = ctx.replyUci ? playMove(fenAfter, ctx.replyUci) : undefined
  const next = ctx.moves[ctx.ply + 1] ? playMove(fenAfter, ctx.moves[ctx.ply + 1]) : undefined
  const backRank = me === 'w' ? '1' : '8'

  if (reply?.chess.inCheck() && (reply.move.piece === 'r' || reply.move.piece === 'q') && reply.move.to[1] === backRank && boxedIn(after, me)) {
    return { tag: 'BACK_RANK_WEAKNESS', squares: [kingSquare(after, me), reply.move.to] }
  }

  const f = me === 'w' ? 'f2' : 'f7'
  const kingHome = kingSquare(after, me) === (me === 'w' ? 'e1' : 'e8')
  const before = new Chess(ctx.fenBefore)
  if (
    kingHome &&
    (move.from === f || move.to === f || reply?.move.to === f || (pressure(after, f, me) > 0 && pressure(before, f, me) <= 0))
  ) {
    return { tag: 'F2_F7_VULNERABILITY', squares: [f] }
  }

  const fairTrade = move.captured && VALUE[move.captured] >= VALUE[move.piece]
  if (!fairTrade && isHanging(after, move.to)) return { tag: 'HANGING_PIECE', squares: [move.to] }
  for (const r of [reply, next]) {
    const captured = r?.move.captured
    if (captured && VALUE[captured] >= 3 && isHanging(after, r.move.to)) return { tag: 'HANGING_PIECE', squares: [r.move.to] }
  }

  const best = ctx.bestMoveUci ? playMove(ctx.fenBefore, ctx.bestMoveUci) : undefined
  if (best && best.move.san !== move.san) {
    const targets = forkTargets(best.chess, best.move)
    if (targets.length) return { tag: 'MISSED_FORK', squares: [best.move.to, ...targets] }
    const pinned = pinnedSquare(best.chess, best.move)
    if (pinned) return { tag: 'PIN_EXPLOIT', squares: [best.move.to, pinned] }
  }
}

export interface MoveFeatures {
  capture: boolean
  check: boolean
  mate: boolean
  fork: boolean
  pin: boolean
}

export function moveFeatures(fen: string, san: string): MoveFeatures {
  const r = playMove(fen, san)
  if (!r) return { capture: false, check: false, mate: false, fork: false, pin: false }
  return {
    capture: Boolean(r.move.captured),
    check: r.chess.inCheck(),
    mate: r.chess.isCheckmate(),
    fork: forkTargets(r.chess, r.move).length > 0,
    pin: pinnedSquare(r.chess, r.move) !== undefined,
  }
}
