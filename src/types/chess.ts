export type Platform = 'lichess' | 'chesscom'

export type Color = 'white' | 'black'

export type TacticalTag =
  | 'HANGING_PIECE'
  | 'F2_F7_VULNERABILITY'
  | 'MISSED_FORK'
  | 'PIN_EXPLOIT'
  | 'BACK_RANK_WEAKNESS'
  | 'OPENING_TRAP'
  | 'MISSED_MATE'
  | 'ALLOWED_MATE'
  | 'ALLOWED_FORK'
  | 'DISCOVERED_ATTACK'
  | 'MISSED_CAPTURE'

export type GoodMoveKind = 'TACTICAL_STRIKE' | 'DEFENSIVE_SAVE' | 'CLEAN_CONVERSION'

export interface ParsedGame {
  id: string
  platform: Platform
  url: string
  pgn: string
  /** SAN moves from the start position. */
  moves: string[]
  whitePlayer: string
  blackPlayer: string
  whiteRating?: number
  blackRating?: number
  userColor: Color
  /** ISO 8601. */
  date: string
  /** PGN result: '1-0', '0-1' or '1/2-1/2'. */
  result: string
  opening?: string
}

/** Engine score from White's point of view. */
export interface Score {
  cp?: number
  mate?: number
}

export interface PositionEval {
  score: Score
  /** Best line in UCI. Empty for a final position. */
  pv: string[]
  /** Score of the second-best move. Only on deep analysis (MultiPV 2). */
  second?: Score
}

export interface GameEvals {
  depth: number
  /** One entry per position: the start position, then the position after each ply. */
  positions: PositionEval[]
}

export interface MoveEval {
  ply: number
  san: string
  color: Color
  fenBefore: string
  fenAfter: string
  /** Centipawns from the mover's point of view, clamped to ±1000. */
  cpBefore: number
  cpAfter: number
  /** Centipawn loss: cpBefore - cpAfter, never below 0. */
  cpl: number
  bestMoveSan?: string
  bestMoveUci?: string
  /** Engine line from fenBefore, in SAN. */
  bestLine: string[]
  /** Engine line from fenAfter, in SAN: how the opponent answers this move. */
  reply: string[]
  /** Centipawns of the second-best move from the mover's point of view (deep analysis only). */
  cpSecond?: number
  /** Forced mate in moves from the mover's point of view: + mover mates, − mover is mated. */
  mateBefore?: number
  mateAfter?: number
  tag?: TacticalTag
  /** Squares that show the tagged pattern. */
  tagSquares?: string[]
  tagVia?: 'best' | 'reply'
  /** Material points the engine line wins, when the tag comes from counting it. */
  tagMaterial?: number
}

export interface Branch {
  label: string
  /** SAN moves from the feedback node's fen. */
  moves: string[]
}

export interface FeedbackNode {
  ply: number
  moveNotation: string
  summary: string
  /** Position before the move. */
  fen: string
  cpl: number
  tag?: TacticalTag
  kind?: GoodMoveKind
  /** Number of the 10 games in which this tag appears. */
  batchFrequency?: number
  arrows: Array<{ from: string; to: string; color: string }>
  highlightSquares: string[]
  branches: Branch[]
}

export interface GameReport {
  gameId: string
  userColor: Color
  opponentName: string
  result: string
  /** Search depth of the analysis behind this report. */
  depth: number
  topErrors: FeedbackNode[]
  goodMoves: FeedbackNode[]
  actionableDrills: string[]
}

export interface BatchAnalysisResult {
  /** Number of analysed games that contain each tag. */
  tagFrequencies: Record<TacticalTag, number>
  /** User errors in all analysed games, and how many of them have no tag. */
  errorCount: number
  untaggedCount: number
  analysedGames: number
  /** gameId to report. */
  reports: Map<string, GameReport>
}
