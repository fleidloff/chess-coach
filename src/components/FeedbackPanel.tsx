import { AlertTriangle, CheckCircle2, Lightbulb, Loader2, Repeat, XCircle } from 'lucide-react'
import type { FeedbackNode, GameReport, TacticalTag } from '../types/chess.ts'
import { DEEP_DEPTH } from '../engine/patternAggregator.ts'
import { formatCp, KIND_LABEL, TAG_LABEL } from '../engine/templateEngine.ts'

interface Props {
  report?: GameReport
  tagFrequencies: Record<TacticalTag, number>
  analysedGames: number
  totalGames: number
  errorCount: number
  untaggedCount: number
  deepening: boolean
  selected?: FeedbackNode
  onSelect: (node: FeedbackNode) => void
}

const heading = 'mb-2 flex items-center gap-2 text-sm font-semibold tracking-wide text-stone-600 uppercase dark:text-stone-400'

function NodeCard({ node, good, total, selected, onSelect }: { node: FeedbackNode; good: boolean; total: number; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        onClick={onSelect}
        aria-pressed={selected}
        className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none motion-reduce:transition-none ${
          selected
            ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40'
            : 'border-stone-200 bg-white hover:border-stone-400 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-600'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-sm font-semibold ${
              good ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
            }`}
          >
            {node.moveNotation}
          </span>
          {!good && <span className="text-xs text-stone-500 dark:text-stone-400">{formatCp(-node.cpl)}</span>}
          {node.tag && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs dark:bg-stone-800">{TAG_LABEL[node.tag]}</span>}
          {node.kind && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs dark:bg-stone-800">{KIND_LABEL[node.kind]}</span>}
          {node.batchFrequency !== undefined && node.batchFrequency >= 2 && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <Repeat className="size-3" aria-hidden /> Pattern: seen {node.batchFrequency}/{total} games
            </span>
          )}
        </div>
        <p className="mt-1.5 text-sm">{node.summary}</p>
      </button>
    </li>
  )
}

export function FeedbackPanel({
  report,
  tagFrequencies,
  analysedGames,
  totalGames,
  errorCount,
  untaggedCount,
  deepening,
  selected,
  onSelect,
}: Props) {
  const tags = (Object.keys(tagFrequencies) as TacticalTag[]).filter(t => tagFrequencies[t] > 0).sort((a, b) => tagFrequencies[b] - tagFrequencies[a])
  const scanning = analysedGames < totalGames

  return (
    <div className="flex flex-col gap-6">
      {!report ? (
        <p className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Analyzing this game…
        </p>
      ) : (
        <>
          {(deepening || report.depth < DEEP_DEPTH) && (
            <p className="flex items-center gap-2 rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
              {deepening && <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
              Quick scan (depth {report.depth}).{deepening ? ' Deep analysis runs…' : ''}
            </p>
          )}

          <section aria-labelledby="good">
            <h2 id="good" className={heading}>
              <CheckCircle2 className="size-4" aria-hidden /> Good moves
            </h2>
            {report.goodMoves.length ? (
              <ul className="flex flex-col gap-2">
                {report.goodMoves.map(g => (
                  <NodeCard key={g.ply} node={g} good total={totalGames} selected={selected?.ply === g.ply && Boolean(selected.kind)} onSelect={() => onSelect(g)} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-600 dark:text-stone-400">No tactical highlight in this game.</p>
            )}
          </section>

          <section aria-labelledby="errors">
            <h2 id="errors" className={heading}>
              <XCircle className="size-4" aria-hidden /> Top errors
            </h2>
            {report.topErrors.length ? (
              <ul className="flex flex-col gap-2">
                {report.topErrors.map(e => (
                  <NodeCard key={e.ply} node={e} good={false} total={totalGames} selected={selected?.ply === e.ply && !selected.kind} onSelect={() => onSelect(e)} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-600 dark:text-stone-400">No blunder in this game.</p>
            )}
          </section>

          {report.actionableDrills.length > 0 && (
            <section aria-labelledby="rules">
              <h2 id="rules" className={heading}>
                <Lightbulb className="size-4" aria-hidden /> Rules for your next games
              </h2>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
                {report.actionableDrills.map(d => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section aria-labelledby="patterns">
        <h2 id="patterns" className={heading}>
          <AlertTriangle className="size-4" aria-hidden /> Patterns in your last {totalGames} games
        </h2>
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map(t => (
              <li
                key={t}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  tagFrequencies[t] >= 2
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                }`}
              >
                {tagFrequencies[t] >= 2 && <AlertTriangle className="size-3" aria-hidden />}
                {TAG_LABEL[t]}: {tagFrequencies[t]}/{totalGames} games
              </li>
            ))}
          </ul>
        )}
        {untaggedCount > 0 && (
          <p className="mt-1.5 text-xs text-stone-600 dark:text-stone-300">
            Other errors: {untaggedCount} of {errorCount} blunders have no known pattern.
          </p>
        )}
        <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
          {scanning
            ? `Scanned ${analysedGames}/${totalGames} games. The counts grow while the scan runs.`
            : tags.length
              ? 'Counts the games in which each pattern appears at least once.'
              : errorCount
                ? 'No recurring tactical pattern found.'
                : 'No blunder in these games. Well played.'}
        </p>
      </section>
    </div>
  )
}
