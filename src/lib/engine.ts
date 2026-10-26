import { Chess } from 'chess.js'
import type { Eval, GameRecord } from './lichess.ts'
import type { GameAnalysis } from './analysis.ts'
import { MAX_LINE, uciLineToSan, winPercent } from './analysis.ts'

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`

export interface EngineLine {
  eval: Eval
  pv: string[]
}

/** One Stockfish web worker. Calls are queued, so only one search runs at a time. */
export class Engine {
  private worker = new Worker(ENGINE_URL)
  private listener: ((line: string) => void) | undefined
  private queue: Promise<unknown>
  private multiPv = 1

  constructor() {
    this.worker.onmessage = e => this.listener?.(String(e.data))
    this.queue = this.send('uci', l => l === 'uciok').then(() => this.send('isready', l => l === 'readyok'))
  }

  private send(cmd: string, until: (line: string) => boolean, onLine?: (line: string) => void): Promise<void> {
    return new Promise(resolve => {
      this.listener = line => {
        onLine?.(line)
        if (until(line)) resolve()
      }
      this.worker.postMessage(cmd)
    })
  }

  analyse(fen: string, depth: number, multiPv = 1): Promise<EngineLine[]> {
    const run = async () => {
      if (multiPv !== this.multiPv) {
        this.worker.postMessage(`setoption name MultiPV value ${multiPv}`)
        this.multiPv = multiPv
      }
      this.worker.postMessage(`position fen ${fen}`)
      const lines: EngineLine[] = []
      const whiteToMove = fen.split(' ')[1] === 'w'
      await this.send(`go depth ${depth}`, l => l.startsWith('bestmove'), line => {
        if (!line.startsWith('info') || !line.includes(' pv ') || / (lower|upper)bound/.test(line)) return
        const t = line.split(' ')
        const idx = Number(t[t.indexOf('multipv') + 1] || 1) - 1
        const kind = t[t.indexOf('score') + 1]
        const value = Number(t[t.indexOf('score') + 2]) * (whiteToMove ? 1 : -1)
        lines[idx] = { eval: kind === 'mate' ? { mate: value } : { cp: value }, pv: t.slice(t.indexOf('pv') + 1) }
      })
      return lines.filter(Boolean)
    }
    const result = this.queue.then(run)
    this.queue = result.catch(() => undefined)
    return result
  }

  terminate() {
    this.worker.terminate()
  }
}

function terminalEval(chess: Chess): Eval | undefined {
  if (chess.isCheckmate()) return { mate: chess.turn() === 'w' ? -1 : 1 }
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return { cp: 0 }
}

function fromLichess(game: GameRecord): GameAnalysis | undefined {
  const evals = game.lichessEvals
  if (!evals) return
  const chess = new Chess()
  for (const san of game.moves) chess.move(san)
  const final = terminalEval(chess)
  const complete = evals.length === game.moves.length || (evals.length === game.moves.length - 1 && final)
  if (!complete) return
  return {
    id: game.id,
    source: 'lichess',
    depth: 0,
    evals: [{ cp: 20 }, ...evals.map(e => ({ cp: e.cp, mate: e.mate })), ...(evals.length < game.moves.length ? [final!] : [])],
    lines: evals.map(e => e.variation?.split(' ').slice(0, MAX_LINE)),
  }
}

/** Uses the Lichess server analysis when the game has one, otherwise runs the local engine on every position. */
export async function analyseGame(engine: Engine, game: GameRecord, depth: number): Promise<GameAnalysis> {
  const lichess = fromLichess(game)
  if (lichess) return lichess
  const chess = new Chess()
  const fens = [chess.fen()]
  for (const san of game.moves) {
    chess.move(san)
    fens.push(chess.fen())
  }
  const evals: Eval[] = []
  const lines: (string[] | undefined)[] = []
  for (const fen of fens) {
    const terminal = terminalEval(new Chess(fen))
    if (terminal) {
      evals.push(terminal)
      lines.push(undefined)
      continue
    }
    const [best] = await engine.analyse(fen, depth)
    evals.push(best?.eval ?? { cp: 0 })
    lines.push(best && uciLineToSan(fen, best.pv))
  }
  return { id: game.id, source: 'local', depth, evals, lines: lines.slice(0, game.moves.length) }
}

/** A puzzle needs one move that is clearly better than every other move. */
export async function checkUnique(engine: Engine, fen: string, depth: number): Promise<string[] | undefined> {
  const [first, second] = await engine.analyse(fen, depth, 2)
  if (!first?.pv.length || !second) return
  const white = fen.split(' ')[1] === 'w'
  const win = (e: Eval) => (white ? winPercent(e) : 100 - winPercent(e))
  if (win(first.eval) - win(second.eval) < 20) return
  return uciLineToSan(fen, first.pv)
}

export type Job = (engine: Engine) => Promise<void>

/** Runs jobs on several single-threaded engines in parallel. Works on any static host. */
export function startPool(next: () => Job | undefined, onIdle: () => void): () => void {
  const size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))
  const engines = Array.from({ length: size }, () => new Engine())
  let stopped = false
  let running = size
  for (const engine of engines) {
    void (async () => {
      for (let job = next(); job && !stopped; job = next()) {
        try {
          await job(engine)
        } catch (e) {
          if (!stopped) console.error(e)
        }
      }
      engine.terminate()
      if (--running === 0 && !stopped) onIdle()
    })()
  }
  return () => {
    stopped = true
    engines.forEach(e => e.terminate())
  }
}
