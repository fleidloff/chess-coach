export interface OpeningTrap {
  name: string
  /** SAN moves from the start position. The last move is the blunder. */
  moves: string[]
  /** The move that punishes the blunder. */
  refutation: string
}

export const OPENING_TRAPS: OpeningTrap[] = [
  { name: "Fool's Mate", moves: ['f3', 'e5', 'g4'], refutation: 'Qh4#' },
  { name: "Fool's Mate", moves: ['f4', 'e5', 'g4'], refutation: 'Qh4#' },
  { name: "Scholar's Mate", moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6'], refutation: 'Qxf7#' },
  { name: "Scholar's Mate", moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6'], refutation: 'Qxf7#' },
  { name: 'Damiano Defense', moves: ['e4', 'e5', 'Nf3', 'f6'], refutation: 'Nxe5' },
  { name: 'Blackburne Shilling Gambit', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4', 'Nxe5'], refutation: 'Qg5' },
  { name: "Legal's Mate", moves: ['e4', 'e5', 'Nf3', 'd6', 'Bc4', 'Bg4', 'Nc3', 'g6', 'Nxe5', 'Bxd1'], refutation: 'Bxf7+' },
  { name: 'Englund Gambit Trap', moves: ['d4', 'e5', 'dxe5', 'Nc6', 'Nf3', 'Qe7', 'Bf4', 'Qb4+', 'c3'], refutation: 'Qxf4' },
  { name: 'Englund Gambit Trap', moves: ['d4', 'e5', 'dxe5', 'Nc6', 'Nf3', 'Qe7', 'Bf4', 'Qb4+', 'Bd2', 'Qxb2', 'Bc3'], refutation: 'Bb4' },
  { name: 'Lasker Trap', moves: ['d4', 'd5', 'c4', 'e5', 'dxe5', 'd4', 'e3'], refutation: 'Bb4+' },
  { name: 'Elephant Trap', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Nbd7', 'cxd5', 'exd5', 'Nxd5'], refutation: 'Nxd5' },
]

/** The trap whose blunder is the move at `ply` of this game. Matches the whole move order up to that ply. */
export function findTrap(moves: string[], ply: number): OpeningTrap | undefined {
  return OPENING_TRAPS.find(t => t.moves.length === ply + 1 && t.moves.every((m, i) => moves[i] === m))
}
