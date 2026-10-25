import { Link } from 'react-router'
import type { IntervalRow, IntervalSort } from '../../api/types'
import { scrollRegion } from '../../lib/a11y'
import { cn } from '../../lib/cn'
import { fmtDuration, fmtShortDateTime, UNAVAILABLE } from '../../lib/format'
import { useAnalysis } from '../../state/useAnalysis'
import { ErrorCell, StatusBadge, ValueCell } from './cells'

interface Column {
  key: string
  label: string
  sort?: IntervalSort
  align?: 'right'
  className?: string
}

const COLUMNS: Column[] = [
  { key: 'start', label: 'Delivery start (UK)', sort: 'start_time' },
  { key: 'cutoff', label: 'Decision cutoff' },
  { key: 'published', label: 'Forecast published', sort: 'publish_time' },
  { key: 'forecast', label: 'Forecast (MW)', sort: 'forecast', align: 'right' },
  { key: 'actual', label: 'Actual (MW)', sort: 'actual', align: 'right' },
  { key: 'error', label: 'Error F−A (MW)', sort: 'error', align: 'right' },
  { key: 'abs', label: '|Error| (MW)', sort: 'abs_error', align: 'right' },
  { key: 'status', label: 'Status' },
  { key: 'open', label: '' },
]

export function IntervalsTable({
  rows,
  sortBy,
  sortDir,
  onSort,
  caption,
}: {
  rows: IntervalRow[]
  sortBy: IntervalSort
  sortDir: 'asc' | 'desc'
  onSort: (sort: IntervalSort) => void
  caption: string
}) {
  const { linkTo } = useAnalysis()
  return (
    <div
      {...scrollRegion('Delivery intervals table')}
      className="relative overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <table className="min-w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {COLUMNS.map((c) => {
              const active = c.sort === sortBy
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={
                    c.sort ? (active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined
                  }
                  className={cn(
                    'whitespace-nowrap px-3 py-2 font-medium',
                    c.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => onSort(c.sort as IntervalSort)}
                      className={cn(
                        'inline-flex items-center gap-1 uppercase tracking-wide hover:text-navy-800',
                        active && 'text-navy-900',
                      )}
                    >
                      {c.label}
                      <span aria-hidden="true" className="text-[10px]">
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr
              key={r.start_time}
              className={cn('hover:bg-slate-50', r.match_status !== 'matched' && 'bg-amber-50/40')}
            >
              <td className="whitespace-nowrap px-3 py-1.5">
                <span className="font-medium text-slate-900">{r.local_label}</span>
                <span className="ml-2 text-xs text-slate-500">P{r.settlement_period}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">
                {fmtShortDateTime(r.decision_cutoff_time)}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">
                {r.forecast_publish_time ? (
                  <>
                    {fmtShortDateTime(r.forecast_publish_time)}
                    <span
                      className="ml-1 text-xs text-slate-500"
                      title="How long before the cutoff this forecast was published"
                    >
                      ({fmtDuration(r.forecast_age_h)} old)
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500">{UNAVAILABLE}</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-right">
                <ValueCell value={r.forecast_mw} />
              </td>
              <td className="px-3 py-1.5 text-right">
                <ValueCell value={r.actual_mw} />
              </td>
              <td className="px-3 py-1.5 text-right">
                <ErrorCell value={r.error_mw} />
              </td>
              <td className="px-3 py-1.5 text-right">
                <ValueCell value={r.abs_error_mw} />
              </td>
              <td className="px-3 py-1.5">
                <StatusBadge status={r.match_status} />
              </td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right">
                <Link
                  className="text-xs font-medium text-teal-700 underline-offset-2 hover:underline"
                  to={linkTo('/vintages', { start: r.start_time })}
                  aria-label={`Open forecast vintages for ${r.local_label}`}
                >
                  Vintages →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
