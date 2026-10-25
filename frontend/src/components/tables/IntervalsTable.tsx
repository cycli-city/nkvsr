import { Link } from 'react-router'
import type { IntervalRow, IntervalSort } from '../../api/types'
import { cn } from '../../lib/cn'
import {
  DIRECTION_LABEL,
  errorDirection,
  fmtDate,
  fmtDuration,
  fmtNumber,
  fmtShortDateTime,
  fmtTime,
  UNAVAILABLE,
} from '../../lib/format'
import { useAnalysis } from '../../state/useAnalysis'
import { Badge } from '../ui/primitives'

const STATUS_LABEL: Record<IntervalRow['match_status'], string> = {
  matched: 'Matched',
  missing_forecast: 'No forecast',
  missing_actual: 'No actual',
  missing_both: 'No data',
}

export function StatusBadge({ status }: { status: IntervalRow['match_status'] }) {
  return status === 'matched' ? (
    <Badge tone="good">{STATUS_LABEL[status]}</Badge>
  ) : (
    <Badge tone="warn">{STATUS_LABEL[status]}</Badge>
  )
}

/** `+120` / `−85` with direction colour AND a text/arrow cue (never colour alone). */
export function ErrorCell({ value }: { value: number | null }) {
  const dir = errorDirection(value)
  if (dir === null || value === null)
    return (
      <span className="text-slate-400" title="Unavailable (missing data)">
        {UNAVAILABLE}
      </span>
    )
  const text = `${value > 0 ? '+' : value < 0 ? '−' : ''}${fmtNumber(Math.abs(value))}`
  return (
    <span
      className={cn('tabular-nums', dir === 'over' && 'text-amber-800', dir === 'under' && 'text-teal-800')}
      title={DIRECTION_LABEL[dir]}
    >
      {dir === 'over' ? '▲ ' : dir === 'under' ? '▼ ' : ''}
      {text}
    </span>
  )
}

const num = (v: number | null) =>
  v === null ? (
    <span className="text-slate-400" title="Unavailable">
      {UNAVAILABLE}
    </span>
  ) : (
    <span className="tabular-nums">{fmtNumber(v)}</span>
  )

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
    <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
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
                      className="ml-1 text-xs text-slate-400"
                      title="How long before the cutoff this forecast was published"
                    >
                      ({fmtDuration(r.forecast_age_h)} old)
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">{UNAVAILABLE}</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-right">{num(r.forecast_mw)}</td>
              <td className="px-3 py-1.5 text-right">{num(r.actual_mw)}</td>
              <td className="px-3 py-1.5 text-right">
                <ErrorCell value={r.error_mw} />
              </td>
              <td className="px-3 py-1.5 text-right">{num(r.abs_error_mw)}</td>
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

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600"
    >
      <p aria-live="polite">
        Showing{' '}
        <strong className="tabular-nums text-slate-900">
          {fmtNumber(from)}–{fmtNumber(to)}
        </strong>{' '}
        of <strong className="tabular-nums text-slate-900">{fmtNumber(total)}</strong>
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          Rows per page
          <select
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
          >
            {[25, 50, 100, 250].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            ← Previous
          </button>
          <span className="px-2 tabular-nums">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </nav>
  )
}

/** Compact "largest errors" table used on the dashboard (each row links to its vintages). */
export function LargestErrorsTable({ rows }: { rows: IntervalRow[] }) {
  const { linkTo } = useAnalysis()
  return (
    <div className="relative overflow-x-auto">
      <table className="min-w-full text-sm">
        <caption className="sr-only">
          The ten matched half-hours with the largest absolute forecast error
        </caption>
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Delivery (UK)
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Forecast
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Actual
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Error F−A
            </th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Published
            </th>
            <th scope="col" className="px-2 py-1.5">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.start_time}>
              <td className="whitespace-nowrap px-2 py-1.5 font-medium text-slate-900">
                {fmtDate(r.delivery_date, 'short')}, {fmtTime(r.start_time)}
              </td>
              <td className="px-2 py-1.5 text-right">{num(r.forecast_mw)}</td>
              <td className="px-2 py-1.5 text-right">{num(r.actual_mw)}</td>
              <td className="px-2 py-1.5 text-right">
                <ErrorCell value={r.error_mw} />
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">
                {fmtShortDateTime(r.forecast_publish_time)}
              </td>
              <td className="px-2 py-1.5 text-right">
                <Link
                  className="text-xs font-medium text-teal-700 hover:underline"
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
