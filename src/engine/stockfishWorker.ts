import { Chess } from 'chess.js'
import type { GameEvals, ParsedGame, PositionEval, Score } from '../types/chess.ts'
import { parseInfo, terminalScore } from './uci.ts'

/** One Stockfish web worker that runs one search at a time. */
class Engine {
  private worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`)
  private listener: ((line: string) => void) | undefined
  private failure: ((error: Error) => void) | undefined
  private multiPv = 1
  readonly ready: Promise<void>

  constructor() {
    this.worker.onmessage = e => this.listener?.(String(e.data))
    this.worker.onerror = () => this.failure?.(new Error('The Stockfish engine failed to load.'))
    this.ready = this.send('uci', l => l === 'uciok').then(() => this.send('isready', l => l === 'readyok'))
  }

  private send(cmd: string, until: (line: string) => boolean, onLine?: (line: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.failure = reject
      this.listener = line => {
        onLine?.(line)
        if (until(line)) resolve()
      }
      this.worker.postMessage(cmd)
    })
  }

  async analyse(fen: string, depth: number, multiPv: number): Promise<PositionEval> {
    await this.ready
    if (multiPv !== this.multiPv) {
      this.worker.postMessage(`setoption name MultiPV value ${multiPv}`)
      this.multiPv = multiPv
    }
    this.worker.postMessage(`position fen ${fen}`)
    const whiteToMove = fen.split(' ')[1] === 'w'
    const lines: { score: Score; pv: string[] }[] = []
    await this.send(`go depth ${depth}`, l => l.startsWith('bestmove'), line => {
      const info = parseInfo(line, whiteToMove)
      if (info) lines[info.index] = info
    })
    return { score: lines[0]?.score ?? { cp: 0 }, pv: lines[0]?.pv ?? [], second: lines[1]?.score }
  }

  terminate() {
    this.worker.terminate()
  }
}

interface Job {
  fen: string
  depth: number
  multiPv: number
  priority: number
  resolve: (result: PositionEval) => void
  reject: (error: Error) => void
}

/** Several single-threaded engines. Jobs with a lower priority number run first, the rest in order of arrival. */
export class EnginePool {
  private engines: Engine[] = []
  private queue: Job[] = []
  private idle: Engine[] = []
  private running = new Set<Job>()
  private stopped = false
  private size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))

  analyse(fen: string, depth: number, multiPv: number, priority: number): Promise<PositionEval> {
    const terminal = terminalScore(fen)
    if (terminal) return Promise.resolve({ score: terminal, pv: [] })
    return new Promise((resolve, reject) => {
      if (this.stopped) return reject(new Error('Analysis stopped.'))
      this.queue.push({ fen, depth, multiPv, priority, resolve, reject })
      this.pump()
    })
  }

  private pump() {
    while (this.queue.length && (this.idle.length || this.engines.length < this.size)) {
      const engine = this.idle.pop() ?? this.spawn()
      const best = this.queue.reduce((b, j, i) => (j.priority < this.queue[b].priority ? i : b), 0)
      const [job] = this.queue.splice(best, 1)
      this.running.add(job)
      engine
        .analyse(job.fen, job.depth, job.multiPv)
        .then(job.resolve, (e: Error) => {
          job.reject(e)
          this.stop(e)
        })
        .finally(() => {
          this.running.delete(job)
          if (this.stopped) return
          this.idle.push(engine)
          this.pump()
        })
    }
  }

  private spawn(): Engine {
    const engine = new Engine()
    this.engines.push(engine)
    return engine
  }

  stop(error = new Error('Analysis stopped.')) {
    if (this.stopped) return
    this.stopped = true
    this.engines.forEach(e => e.terminate())
    ;[...this.queue, ...this.running].forEach(j => j.reject(error))
    this.queue = []
    this.running.clear()
  }
}

/** Evaluates every position of a game. MultiPV 2 also finds the second-best move. */
export async function analyseGame(pool: EnginePool, game: ParsedGame, depth: number, multiPv: number, priority: number): Promise<GameEvals> {
  const chess = new Chess()
  const fens = [chess.fen(), ...game.moves.map(san => (chess.move(san), chess.fen()))]
  return { depth, positions: await Promise.all(fens.map(fen => pool.analyse(fen, depth, multiPv, priority))) }
}
