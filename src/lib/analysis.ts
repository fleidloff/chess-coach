import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js'
import type { Eval, GameRecord } from './lichess.ts'
import { lichessAnalysisUrl } from './lichess.ts'

export const MAX_LINE = 8

export interface GameAnalysis {
  id: string
  source: 'lichess' | 'local'
  depth: number
  /** Eval of every position, from the start position to the final position. */
  evals: Eval[]
  /** Best line in SAN from the position before each ply. */
  lines: (string[] | undefined)[]
}

export type Severity = 'inaccuracy' | 'mistake' | 'blunder'
export type Phase = 'opening' | 'middlegame' | 'endgame'
export type Tag = 'hangingPiece' | 'missedPunish' | 'missedMate' | 'allowedMate' | 'missedMaterial' | 'missedFork' | 'timeTrouble'

export interface MoveInsight {
  gameId: string
  ply: number
  san: string
  fenBefore: string
  best?: string
  line?: string[]
  /** Win chance of the user in percent, before and after the move. */
  winBefore: number
  winAfter: number
  loss: number
  severity?: Severity
  phase: Phase
  tags: Tag[]
  secondsLeft?: number
}

export interface PuzzleRecord {
  id: string
  gameId: string
  ply: number
  fen: string
  /** Best line in SAN. Null when the position has no single clear best move. */
  solution: string[] | null
  tags: Tag[]
  attempts: number
  solved: number
  lastResult?: 'solved' | 'failed'
}

export const PHASE_LABEL: Record<Phase, string> = { opening: 'Eröffnung', middlegame: 'Mittelspiel', endgame: 'Endspiel' }
const PHASE_IN: Record<Phase, string> = { opening: 'in der Eröffnung', middlegame: 'im Mittelspiel', endgame: 'im Endspiel' }
export const SEVERITY_LABEL: Record<Severity, string> = { inaccuracy: 'Ungenauigkeit', mistake: 'Fehler', blunder: 'Grober Fehler' }
export const SEVERITY_SYMBOL: Record<Severity, string> = { inaccuracy: '?!', mistake: '?', blunder: '??' }
export const TAG_LABEL: Record<Tag, string> = {
  hangingPiece: 'Figur hängen lassen',
  missedPunish: 'Gegnerfehler nicht bestraft',
  missedMate: 'Matt übersehen',
  allowedMate: 'Matt zugelassen',
  missedMaterial: 'Material nicht genommen',
  missedFork: 'Gabel übersehen',
  timeTrouble: 'In Zeitnot',
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

/** Lichess formula: centipawns to win chance in percent. */
export function winPercent(e: Eval): number {
  const raw = e.mate !== undefined ? Math.sign(e.mate) * (21 - Math.min(10, Math.abs(e.mate))) * 100 : (e.cp ?? 0)
  const cp = Math.max(-1000, Math.min(1000, raw))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Lichess formula: win chance lost to move accuracy in percent. */
export function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669))
}

export function severityOf(loss: number): Severity | undefined {
  if (loss >= 15) return 'blunder'
  if (loss >= 10) return 'mistake'
  if (loss >= 5) return 'inaccuracy'
}

export function uciLineToSan(fen: string, uci: string[]): string[] {
  const chess = new Chess(fen)
  const san: string[] = []
  for (const m of uci.slice(0, MAX_LINE)) {
    try {
      san.push(chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }).san)
    } catch {
      break
    }
  }
  return san
}

function phaseOf(game: GameRecord, ply: number, fen: string): Phase {
  const d = game.division
  if (d) {
    if (d.end !== undefined && ply >= d.end) return 'endgame'
    if (d.middle !== undefined && ply >= d.middle) return 'middlegame'
    if (d.middle !== undefined || ply < 20) return 'opening'
  }
  const pieces = fen.split(' ')[0].replace(/[^nbrqNBRQ]/g, '').length
  if (pieces <= 6) return 'endgame'
  return ply < 20 ? 'opening' : 'middlegame'
}

/** Pieces worth 3 or more that the opponent can win: undefended, or attacked by a cheaper piece. */
export function hangingSquares(chess: Chess, color: 'w' | 'b'): Square[] {
  const enemy = color === 'w' ? 'b' : 'w'
  return chess
    .board()
    .flat()
    .filter(p => p && p.color === color && p.type !== 'k' && VALUE[p.type] >= 3)
    .filter(p => {
      const attackers = chess.attackers(p!.square, enemy)
      if (!attackers.length) return false
      if (!chess.attackers(p!.square, color).length) return true
      return attackers.some(sq => VALUE[chess.get(sq)!.type] < VALUE[p!.type])
    })
    .map(p => p!.square)
}

function tryMove(fen: string, san: string): { chess: Chess; move: Move } | undefined {
  const chess = new Chess(fen)
  try {
    return { chess, move: chess.move(san) }
  } catch {
    return undefined
  }
}

/** True when the moved piece attacks two targets: the king, a more valuable piece, or an undefended piece. */
export function isFork(fenBefore: string, san: string): boolean {
  const r = tryMove(fenBefore, san)
  if (!r) return false
  const { chess, move } = r
  const enemy = move.color === 'w' ? 'b' : 'w'
  const targets = chess
    .board()
    .flat()
    .filter(p => p && p.color === enemy && chess.attackers(p.square, move.color).includes(move.to))
    .filter(p => p!.type === 'k' || VALUE[p!.type] > VALUE[move.piece] || (VALUE[p!.type] >= 3 && !chess.attackers(p!.square, enemy).length))
  return targets.length >= 2
}

const isMateFor = (e: Eval | undefined, sign: number) => e?.mate !== undefined && Math.sign(e.mate) === sign

const insightCache = new WeakMap<GameAnalysis, MoveInsight[]>()

export function annotateGame(game: GameRecord, analysis: GameAnalysis): MoveInsight[] {
  const cached = insightCache.get(analysis)
  if (cached) return cached
  const me = game.color === 'white' ? 'w' : 'b'
  const sign = me === 'w' ? 1 : -1
  const pov = (e: Eval) => (me === 'w' ? winPercent(e) : 100 - winPercent(e))
  const chess = new Chess()
  const out: MoveInsight[] = []
  let opponentLoss = 0

  game.moves.forEach((san, ply) => {
    const fenBefore = chess.fen()
    const mover = chess.turn()
    const played = chess.move(san)
    const before = analysis.evals[ply]
    const after = analysis.evals[ply + 1]
    if (!before || !after) return
    const winBefore = pov(before)
    const winAfter = pov(after)
    if (mover !== me) {
      opponentLoss = winAfter - winBefore
      return
    }
    const loss = Math.max(0, winBefore - winAfter)
    const severity = severityOf(loss)
    const line = analysis.lines[ply]
    const best = line?.[0] !== san ? line?.[0] : undefined
    const secondsLeft = game.clockInitial === undefined ? undefined : ply >= 2 && game.clocks?.[ply - 2] !== undefined ? game.clocks[ply - 2] / 100 : game.clockInitial

    const tags: Tag[] = []
    if (loss >= 10) {
      if (isMateFor(after, -sign) && !isMateFor(before, -sign)) tags.push('allowedMate')
      if (isMateFor(before, sign) && !isMateFor(after, sign)) tags.push('missedMate')
      if (opponentLoss >= 10) tags.push('missedPunish')
      const reply = analysis.lines[ply + 1]?.[0]
      const hanging = hangingSquares(chess, me)
      if (reply) {
        const r = tryMove(chess.fen(), reply)
        if (r?.move.captured && VALUE[r.move.captured] >= 3 && hanging.includes(r.move.to)) tags.push('hangingPiece')
      } else if (hanging.length && !(played.captured && VALUE[played.captured] >= VALUE[played.piece])) {
        tags.push('hangingPiece')
      }
      if (best) {
        const b = tryMove(fenBefore, best)
        if (b?.move.captured && VALUE[b.move.captured] >= 3 && !played.captured) tags.push('missedMaterial')
        if (isFork(fenBefore, best)) tags.push('missedFork')
      }
      if (secondsLeft !== undefined && game.clockInitial && secondsLeft < Math.max(10, game.clockInitial * 0.1)) tags.push('timeTrouble')
    }

    out.push({
      gameId: game.id,
      ply,
      san,
      fenBefore,
      best,
      line: best ? line : undefined,
      winBefore,
      winAfter,
      loss,
      severity,
      phase: phaseOf(game, ply, fenBefore),
      tags,
      secondsLeft,
    })
    opponentLoss = 0
  })
  insightCache.set(analysis, out)
  return out
}

export interface Filter {
  result: 'all' | 'loss'
  speed: string
}

export interface Weakness {
  id: Tag | 'conversion' | 'opening' | Phase
  title: string
  detail: string
  count: number
  score: number
  examples: MoveInsight[]
}

export interface Strength {
  title: string
  detail: string
}

export interface Plan {
  title: string
  why: string
  steps: string[]
  links: { label: string; url: string }[]
  puzzleTag?: Tag
}

export interface OpeningStat {
  name: string
  color: 'white' | 'black'
  games: number
  score: number
}

export interface Report {
  games: GameRecord[]
  analysed: number
  record: { win: number; loss: number; draw: number }
  accuracy: Record<Phase | 'overall', number | undefined>
  counts: Record<Severity, number>
  mistakes: MoveInsight[]
  weaknesses: Weakness[]
  strengths: Strength[]
  plans: Plan[]
  openings: OpeningStat[]
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
const pct = (x: number) => `${Math.round(x)} %`
const colorLabel = (c: 'white' | 'black') => (c === 'white' ? 'Weiß' : 'Schwarz')
const training = (theme: string, label: string) => ({ label, url: `https://lichess.org/training/${theme}` })

export function filterGames(games: GameRecord[], filter: Filter): GameRecord[] {
  return games.filter(g => (filter.result === 'all' || g.result === 'loss') && (!filter.speed || g.speed === filter.speed))
}

export function buildReport(allGames: GameRecord[], analyses: Map<string, GameAnalysis>, filter: Filter): Report {
  const games = filterGames(allGames, filter)
  const analysed = games.filter(g => analyses.has(g.id))
  const byGame = new Map(analysed.map(g => [g.id, annotateGame(g, analyses.get(g.id)!)]))
  const moves = [...byGame.values()].flat()
  const mistakes = moves.filter(m => m.loss >= 10).sort((a, b) => b.loss - a.loss)

  const accuracyOf = (ms: MoveInsight[]) => avg(ms.map(m => moveAccuracy(m.loss)))
  const phases: Phase[] = ['opening', 'middlegame', 'endgame']
  const accuracy = {
    overall: accuracyOf(moves),
    ...Object.fromEntries(phases.map(p => [p, accuracyOf(moves.filter(m => m.phase === p))])),
  } as Report['accuracy']

  const weaknesses: Weakness[] = []
  for (const tag of Object.keys(TAG_LABEL) as Tag[]) {
    const ms = mistakes.filter(m => m.tags.includes(tag))
    if (!ms.length) continue
    const total = ms.reduce((a, m) => a + m.loss, 0)
    weaknesses.push({
      id: tag,
      title: TAG_LABEL[tag],
      detail: `${ms.length}× in ${new Set(ms.map(m => m.gameId)).size} Partien, im Schnitt ${pct(total / ms.length)} Gewinnchance verloren.`,
      count: ms.length,
      score: total,
      examples: ms.slice(0, 6),
    })
  }

  const swings = analysed.map(g => {
    const ms = byGame.get(g.id)!
    return { game: g, max: Math.max(...ms.map(m => m.winBefore)), min: Math.min(...ms.map(m => m.winBefore)) }
  })
  const winning = swings.filter(s => s.max >= 85)
  const thrown = winning.filter(s => s.game.result !== 'win')
  if (thrown.length) {
    weaknesses.push({
      id: 'conversion',
      title: 'Gewonnene Stellungen nicht verwertet',
      detail: `${thrown.length} von ${winning.length} klar gewonnenen Stellungen nicht gewonnen.`,
      count: thrown.length,
      score: thrown.length * 40,
      examples: thrown.flatMap(s => byGame.get(s.game.id)!.filter(m => m.winBefore >= 70 && m.loss >= 10)).sort((a, b) => b.loss - a.loss).slice(0, 6),
    })
  }

  const phaseAcc = phases.filter(p => accuracy[p] !== undefined)
  const worstPhase = phaseAcc.sort((a, b) => accuracy[a]! - accuracy[b]!)[0]
  const bestPhase = phaseAcc[phaseAcc.length - 1]
  if (worstPhase && bestPhase && accuracy[bestPhase]! - accuracy[worstPhase]! >= 5) {
    const ms = mistakes.filter(m => m.phase === worstPhase)
    weaknesses.push({
      id: worstPhase,
      title: `Schwächste Phase: ${PHASE_LABEL[worstPhase]}`,
      detail: `Genauigkeit ${pct(accuracy[worstPhase]!)} gegenüber ${pct(accuracy[bestPhase]!)} ${PHASE_IN[bestPhase]}.`,
      count: ms.length,
      score: ms.reduce((a, m) => a + m.loss, 0) / 2,
      examples: ms.slice(0, 6),
    })
  }

  const openingMap = new Map<string, OpeningStat>()
  for (const g of games) {
    if (!g.opening) continue
    const name = g.opening.name.split(':')[0]
    const key = `${name}|${g.color}`
    const s = openingMap.get(key) ?? { name, color: g.color, games: 0, score: 0 }
    s.games++
    s.score += g.result === 'win' ? 1 : g.result === 'draw' ? 0.5 : 0
    openingMap.set(key, s)
  }
  const openings = [...openingMap.values()].map(s => ({ ...s, score: s.score / s.games })).sort((a, b) => b.games - a.games)
  const frequent = openings.filter(o => o.games >= 3)
  const worstOpening = [...frequent].sort((a, b) => a.score - b.score)[0]
  if (worstOpening && worstOpening.score <= 0.4) {
    const ids = new Set(games.filter(g => g.opening?.name.split(':')[0] === worstOpening.name && g.color === worstOpening.color).map(g => g.id))
    const ms = mistakes.filter(m => ids.has(m.gameId) && m.phase === 'opening').sort((a, b) => a.ply - b.ply)
    weaknesses.push({
      id: 'opening',
      title: `Eröffnung: ${worstOpening.name} mit ${colorLabel(worstOpening.color)}`,
      detail: `${pct(worstOpening.score * 100)} Punkte aus ${worstOpening.games} Partien.`,
      count: worstOpening.games,
      score: worstOpening.games * (0.5 - worstOpening.score) * 60,
      examples: ms.slice(0, 6),
    })
  }
  weaknesses.sort((a, b) => b.score - a.score)

  const strengths: Strength[] = []
  if (bestPhase && accuracy[bestPhase] !== undefined) {
    strengths.push({ title: `Stärkste Phase: ${PHASE_LABEL[bestPhase]}`, detail: `Deine Genauigkeit liegt dort bei ${pct(accuracy[bestPhase]!)}.` })
  }
  const converted = winning.length - thrown.length
  if (winning.length >= 3 && converted / winning.length >= 0.7) {
    strengths.push({ title: 'Du verwertest Vorteile', detail: `${converted} von ${winning.length} klar gewonnenen Stellungen hast du gewonnen.` })
  }
  const comebacks = swings.filter(s => s.min <= 15 && s.game.result !== 'loss')
  if (comebacks.length) {
    strengths.push({
      title: 'Du gibst nicht auf',
      detail: `${comebacks.length}× hast du eine fast verlorene Stellung (unter 15 % Gewinnchance) noch gerettet oder gewonnen.`,
    })
  }
  const punished = analysed.flatMap(g => {
    const ms = byGame.get(g.id)!
    return ms.filter((m, i) => i > 0 && m.winBefore - ms[i - 1].winAfter >= 10)
  })
  const punishedWell = punished.filter(m => m.loss < 5)
  if (punished.length >= 5 && punishedWell.length / punished.length >= 0.5) {
    strengths.push({
      title: 'Du bestrafst Fehler',
      detail: `Nach ${punishedWell.length} von ${punished.length} Fehlern des Gegners hast du einen guten Zug gefunden.`,
    })
  }
  const bestOpening = [...frequent].sort((a, b) => b.score - a.score)[0]
  if (bestOpening && bestOpening.score >= 0.6) {
    strengths.push({
      title: `Starke Eröffnung: ${bestOpening.name} mit ${colorLabel(bestOpening.color)}`,
      detail: `${pct(bestOpening.score * 100)} Punkte aus ${bestOpening.games} Partien. Bleib dabei.`,
    })
  }
  const clean = analysed.filter(g => !byGame.get(g.id)!.some(m => m.severity === 'blunder'))
  if (clean.length && clean.length / analysed.length >= 0.25) {
    strengths.push({ title: 'Saubere Partien', detail: `${clean.length} von ${analysed.length} Partien ohne groben Fehler.` })
  }

  return {
    games,
    analysed: analysed.length,
    record: {
      win: games.filter(g => g.result === 'win').length,
      loss: games.filter(g => g.result === 'loss').length,
      draw: games.filter(g => g.result === 'draw').length,
    },
    accuracy,
    counts: {
      inaccuracy: moves.filter(m => m.severity === 'inaccuracy').length,
      mistake: moves.filter(m => m.severity === 'mistake').length,
      blunder: moves.filter(m => m.severity === 'blunder').length,
    },
    mistakes,
    weaknesses,
    strengths,
    plans: weaknesses.slice(0, 3).map(planFor),
    openings,
  }
}

function planFor(w: Weakness): Plan {
  const why = `${w.title}: ${w.detail}`
  const first = w.examples[0]
  switch (w.id) {
    case 'hangingPiece':
      return {
        title: 'Blunder-Check vor jedem Zug',
        why,
        steps: [
          'Stell dir vor jedem Zug eine Frage: Welche meiner Figuren ist nach dem Zug angegriffen und nicht gedeckt?',
          'Frag dich nach jedem gegnerischen Zug: Was greift dieser Zug an?',
          'Löse jeden Tag 10 Aufgaben zum Thema „Hängende Figur“, bis du über 90 % richtig hast.',
          'Spiele eine Woche lang mit mehr Bedenkzeit (zum Beispiel 15+10), damit der Check zur Gewohnheit wird.',
        ],
        links: [training('hangingPiece', 'Lichess-Aufgaben: Hängende Figur')],
        puzzleTag: 'hangingPiece',
      }
    case 'missedPunish':
      return {
        title: 'Gegnerfehler sofort bestrafen',
        why,
        steps: [
          'Frag dich nach jedem gegnerischen Zug: Was hat sich geändert? Welche Figur oder welches Feld ist jetzt schwach?',
          'Prüfe immer zuerst Schachs, Schlagzüge und Drohungen, bevor du einen ruhigen Plan spielst.',
          'Löse jeden Tag 10 Aufgaben „Vorteil“ und „Entscheidender Vorteil“.',
          'Wiederhole die Aufgaben aus deinen eigenen Partien in diesem Tool.',
        ],
        links: [training('advantage', 'Lichess-Aufgaben: Vorteil'), training('crushing', 'Lichess-Aufgaben: Entscheidender Vorteil')],
        puzzleTag: 'missedPunish',
      }
    case 'missedMate':
      return {
        title: 'Mattbilder trainieren',
        why,
        steps: [
          'Prüfe in jeder Stellung zuerst alle Schachgebote, auch wenn sie nach Opfer aussehen.',
          'Löse jeden Tag 15 Aufgaben „Matt in 1“ und „Matt in 2“, auf Zeit.',
          'Lerne die Grundbilder: Grundreihenmatt, ersticktes Matt, Matt mit Dame und Läufer.',
        ],
        links: [training('mateIn2', 'Lichess-Aufgaben: Matt in 2'), training('backRankMate', 'Lichess-Aufgaben: Grundreihenmatt')],
        puzzleTag: 'missedMate',
      }
    case 'allowedMate':
      return {
        title: 'Königssicherheit verbessern',
        why,
        steps: [
          'Frag dich vor jedem Zug: Welche Schachs hat mein Gegner danach?',
          'Gib deinem König ein Luftloch (zum Beispiel h3 oder h6), wenn die Grundreihe schwach ist.',
          'Löse jeden Tag 10 Aufgaben „Verteidigung“ und „Grundreihenmatt“.',
        ],
        links: [training('defensiveMove', 'Lichess-Aufgaben: Verteidigung'), training('backRankMate', 'Lichess-Aufgaben: Grundreihenmatt')],
        puzzleTag: 'allowedMate',
      }
    case 'missedMaterial':
      return {
        title: 'Schlagzüge immer prüfen',
        why,
        steps: [
          'Zähle vor jedem Zug alle Schlagzüge für beide Seiten auf.',
          'Prüfe bei jeder angegriffenen Figur: Wie oft ist sie angegriffen und wie oft gedeckt?',
          'Löse jeden Tag 10 Aufgaben „Hängende Figur“ aus Sicht des Angreifers.',
        ],
        links: [training('hangingPiece', 'Lichess-Aufgaben: Hängende Figur')],
        puzzleTag: 'missedMaterial',
      }
    case 'missedFork':
      return {
        title: 'Doppelangriffe sehen',
        why,
        steps: [
          'Suche in jeder Stellung nach Figuren, die ungedeckt stehen oder auf einer Linie mit dem König.',
          'Prüfe für jeden Springer: Welche Felder erreicht er in einem Zug, und was greift er dort an?',
          'Löse jeden Tag 10 Aufgaben „Gabel“.',
        ],
        links: [training('fork', 'Lichess-Aufgaben: Gabel')],
        puzzleTag: 'missedFork',
      }
    case 'timeTrouble':
      return {
        title: 'Zeit besser einteilen',
        why,
        steps: [
          'Spiele die bekannten Eröffnungszüge schnell und spare dir die Zeit für das Mittelspiel.',
          'Denke in kritischen Momenten länger nach: nach Schlagzügen, Schachs und bei Plänen mit Opfer.',
          'Spiele Zeitkontrollen mit Inkrement (zum Beispiel 5+3 statt 5+0).',
          'Wenn du unter 10 % deiner Zeit hast, spiele einfache, sichere Züge und tausche Figuren.',
        ],
        links: [{ label: 'Lichess Puzzle Storm (Tempo-Training)', url: 'https://lichess.org/storm' }],
        puzzleTag: 'timeTrouble',
      }
    case 'conversion':
      return {
        title: 'Vorteile sicher verwerten',
        why,
        steps: [
          'Wenn du klar besser stehst: Tausche Figuren, nicht Bauern.',
          'Frag dich vor jedem Zug: Welches Gegenspiel hat mein Gegner? Stoppe es zuerst.',
          'Nimm dir Zeit. Ein gewonnenes Spiel muss nicht schnell gewonnen werden.',
          'Spiele gewonnene Stellungen aus deinen Partien gegen Stockfish zu Ende (Link unten).',
        ],
        links: [
          training('crushing', 'Lichess-Aufgaben: Entscheidender Vorteil'),
          ...(first ? [{ label: 'Stellung im Lichess-Analysebrett', url: lichessAnalysisUrl(first.fenBefore) }] : []),
        ],
      }
    case 'opening':
      return {
        title: 'Eröffnung reparieren',
        why,
        steps: [
          'Schau dir an, wo du in diesen Partien zuerst ungenau gespielt hast (Link unten).',
          'Lerne die ersten 8 bis 10 Züge der Hauptvariante im Lichess-Eröffnungsbuch.',
          'Notiere dir für die Stellung nach der Eröffnung einen einfachen Plan (Bauernhebel, Ziel für die Figuren).',
          'Spiele die Stellung fünfmal gegen Stockfish Stufe 4 bis 5.',
        ],
        links: first ? [{ label: 'Erste ungenaue Stellung im Lichess-Analysebrett', url: lichessAnalysisUrl(first.fenBefore) }] : [],
      }
    case 'endgame':
      return {
        title: 'Endspiele üben',
        why,
        steps: [
          'Lerne die Grundendspiele: Bauernendspiele mit Opposition, Lucena und Philidor im Turmendspiel.',
          'Aktiviere im Endspiel zuerst deinen König.',
          'Löse jeden Tag 10 Aufgaben „Endspiel“ und „Turmendspiel“.',
        ],
        links: [{ label: 'Lichess Übungen', url: 'https://lichess.org/practice' }, training('rookEndgame', 'Lichess-Aufgaben: Turmendspiel')],
      }
    case 'middlegame':
      return {
        title: 'Taktik im Mittelspiel schärfen',
        why,
        steps: [
          'Prüfe vor jedem Zug Schachs, Schlagzüge und Drohungen, für dich und für den Gegner.',
          'Löse jeden Tag 15 gemischte Aufgaben aus dem Mittelspiel.',
          'Analysiere nach jeder verlorenen Partie den ersten großen Fehler selbst, bevor du die Engine fragst.',
        ],
        links: [training('middlegame', 'Lichess-Aufgaben: Mittelspiel')],
      }
  }
}
